import { describe, expect, test } from "bun:test";
import { MediaService } from "../../../src/bun/plex/media";
import { themedUltraBlur, ultraBlurPath } from "./ultrablur";

describe("desktop UltraBlur", () => {
  test("matches the previous app's light and dark color variants", () => {
    const previous = Object.create(MediaService.prototype) as {
      buildPlexampUltraBlurColors: (
        colors: Record<string, string>,
      ) => ReturnType<typeof themedUltraBlur>;
    };
    for (const colors of [
      {
        topLeft: "ff0000",
        topRight: "00ff00",
        bottomLeft: "0000ff",
        bottomRight: "ffff00",
      },
      {
        topLeft: "#123456",
        topRight: "999999",
        bottomLeft: "abcdef",
        bottomRight: "010203",
      },
    ]) {
      expect(themedUltraBlur(colors)).toEqual(
        previous.buildPlexampUltraBlurColors(colors),
      );
    }
    expect(themedUltraBlur({ topLeft: "invalid" })).toBeNull();
  });

  test("encodes the Plex UltraBlur image request as a photo transcode", () => {
    const path = ultraBlurPath({
      topLeft: "abcdef",
      topRight: "123456",
      bottomLeft: "000000",
      bottomRight: "ffffff",
    });
    const outer = new URL(path, "http://plex");
    const inner = new URL(outer.searchParams.get("url")!, "http://plex");
    expect(outer.pathname).toBe("/photo/:/transcode");
    expect(inner.pathname).toBe("/services/ultrablur/image");
    expect(inner.searchParams.get("topLeft")).toBe("abcdef");
    expect(inner.searchParams.get("noise")).toBe("1");
  });
});
