import { describe, expect, test } from "bun:test";
import { PlexSession, type SavedSession, type SessionStore } from "./session";
import type { PlexServer } from "../../../src/shared/types";

class MemoryStore implements SessionStore {
  constructor(public value: SavedSession | null = null) {}
  async read() {
    return this.value && structuredClone(this.value);
  }
  async write(value: SavedSession) {
    this.value = structuredClone(value);
  }
}

const server = {
  name: "Plex",
  product: "Plex Media Server",
  clientIdentifier: "server-1",
  accessToken: "server-token",
  connections: [
    {
      uri: "http://local:32400",
      address: "local",
      port: 32400,
      protocol: "http",
      local: true,
      relay: false,
      IPv6: false,
    },
    {
      uri: "https://remote:32400",
      address: "remote",
      port: 32400,
      protocol: "https",
      local: false,
      relay: false,
      IPv6: false,
    },
  ],
} as PlexServer;

describe("desktop Plex session", () => {
  test("preserves an existing client identifier and signs in using a Plex PIN", async () => {
    const store = new MemoryStore({
      clientIdentifier: "existing",
      selectedLibraries: ["music"],
    });
    const calls: Array<{ url: string; method: string }> = [];
    const request = (async (
      url: string | URL | Request,
      options?: RequestInit,
    ) => {
      calls.push({ url: String(url), method: options?.method || "GET" });
      return Response.json(
        calls.length === 1
          ? { id: 42, code: "ABCD" }
          : { authToken: "user-token" },
      );
    }) as typeof fetch;
    const session = new PlexSession(store, () => "new-id", request);
    await session.initialize();
    const pin = await session.createPin();
    expect(pin.id).toBe("42");
    expect(pin.authUrl).toContain("clientID=existing");
    expect(await session.checkPin(pin.id)).toBe(true);
    expect(store.value).toMatchObject({
      clientIdentifier: "existing",
      plexUserAccessToken: "user-token",
      selectedLibraries: ["music"],
    });
    expect(calls[0]?.method).toBe("POST");
  });

  test("reads the legacy misspelled connection key without rewriting the old session", async () => {
    const store = new MemoryStore({
      clientIdentifier: "existing",
      lastKnowGoodConnection: "https://old:32400",
    });
    const session = new PlexSession(store, () => "unused");
    await session.initialize();
    expect(session.snapshot.lastKnownGoodConnection).toBe("https://old:32400");
    expect(store.value?.lastKnownGoodConnection).toBeUndefined();
  });

  test("validates a server before stopping playback and preserves old selection on failure", async () => {
    const store = new MemoryStore({
      clientIdentifier: "id",
      plexUserAccessToken: "user-token",
      selectedLibraries: ["old"],
    });
    const session = new PlexSession(
      store,
      () => "unused",
      (async () =>
        new Response("unavailable", {
          status: 503,
        })) as unknown as typeof fetch,
    );
    await session.initialize();
    let stopped = false;
    await expect(
      session.selectServer(server, async () => {
        stopped = true;
      }),
    ).rejects.toThrow("No reachable");
    expect(stopped).toBe(false);
    expect(store.value?.selectedLibraries).toEqual(["old"]);
    expect(store.value?.selectedServer).toBeUndefined();
  });

  test("fails over between routes, selects libraries and stores the last successful route", async () => {
    const store = new MemoryStore({
      clientIdentifier: "id",
      plexUserAccessToken: "user-token",
    });
    const calls: string[] = [];
    const request = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      calls.push(url);
      expect((init?.headers as Record<string, string>)["X-Plex-Token"]).toBe(
        "server-token",
      );
      if (url.startsWith("http://local")) throw new Error("offline");
      if (url.endsWith("/identity")) return new Response("ok");
      return Response.json({
        MediaContainer: {
          Directory: [
            { key: "1", uuid: "music", title: "Music", type: "artist" },
          ],
        },
      });
    }) as typeof fetch;
    const session = new PlexSession(store, () => "unused", request);
    await session.initialize();
    await session.selectServer(server);
    expect(store.value?.lastKnownGoodConnection).toBe("https://remote:32400");
    const libraries = await session.libraries();
    await session.selectLibraries(libraries);
    expect(store.value?.selectedLibraries).toMatchObject([{ uuid: "music" }]);
    expect(calls.filter((url) => url.startsWith("http://local"))).toHaveLength(
      1,
    );
  });

  test("serializes simultaneous preference changes without losing either value", async () => {
    const store = new MemoryStore({ clientIdentifier: "id" });
    const session = new PlexSession(store, () => "unused");
    await session.initialize();
    await Promise.all([
      session.setTheme("dark"),
      session.setTimelineReporting(false),
      session.setUltraBlur(false),
      session.selectLibraries(["music"]),
    ]);
    expect(store.value).toMatchObject({
      theme: "dark",
      enableTimelineReporting: false,
      enableUltraBlur: false,
      selectedLibraries: ["music"],
    });
  });

  test("uses the migrated profile offline and refreshes it online", async () => {
    const oldProfile = {
      id: "1",
      username: "old",
      title: "Old",
      email: "",
      thumb: "",
    };
    const store = new MemoryStore({
      clientIdentifier: "id",
      plexUserAccessToken: "token",
      userProfile: { profile: oldProfile, fetchedAt: 0 },
    });
    let requests = 0;
    const session = new PlexSession(store, () => "unused", (async () => {
      requests++;
      return Response.json({ id: 2, username: "new" });
    }) as unknown as typeof fetch);
    await session.initialize();
    session.setOffline(true);
    expect(await session.userProfile()).toEqual(oldProfile);
    expect(requests).toBe(0);
    session.setOffline(false);
    expect(await session.userProfile()).toMatchObject({
      id: "2",
      username: "new",
      title: "new",
    });
    expect(
      (store.value?.userProfile as { profile: { username: string } }).profile
        .username,
    ).toBe("new");
  });

  test("discards a response from the old server after the selection changes", async () => {
    const nextServer = {
      ...server,
      clientIdentifier: "server-2",
      connections: [{ ...server.connections[0]!, uri: "http://next:32400" }],
    };
    const store = new MemoryStore({
      clientIdentifier: "id",
      plexUserAccessToken: "user-token",
      selectedServer: server,
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const request = (async (input: string | URL | Request) => {
      if (String(input).startsWith("http://next")) return new Response("ok");
      started();
      await gate;
      return Response.json({
        MediaContainer: { Metadata: [{ title: "old server" }] },
      });
    }) as typeof fetch;
    const session = new PlexSession(store, () => "unused", request);
    await session.initialize();
    const pending = session.serverRequest("/library/metadata/1");
    await requestStarted;
    await session.selectServer(nextServer);
    release();
    await expect(pending).rejects.toThrow("selected Plex server changed");
    expect(session.snapshot.selectedServer?.clientIdentifier).toBe("server-2");
  });

  test("does not send Plex credentials to an unrelated absolute URL", async () => {
    const store = new MemoryStore({
      clientIdentifier: "id",
      plexUserAccessToken: "user-token",
      selectedServer: server,
    });
    let requests = 0;
    const session = new PlexSession(store, () => "unused", (async () => {
      requests++;
      return new Response("ok");
    }) as unknown as typeof fetch);
    await session.initialize();
    await expect(
      session.serverRequest("https://other.example/lyrics"),
    ).rejects.toThrow("Invalid Plex server path");
    expect(requests).toBe(0);
  });
});
