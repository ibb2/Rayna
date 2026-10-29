import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { NativeTransferModule } from "../downloads/service";
import { fileUri } from "./file-uri";

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

/** Shares the previous app's server-scoped cache without replacing its files. */
export class ArtworkCache {
  private directory: string | null = null;
  private gate: Promise<void> = Promise.resolve();
  private active: string | null = null;
  private readonly pending = new Map<string, Promise<string | null>>();
  private suspended = false;
  private closed = false;

  constructor(
    private readonly transfer: NativeTransferModule,
    private readonly server: () => string | undefined,
    private readonly offline: () => boolean,
  ) {}
  setDirectory(directory: string): void {
    this.directory = directory;
  }

  resolve(url: string): Promise<string | null> {
    if (url.startsWith("file://")) return Promise.resolve(url);
    const server = this.server();
    const root = this.directory;
    if (
      !root ||
      !server ||
      (!url.startsWith("https://") && !url.startsWith("http://"))
    )
      return Promise.resolve(null);
    const safeServer =
      server.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "server";
    if (safeServer === "." || safeServer === "..") return Promise.resolve(null);
    const hash = bytesToHex(sha256(utf8(url)));
    const key = `${safeServer}:${hash}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const separator = root.includes("\\") ? "\\" : "/";
    const directory = root.replace(/[\\/]+$/, "");
    const path = `${directory}${separator}${safeServer}${separator}${hash}`;
    const uri = fileUri(directory, safeServer, hash);
    const work = (async () => {
      if ((await this.transfer.size(path).catch(() => -1)) > 0) return uri;
      if (this.closed || this.suspended || this.offline()) return null;
      const operation = this.gate.then(async () => {
        if (this.closed || this.suspended || this.offline()) return null;
        if ((await this.transfer.size(path).catch(() => -1)) > 0) return uri;
        if (
          (await this.transfer.size(`${path}.partial`).catch(() => -1)) >=
          MAX_ARTWORK_BYTES
        )
          return null;
        const id = `artwork-${hash}`;
        this.active = id;
        try {
          await this.transfer.download(
            id,
            url,
            directory,
            `${path}.partial`,
            path,
            MAX_ARTWORK_BYTES,
          );
          return uri;
        } catch {
          // The previous app may have populated the same cache entry meanwhile.
          return (await this.transfer.size(path).catch(() => -1)) > 0
            ? uri
            : null;
        } finally {
          this.active = null;
        }
      });
      this.gate = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  async pause(): Promise<void> {
    this.suspended = true;
    while (this.active) {
      if (await this.transfer.cancel(this.active)) break;
      await Promise.race([
        this.gate,
        new Promise<void>((resolve) => setTimeout(resolve, 25)),
      ]);
    }
    await this.gate;
  }
  resume(): void {
    if (!this.closed) this.suspended = false;
  }
  async dispose(): Promise<void> {
    this.closed = true;
    await this.pause();
  }
}

function utf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    let code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return Uint8Array.from(bytes);
}
