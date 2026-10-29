import { orderPlexConnections } from "../../../src/bun/plex/connections";
import { selectMusicLibraries } from "../../../src/bun/plex/library-selection";
import {
  findLyricsStreamKeys,
  parseLyrics,
  selectLyricsCandidate,
} from "../../../src/bun/plex/lyrics";
import type {
  Playable,
  PlaybackCandidate,
  PlaybackSource,
} from "../playback/types";
import type { PlexSession } from "./session";
import type { DesktopDatabase } from "../storage/database";
import type { PlayerTrack } from "../../../src/shared/rpc";
import { opusSource } from "./transcoding";
import type { DownloadTrack } from "../downloads/service";
import { fileUri } from "../storage/file-uri";
import { themedUltraBlur, ultraBlurPath } from "./ultrablur";
import { popularArtistTracks } from "./library-filters";

type Metadata = Record<string, any>;
type PlexContainer = {
  MediaContainer?: {
    Metadata?: Metadata[];
    Directory?: Metadata[];
    Hub?: Array<{ Metadata?: Metadata[]; Directory?: Metadata[] }>;
    totalSize?: number;
  };
};

export type LibraryKind = "artist" | "album" | "track" | "playlist";
export type MusicItem = {
  ratingKey: string;
  title: string;
  kind: LibraryKind;
  subtitle: string;
  thumb: string | null;
  duration: number | null;
  raw: Metadata;
};
export type HomeData = {
  quickAccess: MusicItem[];
  recentlyPlayed: MusicItem[];
  recentlyAdded: MusicItem[];
  playlists: MusicItem[];
};

export class PlexLibraryService {
  private legacyArtworkDirectory: string | null = null;
  constructor(
    private readonly session: PlexSession,
    private readonly createId: () => string,
    private readonly database?: DesktopDatabase,
  ) {}

  setLegacyArtworkDirectory(directory: string): void {
    this.legacyArtworkDirectory = directory;
  }

  async selectedLibraries(serverId: string): Promise<string[]> {
    this.requireServer(serverId);
    return selectMusicLibraries(
      await this.session.libraries(),
      this.session.snapshot.selectedLibraries || [],
    ).map((library) => library.key);
  }

  async refreshLibrary(serverId: string, libraryKey: string): Promise<number> {
    this.requireServer(serverId);
    const data = await this.json(
      `/library/sections/${encodeURIComponent(libraryKey)}/all`,
      {
        type: "10",
        "X-Plex-Container-Start": "0",
        "X-Plex-Container-Size": "100",
        sort: "updatedAt:desc",
      },
    );
    this.requireServer(serverId);
    const items = this.items(data);
    await this.saveCache(`sync-library:${libraryKey}`, items);
    return items.length;
  }

