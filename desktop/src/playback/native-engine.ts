import type {
  AudioEngine,
  AudioEvent,
  AudioStatus,
  PlaybackCandidate,
} from "./types";

export type NativeBassStatus = {
  playing: boolean;
  stalled: boolean;
  stopped: boolean;
  position: number;
  duration: number;
};

/** Implemented by the small desktop native module, not by Expo's mobile modules. */
export interface NativeBassModule {
  initialize(): Promise<{
    version: number;
    plugins: Array<{ name: string; loaded: boolean; error: number }>;
  }>;
  openFile(path: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  status(): Promise<NativeBassStatus>;
  close(): Promise<void>;
  dispose(): Promise<void>;
}

/** Polling remains in JS so BASS's callback threads never call React Native. */
export class NativeAudioEngine implements AudioEngine {
  private initialized = false;
  private nextId = 0;
  private streamId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private stalledAt: number | null = null;
  private terminalEventSent = false;
  private readonly listeners = new Set<(event: AudioEvent) => void>();

  constructor(
    private readonly native: NativeBassModule,
    private readonly options: {
      pollIntervalMs?: number;
      stallTimeoutMs?: number;
      now?: () => number;
      request?: typeof fetch;
    } = {},
  ) {}

  async open(candidate: PlaybackCandidate): Promise<AudioStatus> {
    if (!this.initialized) {
      const info = await this.native.initialize();
      const missing = info.plugins.filter((plugin) => !plugin.loaded);
      if (missing.length) {
        await this.native.dispose();
        throw new Error(
          `Unable to load BASS plugins: ${missing.map((plugin) => plugin.name).join(", ")}`,
        );
      }
      this.initialized = true;
    }
    this.stopPolling();
    this.streamId = null;
    if (candidate.localPath) await this.native.openFile(candidate.localPath);
    else if (candidate.url) {
      if (candidate.prepareUrl) {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 8000);
        try {
          const response = await (this.options.request ?? fetch)(
            candidate.prepareUrl,
            { headers: { Accept: "application/json" }, signal: abort.signal },
          );
          if (!response.ok)
            throw new Error(
              `Plex transcode decision failed: ${response.status}`,
            );
        } finally {
          clearTimeout(timeout);
        }
      }
      await this.native.openUrl(candidate.url);
    } else throw new Error("A playback candidate requires a file or URL");
    const id = String(++this.nextId);
    this.streamId = id;
    this.stalledAt = null;
    this.terminalEventSent = false;
    const status = await this.native.status();
    return this.toAudioStatus(id, status);
  }

  async play(): Promise<void> {
    await this.native.play();
    if (!this.timer) this.startPolling();
  }
  pause(): Promise<void> {
    return this.native.pause();
  }
  seek(position: number): Promise<void> {
    return this.native.seek(position);
  }
  setVolume(volume: number): Promise<void> {
    return this.native.setVolume(volume);
  }

  async close(): Promise<void> {
    this.stopPolling();
    this.streamId = null;
    if (this.initialized) await this.native.close();
  }

  async dispose(): Promise<void> {
    await this.close();
    if (this.initialized) await this.native.dispose();
    this.initialized = false;
    this.listeners.clear();
  }

  subscribe(listener: (event: AudioEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startPolling(): void {
    const interval = this.options.pollIntervalMs ?? 250;
    if (interval > 0)
      this.timer = setInterval(() => void this.poll(), interval);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    const id = this.streamId;
    if (!id || this.polling || this.terminalEventSent) return;
    this.polling = true;
    try {
      const status = await this.native.status();
      if (id !== this.streamId) return;
      this.emit({ type: "status", status: this.toAudioStatus(id, status) });
      if (status.stalled) {
        this.stalledAt ??= (this.options.now ?? Date.now)();
        if (
          (this.options.now ?? Date.now)() - this.stalledAt >=
          (this.options.stallTimeoutMs ?? 8000)
        ) {
          this.terminalEventSent = true;
          this.emit({ type: "stalled", streamId: id });
        }
      } else {
        this.stalledAt = null;
        if (status.stopped) {
          this.terminalEventSent = true;
          const reachedEnd =
            status.duration > 0 &&
            status.position >= Math.max(0, status.duration - 0.75);
          this.emit(
            reachedEnd
              ? { type: "ended", streamId: id }
              : { type: "stopped", streamId: id },
          );
        }
      }
    } catch (error) {
      if (id === this.streamId && !this.terminalEventSent) {
        this.terminalEventSent = true;
        this.emit({
          type: "error",
          streamId: id,
          message:
            error instanceof Error ? error.message : "Audio status failed",
        });
      }
    } finally {
      this.polling = false;
    }
  }

  private toAudioStatus(
    streamId: string,
    status: NativeBassStatus,
  ): AudioStatus {
    return {
      streamId,
      playing: status.playing,
      position: status.position,
      duration: status.duration,
    };
  }

  private emit(event: AudioEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
