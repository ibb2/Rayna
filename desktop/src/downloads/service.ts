import type { MusicItem } from "../plex/library";
import type { DesktopDatabase } from "../storage/database";

export interface NativeTransferModule {
  defaultDirectory(): Promise<string>;
  legacyArtworkDirectory(): Promise<string>;
  paths(
    directory: string,
    server: string,
    id: string,
    title: string,
    extension: string,
  ): Promise<{ file: string; partial: string }>;
  size(path: string): Promise<number>;
  remove(directory: string, path: string): Promise<void>;
  prepareDirectory(directory: string): Promise<string>;
  rebase(
    oldDirectory: string,
    newDirectory: string,
    path: string,
  ): Promise<string | null>;
  copyForMove(
    oldDirectory: string,
    newDirectory: string,
    source: string,
    destination: string,
  ): Promise<boolean>;
  removeIfSame(
    oldDirectory: string,
    newDirectory: string,
    source: string,
    destination: string,
  ): Promise<boolean>;
  download(
    id: string,
    url: string,
    directory: string,
    partial: string,
    destination: string,
    maximumBytes: number,
  ): Promise<number>;
  cancel(id: string): Promise<boolean>;
}

export type DownloadTrack = {
  ratingKey: string;
  title: string;
  artist: string;
  album: string;
  artistRatingKey: string;
  albumRatingKey: string;
  duration: number | null;
  thumb: string | null;
  extension: string;
  totalBytes: number | null;
};

export interface DownloadResolver {
  downloadTracks(serverId: string, target: MusicItem): Promise<DownloadTrack[]>;
  downloadCandidates(serverId: string, ratingKey: string): Promise<string[]>;
}

export type DownloadRow = {
  id: string;
  server_id: string;
  rating_key: string;
  media_type: string;
  title: string;
  file_path: string | null;
  partial_path: string | null;
  status: "queued" | "downloading" | "paused" | "completed" | "failed";
  bytes_downloaded: number;
  total_bytes: number | null;
  error: string | null;
  metadata: string;
  created_at: number;
  updated_at: number;
};
export type StorageMoveResult = {
  directory: string;
  copiedFiles: number;
  retainedLegacyFiles: number;
  skippedFiles: number;
  cleanupFailures: string[];
  relocatedPaths: Record<string, string>;
};

/** Coordinates up to three native transfers and keeps the database authoritative. */
export class DownloadService {
  private directory = "";
  private pending: string[] = [];
  private readonly active = new Map<string, Promise<void>>();
  private readonly paused = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private enqueues: Promise<void> = Promise.resolve();
  private moving = false;
  private moveWork: Promise<StorageMoveResult> | null = null;
  private closed = false;

  constructor(
    private readonly database: DesktopDatabase,
    private readonly transfer: NativeTransferModule,
    private readonly resolver: DownloadResolver,
    private readonly createId: () => string,
    private readonly now: () => number = Date.now,
  ) {}

  async initialize(): Promise<void> {
    const setting = await this.database.execute<{ value: string }>(
      "SELECT value FROM settings WHERE key=?",
      ["downloads.storageDirectory"],
    );
    if (setting.rows[0]) {
      try {
        const value: unknown = JSON.parse(setting.rows[0].value);
        if (typeof value === "string") this.directory = value;
      } catch {
        /* An invalid setting does not modify the legacy data. */
      }
    }
    if (!this.directory)
      this.directory = await this.transfer.defaultDirectory();
    const interrupted = await this.database.execute<DownloadRow>(
      "SELECT * FROM downloads WHERE status IN ('queued', 'downloading')",
    );
    for (const row of interrupted.rows) {
      let desktopManaged = false;
      try {
        desktopManaged = JSON.parse(row.metadata)?.desktopManaged === true;
      } catch {
        /* Preserve unknown legacy records. */
      }
      const finalSize =
        desktopManaged && row.file_path
          ? await this.transfer.size(row.file_path).catch(() => -1)
          : -1;
      const partialSize = row.partial_path
        ? await this.transfer.size(row.partial_path).catch(() => -1)
        : -1;
      await this.update(
        row.id,
        finalSize > 0 ? "completed" : "paused",
        finalSize > 0
          ? finalSize
          : partialSize >= 0
            ? partialSize
            : row.bytes_downloaded,
        finalSize > 0 ? finalSize : row.total_bytes,
        null,
      );
    }
  }

