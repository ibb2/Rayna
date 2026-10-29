# Rayna Expo Desktop port

This directory contains an **in-progress experimental port** of Rayna to
[Expo Desktop](https://github.com/shirakaba/expo-desktop). It is not yet a
replacement for the Electrobun application. Some detail screens are simplified.
If an older downloaded playlist has no saved detail cache, its original track
order may not be recoverable from the old download records. UltraBlur, initial
library synchronization, downloads, storage moves, the stream proxy, and
320 kbps Opus streaming are implemented, but have not been verified on a
desktop or against a live Plex server.

## Setup

Install Node.js 24, then run:

```sh
cd desktop
npm ci
npm run prebuild -- --no-install --platform=desktop
```

On macOS, install Xcode and CocoaPods, run `pod install` in `macos`, and start
the app with `npm run macos`. On Windows, install the React Native Windows
toolchain required by Expo Desktop and run `npm run windows`. The template
currently uses the v145 Windows C++ toolset. Native projects are generated and
ignored by Git; the config plugin reapplies the Rayna native modules on prebuild.

After prebuild and `pod install`, `bash scripts/package-macos-dev.sh` builds a
standalone Release app and writes a `rayna-dev-<architecture>.dmg` and SHA-256
checksum to `desktop/dist`. The app uses a separate development bundle ID and
an ad-hoc signature; it is not notarized and macOS may require you to approve it
in Privacy & Security before opening. The packaging workflow produces separate
Apple Silicon and Intel images.

Expo Desktop 1.0.6, Expo SDK 55, and React Native 0.83 are pinned. The
template's Windows peer dependency declaration conflicts with its own React
Native Windows version, so `.npmrc` enables npm's legacy peer resolution.
Expo UI does not currently support this desktop template; the screens use
React Native desktop controls.

From the repository root, run `bun install --frozen-lockfile` once; `bun test`
then runs both the existing application's tests and the portable desktop tests.
Run `npm run typecheck` in `desktop` to check the
new TypeScript code. The CI workflow also compiles the portable BASS and SQLite
cores, checks local playback and authenticated WAV and 320 kbps Opus HTTP
fixtures, and exercises range proxying, a WAL-backed migration, and resumable
HTTP transfers. These checks do not replace native application builds or tests with a real audio
device and Plex server.

## Code and data

- `src/plex` handles Plex sign-in, server connections, library requests, lyrics,
  and timeline reporting. `src/sync` refreshes server-scoped metadata and
  reconciles download records. `src/playback/controller.ts` serializes queue,
  history, recovery, and playback events; its audio adapter polls native status.
- `native/audio/BassEngine.cpp` owns one BASS stream and loads the codec plugins.
  `native/audio/session` and `native/audio/sqlite` own persistence and migration;
  `native/audio/transfer` uses the operating system's curl executable for
  bounded, resumable downloads. Plex URLs are passed through a private pipe, not
  command-line arguments. `native/audio/proxy` provides a loopback-only BASS
  stream fallback and uses the vendored MIT-licensed cpp-httplib server.
  The platform folders expose these cores as small React Native modules, linked
  by `plugins/withRaynaBass.js`; it also generates the desktop app icons from
  `assets/icon.png`. Native project edits should go in that plugin because
  prebuild recreates the platform projects.
- On first launch, the port reads the old `auth.json` and writes subsequent
  session changes to `auth.desktop.json`. It takes a SQLite backup of `rayna.db` into
  `rayna.desktop.db`, including committed WAL data. It does not delete or modify
  the original database or downloaded music during migration. Existing completed
  downloads can be listed and opened directly.
- Artwork uses the old server-scoped cache in `~/.rayna/artwork-cache`; new
  artwork is cached with the same keys and a 10 MiB publication limit. Existing
  cached files are retained.
- The original renderer's theme is stored in browser local storage and is not
  automatically imported. Choose a theme in Settings if needed.

The native modules and packaged applications must be built and exercised on
macOS and Windows before this port is considered usable. The GitHub Actions
workflow builds both desktop targets and tests the BASS and migration cores;
live Plex and audio-device verification require suitable test environments.

## Troubleshooting

- If the app says its native modules are unavailable, rerun prebuild, reinstall
  pods on macOS, and rebuild the native application; reloading Metro is not
  enough to add native code.
- A missing BASS plugin stops playback with its filename in the error. Confirm
  the four libraries from `vendor/bass` are present in the built app's resource
  directory (macOS) or beside the executable (Windows).
- A new network stream gets up to two seconds to buffer a requested seek.
  Some streams remain unseekable; retry after the stream has buffered.
- Downloads require the system curl executable (`/usr/bin/curl` on macOS or
  `curl.exe` in the Windows system directory). Failed or paused transfers retain
  their partial files. Moving storage copies files before changing the database;
  files imported from the previous app are kept at their original paths so the
  previous app can still use them.
- A migration error leaves `auth.json`, `rayna.db`, its WAL files, and downloaded
  audio in place. Resolve the error before modifying or removing the originals.
- An old renderer theme cannot currently be read from browser local storage.
  The port uses the system appearance until a theme is chosen in Settings.
