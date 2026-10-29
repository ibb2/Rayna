import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { DesktopDatabase } from "../storage/database";
import type { MusicItem } from "../plex/library";
import {
  DownloadService,
  type DownloadResolver,
  type NativeTransferModule,
} from "./service";

class TestDatabase {
  sqlite = new Database(":memory:");
  failTransaction = false;
  constructor() {
    this.sqlite.run(
      "CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    this.sqlite.run(
      "CREATE TABLE downloads(id TEXT PRIMARY KEY, server_id TEXT NOT NULL, rating_key TEXT NOT NULL, media_type TEXT NOT NULL, title TEXT NOT NULL, file_path TEXT, partial_path TEXT, status TEXT NOT NULL, bytes_downloaded INTEGER NOT NULL DEFAULT 0, total_bytes INTEGER, error TEXT, metadata TEXT NOT NULL DEFAULT 'null', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
  }
  database = new DesktopDatabase({
    open: async () => ({ migrated: false }),
    close: async () => {},
    transaction: async (json) => {
      this.sqlite.run("BEGIN IMMEDIATE");
      try {
        for (const statement of JSON.parse(json) as Array<{
          sql: string;
          parameters: any[];
        }>)
          this.sqlite.query(statement.sql).run(...statement.parameters);
        if (this.failTransaction) throw new Error("database failure");
        this.sqlite.run("COMMIT");
      } catch (error) {
        this.sqlite.run("ROLLBACK");
        throw error;
      }
    },
    execute: async (sql, json) => {
      const args = JSON.parse(json) as any[];
      const statement = this.sqlite.query(sql);
      if (/^SELECT/i.test(sql))
        return JSON.stringify({ rows: statement.all(...args), changes: 0 });
      return JSON.stringify({
        rows: [],
        changes: statement.run(...args).changes,
      });
    },
  });
}

class FakeTransfer implements NativeTransferModule {
  files = new Map<string, number>();
  jobs = new Map<
    string,
    {
      resolve: (size: number) => void;
      reject: (error: Error) => void;
      partial: string;
      final: string;
    }
  >();
  calls: Array<{ id: string; url: string }> = [];
  maximum = 0;
  async defaultDirectory() {
    return "/music";
  }
  async legacyArtworkDirectory() {
    return "/home/.rayna/artwork-cache";
  }
  async paths(
    directory: string,
    server: string,
    id: string,
    _title: string,
    extension: string,
  ) {
    const file = `${directory}/${server}/${id}${extension}`;
    return { file, partial: `${file}.partial` };
  }
  async size(path: string) {
    return this.files.get(path) ?? -1;
  }
  async remove(_directory: string, path: string) {
    this.files.delete(path);
  }
  async prepareDirectory(directory: string) {
    if (!directory.startsWith("/")) throw new Error("Choose an absolute path");
    return directory.replace(/\/$/, "");
  }
  async rebase(oldDirectory: string, newDirectory: string, path: string) {
    return path.startsWith(`${oldDirectory}/`)
      ? `${newDirectory}${path.slice(oldDirectory.length)}`
      : null;
  }
  async copyForMove(
    _oldDirectory: string,
    _newDirectory: string,
    source: string,
    destination: string,
  ) {
    if (this.files.has(destination)) throw new Error("destination exists");
    const size = this.files.get(source);
    if (size === undefined) return false;
    this.files.set(destination, size);
    return true;
  }
  async removeIfSame(
    _oldDirectory: string,
    _newDirectory: string,
    source: string,
    destination: string,
  ) {
    if (this.files.get(source) !== this.files.get(destination)) return false;
    this.files.delete(source);
    return true;
  }
  download(
    id: string,
    url: string,
    _directory: string,
    partial: string,
    final: string,
  ): Promise<number> {
    this.calls.push({ id, url });
    this.files.set(partial, this.files.get(partial) ?? 256);
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, partial, final });
      this.maximum = Math.max(this.maximum, this.jobs.size);
    });
  }
  async cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job) return false;
    this.jobs.delete(id);
    job.reject(new Error("Download paused"));
    return true;
  }
  finish(id: string) {
    const job = this.jobs.get(id)!;
    this.jobs.delete(id);
    this.files.delete(job.partial);
    this.files.set(job.final, 1024);
    job.resolve(1024);
  }
  fail(id: string) {
    const job = this.jobs.get(id)!;
    this.jobs.delete(id);
    job.reject(new Error("offline"));
  }
}

const target: MusicItem = {
  ratingKey: "album",
  title: "Album",
  kind: "album",
  subtitle: "",
  thumb: null,
  duration: null,
  raw: {},
};
function resolver(count: number): DownloadResolver {
  return {
    downloadTracks: async () =>
      Array.from({ length: count }, (_, i) => ({
        ratingKey: String(i),
        title: `Track ${i}`,
        artist: "Artist",
        album: "Album",
        artistRatingKey: "a",
        albumRatingKey: "b",
        duration: 1000,
        thumb: null,
        extension: ".flac",
        totalBytes: 1024,
      })),
    downloadCandidates: async () => [
      "https://local/song",
      "https://remote/song",
    ],
  };
}
async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for a download");
}

