import { describe, expect, test } from "bun:test";
import { DesktopDatabase } from "../storage/database";
import { SyncService, type SyncResolver } from "./service";

class MemoryDatabase {
  records = new Map<string, Record<string, unknown>>();
  downloads = [
    {
      id: "download",
      rating_key: "missing",
      metadata: JSON.stringify({
        artist: "Artist",
        filePath: "/keep/song.flac",
      }),
    },
  ];
  database = new DesktopDatabase({
    open: async () => ({ migrated: false }),
    close: async () => {},
    execute: async (sql, json) => {
      const params = JSON.parse(json) as any[];
      if (sql.startsWith("INSERT INTO sync_status")) {
        const key = `${params[0]}:${params[1]}`;
        this.records.set(key, {
          status: params[2],
          last_started_at: params[3],
          last_completed_at:
            params[4] ?? this.records.get(key)?.last_completed_at ?? null,
          error: params[5],
          details: params[6],
        });
        return JSON.stringify({ rows: [], changes: 1 });
      }
      if (sql.startsWith("SELECT status")) {
        const row = this.records.get(`${params[0]}:${params[1]}`);
        return JSON.stringify({ rows: row ? [row] : [], changes: 0 });
      }
      if (sql.startsWith("SELECT id"))
        return JSON.stringify({ rows: this.downloads, changes: 0 });
      if (sql.startsWith("UPDATE downloads")) {
        const download = this.downloads.find((item) => item.id === params[2]);
        if (download) {
          const metadata = JSON.parse(download.metadata || "null") || {};
          const patch = JSON.parse(params[0]);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) delete metadata[key];
            else metadata[key] = value;
          }
          download.metadata = JSON.stringify(metadata);
        }
        return JSON.stringify({ rows: [], changes: 1 });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
}

describe("desktop synchronization", () => {
  test("shares concurrent jobs and marks missing tracks without removing their files", async () => {
    const db = new MemoryDatabase();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let refreshes = 0;
    const resolver: SyncResolver = {
      selectedLibraries: async () => ["music", "music"],
      refreshLibrary: async () => {
        refreshes++;
        await gate;
        return 2;
      },
      trackExists: async () => false,
    };
    const service = new SyncService(db.database, resolver, () => 1000);
    const first = service.run("server", "startup");
    const second = service.run("server", "manual");
    expect(first).toBe(second);
    release();
    const status = await first;
    expect(status).toMatchObject({
      state: "succeeded",
      trigger: "startup",
      refreshedLibraries: 1,
      reconciledDownloads: 1,
    });
    expect(refreshes).toBe(1);
    expect(JSON.parse(db.downloads[0]!.metadata)).toMatchObject({
      orphaned: true,
      filePath: "/keep/song.flac",
    });
  });

  test("reports failed refreshes without changing downloaded records", async () => {
    const db = new MemoryDatabase();
    const original = db.downloads[0]!.metadata;
    const service = new SyncService(
      db.database,
      {
        selectedLibraries: async () => ["music"],
        refreshLibrary: async () => {
          throw new Error("offline");
        },
        trackExists: async () => {
          throw new Error("offline");
        },
      },
      () => 1000,
    );
    expect(await service.run("server", "manual")).toMatchObject({
      state: "failed",
      failedLibraries: 1,
      reconciledDownloads: 0,
    });
    expect(db.downloads[0]!.metadata).toBe(original);
  });

  test("retains a library's last completed sync when a later refresh fails", async () => {
    const db = new MemoryDatabase();
    db.records.set("server:music", {
      status: "completed",
      last_started_at: 100,
      last_completed_at: 200,
      error: null,
      details: "{}",
    });
    const service = new SyncService(
      db.database,
      {
        selectedLibraries: async () => ["music"],
        refreshLibrary: async () => {
          throw new Error("offline");
        },
        trackExists: async () => {
          throw new Error("offline");
        },
      },
      () => 1000,
    );
    await service.run("server", "manual");
    expect(db.records.get("server:music")).toMatchObject({
      status: "failed",
      last_completed_at: 200,
    });
  });
});
