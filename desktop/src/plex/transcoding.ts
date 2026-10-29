import type { PlaybackSource } from "../playback/types";

export function legacyTranscodePreference(
  settings: { transcodeAudio?: unknown; useOriginalFileUrl?: unknown } | null,
): boolean | undefined {
  if (typeof settings?.transcodeAudio === "boolean")
    return settings.transcodeAudio;
  return typeof settings?.useOriginalFileUrl === "boolean"
    ? !settings.useOriginalFileUrl
    : undefined;
}

/** Plex's generic HTTP music profile, matching the existing 320 kbps Opus setting. */
export function opusSource(
  ratingKey: string,
  transcodeSession: string,
  playbackSession: string,
  clientIdentifier: string,
): PlaybackSource {
  return {
    path: "/music/:/transcode/universal/start",
    params: {
      path: `/library/metadata/${ratingKey}`,
      protocol: "http",
      directPlay: "0",
      directStream: "0",
      directStreamAudio: "0",
      hasMDE: "1",
      mediaIndex: "0",
      partIndex: "0",
      download: "0",
      location: "lan",
      mediaBufferSize: "102400",
      musicBitrate: "320",
      session: transcodeSession,
      "X-Plex-Product": "Rayna",
      "X-Plex-Client-Identifier": clientIdentifier,
      "X-Plex-Session-Identifier": playbackSession,
      "X-Plex-Device": "Rayna Desktop",
      "X-Plex-Device-Name": "Rayna Desktop",
      "X-Plex-Platform": "Generic",
      "X-Plex-Platform-Version": "1",
      "X-Plex-Client-Profile-Name": "generic",
      "X-Plex-Client-Profile-Extra":
        "add-transcode-target(replace=true&type=musicProfile&context=streaming&protocol=http&container=ogg&audioCodec=opus)",
    },
  };
}
