import type { SavedSession, SessionStore } from "./session";

export interface NativeSessionModule {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export class NativeSessionStore implements SessionStore {
  constructor(private readonly native: NativeSessionModule) {}

  async read(): Promise<SavedSession | null> {
    const raw = await this.native.read();
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("The saved Rayna session is not a JSON object");
    }
    return value as SavedSession;
  }

  write(value: SavedSession): Promise<void> {
    return this.native.write(JSON.stringify(value));
  }
}
