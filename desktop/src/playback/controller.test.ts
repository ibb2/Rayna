import { describe, expect, test } from "bun:test";
import { PlaybackController } from "./controller";
import type {
  AudioEngine,
  AudioEvent,
  AudioStatus,
  Playable,
  PlaybackCandidate,
} from "./types";

const playable = (id: string): Playable => ({
  track: {
    ratingKey: id,
    title: id,
    artist: "Artist",
    artistRatingKey: "artist",
    album: "Album",
    albumRatingKey: "album",
    duration: 120_000,
  },
  source: { path: `/${id}.flac` },
});

class FakeAudio implements AudioEngine {
  calls: string[] = [];
  failed = new Set<string>();
  listener: ((event: AudioEvent) => void) | null = null;
  serial = 0;
  current: AudioStatus | null = null;

  async open(candidate: PlaybackCandidate): Promise<AudioStatus> {
    const location = candidate.localPath || candidate.url || "";
    this.calls.push(`open:${location}`);
    if (this.failed.has(location)) throw new Error("Cannot open stream");
    this.current = {
      streamId: String(++this.serial),
      position: 0,
      duration: 120,
      playing: false,
    };
    return { ...this.current };
  }
  async play() {
    this.calls.push("play");
    if (this.current) this.current.playing = true;
  }
  async pause() {
    this.calls.push("pause");
    if (this.current) this.current.playing = false;
  }
  async seek(position: number) {
    this.calls.push(`seek:${position}`);
    if (this.current) this.current.position = position;
  }
  async setVolume(volume: number) {
    this.calls.push(`volume:${volume}`);
  }
  async close() {
    this.calls.push("close");
    this.current = null;
  }
  async dispose() {
    this.calls.push("dispose");
  }
  subscribe(listener: (event: AudioEvent) => void) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  emit(event: AudioEvent) {
    this.listener?.(event);
  }
}

