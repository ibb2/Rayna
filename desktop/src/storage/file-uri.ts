/** Convert a native absolute path to a file URL usable by React Native Image. */
export function fileUri(directory: string, ...parts: string[]): string {
  const normalized = directory.replaceAll("\\", "/").replace(/\/$/, "");
  const absolute = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const encoded = [...absolute.split("/"), ...parts]
    .map((segment) =>
      /^[a-z]:$/i.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join("/");
  return normalized.startsWith("//") ? `file:${encoded}` : `file://${encoded}`;
}
