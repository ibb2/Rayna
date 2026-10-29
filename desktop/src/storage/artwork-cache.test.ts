import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { NativeTransferModule } from "../downloads/service";
import { ArtworkCache } from "./artwork-cache";
import { fileUri } from "./file-uri";

describe("desktop artwork cache", () => {
  test("reuses the old cache key, bounds downloads, and works offline", async () => {
    const files = new Map<string, number>();
    let transfers = 0;
    let limit = 0;
    let offline = false;
    const native = {
      size: async (path: string) => files.get(path) ?? -1,
      cancel: async () => false,
      download: async (
        _id: string,
        _url: string,
        _directory: string,
        _partial: string,
        destination: string,
        maximumBytes: number,
      ) => {
        transfers++;
        limit = maximumBytes;
        files.set(destination, 200);
        return 200;
      },
    } as unknown as NativeTransferModule;
    const cache = new ArtworkCache(
      native,
      () => "plex/server",
      () => offline,
    );
    cache.setDirectory("/Users/A B/.rayna/artwork-cache");
    const url = "https://plex.test/library/thumb?X-Plex-Token=token";
    const hash = createHash("sha256").update(url).digest("hex");
    const expected = `file:///Users/A%20B/.rayna/artwork-cache/plex-server/${hash}`;
    expect(await Promise.all([cache.resolve(url), cache.resolve(url)])).toEqual(
      [expected, expected],
    );
    expect(transfers).toBe(1);
    expect(limit).toBe(10 * 1024 * 1024);
    offline = true;
    expect(await cache.resolve(url)).toBe(expected);
    expect(await cache.resolve(`${url}-missing`)).toBeNull();
    expect(transfers).toBe(1);
    offline = false;
    const unicodeUrl = "https://plex.test/cover/音楽";
    const unicodeHash = createHash("sha256").update(unicodeUrl).digest("hex");
    expect(await cache.resolve(unicodeUrl)).toBe(
      `file:///Users/A%20B/.rayna/artwork-cache/plex-server/${unicodeHash}`,
    );
    await cache.dispose();
  });

  test("forms file URLs for Windows paths and network shares", () => {
    expect(fileUri("C:\\Users\\A B\\cache", "server", "hash")).toBe(
      "file:///C:/Users/A%20B/cache/server/hash",
    );
    expect(fileUri("\\\\host\\share\\cache", "server", "hash")).toBe(
      "file://host/share/cache/server/hash",
    );
  });
});
