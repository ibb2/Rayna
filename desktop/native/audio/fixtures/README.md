`transcoded-320k.opus` is a two-second synthesized 440 Hz tone used to test
the BASS Opus plugin against an extensionless Plex-like HTTP endpoint. It was
generated with:

```sh
ffmpeg -f lavfi -i 'sine=frequency=440:duration=2' -ac 2 -c:a libopus -b:a 320k -vbr off transcoded-320k.opus
```
