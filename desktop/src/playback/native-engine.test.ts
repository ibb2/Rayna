import { describe, expect, test } from "bun:test";
import {
  NativeAudioEngine,
  type NativeBassModule,
  type NativeBassStatus,
} from "./native-engine";
import type { AudioEvent } from "./types";

class FakeNative implements NativeBassModule {
  state: NativeBassStatus = {
    playing: false,
    stalled: false,
    stopped: true,
    position: 0,
    duration: 120,
  };
  missing = false;
  disposed = 0;
  openedUrls: string[] = [];
  async initialize() {
    return {
      version: 1,
      plugins: [
        { name: "opus", loaded: !this.missing, error: this.missing ? 2 : 0 },
      ],
    };
  }
  async openFile() {
    this.state = {
      playing: false,
      stalled: false,
      stopped: true,
      position: 0,
      duration: 120,
    };
  }
  async openUrl(url: string) {
    this.openedUrls.push(url);
    await this.openFile();
  }
  async play() {
    this.state.playing = true;
    this.state.stopped = false;
  }
  async pause() {
    this.state.playing = false;
  }
  async seek(position: number) {
    this.state.position = position;
  }
  async setVolume() {}
  async status() {
    return { ...this.state };
  }
  async close() {}
  async dispose() {
    this.disposed++;
  }
}

function poll(engine: NativeAudioEngine): Promise<void> {
  return (engine as unknown as { poll(): Promise<void> }).poll();
}

describe("native audio adapter", () => {
  test("reports an ended stream once and does not mistake a paused stream for an end", async () => {
    const native = new FakeNative();
    const engine = new NativeAudioEngine(native, { pollIntervalMs: 0 });
    const events: AudioEvent[] = [];
    engine.subscribe((event) => events.push(event));
    await engine.open({ connectionUri: "local", localPath: "/song.flac" });
    await engine.play();
    await engine.pause();
    await poll(engine);
    expect(events.filter((event) => event.type === "ended")).toHaveLength(0);
    native.state = {
      playing: false,
      stalled: false,
      stopped: true,
      position: 120,
      duration: 120,
    };
    await poll(engine);
    await poll(engine);
    expect(events.filter((event) => event.type === "ended")).toHaveLength(1);
    await engine.dispose();
  });

  test("reports a persistent stall and rejects missing codec plugins", async () => {
    const native = new FakeNative();
    let time = 0;
    const engine = new NativeAudioEngine(native, {
      pollIntervalMs: 0,
      now: () => time,
      stallTimeoutMs: 8000,
    });
    const events: AudioEvent[] = [];
    engine.subscribe((event) => events.push(event));
    await engine.open({
      connectionUri: "remote",
      url: "https://example.test/song",
    });
    await engine.play();
    native.state = { ...native.state, playing: false, stalled: true };
    await poll(engine);
    time = 8000;
    await poll(engine);
    expect(events.filter((event) => event.type === "stalled")).toHaveLength(1);
    await engine.dispose();
    const missing = new FakeNative();
    missing.missing = true;
    const unsupported = new NativeAudioEngine(missing, { pollIntervalMs: 0 });
    await expect(
      unsupported.open({ connectionUri: "local", localPath: "/song" }),
    ).rejects.toThrow("opus");
    expect(missing.disposed).toBe(1);
  });

  test("reports a stopped stream with unknown duration for the controller to classify", async () => {
    const native = new FakeNative();
    const engine = new NativeAudioEngine(native, { pollIntervalMs: 0 });
    const events: AudioEvent[] = [];
    engine.subscribe((event) => events.push(event));
    await engine.open({ connectionUri: "local", localPath: "/song.flac" });
    await engine.play();
    native.state = {
      playing: false,
      stalled: false,
      stopped: true,
      position: 120,
      duration: 0,
    };
    await poll(engine);
    expect(events.at(-1)?.type).toBe("stopped");
    await engine.dispose();
  });

  test("prepares Plex transcoding before opening a stream and rejects failed decisions", async () => {
    const native = new FakeNative();
    const requests: string[] = [];
    const engine = new NativeAudioEngine(native, {
      pollIntervalMs: 0,
      request: (async (input: string | URL | Request) => {
        requests.push(String(input));
        return new Response("{}", {
          status: requests.length === 1 ? 200 : 503,
        });
      }) as typeof fetch,
    });
    const candidate = {
      connectionUri: "server",
      url: "https://plex.test/start",
      prepareUrl: "https://plex.test/decision",
    };
    await engine.open(candidate);
    expect(requests).toEqual(["https://plex.test/decision"]);
    expect(native.openedUrls).toEqual(["https://plex.test/start"]);
    await expect(engine.open(candidate)).rejects.toThrow(
      "Plex transcode decision failed: 503",
    );
    expect(native.openedUrls).toEqual(["https://plex.test/start"]);
    await engine.dispose();
  });
});
