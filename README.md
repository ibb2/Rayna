# Rayna

Rayna is a 3rd party music player client for Plex focusing on the desktop experience - Inspired by Spotify.

> [!IMPORTANT]
> This is currently completely online only and a major work in progress, I recently migrated from Avalonia to Electron, but local. No support yet for offline usage or any advanced caching.

<img width="1012" height="782" alt="Screenshot 2026-01-07 at 12 36 52 PM" src="https://github.com/user-attachments/assets/29cb7279-5c22-4c53-8b5a-9989f1abff26" />


## Installation

### Windows

> [!IMPORTANT]
> Windows on Arm is not natively supported.

1. Download the installer
2. Run the downloaded installer and follow the instructions onscreen.

### MacOS

> [!WARNING]
> All installations on MacOS will need to be whitelisted due to MacOS blocking apps not signed with a paid developer license by default. This is a limitation as I currently do not have a paid Apple developer license.

1. Download the installer.
2. Open the downloaded .dmg file and drag the application to your Applications folder. You will you get a warning saying "Rayna" is damaged and can't be opened. You should move it to the Bin.
3. Open your Terminal app
4. Run the following command:
   `xattr -d com.apple.quarantine /Applications/Rayna.app`

## Usage/Examples

On install login to you Plex account and select your server[^1], that is all.

## Features

- Cross platform (macos, windows, linux)

## Screenshots
<img width="1012" height="782" alt="Screenshot 2026-01-07 at 12 36 58 PM" src="https://github.com/user-attachments/assets/15d2f81e-0f02-4646-ad6f-d5bf5ebb2541" />
<img width="1012" height="782" alt="Screenshot 2026-01-07 at 12 37 08 PM" src="https://github.com/user-attachments/assets/95f0e5ff-3bac-407a-a07d-72e39d60ec7b" />

## Roadmap

(Probably in order)

- [ ] Light/Dark mode
- [x] Volume Controls
- [ ] Add Screenshots
- [x] Artist page
  - [ ] Play popular tracks
- [x] Playlist page
  - [ ] Play entire playlist
  - [ ] Play individual track for playlist
- [ ] Search
- [ ] Queue's
  - [ ] Queue Albums
  - [ ] Queue individual tracks
  - [ ] Display Queue
- [ ] Offline support
- [ ] Caching
- [ ] Database support
- [ ] Lyrics
- [x] Performance Improvements
- [x] Server select
  - [ ] Change selected server
- [ ] Transcoding
- [ ] Sync
- [ ] TV Support
- [ ] Settings Page
- [x] Prev and Next functionality

## Contributing

**Ignore anything written in this section for now**

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Please make sure to update tests as appropriate. (There are no tests :D)

Contributions are always welcome!

See `contributing.md` for ways to get started.

Please adhere to this project's `code of conduct`.

## License

## Appendix

[^1]: Only a single server and library is supported currently.
