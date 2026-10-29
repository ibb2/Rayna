import type { PlayerTrack } from "../../../src/shared/rpc";

/** A source is deliberately independent of a particular Plex connection. */
export type PlaybackSource = {
  path: string;
  params?: Record<string, string>;
  localPath?: string;
};

export type Playable = { track: PlayerTrack; source: PlaybackSource };

/** Ordered candidates can include a direct URL and a proxy for the same route. */
export type PlaybackCandidate = {
  connectionUri: string;
  url?: string;
  localPath?: string;
  /** Distinguishes fallback transports that share the same Plex route. */
  transport?: "direct" | "proxy";
  /** Plex's transcode decision must complete before its start URL is opened. */
  prepareUrl?: string;
};

export type AudioStatus = {
  streamId: string;
  playing: boolean;
  position: number;
  duration: number;
};

export type AudioEvent =
  | { type: "status"; status: AudioStatus }
  | { type: "ended"; streamId: string }
  | { type: "stopped"; streamId: string }
  | { type: "stalled"; streamId: string }
  | { type: "error"; streamId: string; message: string };

/** All positions and durations cross this boundary in seconds. */
export interface AudioEngine {
  open(candidate: PlaybackCandidate): Promise<AudioStatus>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  close(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: (event: AudioEvent) => void): () => void;
}

export type ResolveCandidates = (
  source: PlaybackSource,
  excludedRoutes: ReadonlySet<string>,
) => Promise<PlaybackCandidate[]> | PlaybackCandidate[];

export type PlaybackSnapshot = {
  currentTrack: PlayerTrack | null;
  previousTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  connectionState: "connected" | "reconnecting" | "failed";
  connectionError: string | null;
};

export type PlaybackEvent =
  | {
      type: "track-started";
      track: PlayerTrack;
      position: number;
      duration: number;
    }
  | {
      type: "state-changed";
      state: "playing" | "paused";
      track: PlayerTrack;
      position: number;
      duration: number;
    }
  | {
      type: "seeked";
      track: PlayerTrack;
      position: number;
      duration: number;
      isPlaying: boolean;
    }
  | {
      type: "track-stopped";
      reason: "manual" | "replaced" | "ended" | "remote" | "connection-failed";
      track: PlayerTrack;
      position: number;
      duration: number;
    };
