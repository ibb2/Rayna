import { describe, expect, test } from "bun:test";
import { withStreamProxy } from "./proxy";

describe("desktop stream proxy adapter", () => {
  test("prefers direct files and proxies extensionless transcodes", async () => {
    const proxy = {
      registerUrl: async (url: string) =>
        `http://127.0.0.1/proxy/${url.includes("start") ? "transcode" : "file"}`,
      stop: async () => {},
    };
    const result = await withStreamProxy(
      [
        { connectionUri: "offline", localPath: "/music/song.flac" },
        { connectionUri: "local", url: "https://plex/song.flac" },
        {
          connectionUri: "remote",
          url: "https://plex/music/start",
          prepareUrl: "https://plex/music/decision",
        },
      ],
      proxy,
    );
    expect(
      result.map((candidate) => candidate.url || candidate.localPath),
    ).toEqual([
      "/music/song.flac",
      "https://plex/song.flac",
      "http://127.0.0.1/proxy/file",
      "http://127.0.0.1/proxy/transcode",
      "https://plex/music/start",
    ]);
    expect(result[3]?.prepareUrl).toBe("https://plex/music/decision");
    expect(result.map((candidate) => candidate.transport)).toEqual([
      undefined,
      "direct",
      "proxy",
      "proxy",
      "direct",
    ]);
  });

  test("keeps a direct candidate when the native proxy cannot start", async () => {
    const result = await withStreamProxy(
      [{ connectionUri: "local", url: "https://plex/song" }],
      {
        registerUrl: async () => {
          throw new Error("unavailable");
        },
        stop: async () => {},
      },
    );
    expect(result).toEqual([
      { connectionUri: "local", url: "https://plex/song", transport: "direct" },
    ]);
  });
});
