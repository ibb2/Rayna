type Color = { r: number; g: number; b: number };
type Corners = {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
};

const names = ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function parse(value: unknown): Color | null {
  if (typeof value !== "string") return null;
  const hex = value.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl({ r, g, b }: Color) {
  const red = r / 255,
    green = g / 255,
    blue = b / 255;
  const max = Math.max(red, green, blue),
    min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0 };
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return { h: hue / 6, s: saturation };
}

function hslToRgb(h: number, s: number, l: number): Color {
  if (!s) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (value: number) => {
    let t = value;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: channel(h + 1 / 3) * 255,
    g: channel(h) * 255,
    b: channel(h - 1 / 3) * 255,
  };
}

/** Match the previous app's light and dark Plexamp-style UltraBlur colors. */
export function themedUltraBlur(
  value: unknown,
): { light: Corners; dark: Corners } | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const colors = names.map((name) => parse(input[name]));
  const valid = colors.filter((color): color is Color => color !== null);
  if (!valid.length) return null;
  const average = valid.reduce(
    (result, color) => ({
      r: result.r + color.r / valid.length,
      g: result.g + color.g / valid.length,
      b: result.b + color.b / valid.length,
    }),
    { r: 0, g: 0, b: 0 },
  );
  const hsl = rgbToHsl(average);
  const light = hslToRgb(hsl.h, clamp(hsl.s * 0.68, 0.36, 0.5), 0.9);
  const dark = hslToRgb(hsl.h, clamp(hsl.s * 1.2, 0.38, 0.62), 0.31);
  const mix = (base: Color, accent: Color, amount: number) =>
    (["r", "g", "b"] as const)
      .map((key) =>
        Math.round(
          clamp(base[key] * (1 - amount) + accent[key] * amount, 0, 255),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const result = { light: {} as Corners, dark: {} as Corners };
  names.forEach((name, index) => {
    result.light[name] = mix(light, colors[index] || average, 0.08);
    result.dark[name] = mix(dark, colors[index] || average, 0.18);
  });
  return result;
}

export function ultraBlurPath(colors: Corners): string {
  const image = new URLSearchParams({
    ...colors,
    width: "1920",
    height: "1080",
    noise: "1",
  });
  const transcode = new URLSearchParams({
    url: `/services/ultrablur/image?${image}`,
    width: "1920",
    height: "1080",
  });
  return `/photo/:/transcode?${transcode}`;
}
