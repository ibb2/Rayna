import { describe, expect, test } from "bun:test";
import { PlaybackController } from "../playback/controller";
import type {
  AudioEngine,
  AudioEvent,
  AudioStatus,
  Playable,
} from "../playback/types";
import type { PlexSession } from "./session";
import { PlexTimeline } from "./timeline";

class Audio implements AudioEngine {
  listener: ((event: AudioEvent) => void) | null = null;
  async open(): Promise<AudioStatus> {
    return { streamId: "1", playing: false, position: 0, duration: 120 };
  }
  async play() {}
  async pause() {}
  async seek() {}
  async setVolume() {}
  async close() {}
  async dispose() {}
  subscribe(listener: (event: AudioEvent) => void) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
}

const track: Playable = {
  track: {
    ratingKey: "7",
    title: "Song",
    artist: "Artist",
    artistRatingKey: "1",
    album: "Album",
    albumRatingKey: "2",
    duration: 120000,
    plexSessionId: "session-7",
  },
  source: { path: "/song.flac" },
};

describe("desktop Plex timeline", () => {
  test("reports playback, pause, seek and stop using the track's session identifier", async () => {
    const calls: Array<Record<string, string>> = [];
    const session = {
      snapshot: { clientIdentifier: "client", enableTimelineReporting: true },
      serverRequest: async (_path: string, params: Record<string, string>) => {
        calls.push(params);
        return new Response("");
      },
    } as unknown as PlexSession;
    const player = new PlaybackController(new Audio(), () => [
      { connectionUri: "local", url: "/song.flac" },
    ]);
    const timeline = new PlexTimeline(session, player);
    timeline.start();
    await player.play([track]);
    await player.pause();
    await player.seek(10);
    await player.stop();
    expect(calls.map((call) => call.state)).toEqual([
      "playing",
      "paused",
      "paused",
      "stopped",
    ]);
    expect(
      calls.every((call) => call["X-Plex-Session-Identifier"] === "session-7"),
    ).toBe(true);
    expect(calls[2]?.time).toBe("10000");
    timeline.dispose();
    await player.dispose();
  });

  test("does not send timeline requests when reporting is disabled", async () => {
    let requests = 0;
    const session = {
      snapshot: { clientIdentifier: "client", enableTimelineReporting: false },
      serverRequest: async () => {
        requests++;
        return new Response("");
      },
    } as unknown as PlexSession;
    const player = new PlaybackController(new Audio(), () => [
      { connectionUri: "local", url: "/song.flac" },
    ]);
    const timeline = new PlexTimeline(session, player);
    timeline.start();
    await player.play([track]);
    await player.pause();
    expect(requests).toBe(0);
    timeline.dispose();
    await player.dispose();
  });
});
