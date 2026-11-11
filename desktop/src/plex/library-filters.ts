import type { MusicItem } from "./library";

export type SortField = "title" | "artist" | "album" | "year" | "dateAdded";
export type SortDirection = "asc" | "desc";
export type LibraryFilters = { artist?: string; album?: string; year?: number };
export type FacetOption = { id: string; title: string };

/** Match the existing artist page's popularity and recency ordering. */
export function popularArtistTracks(
  items: MusicItem[],
  artistId: string,
): MusicItem[] {
  return items
    .filter(
      (item) =>
        item.kind === "track" &&
        String(item.raw.grandparentRatingKey || "") === artistId,
    )
    .sort((left, right) => {
      const popularity =
        Number(right.raw.viewCount ?? right.raw.ratingCount ?? 0) -
        Number(left.raw.viewCount ?? left.raw.ratingCount ?? 0);
      if (popularity) return popularity;
      const recency =
        Number(right.raw.addedAt ?? 0) - Number(left.raw.addedAt ?? 0);
      if (recency) return recency;
      return left.title.localeCompare(right.title, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    })
    .slice(0, 10);
}

/** Filter a detail list without changing Plex's album or playlist order. */
export function filterInOriginalOrder(
  items: MusicItem[],
  query: string,
): MusicItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  return items.filter((item) => matchesQuery(item, normalized));
}

function matchesQuery(item: MusicItem, normalized: string): boolean {
  return (
    !normalized ||
    `${item.title} ${item.subtitle} ${item.raw.parentTitle || ""}`
      .toLocaleLowerCase()
      .includes(normalized)
  );
}

function artist(item: MusicItem): FacetOption | null {
  const id =
    item.kind === "album"
      ? item.raw.parentRatingKey
      : item.raw.grandparentRatingKey;
  const title =
    item.kind === "album" ? item.raw.parentTitle : item.raw.grandparentTitle;
  return id && title ? { id: String(id), title: String(title) } : null;
}

function album(item: MusicItem): FacetOption | null {
  return item.kind === "track" &&
    item.raw.parentRatingKey &&
    item.raw.parentTitle
    ? {
        id: String(item.raw.parentRatingKey),
        title: String(item.raw.parentTitle),
      }
    : null;
}

export function libraryFacets(items: MusicItem[]): {
  artists: FacetOption[];
  albums: FacetOption[];
  years: number[];
} {
  const artists = new Map<string, FacetOption>();
  const albums = new Map<string, FacetOption>();
  const years = new Set<number>();
  for (const item of items) {
    const artistOption = artist(item);
    const albumOption = album(item);
    if (artistOption) artists.set(artistOption.id, artistOption);
    if (albumOption) albums.set(albumOption.id, albumOption);
    if (typeof item.raw.year === "number" && Number.isFinite(item.raw.year))
      years.add(item.raw.year);
  }
  const order = (a: FacetOption, b: FacetOption) =>
    a.title.localeCompare(b.title, undefined, {
      sensitivity: "base",
      numeric: true,
    }) || a.id.localeCompare(b.id);
  return {
    artists: [...artists.values()].sort(order),
    albums: [...albums.values()].sort(order),
    years: [...years].sort((a, b) => b - a),
  };
}

export function filterAndSort(
  items: MusicItem[],
  query: string,
  field: SortField,
  direction: SortDirection,
  filters: LibraryFilters = {},
): MusicItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  const result = items.filter(
    (item) =>
      matchesQuery(item, normalized) &&
      (!filters.artist || artist(item)?.id === filters.artist) &&
      (!filters.album || album(item)?.id === filters.album) &&
      (filters.year === undefined || item.raw.year === filters.year),
  );
  const value = (item: MusicItem): string | number | null => {
    if (field === "title") return item.title || null;
    if (field === "artist")
      return (
        item.raw.grandparentTitle ||
        item.raw.parentTitle ||
        item.subtitle ||
        null
      );
    if (field === "album") return album(item)?.title || null;
    const candidate = field === "year" ? item.raw.year : item.raw.addedAt;
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate
      : null;
  };
  const factor = direction === "asc" ? 1 : -1;
  return result.sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (a === null)
      return b === null ? left.ratingKey.localeCompare(right.ratingKey) : 1;
    if (b === null) return -1;
    const comparison =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b), undefined, {
            sensitivity: "base",
            numeric: true,
          });
    return comparison
      ? comparison * factor
      : left.ratingKey.localeCompare(right.ratingKey);
  });
}
