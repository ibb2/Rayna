import type {
  AudioEngine,
  AudioEvent,
  AudioStatus,
  Playable,
  PlaybackEvent,
  PlaybackSnapshot,
  PlaybackSource,
  ResolveCandidates,
} from "./types";

const PREVIOUS_TRACK_THRESHOLD_SECONDS = 3;
const RECOVERY_STABLE_SECONDS = 10;

/** Owns playback and the queue; native code only owns the currently open stream. */
export class PlaybackController {
  private current: Playable | null = null;
  private history: Playable[] = [];
  private upcoming: Playable[] = [];
  private streamId: string | null = null;
  private route: string | null = null;
  private transport: "direct" | "proxy" | undefined;
  private readonly failedCandidates = new Set<string>();
  private recoveryPosition: number | null = null;
  private intent: "playing" | "paused" = "playing";
  private position = 0;
  private duration = 0;
  private volume = 1;
  private volumeBeforeMute = 1;
  private connectionState: PlaybackSnapshot["connectionState"] = "connected";
  private connectionError: string | null = null;
  private operation: Promise<unknown> = Promise.resolve();
  private closed = false;
  private readonly stateListeners = new Set<
    (state: PlaybackSnapshot) => void
  >();
  private readonly eventListeners = new Set<(event: PlaybackEvent) => void>();
  private readonly unsubscribeAudio: () => void;

  constructor(
    private readonly audio: AudioEngine,
    private readonly resolveCandidates: ResolveCandidates,
    private readonly onConnectionChanged?: (uri: string) => void,
  ) {
    this.unsubscribeAudio = audio.subscribe((event) => {
      void this.serial(() => this.handleAudioEvent(event)).catch(() => {
        // Command failures remain visible in the snapshot; an event callback
        // must not leave an unhandled rejection in the native event loop.
      });
    });
  }

  snapshot(): PlaybackSnapshot {
    return {
      currentTrack: this.current?.track ?? null,
      previousTrack: this.history.at(-1)?.track ?? null,
      queue: this.upcoming.map((item) => item.track),
      playing: this.current !== null && this.intent === "playing",
      position: this.position,
      duration: this.duration,
      volume: this.volume,
      connectionState: this.connectionState,
      connectionError: this.connectionError,
    };
  }

  get currentConnection(): string | null {
    return this.route;
  }

