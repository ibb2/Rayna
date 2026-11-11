import type { PlayerTrack } from "../../../src/shared/rpc";
import type { PlaybackController } from "../playback/controller";
import type { PlaybackEvent } from "../playback/types";
import type { PlexSession } from "./session";

type TimelineState = "playing" | "paused" | "stopped";
type Active = {
  track: PlayerTrack;
  sessionId: string;
  state: TimelineState;
  pausedTicks: number;
};

/** Plex timeline requests are best effort and must never stop local playback. */
export class PlexTimeline {
  private active: Active | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private handlingTermination = false;

  constructor(
    private readonly session: PlexSession,
    private readonly player: PlaybackController,
  ) {}

  start(): void {
    if (!this.unsubscribe)
      this.unsubscribe = this.player.onPlaybackEvent((event) =>
        this.handle(event),
      );
  }

  refresh(): void {
    if (this.session.snapshot.enableTimelineReporting === false) {
      this.stopTimer();
      this.active = null;
      return;
    }
    const status = this.player.snapshot();
    if (status.currentTrack) {
      this.handle({
        type: "track-started",
        track: status.currentTrack,
        position: status.position,
        duration: status.duration,
      });
      if (!status.playing)
        this.handle({
          type: "state-changed",
          state: "paused",
          track: status.currentTrack,
          position: status.position,
          duration: status.duration,
        });
    }
  }

  dispose(): void {
    this.stopTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.active = null;
  }

  private handle(event: PlaybackEvent): void {
    if (this.session.snapshot.enableTimelineReporting === false) {
      this.stopTimer();
      this.active = null;
      return;
    }
    if (this.handlingTermination) return;
    if (event.type === "track-started") {
      const sessionId = event.track.plexSessionId;
      if (!sessionId) return;
      this.active = {
        track: event.track,
        sessionId,
        state: "playing",
        pausedTicks: 0,
      };
      void this.report(this.active, "playing", event.position, event.duration);
      this.startTimer();
    } else if (event.type === "state-changed" || event.type === "seeked") {
      if (!this.active || this.active.track.ratingKey !== event.track.ratingKey)
        return;
      const state =
        event.type === "seeked"
          ? event.isPlaying
            ? "playing"
            : "paused"
          : event.state;
      this.active.state = state;
      this.active.pausedTicks = 0;
      void this.report(this.active, state, event.position, event.duration);
    } else if (this.active?.track.ratingKey === event.track.ratingKey) {
      const active = this.active;
      this.active = null;
      this.stopTimer();
      if (event.reason !== "remote")
        void this.report(active, "stopped", event.position, event.duration);
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      const active = this.active;
      if (!active || this.session.snapshot.enableTimelineReporting === false) {
        this.stopTimer();
        return;
      }
      if (active.state === "paused" && ++active.pausedTicks < 6) return;
      active.pausedTicks = 0;
      const status = this.player.snapshot();
      void this.report(active, active.state, status.position, status.duration);
    }, 10_000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async report(
    active: Active,
    state: TimelineState,
    position: number,
    duration: number,
  ): Promise<void> {
    try {
      const ms = (seconds: number) =>
        String(
          Number.isFinite(seconds)
            ? Math.max(0, Math.floor(seconds * 1000))
            : 0,
        );
      const response = await this.session.serverRequest("/:/timeline", {
        type: "music",
        key: `/library/metadata/${active.track.ratingKey}`,
        ratingKey: active.track.ratingKey,
        state,
        time: ms(position),
        playbackTime: ms(position),
        duration: ms(duration || (active.track.duration || 0) / 1000),
        context: "source:content.library",
        hasMDE: "1",
        "X-Plex-Client-Identifier": this.session.snapshot.clientIdentifier,
        "X-Plex-Session-Identifier": active.sessionId,
        "X-Plex-Product": "Rayna",
        "X-Plex-Version": "0.4.0",
        "X-Plex-Platform": "Generic",
      });
      const text = await response.text();
      let termination = /\btermination(Code|Text)\b/i.test(text);
      try {
        const data = JSON.parse(text) as {
          MediaContainer?: {
            terminationCode?: unknown;
            terminationText?: unknown;
          };
          terminationCode?: unknown;
          terminationText?: unknown;
        };
        const container = data.MediaContainer || data;
        termination ||=
          container.terminationCode !== undefined ||
          container.terminationText !== undefined;
      } catch {
        /* Plex may return XML or an empty body. */
      }
      if (termination && this.active === active && !this.handlingTermination) {
        this.handlingTermination = true;
        this.active = null;
        this.stopTimer();
        try {
          await this.player.stop(true);
        } finally {
          this.handlingTermination = false;
        }
      }
    } catch {
      /* Reporting must not interrupt playback. */
    }
  }
}
