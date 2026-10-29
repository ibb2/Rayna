import { orderPlexConnections } from "../../../src/bun/plex/connections";
import type {
  PlexLibrary,
  PlexLibrarySelection,
  PlexServer,
} from "../../../src/shared/types";
import type { UserProfile } from "../../../src/shared/rpc";

export type SavedSession = {
  clientIdentifier: string;
  plexUserAccessToken?: string;
  selectedServer?: PlexServer;
  selectedLibraries?: PlexLibrarySelection[];
  lastKnownGoodConnection?: string;
  theme?: "system" | "light" | "dark";
  enableTimelineReporting?: boolean;
  transcodeAudio?: boolean;
  enableUltraBlur?: boolean;
  [key: string]: unknown;
};

/** The implementation must write the complete object atomically. */
export interface SessionStore {
  read(): Promise<SavedSession | null>;
  write(value: SavedSession): Promise<void>;
}

type PlexPin = { id: string; code: string };

export class PlexSession {
  private saved: SavedSession | null = null;
  private writes: Promise<void> = Promise.resolve();
  private forcedOffline = false;

  constructor(
    private readonly store: SessionStore,
    private readonly createClientId: () => string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async initialize(): Promise<void> {
    const existing = await this.store.read();
    // Older Rayna releases wrote a misspelled route key. Keep it usable
    // without changing the legacy file during import.
    if (
      existing &&
      !existing.lastKnownGoodConnection &&
      typeof existing.lastKnowGoodConnection === "string"
    ) {
      existing.lastKnownGoodConnection = existing.lastKnowGoodConnection;
    }
    if (existing?.clientIdentifier) this.saved = existing;
    else {
      const initial = {
        ...(existing ?? {}),
        clientIdentifier: this.createClientId(),
      };
      await this.store.write(initial);
      this.saved = initial;
    }
  }

  get snapshot(): Readonly<SavedSession> {
    if (!this.saved) throw new Error("Plex session has not been initialized");
    return { ...this.saved };
  }

  get signedIn(): boolean {
    return Boolean(this.snapshot.plexUserAccessToken);
  }
  get offline(): boolean {
    return this.forcedOffline;
  }
  setOffline(offline: boolean): void {
    this.forcedOffline = offline;
  }

  async createPin(): Promise<PlexPin & { authUrl: string }> {
    this.requireOnline();
    const response = await this.request(
      "https://plex.tv/api/v2/pins?strong=true",
      {
        method: "POST",
        headers: this.headers(),
      },
    );
    if (!response.ok)
      throw new Error(`Plex sign-in failed: ${response.status}`);
    const result = (await response.json()) as {
      id?: string | number;
      code?: string;
    };
    if (!result.id || !result.code)
      throw new Error("Plex returned an invalid sign-in code");
    const query = new URLSearchParams({
      clientID: this.snapshot.clientIdentifier,
      code: result.code,
      "context[device][product]": "Rayna",
    });
    return {
      id: String(result.id),
      code: result.code,
      authUrl: `https://app.plex.tv/auth#?${query.toString()}`,
    };
  }

  async checkPin(id: string): Promise<boolean> {
    this.requireOnline();
    const response = await this.request(
      `https://plex.tv/api/v2/pins/${encodeURIComponent(id)}`,
      { headers: this.headers() },
    );
    if (!response.ok)
      throw new Error(`Plex sign-in check failed: ${response.status}`);
    const result = (await response.json()) as {
      authToken?: string;
      auth_token?: string;
    };
    const token = result.authToken || result.auth_token;
    if (!token) return false;
    await this.mutate((current) => ({
      ...current,
      plexUserAccessToken: token,
    }));
    return true;
  }

  async logout(): Promise<void> {
    await this.mutate((current) => {
      const next = { ...current };
      delete next.plexUserAccessToken;
      delete next.selectedServer;
      delete next.selectedLibraries;
      delete next.lastKnownGoodConnection;
      delete next.lastKnowGoodConnection;
      delete next.userProfile;
      return next;
    });
    this.forcedOffline = false;
  }

  async servers(): Promise<PlexServer[]> {
    this.requireOnline();
    const token = this.requireToken();
    const response = await this.request(
      "https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1",
      {
        headers: this.headers(token),
      },
    );
    if (!response.ok)
      throw new Error(`Could not load Plex servers: ${response.status}`);
    const servers = (await response.json()) as PlexServer[];
    if (!Array.isArray(servers))
      throw new Error("Plex returned an invalid server list");
    return servers.filter((server) => server.product === "Plex Media Server");
  }

  async userProfile(): Promise<UserProfile | null> {
    const token = this.snapshot.plexUserAccessToken;
    if (!token) return null;
    const cached = this.snapshot.userProfile as
      | { profile?: UserProfile; fetchedAt?: number }
      | undefined;
    if (
      cached?.profile &&
      (this.offline ||
        (typeof cached.fetchedAt === "number" &&
          Date.now() - cached.fetchedAt < 24 * 60 * 60 * 1000))
    )
      return cached.profile;
    if (this.offline) return null;
    try {
      const response = await this.fetchWithTimeout(
        "https://plex.tv/api/v2/user",
        { headers: this.headers(token) },
      );
      if (!response.ok)
        throw new Error(`Plex user profile request failed: ${response.status}`);
      const data = (await response.json()) as Record<string, unknown>;
      const username = String(
        data.username || data.title || data.email || "Rayna User",
      );
      const profile: UserProfile = {
        id: String(data.id || data.uuid || ""),
        username,
        title: String(data.title || username),
        email: String(data.email || ""),
        thumb: String(data.thumb || ""),
      };
      if (this.snapshot.plexUserAccessToken !== token) return null;
      await this.mutate((current) =>
        current.plexUserAccessToken === token
          ? { ...current, userProfile: { profile, fetchedAt: Date.now() } }
          : current,
      );
      return this.snapshot.plexUserAccessToken === token ? profile : null;
    } catch {
      return this.snapshot.plexUserAccessToken === token
        ? cached?.profile || null
        : null;
    }
  }

  async selectServer(
    server: PlexServer,
    beforeCommit?: () => Promise<void>,
  ): Promise<void> {
    this.requireOnline();
    if (
      server.clientIdentifier === this.snapshot.selectedServer?.clientIdentifier
    )
      return;
    const token = server.accessToken || this.requireToken();
    let reachable: string | null = null;
    for (const connection of orderPlexConnections(server)) {
      try {
        const response = await this.fetchWithTimeout(
          new URL("/identity", connection.uri).toString(),
          { headers: this.headers(token) },
          2500,
        );
        if (response.ok) {
          reachable = connection.uri;
          break;
        }
      } catch {
        /* Try the next route. */
      }
    }
    if (!reachable)
      throw new Error("No reachable Plex server connection found");
    await beforeCommit?.();
    await this.mutate((current) => {
      const next: SavedSession = {
        ...current,
        selectedServer: server,
        lastKnownGoodConnection: reachable!,
      };
      delete next.selectedLibraries;
      delete next.lastKnowGoodConnection;
      return next;
    });
  }

  async libraries(): Promise<PlexLibrary[]> {
    const response = await this.serverRequest("/library/sections");
    const data = (await response.json()) as {
      MediaContainer?: { Directory?: Array<Record<string, unknown>> };
    };
    return (data.MediaContainer?.Directory ?? []).map((item) => ({
      key: String(item.key ?? ""),
      title: String(item.title ?? ""),
      type: String(item.type ?? ""),
      uuid: String(item.uuid ?? item.key ?? ""),
    }));
  }

  async selectLibraries(libraries: PlexLibrarySelection[]): Promise<void> {
    await this.mutate((current) => ({
      ...current,
      selectedLibraries: [...libraries],
    }));
  }

  async setTheme(theme: "system" | "light" | "dark"): Promise<void> {
    await this.mutate((current) => ({ ...current, theme }));
  }

  async setTimelineReporting(enabled: boolean): Promise<void> {
    await this.mutate((current) => ({
      ...current,
      enableTimelineReporting: enabled,
    }));
  }

  async setTranscodeAudio(enabled: boolean): Promise<void> {
    await this.mutate((current) => ({ ...current, transcodeAudio: enabled }));
  }

  async setUltraBlur(enabled: boolean): Promise<void> {
    await this.mutate((current) => ({ ...current, enableUltraBlur: enabled }));
  }

  /** Uses the active and last successful routes first, then Plex's fallbacks. */
  async serverRequest(
    path: string,
    params: Record<string, string> = {},
    accept = "application/json",
  ): Promise<Response> {
    this.requireOnline();
    const server = this.snapshot.selectedServer;
    if (!server) throw new Error("Select a Plex server first");
    const token = server.accessToken || this.requireToken();
    const connections = orderPlexConnections(server, {
      lastKnownGoodUri: this.snapshot.lastKnownGoodConnection,
    });
    let lastError: unknown;
    for (const connection of connections) {
      try {
        const url = new URL(path, connection.uri);
        if (url.origin !== new URL(connection.uri).origin)
          throw new Error("Invalid Plex server path");
        for (const [key, value] of Object.entries(params))
          url.searchParams.set(key, value);
        const response = await this.fetchWithTimeout(url.toString(), {
          headers: { ...this.headers(token), Accept: accept },
        });
        this.requireOnline();
        if (
          this.snapshot.selectedServer?.clientIdentifier !==
          server.clientIdentifier
        )
          throw new Error(
            "The selected Plex server changed during the request",
          );
        if (!response.ok) {
          lastError = new Error(`Plex request failed: ${response.status}`);
          continue;
        }
        if (this.snapshot.lastKnownGoodConnection !== connection.uri) {
          await this.mutate((current) =>
            current.selectedServer?.clientIdentifier === server.clientIdentifier
              ? { ...current, lastKnownGoodConnection: connection.uri }
              : current,
          );
        }
        if (
          this.snapshot.selectedServer?.clientIdentifier !==
          server.clientIdentifier
        )
          throw new Error(
            "The selected Plex server changed during the request",
          );
        return response;
      } catch (error) {
        this.requireOnline();
        if (
          this.snapshot.selectedServer?.clientIdentifier !==
          server.clientIdentifier
        )
          throw new Error(
            "The selected Plex server changed during the request",
          );
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("No reachable Plex server connection found");
  }

  private mutate(
    update: (current: SavedSession) => SavedSession,
  ): Promise<void> {
    const operation = this.writes.then(async () => {
      const next = update(this.snapshot as SavedSession);
      await this.store.write(next);
      this.saved = next;
    });
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  private requireToken(): string {
    const token = this.snapshot.plexUserAccessToken;
    if (!token) throw new Error("Sign in to Plex first");
    return token;
  }

  private requireOnline(): void {
    if (this.forcedOffline) throw new Error("Rayna is offline");
  }

  private headers(token?: string): Record<string, string> {
    return {
      Accept: "application/json",
      "X-Plex-Product": "Rayna",
      "X-Plex-Client-Identifier": this.snapshot.clientIdentifier,
      ...(token ? { "X-Plex-Token": token } : {}),
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = 8000,
  ): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      return await this.request(url, { ...init, signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