  get storageDirectory(): string {
    return this.directory;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list(serverId: string): Promise<DownloadRow[]> {
    const result = await this.database.execute<DownloadRow>(
      "SELECT * FROM downloads WHERE server_id=? ORDER BY created_at DESC",
      [serverId],
    );
    return Promise.all(
      result.rows.map(async (row) => {
        if (
          (row.status === "downloading" || row.status === "paused") &&
          row.partial_path
        ) {
          const bytes = await this.transfer
            .size(row.partial_path)
            .catch(() => -1);
          if (bytes >= 0) return { ...row, bytes_downloaded: bytes };
        }
        return row;
      }),
    );
  }

  enqueue(serverId: string, target: MusicItem): Promise<void> {
    const operation = this.enqueues.then(() =>
      this.enqueueOnce(serverId, target),
    );
    this.enqueues = operation.catch(() => undefined);
    return operation;
  }

  private async enqueueOnce(
    serverId: string,
    target: MusicItem,
  ): Promise<void> {
    if (this.closed || this.moving)
      throw new Error(
        this.closed
          ? "The download service is closed"
          : "A storage move is in progress",
      );
    if (target.kind === "artist")
      throw new Error("Choose a track, album, or playlist to download");
    const existing = await this.list(serverId);
    if (
      existing.some((row) => {
        try {
          const metadata = JSON.parse(row.metadata);
          return (
            metadata?.targetType === target.kind &&
            metadata?.targetRatingKey === target.ratingKey
          );
        } catch {
          return false;
        }
      })
    )
      return;
    const tracks = await this.resolver.downloadTracks(serverId, target);
    if (this.closed) throw new Error("The download service is closed");
    if (!tracks.length) throw new Error("There are no tracks to download");
    for (const [targetIndex, track] of tracks.entries()) {
      if (this.closed) break;
      const id = this.createId();
      const paths = await this.transfer.paths(
        this.directory,
        serverId,
        id,
        track.title,
        track.extension,
      );
      const metadata = {
        desktopManaged: true,
        targetType: target.kind,
        targetRatingKey: target.ratingKey,
        targetTitle: target.title,
        targetIndex,
        artist: track.artist,
        album: track.album,
        artistRatingKey: track.artistRatingKey,
        albumRatingKey: track.albumRatingKey,
        duration: track.duration,
        thumb: track.thumb,
      };
      const at = this.now();
      await this.database.execute(
        "INSERT INTO downloads (id, server_id, rating_key, media_type, title, file_path, partial_path, status, bytes_downloaded, total_bytes, error, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, ?, ?, ?)",
        [
          id,
          serverId,
          track.ratingKey,
          target.kind,
          track.title,
          paths.file,
          paths.partial,
          track.totalBytes,
          JSON.stringify(metadata),
          at,
          at,
        ],
      );
      this.pending.push(id);
    }
    this.notify();
    this.pump();
  }

  async pause(id: string): Promise<void> {
    this.paused.add(id);
    this.pending = this.pending.filter((item) => item !== id);
    const active = this.active.get(id);
    while (active && this.active.has(id)) {
      if (await this.transfer.cancel(id)) break;
      await Promise.race([
        active,
        new Promise<void>((resolve) => setTimeout(resolve, 25)),
      ]);
    }
    if (active) await active;
    const row = await this.row(id);
    if (row && row.status !== "completed") {
      const bytes = row.partial_path
        ? await this.transfer.size(row.partial_path)
        : -1;
      await this.update(
        id,
        "paused",
        Math.max(row.bytes_downloaded, bytes),
        row.total_bytes,
        null,
      );
    }
    this.notify();
  }

  async pauseAll(): Promise<void> {
    await this.enqueues;
    await Promise.all(
      [...new Set([...this.pending, ...this.active.keys()])].map((id) =>
        this.pause(id),
      ),
    );
  }

  async resume(id: string): Promise<void> {
    if (this.closed || this.moving)
      throw new Error(
        this.closed
          ? "The download service is closed"
          : "A storage move is in progress",
      );
    const row = await this.row(id);
    if (!row) throw new Error("Download not found");
    if (row.status !== "paused" && row.status !== "failed") return;
    this.paused.delete(id);
    await this.update(
      id,
      "queued",
      row.bytes_downloaded,
      row.total_bytes,
      null,
    );
    if (!this.pending.includes(id) && !this.active.has(id))
      this.pending.push(id);
    this.notify();
    this.pump();
  }

  async remove(id: string): Promise<void> {
    if (this.moving) throw new Error("A storage move is in progress");
    await this.pause(id);
    const row = await this.row(id);
    if (!row) return;
    for (const path of new Set([row.file_path, row.partial_path])) {
      if (!path) continue;
      const other = await this.database.execute<{ count: number }>(
        "SELECT COUNT(*) AS count FROM downloads WHERE id<>? AND (file_path=? OR partial_path=?)",
        [id, path, path],
      );
      if (!other.rows[0]?.count)
        await this.transfer.remove(this.directory, path);
    }
    await this.database.execute("DELETE FROM downloads WHERE id=?", [id]);
    this.paused.delete(id);
    this.notify();
  }

  async clearActivity(serverId: string): Promise<void> {
    const at = this.now();
    await this.database.execute(
      "UPDATE downloads SET metadata=json_set(CASE WHEN json_type(metadata)='object' THEN metadata ELSE '{}' END, '$.activityClearedAt', ?), updated_at=? WHERE server_id=? AND status IN ('completed', 'failed') AND CASE WHEN json_valid(metadata) THEN json_type(metadata) IN ('object', 'null') ELSE 0 END",
      [at, at, serverId],
    );
    this.notify();
  }

  moveDirectory(directory: string): Promise<StorageMoveResult> {
    if (this.closed || this.moving)
      throw new Error(
        this.closed
          ? "The download service is closed"
          : "A storage move is already in progress",
      );
    if (!directory.trim()) throw new Error("Choose a download directory");
    this.moving = true;
    const work = this.moveDirectoryInternal(directory.trim()).finally(() => {
      this.moveWork = null;
    });
    this.moveWork = work;
    return work;
  }

  private async moveDirectoryInternal(
    directory: string,
  ): Promise<StorageMoveResult> {
    const resumeIds: string[] = [];
    const copies: Array<{
      source: string;
      destination: string;
      desktopManaged: boolean;
    }> = [];
    let committed = false;
    let oldDirectory = this.directory;
    let newDirectory = "";
    try {
      await this.enqueues;
      oldDirectory = await this.transfer.prepareDirectory(this.directory);
      newDirectory = await this.transfer.prepareDirectory(directory);
      resumeIds.push(...new Set([...this.pending, ...this.active.keys()]));
      await Promise.all(resumeIds.map((id) => this.pause(id)));
      const result: StorageMoveResult = {
        directory: newDirectory,
        copiedFiles: 0,
        retainedLegacyFiles: 0,
        skippedFiles: 0,
        cleanupFailures: [],
        relocatedPaths: Object.create(null),
      };
      const rows = (
        await this.database.execute<DownloadRow>("SELECT * FROM downloads")
      ).rows;
      const mapped = new Map<
        string,
        { destination: string | null; desktopManaged: boolean }
      >();
      const destinations = new Map<string, string>();
      for (const row of rows) {
        let desktopManaged = false;
        try {
          desktopManaged = JSON.parse(row.metadata)?.desktopManaged === true;
        } catch {
          /* Keep unknown legacy media. */
        }
        for (const path of [row.file_path, row.partial_path]) {
          if (!path) continue;
          const previous = mapped.get(path);
          if (previous) {
            previous.desktopManaged &&= desktopManaged;
            continue;
          }
          const destination = await this.transfer.rebase(
            oldDirectory,
            newDirectory,
            path,
          );
          if (!destination) result.skippedFiles++;
          else {
            const existing = destinations.get(destination);
            if (existing && existing !== path)
              throw new Error(
                "Multiple downloads would use the same destination",
              );
            destinations.set(destination, path);
          }
          mapped.set(path, { destination, desktopManaged });
          if (destination && destination !== path)
            result.relocatedPaths[path] = destination;
        }
      }
      if (oldDirectory !== newDirectory) {
        for (const [source, entry] of mapped) {
          if (
            entry.destination &&
            (await this.transfer.copyForMove(
              oldDirectory,
              newDirectory,
              source,
              entry.destination,
            ))
          ) {
            copies.push({
              source,
              destination: entry.destination,
              desktopManaged: entry.desktopManaged,
            });
          }
        }
      }
      const statements = rows.map((row) => ({
        sql: "UPDATE downloads SET file_path=?, partial_path=?, updated_at=? WHERE id=?",
        parameters: [
          row.file_path
            ? mapped.get(row.file_path)?.destination || row.file_path
            : null,
          row.partial_path
            ? mapped.get(row.partial_path)?.destination || row.partial_path
            : null,
          this.now(),
          row.id,
        ],
      }));
      statements.push({
        sql: "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        parameters: [
          "downloads.storageDirectory",
          JSON.stringify(newDirectory),
        ],
      });
      await this.database.transaction(statements);
      committed = true;
      this.directory = newDirectory;
      result.copiedFiles = copies.length;
      for (const copy of copies) {
        if (!copy.desktopManaged) {
          result.retainedLegacyFiles++;
          continue;
        }
        try {
          if (
            !(await this.transfer.removeIfSame(
              oldDirectory,
              newDirectory,
              copy.source,
              copy.destination,
            ))
          )
            result.cleanupFailures.push(copy.source);
        } catch {
          result.cleanupFailures.push(copy.source);
        }
      }
      this.notify();
      return result;
    } catch (error) {
      if (!committed && newDirectory) {
        const retained: string[] = [];
        for (const copy of copies) {
          try {
            if (
              !(await this.transfer.removeIfSame(
                newDirectory,
                oldDirectory,
                copy.destination,
                copy.source,
              ))
            )
              retained.push(copy.destination);
          } catch {
            retained.push(copy.destination);
          }
        }
        if (retained.length)
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}. Some copied files were retained at the new location.`,
          );
      }
      throw error;
    } finally {
      this.moving = false;
      for (const id of resumeIds) await this.resume(id).catch(() => undefined);
      this.pump();
    }
  }

  async dispose(): Promise<void> {
    this.closed = true;
    await this.enqueues;
    await this.moveWork?.catch(() => undefined);
    const ids = [...new Set([...this.pending, ...this.active.keys()])];
    await Promise.all(ids.map((id) => this.pause(id)));
    this.listeners.clear();
  }

  private pump(): void {
    while (
      !this.closed &&
      !this.moving &&
      this.active.size < 3 &&
      this.pending.length
    ) {
      const id = this.pending.shift()!;
      const work = this.run(id)
        .catch(() => undefined)
        .finally(() => {
          this.active.delete(id);
          this.notify();
          this.pump();
        });
      this.active.set(id, work);
    }
  }

  private async run(id: string): Promise<void> {
    const row = await this.row(id);
    if (!row || this.paused.has(id)) return;
    try {
      if (!row.file_path || !row.partial_path)
        throw new Error("Download paths are missing");
      const urls = await this.resolver.downloadCandidates(
        row.server_id,
        row.rating_key,
      );
      if (this.paused.has(id)) return;
      if (!urls.length) throw new Error("No Plex download route is available");
      await this.update(
        id,
        "downloading",
        row.bytes_downloaded,
        row.total_bytes,
        null,
      );
      this.notify();
      let failure: unknown = new Error("Download failed");
      for (const url of urls) {
        if (this.paused.has(id)) break;
        try {
          const bytes = await this.transfer.download(
            id,
            url,
            this.directory,
            row.partial_path,
            row.file_path,
            0,
          );
          await this.update(id, "completed", bytes, bytes, null);
          return;
        } catch (error) {
          failure = error;
        }
      }
      if (!this.paused.has(id)) throw failure;
    } catch (error) {
      if (!this.paused.has(id)) {
        const bytes = row.partial_path
          ? await this.transfer.size(row.partial_path).catch(() => -1)
          : -1;
        await this.update(
          id,
          "failed",
          Math.max(row.bytes_downloaded, bytes),
          row.total_bytes,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async row(id: string): Promise<DownloadRow | null> {
    return (
      (
        await this.database.execute<DownloadRow>(
          "SELECT * FROM downloads WHERE id=?",
          [id],
        )
      ).rows[0] || null
    );
  }
  private async update(
    id: string,
    status: DownloadRow["status"],
    bytes: number,
    total: number | null,
    error: string | null,
  ): Promise<void> {
    await this.database.execute(
      "UPDATE downloads SET status=?, bytes_downloaded=?, total_bytes=?, error=?, updated_at=? WHERE id=?",
      [status, bytes, total, error, this.now(), id],
    );
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