describe("desktop downloads", () => {
  test("bounds transfers and preserves partial files through pause and resume", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    let nextId = 0;
    const service = new DownloadService(
      db.database,
      native,
      resolver(4),
      () => `id-${++nextId}`,
    );
    await service.initialize();
    await Promise.all([
      service.enqueue("server", target),
      service.enqueue("server", target),
    ]);
    await until(() => native.jobs.size === 3);
    const queued = await service.list("server");
    expect(queued).toHaveLength(4);
    expect(
      JSON.parse(queued.find((row) => row.rating_key === "2")!.metadata)
        .targetIndex,
    ).toBe(2);
    expect(native.maximum).toBe(3);
    native.finish("id-1");
    await until(() => native.jobs.has("id-4"));
    await service.pause("id-2");
    const paused = (await service.list("server")).find(
      (row) => row.id === "id-2",
    )!;
    expect(paused).toMatchObject({ status: "paused", bytes_downloaded: 256 });
    await service.resume("id-2");
    await until(() => native.jobs.has("id-2"));
    native.finish("id-2");
    await until(() => !native.jobs.has("id-2"));
    await service.dispose();
    const records = await service.list("server");
    expect(records.find((row) => row.id === "id-1")?.status).toBe("completed");
    expect(records.find((row) => row.id === "id-2")?.status).toBe("completed");
    expect(native.maximum).toBe(3);
  });

  test("retries another Plex route without discarding partial bytes", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    const service = new DownloadService(
      db.database,
      native,
      resolver(1),
      () => "id",
    );
    await service.initialize();
    await service.enqueue("server", target);
    await until(() => native.jobs.has("id"));
    native.fail("id");
    await until(() => native.calls.length === 2);
    expect(native.calls.map((call) => call.url)).toEqual([
      "https://local/song",
      "https://remote/song",
    ]);
    expect(await native.size("/music/server/id.flac.partial")).toBe(256);
    native.finish("id");
    await until(() => !native.jobs.has("id"));
    await service.dispose();
    expect((await service.list("server"))[0]).toMatchObject({
      status: "completed",
      bytes_downloaded: 1024,
    });
  });

  test("restores interrupted records and the configured storage directory", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    db.sqlite.run(
      "INSERT INTO settings VALUES ('downloads.storageDirectory', ?)",
      [JSON.stringify("/custom")],
    );
    db.sqlite.run(
      "INSERT INTO downloads VALUES ('old', 'server', '7', 'track', 'Old', '/custom/server/song.flac', '/custom/server/song.flac.partial', 'downloading', 10, NULL, NULL, '{}', 1, 1)",
    );
    db.sqlite.run(
      "INSERT INTO downloads VALUES ('finished', 'server', '8', 'track', 'Finished', '/custom/server/finished.flac', '/custom/server/finished.flac.partial', 'downloading', 0, NULL, NULL, '{\"desktopManaged\":true}', 2, 2)",
    );
    native.files.set("/custom/server/song.flac.partial", 400);
    native.files.set("/custom/server/finished.flac", 1024);
    const service = new DownloadService(
      db.database,
      native,
      resolver(0),
      () => "unused",
    );
    await service.initialize();
    expect(service.storageDirectory).toBe("/custom");
    const records = await service.list("server");
    expect(records.find((row) => row.id === "old")).toMatchObject({
      status: "paused",
      bytes_downloaded: 400,
    });
    expect(records.find((row) => row.id === "finished")).toMatchObject({
      status: "completed",
      bytes_downloaded: 1024,
    });
    expect(await native.size("/custom/server/song.flac.partial")).toBe(400);
    await service.dispose();
  });

  test("keeps a shared file until the last download record is removed", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    for (const id of ["one", "two"]) {
      db.sqlite.run(
        "INSERT INTO downloads VALUES (?, 'server', '7', 'track', 'Song', '/music/server/song.flac', NULL, 'completed', 1024, 1024, NULL, '{}', 1, 1)",
        [id],
      );
    }
    native.files.set("/music/server/song.flac", 1024);
    const service = new DownloadService(
      db.database,
      native,
      resolver(0),
      () => "unused",
    );
    await service.initialize();
    await service.remove("one");
    expect(await native.size("/music/server/song.flac")).toBe(1024);
    expect(await service.list("server")).toHaveLength(1);
    await service.remove("two");
    expect(await native.size("/music/server/song.flac")).toBe(-1);
    expect(await service.list("server")).toHaveLength(0);
    await service.dispose();
  });

  test("clears terminal activity without removing records or media", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    db.sqlite.run(
      "INSERT INTO downloads VALUES ('done', 'server', '7', 'track', 'Song', '/music/server/song.flac', NULL, 'completed', 10, 10, NULL, '{\"artist\":\"Artist\"}', 1, 1)",
    );
    db.sqlite.run(
      "INSERT INTO downloads VALUES ('paused', 'server', '8', 'track', 'Paused', '/music/server/other.flac', NULL, 'paused', 0, NULL, NULL, '{}', 2, 2)",
    );
    native.files.set("/music/server/song.flac", 10);
    const service = new DownloadService(
      db.database,
      native,
      resolver(0),
      () => "unused",
      () => 1000,
    );
    await service.initialize();
    await service.clearActivity("server");
    const records = await service.list("server");
    expect(
      JSON.parse(records.find((row) => row.id === "done")!.metadata),
    ).toMatchObject({ artist: "Artist", activityClearedAt: 1000 });
    expect(
      JSON.parse(records.find((row) => row.id === "paused")!.metadata),
    ).toEqual({});
    expect(await native.size("/music/server/song.flac")).toBe(10);
    await service.dispose();
  });

  test("moves desktop files, retaining originals imported from the old app", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    db.sqlite.run(
      "INSERT INTO downloads VALUES ('legacy', 'server', '1', 'track', 'Legacy', '/music/server/legacy.flac', NULL, 'completed', 10, 10, NULL, '{}', 1, 1)",
    );
    db.sqlite.run(
      "INSERT INTO downloads VALUES ('new', 'server', '2', 'track', 'New', '/music/server/new.flac', NULL, 'completed', 20, 20, NULL, '{\"desktopManaged\":true}', 2, 2)",
    );
    native.files.set("/music/server/legacy.flac", 10);
    native.files.set("/music/server/new.flac", 20);
    const service = new DownloadService(
      db.database,
      native,
      resolver(0),
      () => "unused",
    );
    await service.initialize();
    expect(await service.moveDirectory("/new")).toMatchObject({
      directory: "/new",
      copiedFiles: 2,
      retainedLegacyFiles: 1,
      cleanupFailures: [],
    });
    expect(await native.size("/music/server/legacy.flac")).toBe(10);
    expect(await native.size("/music/server/new.flac")).toBe(-1);
    expect(await native.size("/new/server/new.flac")).toBe(20);
    expect(
      (await service.list("server")).find((row) => row.id === "legacy")
        ?.file_path,
    ).toBe("/new/server/legacy.flac");
    expect(
      JSON.parse(
        (
          db.sqlite
            .query(
              "SELECT value FROM settings WHERE key='downloads.storageDirectory'",
            )
            .get() as { value: string }
        ).value,
      ),
    ).toBe("/new");
    await service.dispose();
  });

  test("rolls back copies and database changes on a destination conflict or transaction failure", async () => {
    for (const mode of ["conflict", "transaction"]) {
      const db = new TestDatabase();
      const native = new FakeTransfer();
      for (const id of ["one", "two"]) {
        db.sqlite.run(
          "INSERT INTO downloads VALUES (?, 'server', ?, 'track', ?, ?, NULL, 'completed', 10, 10, NULL, '{\"desktopManaged\":true}', 1, 1)",
          [id, id, id, `/music/server/${id}.flac`],
        );
        native.files.set(`/music/server/${id}.flac`, 10);
      }
      if (mode === "conflict") native.files.set("/new/server/two.flac", 99);
      else db.failTransaction = true;
      const service = new DownloadService(
        db.database,
        native,
        resolver(0),
        () => "unused",
      );
      await service.initialize();
      await expect(service.moveDirectory("/new")).rejects.toThrow();
      expect(service.storageDirectory).toBe("/music");
      expect(await native.size("/music/server/one.flac")).toBe(10);
      expect(await native.size("/music/server/two.flac")).toBe(10);
      expect(await native.size("/new/server/one.flac")).toBe(-1);
      expect(
        (await service.list("server")).every((row) =>
          row.file_path?.startsWith("/music/"),
        ),
      ).toBe(true);
      if (mode === "conflict")
        expect(await native.size("/new/server/two.flac")).toBe(99);
      await service.dispose();
    }
  });

  test("pauses and resumes active transfers at the moved partial path", async () => {
    const db = new TestDatabase();
    const native = new FakeTransfer();
    const service = new DownloadService(
      db.database,
      native,
      resolver(1),
      () => "id",
    );
    await service.initialize();
    await service.enqueue("server", target);
    await until(() => native.jobs.has("id"));
    await service.moveDirectory("/new");
    await until(() => native.jobs.has("id"));
    expect(native.jobs.get("id")?.partial).toBe("/new/server/id.flac.partial");
    expect(await native.size("/new/server/id.flac.partial")).toBe(256);
    native.finish("id");
    await service.dispose();
  });
});
