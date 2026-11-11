import type { PlaybackCandidate } from "./types";

export interface NativeProxyModule {
  registerUrl(url: string): Promise<string>;
  stop(): Promise<void>;
}

/** Direct files stay seekable; extensionless streams use the range proxy first. */
export async function withStreamProxy(
  candidates: PlaybackCandidate[],
  proxy: NativeProxyModule,
): Promise<PlaybackCandidate[]> {
  const result: PlaybackCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.url || candidate.localPath) {
      result.push(candidate);
      continue;
    }
    let proxied: PlaybackCandidate | null = null;
    try {
      proxied = {
        ...candidate,
        url: await proxy.registerUrl(candidate.url),
        transport: "proxy",
      };
    } catch {
      /* A direct URL may still work if the proxy is unavailable. */
    }
    const hasExtension = /\.[a-z0-9]{1,10}$/i.test(
      new URL(candidate.url).pathname,
    );
    if (hasExtension) {
      result.push({ ...candidate, transport: "direct" });
      if (proxied) result.push(proxied);
    } else {
      if (proxied) result.push(proxied);
      result.push({ ...candidate, transport: "direct" });
    }
  }
  return result;
}
