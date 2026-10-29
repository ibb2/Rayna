import { describe, expect, test } from "bun:test";
import { PlexLibraryService } from "./library";
import { PlexSession, type SavedSession, type SessionStore } from "./session";
import type { PlexServer } from "../../../src/shared/types";
import { DesktopDatabase } from "../storage/database";
import { legacyTranscodePreference } from "./transcoding";

const server = {
  product: "Plex Media Server",
  clientIdentifier: "server",
  accessToken: "server-token",
  connections: [
    {
      uri: "http://plex:32400",
      protocol: "http",
      address: "plex",
      port: 32400,
      local: true,
      relay: false,
      IPv6: false,
    },
  ],
} as PlexServer;
class MemoryStore implements SessionStore {
  value: SavedSession = {
    clientIdentifier: "client",
    plexUserAccessToken: "user-token",
    selectedServer: server,
    selectedLibraries: ["music"],
  };
  async read() {
    return this.value;
  }
  async write(value: SavedSession) {
    this.value = value;
  }
}

describe("desktop Plex library", () => {
  test("browses selected music sections and resolves authenticated audio candidates", async () => {
    const request = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/library/sections") {
        return Response.json({
          MediaContainer: {
            Directory: [
              { key: "1", uuid: "music", title: "Music", type: "artist" },
              { key: "2", uuid: "other", title: "Other", type: "artist" },
            ],
          },
        });
      }
      expect(url.pathname).toBe("/library/sections/1/all");
      expect(url.searchParams.get("type")).toBe("10");
      return Response.json({
        MediaContainer: {
          totalSize: 1,
          Metadata: [
            {
              ratingKey: "7",
              title: "Song",
              grandparentTitle: "Artist",
              parentTitle: "Album",
              duration: 120000,
              Media: [{ Part: [{ key: "/library/parts/7/file.flac" }] }],
            },
          ],
        },
      });
    }) as typeof fetch;
    const session = new PlexSession(new MemoryStore(), () => "unused", request);
    await session.initialize();
    const library = new PlexLibraryService(session, () => "session-id");
    const tracks = await library.list("track");
    const playables = await library.playables(tracks[0]!);
    const candidates = library.candidates(playables[0]!.source, new Set());
    expect(tracks).toHaveLength(1);
    expect(playables[0]?.track).toMatchObject({
      title: "Song",
      artist: "Artist",
      album: "Album",
      plexSessionId: "sessionid",
    });
    const url = new URL(candidates[0]!.url!);
    expect(url.searchParams.get("X-Plex-Token")).toBe("server-token");
    expect(url.searchParams.get("X-Plex-Session-Identifier")).toBe("sessionid");
  });

  test("selects timed Plex lyrics when they match the track", async () => {
    const request = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/library/metadata/7") {
        return Response.json({
          MediaContainer: {
            Metadata: [
              {
                duration: 120000,
                Media: [
                  {
                    Part: [
                      {
                        Stream: [
                          { streamType: 4, key: "/lyrics/plain" },
                          { streamType: 4, key: "/lyrics/timed" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
      }
      if (path === "/lyrics/plain") return new Response("Plain lyrics");
      if (path === "/lyrics/timed")
        return new Response("[00:12.00]Timed lyrics");
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const session = new PlexSession(new MemoryStore(), () => "unused", request);
    await session.initialize();
    const result = await new PlexLibraryService(session, () => "id").lyrics(
      "7",
    );
    expect(result).toEqual({
      format: "lrc",
      lines: [{ text: "Timed lyrics", startTimeMs: 12000 }],
    });
  });

  test("plays a migrated download without reaching Plex", async () => {
    const store = new MemoryStore();
    const session = new PlexSession(store, () => "unused", (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    await session.initialize();
    const database = new DesktopDatabase({
      open: async () => ({ migrated: true }),
      close: async () => {},
      execute: async () =>
        JSON.stringify({
          rows: [
            {
              rating_key: "7",
              title: "Offline song",
              file_path: "/music/song.flac",
              metadata: JSON.stringify({
                artist: "Artist",
                album: "Album",
                duration: 120000,
              }),
            },
          ],
          changes: 0,
        }),
    });
    const library = new PlexLibraryService(session, () => "id", database);
    const items = await library.downloaded();
    const playable = await library.playables(items[0]!);
    expect(playable[0]?.source.localPath).toBe("/music/song.flac");
    expect(playable[0]?.track).toMatchObject({
      title: "Offline song",
      artist: "Artist",
      album: "Album",
    });
    expect(library.candidates(playable[0]!.source, new Set())).toEqual([
      { connectionUri: "offline", localPath: "/music/song.flac" },
    ]);
  });

  test("falls back to an online stream if a downloaded file is unavailable", async () => {
    const session = new PlexSession(new MemoryStore(), () => "unused");
    await session.initialize();
    const database = new DesktopDatabase({
      open: async () => ({ migrated: true }),
      close: async () => {},
      execute: async () =>
        JSON.stringify({
          rows: [{ file_path: "/music/missing.flac" }],
          changes: 0,
        }),
    });
    const library = new PlexLibraryService(session, () => "id", database);
    const [playable] = await library.playables({
      ratingKey: "7",
      title: "Song",
      kind: "track",
      subtitle: "Artist",
      thumb: null,
      duration: null,
      raw: { Media: [{ Part: [{ key: "/library/parts/7/file.flac" }] }] },
    });
    const candidates = library.candidates(playable!.source, new Set());
    expect(candidates[0]).toEqual({
      connectionUri: "offline",
      localPath: "/music/missing.flac",
    });
    expect(candidates[1]?.url).toContain("/library/parts/7/file.flac");
    expect(
      library.candidates(playable!.source, new Set(["offline"]))[0]
        ?.connectionUri,
    ).toBe("http://plex:32400");
  });

  test("builds a 320 kbps Opus stream and matching authenticated decision URL", async () => {
    const store = new MemoryStore();
    store.value.transcodeAudio = true;
    const session = new PlexSession(store, () => "unused");
    await session.initialize();
    const library = new PlexLibraryService(session, () => "session-id");
    const [playable] = await library.playables({
      ratingKey: "7",
      title: "Song",
      kind: "track",
      subtitle: "",
      thumb: null,
      duration: null,
      raw: {},
    });
    expect(playable?.source.params).toMatchObject({
      musicBitrate: "320",
      path: "/library/metadata/7",
      directPlay: "0",
      directStream: "0",
    });
    expect(playable?.source.params?.["X-Plex-Client-Profile-Extra"]).toContain(
      "audioCodec=opus",
    );
    const candidate = library.candidates(playable!.source, new Set())[0]!;
    const decision = new URL(candidate.prepareUrl!);
    expect(decision.pathname).toBe("/music/:/transcode/universal/decision");
    expect(decision.searchParams.get("X-Plex-Token")).toBe("server-token");
    expect(decision.searchParams.get("session")).toBe(
      new URL(candidate.url!).searchParams.get("session"),
    );
    expect(legacyTranscodePreference({ useOriginalFileUrl: false })).toBe(true);
    expect(
      legacyTranscodePreference({
        transcodeAudio: false,
        useOriginalFileUrl: false,
      }),
    ).toBe(false);
  });

  test("downloads the original media even when transcoded playback is enabled", async () => {
    const store = new MemoryStore();
    store.value.transcodeAudio = true;
    const request = (async () =>
      Response.json({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: "7",
              title: "Song",
              grandparentTitle: "Artist",
              parentTitle: "Album",
              Media: [
                {
                  Part: [
                    {
                      key: "/library/parts/7/original.flac",
                      file: "/music/original.flac",
                    },
                  ],
                },
              ],
            },
          ],
        },
      })) as unknown as typeof fetch;
    const session = new PlexSession(store, () => "unused", request);
    await session.initialize();
    const library = new PlexLibraryService(session, () => "unused");
    const target = {
      ratingKey: "7",
      title: "Song",
      kind: "track" as const,
      subtitle: "",
      thumb: null,
      duration: null,
      raw: {},
    };
    expect((await library.downloadTracks("server", target))[0]).toMatchObject({
      ratingKey: "7",
      extension: ".flac",
      artist: "Artist",
    });
    const candidates = await library.downloadCandidates("server", "7");
    expect(new URL(candidates[0]!).pathname).toBe(
      "/library/parts/7/original.flac",
    );
    expect(new URL(candidates[0]!).searchParams.get("X-Plex-Token")).toBe(
      "server-token",
    );
  });

  test("uses a migrated library cache when Plex is offline", async () => {
    const session = new PlexSession(
      new MemoryStore(),
      () => "unused",
      (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    await session.initialize();
    const database = new DesktopDatabase({
      open: async () => ({ migrated: true }),
      close: async () => {},
      execute: async (_sql, paramsJson) => {
        const parameters = JSON.parse(paramsJson) as string[];
        const rows = parameters[1]?.startsWith("tracks-complete-corpus:v2:")
          ? [
              {
                value: JSON.stringify([
                  {
                    ratingKey: "7",
                    title: "Saved track",
                    artist: "Artist",
                    artistRatingKey: "1",
                    album: "Album",
                    albumRatingKey: "2",
                  },
                ]),
              },
            ]
          : [];
        return JSON.stringify({ rows, changes: 0 });
      },
    });
    const library = new PlexLibraryService(session, () => "id", database);
    const items = await library.list("track");
    expect(items[0]).toMatchObject({
      ratingKey: "7",
      title: "Saved track",
      subtitle: "Artist",
    });
    expect(items[0]?.raw.parentTitle).toBe("Album");
  });

  test("browses and searches downloaded metadata without making network requests", async () => {
    let requests = 0;
    const session = new PlexSession(
      new MemoryStore(),
      () => "unused",
      (async () => {
        requests++;
        throw new Error("unexpected request");
      }) as unknown as typeof fetch,
    );
    await session.initialize();
    session.setOffline(true);
    const database = new DesktopDatabase({
      open: async () => ({ migrated: true }),
      close: async () => {},
      execute: async (sql) =>
        JSON.stringify({
          rows: sql.startsWith("SELECT rating_key")
            ? [
                {
                  rating_key: "7",
                  title: "Offline song",
                  file_path: "/music/song.flac",
                  metadata: JSON.stringify({
                    artist: "Artist",
                    artistRatingKey: "a",
                    album: "Album",
                    albumRatingKey: "b",
                    targetType: "playlist",
                    targetRatingKey: "p",
                    targetTitle: "Playlist",
                  }),
                },
              ]
            : [],
          changes: 0,
        }),
    });
    const library = new PlexLibraryService(session, () => "id", database);
    const [artist] = await library.list("artist");
    const [album] = await library.list("album");
    const [playlist] = await library.list("playlist");
    expect(artist).toMatchObject({ ratingKey: "a", title: "Artist" });
    expect(album).toMatchObject({ ratingKey: "b", title: "Album" });
    expect(playlist).toMatchObject({ ratingKey: "p", title: "Playlist" });
    expect((await library.children(album!))[0]?.title).toBe("Offline song");
    expect((await library.playables(artist!))[0]?.source.localPath).toBe(
      "/music/song.flac",
    );
    expect((await library.artistTracks(artist!))[0]?.title).toBe(
      "Offline song",
    );
    expect(
      (await library.search("offline")).map((item) => item.title),
    ).toContain("Offline song");
    const home = await library.home();
    expect(home.recentlyAdded[0]?.title).toBe("Album");
    expect(home.quickAccess.map((item) => item.title)).toContain("Playlist");
    await expect(
      library.playables({
        ratingKey: "missing",
        title: "Missing",
        kind: "track",
        subtitle: "",
        thumb: null,
        duration: null,
        raw: {},
      }),
    ).rejects.toThrow("not downloaded");
    expect(requests).toBe(0);
  });

  test("keeps downloaded playlist order when its detail cache is unavailable", async () => {
    const session = new PlexSession(new MemoryStore(), () => "unused");
    await session.initialize();
    session.setOffline(true);
    const database = new DesktopDatabase({
      open: async () => ({ migrated: true }),
      close: async () => {},
      execute: async (sql) =>
        JSON.stringify({
          rows: sql.startsWith("SELECT rating_key")
            ? [
                {
                  rating_key: "2",
                  title: "Alpha",
                  file_path: "/music/2.flac",
                  metadata: JSON.stringify({
                    targetType: "playlist",
                    targetRatingKey: "p",
                    targetIndex: 1,
                    targetTitle: "Playlist",
                  }),
                },
                {
                  rating_key: "1",
                  title: "Zebra",
                  file_path: "/music/1.flac",
                  metadata: JSON.stringify({
                    targetType: "playlist",
                    targetRatingKey: "p",
                    targetIndex: 0,
                    targetTitle: "Playlist",
                  }),
                },
              ]
            : [],
          changes: 0,
        }),
    });
    const library = new PlexLibraryService(session, () => "id", database);
    const [playlist] = await library.list("playlist");
    expect(
      (await library.children(playlist!)).map((track) => track.title),
    ).toEqual(["Zebra", "Alpha"]);
    expect(
      (await library.playables(playlist!)).map(
        (track) => track.source.localPath,
      ),
    ).toEqual(["/music/1.flac", "/music/2.flac"]);
  });

  test("caches UltraBlur colors for album artwork and reuses them offline", async () => {
    let requests = 0;
    const session = new PlexSession(new MemoryStore(), () => "unused", (async (
      input,
    ) => {
      requests++;
      const url = new URL(String(input));
      expect(url.pathname).toBe("/services/ultrablur/colors");
      expect(url.searchParams.get("url")).toBe("/artwork/album");
      return Response.json({
        MediaContainer: {
          UltraBlurColors: [
            {
              topLeft: "123456",
              topRight: "654321",
              bottomLeft: "abcd12",
              bottomRight: "abcdef",
            },
          ],
        },
      });
    }) as typeof fetch);
    await session.initialize();
    const cache = new Map<string, string>();
    const database = new DesktopDatabase({
      open: async () => ({ migrated: true }),
      close: async () => {},
      execute: async (sql, json) => {
        const params = JSON.parse(json);
        if (sql.startsWith("INSERT INTO media_cache"))
          cache.set(params[1], params[2]);
        const value = cache.get(params[1]);
        return JSON.stringify({
          rows: sql.startsWith("SELECT value") && value ? [{ value }] : [],
          changes: 0,
        });
      },
    });
    const library = new PlexLibraryService(session, () => "id", database);
    const album = {
      ratingKey: "album",
      title: "Album",
      kind: "album" as const,
      subtitle: "",
      thumb: null,
      duration: null,
      raw: { thumb: "/artwork/album" },
    };
    const online = await library.ultraBlur(album);
    expect(online?.light).toContain("/photo/:/transcode?");
    expect(new URL(online!.dark).searchParams.get("X-Plex-Token")).toBe(
      "server-token",
    );
    session.setOffline(true);
    expect(await library.ultraBlur(album)).toEqual(online);
    expect(requests).toBe(1);
  });

  test("revives legacy cached artwork without sending the Plex token to another origin", async () => {
    const session = new PlexSession(new MemoryStore(), () => "unused");
    await session.initialize();
    const library = new PlexLibraryService(session, () => "id");
    library.setLegacyArtworkDirectory(
      "/Users/Name With Space/.rayna/artwork-cache",
    );
    const hash = "a".repeat(64);
    expect(
      library.artwork(`http://127.0.0.1:1234/artwork/server/${hash}`),
    ).toBe(
      `file:///Users/Name%20With%20Space/.rayna/artwork-cache/server/${hash}`,
    );
    expect(
      library.artwork(`http://127.0.0.1:1234/artwork/other/${hash}`),
    ).toBeNull();
    expect(library.artwork("https://other.example/image.jpg")).toBeNull();
  });
});