  subscribe(listener: (state: PlaybackSnapshot) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.snapshot());
    return () => this.stateListeners.delete(listener);
  }

  onPlaybackEvent(listener: (event: PlaybackEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  play(items: Playable[]): Promise<void> {
    return this.serial(async () => {
      this.rememberCurrent();
      await this.stopCurrent("replaced");
      this.upcoming = [...items];
      await this.advance();
    });
  }

  enqueue(items: Playable[]): Promise<void> {
    return this.serial(async () => {
      this.upcoming.push(...items);
      if (!this.current && this.upcoming.length) await this.advance();
      else this.notify();
    });
  }

  clearQueue(): Promise<void> {
    return this.serial(() => {
      this.upcoming = [];
      this.notify();
    });
  }

  /** Keep queued and historical local files usable after a storage move. */
  remapLocalPaths(paths: Readonly<Record<string, string>>): Promise<void> {
    return this.serial(() => {
      const remap = (item: Playable): Playable => {
        const localPath = item.source.localPath;
        return localPath && paths[localPath]
          ? { ...item, source: { ...item.source, localPath: paths[localPath] } }
          : item;
      };
      if (this.current) this.current = remap(this.current);
      this.history = this.history.map(remap);
      this.upcoming = this.upcoming.map(remap);
      this.notify();
    });
  }

  next(): Promise<void> {
    return this.serial(async () => {
      this.rememberCurrent();
      await this.stopCurrent("replaced");
      await this.advance();
    });
  }

  previous(): Promise<void> {
    return this.serial(async () => {
      if (!this.current) return;
      if (
        this.position > PREVIOUS_TRACK_THRESHOLD_SECONDS ||
        !this.history.length
      ) {
        await this.seekInternal(0);
        return;
      }
      const previous = this.history.pop()!;
      this.upcoming.unshift(this.current);
      await this.stopCurrent("replaced");
      await this.start(previous);
    });
  }

  pause(): Promise<void> {
    return this.serial(async () => {
      if (!this.current || this.intent === "paused") return;
      await this.audio.pause();
      this.intent = "paused";
      this.emitState();
      this.notify();
    });
  }

  resume(): Promise<void> {
    return this.serial(async () => {
      if (!this.current || this.intent === "playing") return;
      try {
        await this.audio.play();
        this.intent = "playing";
        this.emitState();
        this.notify();
      } catch {
        this.intent = "playing";
        await this.recoverInternal();
      }
    });
  }

  seek(position: number): Promise<void> {
    return this.serial(() => this.seekInternal(position));
  }

  setVolume(volume: number): Promise<void> {
    return this.serial(async () => {
      if (!Number.isFinite(volume)) throw new Error("Volume must be finite");
      const next = Math.max(0, Math.min(1, volume));
      if (this.current) await this.audio.setVolume(next);
      this.volume = next;
      this.notify();
    });
  }

  setMuted(muted: boolean): Promise<void> {
    return this.serial(async () => {
      if (muted) this.volumeBeforeMute = this.volume;
      const next = muted ? 0 : this.volumeBeforeMute || 1;
      if (this.current) await this.audio.setVolume(next);
      this.volume = next;
      this.notify();
    });
  }

  stop(remote = false): Promise<void> {
    return this.serial(async () => {
      if (remote) this.upcoming = [];
      await this.stopCurrent(remote ? "remote" : "manual");
      this.notify();
    });
  }

  /** Reopen the current track after a route failure, preserving intent and queue. */
  recover(): Promise<void> {
    return this.serial(() => this.recoverInternal());
  }

  /** Change direct/transcoded sources without discarding a working stream on failure. */
  replaceCurrentSource(source: PlaybackSource): Promise<boolean> {
    return this.serial(async () => {
      if (!this.current) return false;
      const original = this.current;
      const position = this.position;
      const intent = this.intent;
      this.failedCandidates.clear();
      this.recoveryPosition = null;
      await this.releaseStream();
      if (
        await this.open({ ...original, source }, new Set(), position, intent)
      ) {
        this.emitState();
        this.notify();
        return true;
      }
      const replacementError = this.connectionError;
      if (await this.open(original, new Set(), position, intent)) {
        this.connectionError = replacementError;
        this.emitState();
        this.notify();
        return false;
      }
      this.emitStopped("connection-failed", original);
      this.current = null;
      this.notify();
      return false;
    });
  }

  dispose(): Promise<void> {
    return this.serial(async () => {
      this.unsubscribeAudio();
      await this.stopCurrent("manual");
      await this.audio.dispose();
      this.closed = true;
      this.stateListeners.clear();
      this.eventListeners.clear();
    });
  }

  private serial<T>(action: () => Promise<T> | T): Promise<T> {
    const result = this.operation.then(() => {
      if (this.closed) throw new Error("Playback controller has been disposed");
      return action();
    });
    this.operation = result.catch(() => undefined);
    return result;
  }

  private async advance(): Promise<void> {
    const next = this.upcoming.shift();
    if (next) await this.start(next);
    else this.notify();
  }

  private async start(playable: Playable): Promise<void> {
    if (await this.open(playable, new Set(), 0, "playing")) {
      this.emit({
        type: "track-started",
        track: playable.track,
        position: this.position,
        duration: this.duration,
      });
    }
    this.notify();
  }

  private async open(
    playable: Playable,
    excluded: Set<string>,
    position: number,
    intent: "playing" | "paused",
    failedCandidates?: Set<string>,
  ): Promise<boolean> {
    let candidates;
    try {
      candidates = await this.resolveCandidates(playable.source, excluded);
    } catch (error) {
      this.fail(error);
      return false;
    }

    let lastError: unknown = new Error(
      "No reachable Plex audio stream was found",
    );
    for (const candidate of candidates) {
      const key = this.candidateKey(
        candidate.connectionUri,
        candidate.transport,
      );
      if (excluded.has(candidate.connectionUri) || failedCandidates?.has(key))
        continue;
      try {
        const status = await this.audio.open(candidate);
        this.streamId = status.streamId;
        await this.audio.setVolume(this.volume);
        // A newly created BASS stream is stopped; start it before restoring a
        // position or paused state, as BASS network streams need to buffer.
        await this.audio.play();
        if (position > 0) await this.audio.seek(position);
        if (intent === "paused") await this.audio.pause();
        this.current = playable;
        this.route = candidate.connectionUri;
        this.transport = candidate.transport;
        this.position = position;
        this.duration =
          status.duration || (playable.track.duration ?? 0) / 1000;
        this.intent = intent;
        this.connectionState = "connected";
        this.connectionError = null;
        try {
          this.onConnectionChanged?.(candidate.connectionUri);
        } catch {
          // A sync observer must not invalidate an already opened stream.
        }
        return true;
      } catch (error) {
        lastError = error;
        failedCandidates?.add(key);
        await this.audio.close().catch(() => undefined);
        this.streamId = null;
      }
    }
    this.fail(lastError);
    return false;
  }

  private async recoverInternal(): Promise<void> {
    if (!this.current) return;
    const previous = this.current;
    const position = this.position;
    const intent = this.intent;
    if (this.route)
      this.failedCandidates.add(this.candidateKey(this.route, this.transport));
    this.connectionState = "reconnecting";
    this.connectionError = null;
    this.notify();
    await this.releaseStream();
    if (
      await this.open(
        previous,
        new Set(),
        position,
        intent,
        this.failedCandidates,
      )
    ) {
      this.recoveryPosition = position;
      this.emitState();
    } else {
      this.emitStopped("connection-failed", previous);
      this.current = null;
    }
    this.notify();
  }

  private async seekInternal(position: number): Promise<void> {
    if (!this.current) return;
    if (!Number.isFinite(position)) throw new Error("Position must be finite");
    const next = Math.max(
      0,
      this.duration > 0 ? Math.min(position, this.duration) : position,
    );
    await this.audio.seek(next);
    this.position = next;
    this.emit({
      type: "seeked",
      track: this.current.track,
      position: next,
      duration: this.duration,
      isPlaying: this.intent === "playing",
    });
    this.notify();
  }

  private async handleAudioEvent(event: AudioEvent): Promise<void> {
    const id = event.type === "status" ? event.status.streamId : event.streamId;
    if (!this.current || !this.streamId || id !== this.streamId) return;
    if (event.type === "status") {
      this.applyStatus(event.status);
      this.notify();
    } else if (
      event.type === "ended" ||
      (event.type === "stopped" &&
        this.duration > 0 &&
        this.position >= Math.max(0, this.duration - 0.75))
    ) {
      this.rememberCurrent();
      await this.stopCurrent("ended");
      await this.advance();
    } else {
      await this.recoverInternal();
    }
  }

  private applyStatus(status: AudioStatus): void {
    if (Number.isFinite(status.position))
      this.position = Math.max(0, status.position);
    if (
      this.recoveryPosition !== null &&
      this.position - this.recoveryPosition >= RECOVERY_STABLE_SECONDS
    ) {
      this.failedCandidates.clear();
      this.recoveryPosition = null;
    }
    if (Number.isFinite(status.duration) && status.duration > 0)
      this.duration = status.duration;
  }

  private rememberCurrent(): void {
    if (
      this.current &&
      this.history.at(-1)?.track.ratingKey !== this.current.track.ratingKey
    ) {
      this.history.push(this.current);
    }
  }

  private async stopCurrent(
    reason: Extract<PlaybackEvent, { type: "track-stopped" }>["reason"],
  ): Promise<void> {
    const previous = this.current;
    await this.releaseStream();
    if (previous) this.emitStopped(reason, previous);
    this.current = null;
    this.failedCandidates.clear();
    this.recoveryPosition = null;
    this.position = 0;
    this.duration = 0;
  }

  private async releaseStream(): Promise<void> {
    this.streamId = null;
    this.route = null;
    this.transport = undefined;
    await this.audio.close();
  }

  private fail(error: unknown): void {
    this.connectionState = "failed";
    this.connectionError =
      error instanceof Error ? error.message : String(error);
    this.streamId = null;
    this.route = null;
    this.transport = undefined;
  }

  private candidateKey(
    route: string,
    transport: "direct" | "proxy" | undefined,
  ): string {
    return JSON.stringify([route, transport ?? null]);
  }

  private emitState(): void {
    if (this.current)
      this.emit({
        type: "state-changed",
        state: this.intent,
        track: this.current.track,
        position: this.position,
        duration: this.duration,
      });
  }

  private emitStopped(
    reason: Extract<PlaybackEvent, { type: "track-stopped" }>["reason"],
    playable: Playable,
  ): void {
    this.emit({
      type: "track-stopped",
      reason,
      track: playable.track,
      position: this.position,
      duration: this.duration,
    });
  }

  private emit(event: PlaybackEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.stateListeners) listener(snapshot);
  }
}