describe("desktop playback controller", () => {
  test("starts queued tracks, preserves ordering and implements previous threshold", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, (source) => [
      { connectionUri: "local", url: source.path },
    ]);
    await player.enqueue([playable("one"), playable("two"), playable("three")]);
    expect(player.snapshot().currentTrack?.ratingKey).toBe("one");
    expect(player.snapshot().queue.map((track) => track.ratingKey)).toEqual([
      "two",
      "three",
    ]);
    await player.next();
    await player.seek(8);
    await player.previous();
    expect(player.snapshot().currentTrack?.ratingKey).toBe("two");
    expect(player.snapshot().position).toBe(0);
    await player.previous();
    expect(player.snapshot().currentTrack?.ratingKey).toBe("one");
    expect(player.snapshot().queue.map((track) => track.ratingKey)).toEqual([
      "two",
      "three",
    ]);
    await player.dispose();
  });

  test("tries a proxy and recovers a paused track on another route without losing its queue", async () => {
    const audio = new FakeAudio();
    audio.failed.add("local-direct");
    const player = new PlaybackController(audio, (_source, excluded) =>
      [
        { connectionUri: "local", url: "local-direct" },
        { connectionUri: "local", url: "local-proxy" },
        { connectionUri: "remote", url: "remote-direct" },
      ].filter((candidate) => !excluded.has(candidate.connectionUri)),
    );
    await player.play([playable("one"), playable("two")]);
    expect(audio.calls).toContain("open:local-proxy");
    await player.seek(42);
    await player.pause();
    await player.recover();
    expect(audio.calls).toContain("open:remote-direct");
    const reopened = audio.calls.lastIndexOf("open:remote-direct");
    expect(audio.calls.slice(reopened, reopened + 5)).toEqual([
      "open:remote-direct",
      "volume:1",
      "play",
      "seek:42",
      "pause",
    ]);
    expect(player.snapshot()).toMatchObject({
      currentTrack: { ratingKey: "one" },
      playing: false,
      position: 42,
      connectionState: "connected",
    });
    expect(player.snapshot().queue.map((track) => track.ratingKey)).toEqual([
      "two",
    ]);
    await player.dispose();
  });

  test("recovers a stalled direct stream through the same route's proxy", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, () => [
      { connectionUri: "local", url: "local-direct", transport: "direct" },
      { connectionUri: "local", url: "local-proxy", transport: "proxy" },
    ]);
    await player.play([playable("one"), playable("two")]);
    await player.seek(42);
    audio.emit({ type: "stalled", streamId: audio.current!.streamId });
    await player.setVolume(0.5); // Wait for the queued native event.
    expect(audio.calls).toContain("open:local-proxy");
    expect(player.snapshot()).toMatchObject({
      currentTrack: { ratingKey: "one" },
      position: 42,
      playing: true,
      connectionState: "connected",
    });
    expect(player.snapshot().queue.map((track) => track.ratingKey)).toEqual([
      "two",
    ]);
    await player.dispose();
  });

  test("stops retrying failed transports when neither makes progress", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, () => [
      { connectionUri: "local", url: "local-direct", transport: "direct" },
      { connectionUri: "local", url: "local-proxy", transport: "proxy" },
    ]);
    await player.play([playable("one")]);
    audio.emit({ type: "stalled", streamId: audio.current!.streamId });
    await player.setVolume(0.5);
    audio.emit({ type: "stalled", streamId: audio.current!.streamId });
    await player.setVolume(0.5);
    expect(audio.calls.filter((call) => call.startsWith("open:"))).toEqual([
      "open:local-direct",
      "open:local-proxy",
    ]);
    expect(player.snapshot()).toMatchObject({
      currentTrack: null,
      connectionState: "failed",
    });
    await player.dispose();
  });

  test("permits a previously failed route after stable recovered playback", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, () => [
      { connectionUri: "local", url: "local-direct", transport: "direct" },
      { connectionUri: "local", url: "local-proxy", transport: "proxy" },
    ]);
    await player.play([playable("one")]);
    audio.emit({ type: "stalled", streamId: audio.current!.streamId });
    await player.setVolume(0.5);
    audio.emit({ type: "status", status: { ...audio.current!, position: 11 } });
    await player.setVolume(0.5);
    audio.emit({ type: "stalled", streamId: audio.current!.streamId });
    await player.setVolume(0.5);
    expect(audio.calls.filter((call) => call.startsWith("open:"))).toEqual([
      "open:local-direct",
      "open:local-proxy",
      "open:local-direct",
    ]);
    expect(player.snapshot()).toMatchObject({
      position: 11,
      connectionState: "connected",
    });
    await player.dispose();
  });

  test("restores the original source when a source replacement cannot open", async () => {
    const audio = new FakeAudio();
    audio.failed.add("/bad");
    const player = new PlaybackController(audio, (source) => [
      { connectionUri: "local", url: source.path },
    ]);
    await player.play([playable("one"), playable("two")]);
    await player.seek(20);
    expect(await player.replaceCurrentSource({ path: "/bad" })).toBe(false);
    expect(player.snapshot()).toMatchObject({
      currentTrack: { ratingKey: "one" },
      position: 20,
      playing: true,
    });
    expect(player.snapshot().queue.map((track) => track.ratingKey)).toEqual([
      "two",
    ]);
    expect(
      audio.calls.filter((call) => call === "open:/one.flac"),
    ).toHaveLength(2);
    await player.dispose();
  });

  test("ignores stale stream events and advances once when the active stream ends", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, (source) => [
      { connectionUri: "local", url: source.path },
    ]);
    await player.play([playable("one"), playable("two"), playable("three")]);
    const oldId = audio.current!.streamId;
    audio.emit({ type: "ended", streamId: oldId });
    await player.setVolume(0.5); // queued after the native event
    expect(player.snapshot().currentTrack?.ratingKey).toBe("two");
    audio.emit({ type: "ended", streamId: oldId });
    await player.setVolume(0.5);
    expect(player.snapshot().currentTrack?.ratingKey).toBe("two");
    await player.dispose();
  });

  test("advances when an unknown-length stream reaches the Plex track duration", async () => {
    const audio = new FakeAudio();
    const open = audio.open.bind(audio);
    audio.open = async (candidate) => ({
      ...(await open(candidate)),
      duration: 0,
    });
    const player = new PlaybackController(audio, (source) => [
      { connectionUri: "local", url: source.path },
    ]);
    await player.play([playable("one"), playable("two")]);
    const id = audio.current!.streamId;
    audio.emit({
      type: "status",
      status: { streamId: id, playing: false, position: 119.5, duration: 0 },
    });
    audio.emit({ type: "stopped", streamId: id });
    await player.setVolume(0.5);
    expect(player.snapshot().currentTrack?.ratingKey).toBe("two");
    await player.dispose();
  });

  test("serializes commands and publishes timeline events", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, (source) => [
      { connectionUri: "local", url: source.path },
    ]);
    const events: string[] = [];
    player.onPlaybackEvent((event) => events.push(event.type));
    await Promise.all([
      player.play([playable("one")]),
      player.pause(),
      player.seek(10),
    ]);
    expect(player.snapshot()).toMatchObject({ playing: false, position: 10 });
    expect(events).toEqual(["track-started", "state-changed", "seeked"]);
    await player.dispose();
  });

  test("updates queued and historical local paths after a storage move", async () => {
    const audio = new FakeAudio();
    const player = new PlaybackController(audio, (source) => [
      { connectionUri: "offline", localPath: source.localPath },
    ]);
    const one = {
      ...playable("one"),
      source: { path: "", localPath: "/old/one.flac" },
    };
    const two = {
      ...playable("two"),
      source: { path: "", localPath: "/old/two.flac" },
    };
    await player.play([one, two]);
    await player.remapLocalPaths({
      "/old/one.flac": "/new/one.flac",
      "/old/two.flac": "/new/two.flac",
    });
    await player.next();
    expect(audio.calls).toContain("open:/new/two.flac");
    await player.previous();
    expect(audio.calls).toContain("open:/new/one.flac");
    await player.dispose();
  });
});
