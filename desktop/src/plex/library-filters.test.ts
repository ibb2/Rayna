import { describe, expect, test } from "bun:test";
import {
  filterAndSort,
  filterInOriginalOrder,
  libraryFacets,
  popularArtistTracks,
} from "./library-filters";
import type { MusicItem } from "./library";

const item = (
  ratingKey: string,
  title: string,
  artist: string,
  year?: number,
): MusicItem => ({
  ratingKey,
  title,
  subtitle: artist,
  kind: "album",
  thumb: null,
  duration: null,
  raw: { parentTitle: artist, year },
});

describe("desktop library filtering and sorting", () => {
  const items = [
    item("1", "Ten", "Björk", 2000),
    item("2", "Two", "Adele"),
    item("3", "One", "Björk", 1995),
  ];
  test("filters by title or artist without changing the original list", () => {
    expect(
      filterAndSort(items, "BJÖRK", "title", "asc").map((value) => value.title),
    ).toEqual(["One", "Ten"]);
    expect(items.map((value) => value.title)).toEqual(["Ten", "Two", "One"]);
  });
  test("retains album and playlist order while filtering detail tracks", () => {
    const tracks = [
      item("1", "Zebra", "Adele"),
      item("2", "Alpha", "Björk"),
      item("3", "Another", "Adele"),
    ];
    expect(
      filterInOriginalOrder(tracks, "").map((track) => track.title),
    ).toEqual(["Zebra", "Alpha", "Another"]);
    expect(
      filterInOriginalOrder(tracks, "adele").map((track) => track.title),
    ).toEqual(["Zebra", "Another"]);
  });
  test("sorts numbers in either direction with missing values last", () => {
    expect(
      filterAndSort(items, "", "year", "asc").map((value) => value.title),
    ).toEqual(["One", "Ten", "Two"]);
    expect(
      filterAndSort(items, "", "year", "desc").map((value) => value.title),
    ).toEqual(["Ten", "One", "Two"]);
  });
  test("collects and filters facets by stable Plex identifiers", () => {
    const tracks: MusicItem[] = [
      {
        ...item("1", "Second", "Same name"),
        kind: "track",
        raw: {
          grandparentRatingKey: "artist-1",
          grandparentTitle: "Same name",
          parentRatingKey: "album-2",
          parentTitle: "Zed",
        },
      },
      {
        ...item("2", "First", "Same name"),
        kind: "track",
        raw: {
          grandparentRatingKey: "artist-2",
          grandparentTitle: "Same name",
          parentRatingKey: "album-1",
          parentTitle: "Alpha",
        },
      },
    ];
    expect(libraryFacets(tracks).artists.map((option) => option.id)).toEqual([
      "artist-1",
      "artist-2",
    ]);
    expect(
      filterAndSort(tracks, "", "album", "asc").map((value) => value.ratingKey),
    ).toEqual(["2", "1"]);
    expect(
      filterAndSort(tracks, "", "title", "asc", {
        artist: "artist-1",
        album: "album-2",
      }).map((value) => value.ratingKey),
    ).toEqual(["1"]);
    expect(
      filterAndSort(tracks, "", "title", "asc", {
        artist: "artist-1",
        album: "album-1",
      }),
    ).toEqual([]);
  });

  test("ranks an artist's popular tracks by plays, then recency", () => {
    const track = (
      ratingKey: string,
      title: string,
      artistId: string,
      viewCount: number,
      addedAt: number,
    ): MusicItem => ({
      ...item(ratingKey, title, "Artist"),
      kind: "track",
      raw: { grandparentRatingKey: artistId, viewCount, addedAt },
    });
    const tracks = [
      track("1", "Older", "artist", 1, 1),
      track("2", "Popular", "artist", 10, 1),
      track("3", "Newer", "artist", 1, 20),
      track("4", "Other artist", "other", 100, 99),
    ];
    expect(
      popularArtistTracks(tracks, "artist").map((value) => value.ratingKey),
    ).toEqual(["2", "3", "1"]);
  });
});