  async trackExists(serverId: string, ratingKey: string): Promise<boolean> {
    this.requireServer(serverId);
    try {
      await this.json(`/library/metadata/${encodeURIComponent(ratingKey)}`);
      this.requireServer(serverId);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        /Plex request failed: 404/.test(error.message)
      ) {
        this.requireServer(serverId);
        return false;
      }
      throw error;
    }
  }

  async downloaded(): Promise<MusicItem[]> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!this.database || !serverId) return [];
    const result = await this.database.execute<{
      rating_key: string;
      title: string;
      file_path: string;
      metadata: string;
    }>(
      "SELECT rating_key, title, file_path, metadata FROM downloads WHERE server_id=? AND status='completed' AND file_path IS NOT NULL ORDER BY title COLLATE NOCASE",
      [serverId],
    );
    return result.rows.map((record) => {
      let metadata: Record<string, any> = {};
      try {
        metadata = JSON.parse(record.metadata) || {};
      } catch {
        /* Retain the saved track even if optional metadata is corrupt. */
      }
      return this.map(
        {
          ratingKey: record.rating_key,
          title: record.title,
          localPath: record.file_path,
          grandparentTitle: metadata.artist || "",
          grandparentRatingKey: metadata.artistRatingKey || "",
          parentTitle: metadata.album || "",
          parentRatingKey: metadata.albumRatingKey || "",
          duration: metadata.duration,
          thumb: metadata.thumb,
          targetType: metadata.targetType,
          targetRatingKey: metadata.targetRatingKey,
          targetTitle: metadata.targetTitle,
          targetIndex: metadata.targetIndex,
        },
        "track",
      );
    });
  }

  async downloadTracks(
    serverId: string,
    target: MusicItem,
  ): Promise<DownloadTrack[]> {
    this.requireServer(serverId);
    if (target.kind === "artist")
      throw new Error("Choose a track, album, or playlist to download");
    const tracks =
      target.kind === "track" ? [target] : await this.children(target);
    const result: DownloadTrack[] = [];
    for (const track of tracks) {
      let raw = track.raw;
      if (!raw.Media?.[0]?.Part?.[0]?.key)
        raw =
          this.items(
            await this.json(
              `/library/metadata/${encodeURIComponent(track.ratingKey)}`,
            ),
          )[0] || raw;
      this.requireServer(serverId);
      const part = raw.Media?.[0]?.Part?.[0];
      if (typeof part?.key !== "string" || !part.key)
        throw new Error(`No original audio is available for ${track.title}`);
      const name = typeof part.file === "string" ? part.file : part.key;
      const match = name.match(/\.([a-z0-9]{1,10})(?:\?.*)?$/i);
      result.push({
        ratingKey: track.ratingKey,
        title: track.title,
        artist: String(raw.originalTitle || raw.grandparentTitle || ""),
        album: String(raw.parentTitle || ""),
        artistRatingKey: String(raw.grandparentRatingKey || ""),
        albumRatingKey: String(raw.parentRatingKey || ""),
        duration: typeof raw.duration === "number" ? raw.duration : null,
        thumb: typeof raw.thumb === "string" ? raw.thumb : null,
        extension: match ? `.${match[1]!.toLowerCase()}` : ".audio",
        totalBytes:
          Number.isSafeInteger(Number(part.size)) && Number(part.size) > 0
            ? Number(part.size)
            : null,
      });
    }
    return result;
  }

  async downloadCandidates(
    serverId: string,
    ratingKey: string,
  ): Promise<string[]> {
    this.requireServer(serverId);
    const raw = this.items(
      await this.json(`/library/metadata/${encodeURIComponent(ratingKey)}`),
    )[0];
    this.requireServer(serverId);
    const path = raw?.Media?.[0]?.Part?.[0]?.key;
    if (typeof path !== "string" || !path)
      throw new Error("The original Plex audio file is unavailable");
    return this.candidates(
      {
        path,
        params: {
          "X-Plex-Product": "Rayna",
          "X-Plex-Client-Identifier": this.session.snapshot.clientIdentifier,
          "X-Plex-Platform": "Generic",
        },
      },
      new Set(),
    ).flatMap((candidate) => (candidate.url ? [candidate.url] : []));
  }

  async list(kind: LibraryKind): Promise<MusicItem[]> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    const cacheKey = this.libraryCacheKey(kind);
    try {
      const items = await this.fetchList(kind);
      this.requireServer(serverId);
      await this.saveCache(
        cacheKey,
        items.map((item) => item.raw),
      );
      return items;
    } catch (error) {
      this.requireServer(serverId);
      const cached = await this.cachedList(kind);
      this.requireServer(serverId);
      if (cached) return cached;
      throw error;
    }
  }

  async home(): Promise<HomeData> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    const [albumsResult, playlistsResult] = await Promise.allSettled([
      this.list("album"),
      this.list("playlist"),
    ]);
    this.requireServer(serverId);
    if (
      albumsResult.status === "rejected" &&
      playlistsResult.status === "rejected"
    )
      throw albumsResult.reason;
    const albums =
      albumsResult.status === "fulfilled" ? albumsResult.value : [];
    const playlists =
      playlistsResult.status === "fulfilled" ? playlistsResult.value : [];
    const recentlyPlayed = albums
      .filter((album) => Number(album.raw.lastViewedAt || 0) > 0)
      .sort(
        (a, b) =>
          Number(b.raw.lastViewedAt || 0) - Number(a.raw.lastViewedAt || 0),
      )
      .slice(0, 50);
    const recentlyAdded = [...albums]
      .sort((a, b) => Number(b.raw.addedAt || 0) - Number(a.raw.addedAt || 0))
      .slice(0, 50);
    const unique = new Map<string, MusicItem>();
    for (const item of [
      ...(recentlyPlayed.length ? recentlyPlayed : recentlyAdded),
      ...playlists,
    ]) {
      const key = `${item.kind}:${item.ratingKey}`;
      if (!unique.has(key)) unique.set(key, item);
      if (unique.size === 8) break;
    }
    return {
      quickAccess: [...unique.values()],
      recentlyPlayed,
      recentlyAdded,
      playlists: playlists.slice(0, 50),
    };
  }

  private async fetchList(kind: LibraryKind): Promise<MusicItem[]> {
    if (kind === "playlist") {
      const data = await this.json("/playlists", { playlistType: "audio" });
      return this.items(data).map((item) => this.map(item, kind));
    }
    const libraries = await this.session.libraries();
    const sections = selectMusicLibraries(
      libraries,
      this.session.snapshot.selectedLibraries || [],
    );
    const type = { artist: "8", album: "9", track: "10" }[kind];
    const pages = await Promise.all(
      sections.map(async (section) => {
        const result: Metadata[] = [];
        for (let start = 0; ; start += 100) {
          const data = await this.json(
            `/library/sections/${encodeURIComponent(section.key)}/all`,
            {
              type,
              "X-Plex-Container-Start": String(start),
              "X-Plex-Container-Size": "100",
            },
          );
          const items = this.items(data);
          result.push(...items);
          const total = data.MediaContainer?.totalSize;
          if (
            !items.length ||
            (typeof total === "number"
              ? start + items.length >= total
              : items.length < 100)
          )
            break;
        }
        return result;
      }),
    );
    return pages.flat().map((item) => this.map(item, kind));
  }

  async search(query: string): Promise<MusicItem[]> {
    if (!query.trim()) return [];
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    try {
      const data = await this.json("/hubs/search", {
        query: query.trim(),
        limit: "25",
        includeCollections: "0",
      });
      this.requireServer(serverId);
      return (data.MediaContainer?.Hub || [])
        .flatMap((hub) => hub.Metadata || hub.Directory || [])
        .filter((item) =>
          ["artist", "album", "track", "playlist"].includes(String(item.type)),
        )
        .map((item) => this.map(item, item.type as LibraryKind));
    } catch (error) {
      this.requireServer(serverId);
      const results = await Promise.all(
        (["artist", "album", "track", "playlist"] as LibraryKind[]).map(
          (kind) => this.cachedList(kind),
        ),
      );
      this.requireServer(serverId);
      const text = query.trim().toLocaleLowerCase();
      return results
        .flatMap((items) => items || [])
        .filter((item) =>
          `${item.title} ${item.subtitle}`.toLocaleLowerCase().includes(text),
        )
        .slice(0, 100);
    }
  }

  async children(item: MusicItem): Promise<MusicItem[]> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    const suffix =
      item.kind === "playlist"
        ? `/playlists/${encodeURIComponent(item.ratingKey)}/items`
        : `/library/metadata/${encodeURIComponent(item.ratingKey)}/children`;
    const defaultKind: LibraryKind = item.kind === "artist" ? "album" : "track";
    try {
      const data = await this.json(suffix);
      this.requireServer(serverId);
      const children = this.items(data).map((child) =>
        this.map(child, defaultKind),
      );
      await this.saveCache(
        `expo:children:${item.kind}:${item.ratingKey}`,
        children.map((child) => child.raw),
      );
      return children;
    } catch (error) {
      this.requireServer(serverId);
      const cached = await this.readCache(
        `expo:children:${item.kind}:${item.ratingKey}`,
      );
      this.requireServer(serverId);
      if (Array.isArray(cached))
        return cached.map((child) =>
          this.map(this.reviveLegacy(child), defaultKind),
        );
      if (item.kind === "album" || item.kind === "playlist") {
        const old = await this.readCache(
          `${item.kind}-detail:v1:${item.ratingKey}`,
        );
        if (
          old &&
          typeof old === "object" &&
          Array.isArray((old as Metadata).tracks)
        ) {
          return (old as Metadata).tracks.map((child: Metadata) =>
            this.map(this.reviveLegacy(child), "track"),
          );
        }
        const downloads = await this.downloaded();
        const matches = downloads.filter(
          (track) =>
            (track.raw.targetType === item.kind &&
              String(track.raw.targetRatingKey) === item.ratingKey) ||
            (item.kind === "album" &&
              String(track.raw.parentRatingKey || "") === item.ratingKey),
        );
        if (matches.length) {
          matches.sort((left, right) => {
            const position = (track: MusicItem) =>
              track.raw.targetType === item.kind &&
              String(track.raw.targetRatingKey) === item.ratingKey &&
              Number.isSafeInteger(track.raw.targetIndex)
                ? track.raw.targetIndex
                : Number.MAX_SAFE_INTEGER;
            return position(left) - position(right);
          });
          if (item.kind === "playlist") return matches;
          const seen = new Set<string>();
          return matches.filter((track) => {
            if (seen.has(track.ratingKey)) return false;
            seen.add(track.ratingKey);
            return true;
          });
        }
      }
      if (item.kind === "artist") {
        const albums = await this.cachedList("album");
        if (albums)
          return albums.filter(
            (album) =>
              String(album.raw.parentRatingKey || "") === item.ratingKey,
          );
      }
      throw error;
    }
  }

  async artistTracks(item: MusicItem): Promise<MusicItem[]> {
    if (item.kind !== "artist") return [];
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    try {
      const data = await this.json(
        `/library/metadata/${encodeURIComponent(item.ratingKey)}/popularTracks`,
      );
      this.requireServer(serverId);
      const tracks = this.items(data).map((track) => this.map(track, "track"));
      await this.saveCache(
        `expo:artist-popular:${item.ratingKey}`,
        tracks.map((track) => track.raw),
      );
      return tracks;
    } catch (error) {
      this.requireServer(serverId);
      const cached = await this.readCache(
        `expo:artist-popular:${item.ratingKey}`,
      );
      this.requireServer(serverId);
      if (Array.isArray(cached))
        return cached.map((track) =>
          this.map(this.reviveLegacy(track), "track"),
        );
      const downloaded = (await this.downloaded()).filter(
        (track) =>
          String(track.raw.grandparentRatingKey || "") === item.ratingKey,
      );
      if (downloaded.length) return downloaded;
      throw error;
    }
  }

  async popularTracks(item: MusicItem): Promise<MusicItem[]> {
    if (item.kind !== "artist") return [];
    return popularArtistTracks(await this.list("track"), item.ratingKey);
  }

  async ultraBlur(
    item: MusicItem,
  ): Promise<{ light: string; dark: string } | null> {
    if (item.kind !== "album" && item.kind !== "artist") return null;
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) return null;
    const key = `expo:ultrablur:${item.kind}:${item.ratingKey}`;
    let colors: unknown = null;
    try {
      const image = item.raw.thumb;
      if (typeof image !== "string" || !image.startsWith("/"))
        throw new Error("No Plex artwork is available");
      const data = await this.json("/services/ultrablur/colors", {
        url: image,
      });
      this.requireServer(serverId);
      colors = (data.MediaContainer as Metadata | undefined)
        ?.UltraBlurColors?.[0];
      if (!themedUltraBlur(colors))
        throw new Error("No UltraBlur colors available");
      await this.saveCache(key, colors);
    } catch {
      this.requireServer(serverId);
      colors = await this.readCache(key);
      this.requireServer(serverId);
    }
    const themed = themedUltraBlur(colors);
    if (!themed) return null;
    const light = this.artwork(ultraBlurPath(themed.light));
    const dark = this.artwork(ultraBlurPath(themed.dark));
    return light && dark ? { light, dark } : null;
  }

  async lyrics(ratingKey: string) {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    try {
      const metadata = this.items(
        await this.json(`/library/metadata/${encodeURIComponent(ratingKey)}`),
      )[0];
      if (!metadata) return null;
      const candidates = await Promise.all(
        findLyricsStreamKeys(metadata).map(async (key) => {
          try {
            const text = await (
              await this.session.serverRequest(
                key,
                {},
                "text/plain, application/x-subrip, */*",
              )
            ).text();
            return { text, parsed: parseLyrics(text) };
          } catch {
            return null;
          }
        }),
      );
      this.requireServer(serverId);
      const selected = selectLyricsCandidate(
        candidates.filter((item) => item !== null),
        Number(metadata.duration),
      );
      if (selected)
        await this.saveCache(`lyrics:v2:${ratingKey}`, selected.text);
      return selected?.parsed || null;
    } catch (error) {
      this.requireServer(serverId);
      if (!this.database) throw error;
      const rows = await this.database.execute<{ value: string }>(
        "SELECT value FROM media_cache WHERE server_id=? AND cache_key=?",
        [serverId, `lyrics:v2:${ratingKey}`],
      );
      if (!rows.rows[0]) throw error;
      const text: unknown = JSON.parse(rows.rows[0].value);
      return typeof text === "string" ? parseLyrics(text) : null;
    }
  }

  async playables(item: MusicItem): Promise<Playable[]> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    let tracks: MusicItem[];
    if (item.kind === "track") tracks = [item];
    else if (item.kind === "artist") {
      tracks = this.session.offline
        ? (await this.downloaded()).filter(
            (track) =>
              String(track.raw.grandparentRatingKey || "") === item.ratingKey,
          )
        : await this.artistTracks(item);
      if (!tracks.length)
        throw new Error("No playable tracks are available for this artist");
    } else tracks = await this.children(item);
    this.requireServer(serverId);
    return Promise.all(
      tracks.map(async (track) => {
        let raw = track.raw;
        let localPath =
          typeof raw.localPath === "string" ? raw.localPath : undefined;
        if (!localPath && this.database && serverId) {
          const result = await this.database.execute<{ file_path: string }>(
            "SELECT file_path FROM downloads WHERE server_id=? AND rating_key=? AND status='completed' AND file_path IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
            [serverId, track.ratingKey],
          );
          localPath = result.rows[0]?.file_path;
        }
        if (!localPath && this.session.offline)
          throw new Error(`This track is not downloaded: ${track.title}`);
        const transcode =
          !localPath && this.session.snapshot.transcodeAudio === true;
        if (!localPath && !transcode && !raw.Media?.[0]?.Part?.[0]?.key) {
          raw =
            this.items(
              await this.json(
                `/library/metadata/${encodeURIComponent(track.ratingKey)}`,
              ),
            )[0] || raw;
        }
        this.requireServer(serverId);
        const path = raw.Media?.[0]?.Part?.[0]?.key;
        if (!localPath && !transcode && (typeof path !== "string" || !path))
          throw new Error(`No audio stream is available for ${track.title}`);
        const plexSessionId = this.createId().replaceAll("-", "");
        return {
          track: {
            ratingKey: track.ratingKey,
            title: track.title,
            artist: String(raw.originalTitle || raw.grandparentTitle || ""),
            artistRatingKey: String(raw.grandparentRatingKey || ""),
            album: String(raw.parentTitle || ""),
            albumRatingKey: String(raw.parentRatingKey || ""),
            duration:
              typeof raw.duration === "number" ? raw.duration : undefined,
            plexSessionId,
            thumb: this.artwork(raw.thumb),
          },
          source: transcode
            ? this.transcodeSource(track.ratingKey, plexSessionId)
            : {
                path: typeof path === "string" ? path : "",
                localPath,
                params: {
                  "X-Plex-Product": "Rayna",
                  "X-Plex-Client-Identifier":
                    this.session.snapshot.clientIdentifier,
                  "X-Plex-Session-Identifier": plexSessionId,
                  "X-Plex-Platform": "Generic",
                },
              },
        };
      }),
    );
  }

  async remoteSource(
    track: PlayerTrack,
    transcode: boolean,
  ): Promise<PlaybackSource> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) throw new Error("Select a Plex server first");
    const sessionId =
      track.plexSessionId || this.createId().replaceAll("-", "");
    if (transcode) return this.transcodeSource(track.ratingKey, sessionId);
    const raw = this.items(
      await this.json(
        `/library/metadata/${encodeURIComponent(track.ratingKey)}`,
      ),
    )[0];
    this.requireServer(serverId);
    const path = raw?.Media?.[0]?.Part?.[0]?.key;
    if (typeof path !== "string" || !path)
      throw new Error(
        `No original audio stream is available for ${track.title}`,
      );
    return {
      path,
      params: {
        "X-Plex-Product": "Rayna",
        "X-Plex-Client-Identifier": this.session.snapshot.clientIdentifier,
        "X-Plex-Session-Identifier": sessionId,
        "X-Plex-Platform": "Generic",
      },
    };
  }

  private transcodeSource(
    ratingKey: string,
    playbackSession: string,
  ): PlaybackSource {
    return opusSource(
      ratingKey,
      this.createId().replaceAll("-", ""),
      playbackSession,
      this.session.snapshot.clientIdentifier,
    );
  }

  candidates(
    source: PlaybackSource,
    excluded: ReadonlySet<string>,
  ): PlaybackCandidate[] {
    const local: PlaybackCandidate[] =
      source.localPath && !excluded.has("offline")
        ? [{ connectionUri: "offline", localPath: source.localPath }]
        : [];
    if (!source.path || this.session.offline) return local;
    const state = this.session.snapshot;
    const server = state.selectedServer;
    const token = server?.accessToken || state.plexUserAccessToken;
    if (!server || !token) return local;
    return [
      ...local,
      ...orderPlexConnections(server, {
        lastKnownGoodUri: state.lastKnownGoodConnection,
        excludedUris: excluded,
      }).flatMap((connection) => {
        const url = new URL(source.path, connection.uri);
        if (url.origin !== new URL(connection.uri).origin) return [];
        url.searchParams.set("X-Plex-Token", token);
        for (const [key, value] of Object.entries(source.params || {}))
          url.searchParams.set(key, value);
        let prepareUrl: string | undefined;
        if (url.pathname === "/music/:/transcode/universal/start") {
          const decision = new URL(url.toString());
          decision.pathname = "/music/:/transcode/universal/decision";
          prepareUrl = decision.toString();
        }
        return [
          {
            connectionUri: connection.uri,
            url: url.toString(),
            ...(prepareUrl ? { prepareUrl } : {}),
          },
        ];
      }),
    ];
  }

  artwork(path: unknown): string | null {
    if (typeof path !== "string" || !path) return null;
    const state = this.session.snapshot;
    const server = state.selectedServer;
    try {
      const existing = new URL(path);
      const match =
        existing.hostname === "127.0.0.1" &&
        /^\/artwork\/([a-z0-9._-]+)\/([a-f0-9]{64})$/i.exec(existing.pathname);
      if (match) {
        const expectedServer =
          server?.clientIdentifier
            .replace(/[^a-zA-Z0-9._-]/g, "-")
            .slice(0, 100) || "server";
        if (
          !this.legacyArtworkDirectory ||
          match[1] !== expectedServer ||
          match[1] === "." ||
          match[1] === ".."
        )
          return null;
        return fileUri(this.legacyArtworkDirectory, match[1]!, match[2]!);
      }
    } catch {
      /* Relative Plex artwork paths are handled below. */
    }
    const token = server?.accessToken || state.plexUserAccessToken;
    const route = state.lastKnownGoodConnection || server?.connections[0]?.uri;
    if (!route || !token) return null;
    const url = new URL(path, route);
    if (url.origin !== new URL(route).origin) return null;
    url.searchParams.set("X-Plex-Token", token);
    return url.toString();
  }

  private async json(
    path: string,
    params: Record<string, string> = {},
  ): Promise<PlexContainer> {
    return (await (
      await this.session.serverRequest(path, params)
    ).json()) as PlexContainer;
  }
  private requireServer(serverId: string): void {
    if (this.session.snapshot.selectedServer?.clientIdentifier !== serverId)
      throw new Error("The selected Plex server changed during the request");
  }
  private items(data: PlexContainer): Metadata[] {
    return (
      data.MediaContainer?.Metadata || data.MediaContainer?.Directory || []
    );
  }
  private async saveCache(key: string, value: unknown): Promise<void> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!this.database || !serverId) return;
    const now = Date.now();
    await this.database.execute(
      "INSERT INTO media_cache (server_id, cache_key, value, updated_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(server_id, cache_key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, expires_at=excluded.expires_at",
      [serverId, key, JSON.stringify(value), now, now + 300000],
    );
  }
  private async readCache(key: string, prefix = false): Promise<unknown> {
    const serverId = this.session.snapshot.selectedServer?.clientIdentifier;
    if (!this.database || !serverId) return null;
    const result = await this.database.execute<{ value: string }>(
      prefix
        ? "SELECT value FROM media_cache WHERE server_id=? AND cache_key LIKE ? ORDER BY updated_at DESC LIMIT 1"
        : "SELECT value FROM media_cache WHERE server_id=? AND cache_key=? LIMIT 1",
      [serverId, prefix ? `${key}%` : key],
    );
    if (!result.rows[0]) return null;
    try {
      return JSON.parse(result.rows[0].value);
    } catch {
      return null;
    }
  }
  private async cachedList(kind: LibraryKind): Promise<MusicItem[] | null> {
    let value = await this.readCache(this.libraryCacheKey(kind));
    if (!Array.isArray(value)) {
      const legacy =
        kind === "album"
          ? "albums-complete-corpus:v2:"
          : kind === "track"
            ? "tracks-complete-corpus:v2:"
            : kind === "playlist"
              ? "playlists:v1"
              : null;
      value = legacy ? await this.readCache(legacy, kind !== "playlist") : null;
    }
    if (!Array.isArray(value) && kind === "artist") {
      const tracks = await this.cachedList("track");
      if (tracks) {
        const artists = new Map<string, MusicItem>();
        for (const track of tracks) {
          const key = String(track.raw.grandparentRatingKey || "");
          if (key)
            artists.set(
              key,
              this.map(
                { ratingKey: key, title: track.raw.grandparentTitle },
                "artist",
              ),
            );
        }
        return [...artists.values()];
      }
    }
    if (!Array.isArray(value)) {
      const downloads = await this.downloaded();
      if (kind === "track" && downloads.length) return downloads;
      if (kind === "album" || kind === "playlist") {
        const groups = new Map<string, MusicItem>();
        for (const track of downloads) {
          const key =
            kind === "album"
              ? track.raw.parentRatingKey
              : track.raw.targetType === "playlist"
                ? track.raw.targetRatingKey
                : null;
          const title =
            kind === "album" ? track.raw.parentTitle : track.raw.targetTitle;
          if (key && title)
            groups.set(
              String(key),
              this.map(
                {
                  ratingKey: key,
                  title,
                  parentRatingKey: track.raw.grandparentRatingKey,
                  parentTitle: track.raw.grandparentTitle,
                  thumb: track.raw.thumb,
                },
                kind,
              ),
            );
        }
        if (groups.size) return [...groups.values()];
      }
    }
    return Array.isArray(value)
      ? value.map((item) => this.map(this.reviveLegacy(item), kind))
      : null;
  }
  private reviveLegacy(item: Metadata): Metadata {
    return {
      ...item,
      grandparentTitle:
        item.grandparentTitle || item.artist || item.artistTitle,
      grandparentRatingKey: item.grandparentRatingKey || item.artistRatingKey,
      parentTitle:
        item.parentTitle ||
        item.album ||
        item.albumTitle ||
        (item.artistRatingKey ? item.artist : undefined),
      parentRatingKey:
        item.parentRatingKey ||
        item.albumRatingKey ||
        (item.year !== undefined ? item.artistRatingKey : undefined),
      thumb: item.thumb || item.albumThumb || item.composite,
    };
  }
  private libraryCacheKey(kind: LibraryKind): string {
    const selected =
      (this.session.snapshot.selectedLibraries || [])
        .map((library) =>
          typeof library === "string" ? library : library.uuid || library.key,
        )
        .sort()
        .join(",") || "all";
    return `expo:library:${kind}:${selected}`;
  }
  private map(raw: Metadata, kind: LibraryKind): MusicItem {
    return {
      ratingKey: String(raw.ratingKey || ""),
      title: String(raw.title || ""),
      kind,
      subtitle: String(raw.grandparentTitle || raw.parentTitle || ""),
      thumb: this.artwork(raw.thumb || raw.composite),
      duration: typeof raw.duration === "number" ? raw.duration : null,
      raw,
    };
  }
}
