import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import type { PlexLibrary, PlexServer, SyncStatus } from "../src/shared/types";
import type { PlayerTrack, UserProfile } from "../src/shared/rpc";
import { PlaybackController } from "./src/playback/controller";
import {
  NativeAudioEngine,
  type NativeBassModule,
} from "./src/playback/native-engine";
import type { PlaybackSnapshot } from "./src/playback/types";
import {
  PlexLibraryService,
  type HomeData,
  type LibraryKind,
  type MusicItem,
} from "./src/plex/library";
import {
  NativeSessionStore,
  type NativeSessionModule,
} from "./src/plex/native-session-store";
import { PlexSession } from "./src/plex/session";
import { PlexTimeline } from "./src/plex/timeline";
import {
  filterAndSort,
  filterInOriginalOrder,
  libraryFacets,
  type LibraryFilters,
  type SortDirection,
  type SortField,
} from "./src/plex/library-filters";
import type { ParsedLyrics } from "../src/bun/plex/lyrics";
import {
  DesktopDatabase,
  type NativeDatabaseModule,
} from "./src/storage/database";
import { SyncService } from "./src/sync/service";
import { legacyTranscodePreference } from "./src/plex/transcoding";
import {
  DownloadService,
  type DownloadRow,
  type NativeTransferModule,
} from "./src/downloads/service";
import { withStreamProxy, type NativeProxyModule } from "./src/playback/proxy";
import { ArtworkCache } from "./src/storage/artwork-cache";
import { NativeSidebar } from "./src/NativeSidebar";
import { NativePlayerControls } from "./src/NativePlayerControls";
import { updateSettingsContent } from "./src/SettingsWindow";

type Page =
  | "home"
  | "artist"
  | "album"
  | "track"
  | "playlist"
  | "downloads"
  | "search"
  | "settings";
const navigationItems: Array<[Page, string]> = [
  ["home", "Home"], ["album", "Albums"], ["track", "Tracks"],
  ["artist", "Artists"], ["playlist", "Playlists"], ["downloads", "Downloads"],
  ["search", "Search"], ["settings", "Settings"],
];

const searchKinds: LibraryKind[] = ["artist", "album", "track", "playlist"];
const searchKindLabels: Record<LibraryKind, string> = { artist: "Artists", album: "Albums", track: "Tracks", playlist: "Playlists" };

type Phase = "auth" | "servers" | "libraries" | "app";
type Theme = "system" | "light" | "dark";
type Runtime = {
  session: PlexSession;
  library: PlexLibraryService;
  player: PlaybackController;
  timeline: PlexTimeline;
  database: DesktopDatabase;
  sync: SyncService;
  downloads: DownloadService;
  transfer: NativeTransferModule;
  proxy: NativeProxyModule;
  artwork: ArtworkCache;
};

// Plex client and playback identifiers are identifiers, not credentials.
function createId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 3) | 8).toString(16);
    },
  );
}

function createRuntime(): Runtime {
  const storage = NativeModules.RaynaSession as NativeSessionModule | undefined;
  const bass = NativeModules.RaynaBass as NativeBassModule | undefined;
  const nativeDatabase = NativeModules.RaynaDatabase as
    | NativeDatabaseModule
    | undefined;
  const transfer = NativeModules.RaynaTransfer as
    | NativeTransferModule
    | undefined;
  const proxy = NativeModules.RaynaProxy as NativeProxyModule | undefined;
  if (!storage || !bass || !nativeDatabase || !transfer || !proxy)
    throw new Error(
      "The Rayna desktop native modules are unavailable. Rebuild the desktop application.",
    );
  const session = new PlexSession(new NativeSessionStore(storage), createId);
  const database = new DesktopDatabase(nativeDatabase);
  const library = new PlexLibraryService(session, createId, database);
  const sync = new SyncService(database, library);
  const downloads = new DownloadService(database, transfer, library, createId);
  const artwork = new ArtworkCache(
    transfer,
    () => session.snapshot.selectedServer?.clientIdentifier,
    () => session.offline,
  );
  let previousRoute: string | null = null;
  const player = new PlaybackController(
    new NativeAudioEngine(bass),
    (source, excluded) =>
      withStreamProxy(library.candidates(source, excluded), proxy),
    (uri) => {
      const serverId = session.snapshot.selectedServer?.clientIdentifier;
      if (uri !== "offline" && uri !== previousRoute && serverId)
        void sync.run(serverId, "network-restored").catch(() => undefined);
      previousRoute = uri;
    },
  );
  return {
    session,
    library,
    player,
    database,
    sync,
    downloads,
    transfer,
    proxy,
    artwork,
    timeline: new PlexTimeline(session, player),
  };
}

function initialPhase(session: PlexSession): Phase {
  if (!session.signedIn) return "auth";
  if (!session.snapshot.selectedServer) return "servers";
  return Array.isArray(session.snapshot.selectedLibraries)
    ? "app"
    : "libraries";
}

export default function App() {
  const systemTheme = useColorScheme();
  const [theme, setTheme] = useState<Theme>("system");
  const dark =
    theme === "dark" || (theme === "system" && systemTheme === "dark");
  const colors = dark ? palette.dark : palette.light;
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [phase, setPhase] = useState<Phase>("auth");
  const [page, setPage] = useState<Page>("home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [items, setItems] = useState<MusicItem[]>([]);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [detail, setDetail] = useState<MusicItem | null>(null);
  const [popularTracks, setPopularTracks] = useState<MusicItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(false);
  const detailRequest = useRef(0);
  const relatedRequest = useRef(0);
  const [history, setHistory] = useState<
    Array<{
      detail: MusicItem | null;
      items: MusicItem[];
      popularTracks: MusicItem[];
      query: string;
    }>
  >([]);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<LibraryFilters>({});
  const [openFacet, setOpenFacet] = useState<
    "artist" | "album" | "year" | null
  >(null);
  const [facetQuery, setFacetQuery] = useState("");
  const [showQueue, setShowQueue] = useState(false);
  const [contentWidth, setContentWidth] = useState(800);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<ParsedLyrics | null>(null);
  const [lyricsError, setLyricsError] = useState("");
  const [timelineEnabled, setTimelineEnabled] = useState(true);
  const [transcodeEnabled, setTranscodeEnabled] = useState(false);
  const [ultraBlurEnabled, setUltraBlurEnabled] = useState(true);
  const [ultraBlurUri, setUltraBlurUri] = useState<string | null>(null);
  const [storageLocation, setStorageLocation] = useState<string | null>(null);
  const [storageInput, setStorageInput] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const [downloadRecords, setDownloadRecords] = useState<DownloadRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [seekText, setSeekText] = useState("");
  const [playback, setPlayback] = useState<PlaybackSnapshot | null>(null);
  const homeScrollViews = useRef<Record<string, ScrollView | null>>({});
  const homeScrollOffsets = useRef<Record<string, number>>({});
  const active = useRef(true);
  const authGeneration = useRef(0);
  const facets = useMemo(() => libraryFacets(items), [items]);
  const showLibraryGrid = detail?.kind === "artist" || (!detail && (page === "album" || page === "artist" || page === "playlist"));
  const gridColumns = Math.max(1, Math.floor(Math.max(contentWidth - 40, 150) / 180));
  const gridItemWidth = Math.floor(Math.max(contentWidth - 40, 150) / gridColumns);
  const visibleItems = useMemo(
    () =>
      detail
        ? filterInOriginalOrder(items, query)
        : page === "search"
          ? [...items].sort((left, right) => searchKinds.indexOf(left.kind) - searchKinds.indexOf(right.kind))
        : filterAndSort(
            items,
            query,
            sortField,
            sortDirection,
            page === "album" || page === "track" ? filters : {},
          ),
    [items, page, query, sortField, sortDirection, detail, filters],
  );

  useEffect(() => {
    let current: Runtime | null = null;
    let unsubscribe: (() => void) | null = null;
    active.current = true;
    void (async () => {
      try {
        current = createRuntime();
        await current.database.open();
        await current.session.initialize();
        await current.downloads.initialize();
        const artworkDirectory = await current.transfer
          .legacyArtworkDirectory()
          .catch(() => null);
        if (artworkDirectory) {
          current.library.setLegacyArtworkDirectory(artworkDirectory);
          current.artwork.setDirectory(artworkDirectory);
        }
        if (active.current) {
          setStorageLocation(current.downloads.storageDirectory);
          setStorageInput(current.downloads.storageDirectory);
        }
        if (
          current.session.snapshot.enableTimelineReporting === undefined ||
          current.session.snapshot.transcodeAudio === undefined ||
          current.session.snapshot.enableUltraBlur === undefined
        ) {
          const settings = await current.database.execute<{ value: string }>(
            "SELECT value FROM settings WHERE key=?",
            ["playback"],
          );
          if (settings.rows[0]) {
            let value: {
              enableTimelineReporting?: unknown;
              transcodeAudio?: unknown;
              useOriginalFileUrl?: unknown;
              enableUltraBlur?: unknown;
            } | null = null;
            try {
              value = JSON.parse(settings.rows[0].value);
            } catch {
              /* Keep the default when the old optional setting is invalid. */
            }
            if (
              current.session.snapshot.enableTimelineReporting === undefined &&
              typeof value?.enableTimelineReporting === "boolean"
            )
              await current.session.setTimelineReporting(
                value.enableTimelineReporting,
              );
            const transcode = legacyTranscodePreference(value);
            if (
              current.session.snapshot.transcodeAudio === undefined &&
              transcode !== undefined
            )
              await current.session.setTranscodeAudio(transcode);
            if (
              current.session.snapshot.enableUltraBlur === undefined &&
              typeof value?.enableUltraBlur === "boolean"
            )
              await current.session.setUltraBlur(value.enableUltraBlur);
          }
        }
        if (!active.current) return;
        unsubscribe = current.player.subscribe(setPlayback);
        setTheme(current.session.snapshot.theme || "system");
        setTimelineEnabled(
          current.session.snapshot.enableTimelineReporting !== false,
        );
        setTranscodeEnabled(current.session.snapshot.transcodeAudio === true);
        setUltraBlurEnabled(current.session.snapshot.enableUltraBlur !== false);
        current.timeline.start();
        setPhase(initialPhase(current.session));
        setRuntime(current);
        const serverId =
          current.session.snapshot.selectedServer?.clientIdentifier;
        if (
          serverId &&
          Array.isArray(current.session.snapshot.selectedLibraries)
        ) {
          void current.sync
            .run(serverId, "startup")
            .then((status) => {
              if (active.current) setSyncStatus(status);
            })
            .catch(() => undefined);
        }
      } catch (failure) {
        if (active.current) setError(message(failure));
      }
    })();
    return () => {
      active.current = false;
      authGeneration.current++;
      unsubscribe?.();
      if (current) {
        current.timeline.dispose();
        const runtime = current;
        void (async () => {
          try {
            await runtime.artwork.dispose();
          } finally {
            try {
              await runtime.downloads.dispose();
            } finally {
              try {
                await runtime.player.dispose();
              } finally {
                try {
                  await runtime.proxy.stop();
                } finally {
                  await runtime.database.close();
                }
              }
            }
          }
        })().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!runtime || !runtime.session.signedIn) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    void runtime.session
      .userProfile()
      .then((value) => {
        if (!cancelled) setProfile(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runtime, phase, offline]);

  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    void (async () => {
      try {
        if (phase === "servers") {
          const result = await runtime.session.servers();
          if (!cancelled) setServers(result);
        } else if (phase === "libraries") {
          const result = (await runtime.session.libraries()).filter(
            (library) => library.type === "artist",
          );
          if (!cancelled) {
            setLibraries(result);
            setSelected(
              (runtime.session.snapshot.selectedLibraries || []).map(
                (library) =>
                  typeof library === "string" ? library : library.uuid,
              ),
            );
          }
        }
      } catch (failure) {
        if (!cancelled) setError(message(failure));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, runtime]);

  useEffect(() => {
    if (phase !== "app") {
      detailRequest.current++;
      relatedRequest.current++;
      setDetailLoading(false);
      setPopularLoading(false);
    }
  }, [phase]);

  useEffect(() => {
    if (!runtime || phase !== "app" || page === "settings" || page === "search")
      return;
    let cancelled = false;
    setDetail(null);
    setItems([]);
    if (page === "home") {
      setHomeData(null);
      void runtime.library
        .home()
        .then((result) => {
          if (!cancelled) setHomeData(result);
        })
        .catch((failure) => {
          if (!cancelled) {
            setError(message(failure));
            setHomeData({
              quickAccess: [],
              recentlyPlayed: [],
              recentlyAdded: [],
              playlists: [],
            });
          }
        });
    } else {
      const request =
        page === "downloads"
          ? runtime.library.downloaded()
          : runtime.library.list(page as LibraryKind);
      void request
        .then((result) => {
          if (!cancelled) setItems(result);
        })
        .catch((failure) => {
          if (!cancelled) setError(message(failure));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [runtime, phase, page, navigationVersion]);

  useEffect(() => {
    if (!runtime || phase !== "app" || page !== "search" || detail) return;
    let cancelled = false;
    const text = query.trim();
    setItems([]);
    setSearchError("");
    setSearchLoading(!!text);
    if (!text) return;
    const timer = setTimeout(() => {
      void runtime.library.search(text).then((results) => {
        if (!cancelled) setItems(results);
      }).catch((failure) => {
        if (!cancelled) setSearchError(message(failure));
      }).finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [runtime, phase, page, detail, query]);

  useEffect(() => {
    if (!runtime || phase !== "app" || page !== "downloads") return;
    const serverId = runtime.session.snapshot.selectedServer?.clientIdentifier;
    if (!serverId) return;
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [records, completed] = await Promise.all([
          runtime.downloads.list(serverId),
          runtime.library.downloaded(),
        ]);
        if (!cancelled) {
          setDownloadRecords(records);
          setItems(completed);
        }
      } catch (failure) {
        if (!cancelled) setError(message(failure));
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const unsubscribe = runtime.downloads.subscribe(() => void refresh());
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [runtime, phase, page]);

  useEffect(() => {
    const ratingKey = playback?.currentTrack?.ratingKey;
    if (!runtime || !showLyrics || !ratingKey) {
      setLyrics(null);
      setLyricsError("");
      return;
    }
    let cancelled = false;
    setLyrics(null);
    setLyricsError("");
    void runtime.library
      .lyrics(ratingKey)
      .then((result) => {
        if (!cancelled) {
          setLyrics(result);
          if (!result) setLyricsError("Lyrics are unavailable for this track.");
        }
      })
      .catch(() => {
        if (!cancelled) setLyricsError("Unable to load lyrics.");
      });
    return () => {
      cancelled = true;
    };
  }, [runtime, showLyrics, playback?.currentTrack?.ratingKey]);

  useEffect(() => {
    setUltraBlurUri(null);
    if (!runtime || phase !== "app" || !detail || !ultraBlurEnabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const variants = await runtime.library.ultraBlur(detail);
        const url = variants && (dark ? variants.dark : variants.light);
        if (!url) return;
        const cached = await runtime.artwork.resolve(url);
        if (!cancelled) setUltraBlurUri(cached || (!offline ? url : null));
      } catch {
        // The regular background remains usable when artwork is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime, phase, detail, ultraBlurEnabled, dark, offline]);

  useEffect(() => {
    const serverId = runtime?.session.snapshot.selectedServer?.clientIdentifier;
    if (!runtime || phase !== "app" || !serverId) return;
    let cancelled = false;
    void runtime.sync
      .status(serverId)
      .then((status) => {
        if (!cancelled) setSyncStatus(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runtime, phase]);

  const run = async (task: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (failure) {
      if (active.current) setError(message(failure));
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const signIn = () =>
    runtime &&
    void run(async () => {
      const generation = ++authGeneration.current;
      const pin = await runtime.session.createPin();
      await Linking.openURL(pin.authUrl);
      const deadline = Date.now() + 120_000;
      while (
        active.current &&
        generation === authGeneration.current &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!active.current || generation !== authGeneration.current) return;
        if (await runtime.session.checkPin(pin.id)) {
          setPhase("servers");
          return;
        }
      }
      if (active.current && generation === authGeneration.current)
        throw new Error("Plex sign-in timed out. Please try again.");
    });
  const selectServer = (server: PlexServer) =>
    runtime &&
    void run(async () => {
      await runtime.session.selectServer(server, async () => {
        await runtime.player.stop(true);
      });
      setPhase("libraries");
    });
  const selectLibraries = () =>
    runtime &&
    void run(async () => {
      await runtime.session.selectLibraries(
        libraries.filter((library) => selected.includes(library.uuid)),
      );
      setPage("home");
      setPhase("app");
      const serverId =
        runtime.session.snapshot.selectedServer?.clientIdentifier;
      if (serverId)
        void runtime.sync
          .run(serverId, "startup")
          .then((status) => {
            if (
              active.current &&
              runtime.session.snapshot.selectedServer?.clientIdentifier ===
                serverId
            )
              setSyncStatus(status);
          })
          .catch(() => undefined);
    });
  const loadDetail = (item: MusicItem, request: number, children: boolean, popular: boolean) => {
    if (!runtime) return;
    const current = () => active.current && detailRequest.current === request;
    if (children) {
      setDetailLoading(true);
      void runtime.library.children(item).then((result) => {
        if (current()) setItems(result);
      }).catch((failure) => {
        if (current()) setError(message(failure));
      }).finally(() => {
        if (current()) setDetailLoading(false);
      });
    }
    if (popular) {
      setPopularLoading(true);
      void runtime.library.popularTracks(item).then((result) => {
        if (current()) setPopularTracks(result);
      }).catch(() => {}).finally(() => {
        if (current()) setPopularLoading(false);
      });
    }
  };
  const openItem = (item: MusicItem) => {
    if (!runtime) return;
    relatedRequest.current++;
    if (item.kind === "track") {
      void run(async () => runtime.player.play(await runtime.library.playables(item)));
      return;
    }
    const request = ++detailRequest.current;
    setHistory((previous) => [...previous, { detail, items, popularTracks, query }]);
    setDetail(item);
    setItems([]);
    setPopularTracks([]);
    setQuery("");
    setError("");
    setDetailLoading(false);
    setPopularLoading(false);
    loadDetail(item, request, true, item.kind === "artist");
  };
  const openRelated = (kind: "artist" | "album", ratingKey: string, title: string) => {
    if (!runtime || !ratingKey) return;
    const request = ++relatedRequest.current;
    void runtime.library.relatedItem(kind, ratingKey, title).then((item) => {
      if (active.current && relatedRequest.current === request) openItem(item);
    }).catch((failure) => {
      if (active.current && relatedRequest.current === request) setError(message(failure));
    });
  };
  const navigateTo = (id: Page) => {
    detailRequest.current++;
    relatedRequest.current++;
    setDetailLoading(false);
    setPopularLoading(false);
    setPage(id);
    setDetail(null);
    setItems([]);
    setPopularTracks([]);
    setHistory([]);
    setQuery("");
    setFilters({});
    setOpenFacet(null);
    setSortField("title");
    setSortDirection("asc");
    setNavigationVersion((value) => value + 1);
  };
  const settingsContentRef = useRef<ReactNode>(null);
  useEffect(() => {
    if (Platform.OS === "macos") updateSettingsContent(settingsContentRef.current);
  });
  useEffect(() => () => {
    if (Platform.OS === "macos") updateSettingsContent(null);
  }, []);

  const playItem = (item: MusicItem, queue: boolean) =>
    runtime &&
    void run(async () => {
      const tracks = await runtime.library.playables(item);
      if (queue) await runtime.player.enqueue(tracks);
      else await runtime.player.play(tracks);
    });
  const downloadItem = (item: MusicItem) =>
    runtime &&
    void run(async () => {
      const serverId =
        runtime.session.snapshot.selectedServer?.clientIdentifier;
      if (!serverId) throw new Error("Select a Plex server first");
      await runtime.downloads.enqueue(serverId, item);
    });
  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.button, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
  const homeSection = (title: string, section: MusicItem[]) => (
    <View style={styles.homeSection}>
      <View style={styles.homeSectionHeader}>
        <Text style={[styles.section, { color: colors.text }]}>{title}</Text>
        {!!section.length && (
          <View style={styles.row}>
            {[[-1, "left"], [1, "right"]].map(([direction, label]) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={`Scroll ${title} ${label}`}
                onPress={() => homeScrollViews.current[title]?.scrollTo({
                  x: Math.max(0, (homeScrollOffsets.current[title] || 0) + Number(direction) * 500),
                  animated: true,
                })}
                style={styles.carouselArrow}
              >
                <Text style={{ color: colors.text, fontSize: 20 }}>{direction === -1 ? "‹" : "›"}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {section.length ? (
        <ScrollView
          ref={(view) => { homeScrollViews.current[title] = view; }}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => { homeScrollOffsets.current[title] = event.nativeEvent.contentOffset.x; }}
        >
          {section.map((item) => (
            <Pressable
              key={`${item.kind}-${item.ratingKey}`}
              accessibilityRole="button"
              onPress={() => openItem(item)}
              style={styles.homeCard}
            >
              <CachedArtwork
                cache={runtime!.artwork}
                uri={item.thumb}
                offline={offline}
                label={item.title}
                style={styles.homeArtwork}
                background={colors.button}
                color={colors.muted}
              />
              <Text numberOfLines={1} style={{ color: colors.text }}>
                {item.title}
              </Text>
              {!!item.subtitle && (
                <Text numberOfLines={1} style={{ color: colors.muted }}>
                  {item.subtitle}
                </Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={{ color: colors.muted }}>Nothing here yet.</Text>
      )}
    </View>
  );

  if (!runtime)
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {error ? (
          <Text style={{ color: colors.error }}>{error}</Text>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );

  const detailHeader = (
    <>
                  {detail && (
                    <View style={styles.detailHeader}>
                      <CachedArtwork
                        cache={runtime.artwork}
                        uri={detail.thumb}
                        offline={offline}
                        label={detail.title}
                        style={styles.detailArtwork}
                        background={colors.button}
                        color={colors.muted}
                      />
                      <View>
                        {detail.kind === "album" && detail.raw.parentRatingKey ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Open artist ${detail.subtitle}`}
                            onPress={() => openRelated("artist", String(detail.raw.parentRatingKey), detail.subtitle)}
                          >
                            <Text style={{ color: colors.accent }}>{detail.subtitle}</Text>
                          </Pressable>
                        ) : <Text style={{ color: colors.text }}>{detail.subtitle}</Text>}
                        {detail.duration !== null && (
                          <Text style={{ color: colors.muted }}>
                            {formatTime(detail.duration / 1000)}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                  {detail && (
                    <View style={styles.row}>
                      {button("Back", () => {
                        const previous = history.at(-1);
                        if (previous) {
                          detailRequest.current++;
                          relatedRequest.current++;
                          setDetailLoading(false);
                          setPopularLoading(false);
                          setDetail(previous.detail);
                          setItems(previous.items);
                          setPopularTracks(previous.popularTracks);
                          setQuery(previous.query);
                          setHistory(history.slice(0, -1));
                          const request = detailRequest.current;
                          if (previous.detail) {
                            loadDetail(
                              previous.detail,
                              request,
                              !previous.items.length,
                              previous.detail.kind === "artist" && !previous.popularTracks.length,
                            );
                          }
                        }
                      })}
                      {button("Play all", () => playItem(detail, false), busy)}
                      {button(
                        "Add to queue",
                        () => playItem(detail, true),
                        busy,
                      )}
                      {detail.kind !== "artist" &&
                        button("Download", () => downloadItem(detail), busy)}
                    </View>
                  )}
                  {detail?.kind === "artist" && (
                    <View>
                      <Text style={[styles.section, { color: colors.text }]}>
                        Popular tracks
                      </Text>
                      <View>
                        {popularLoading ? (
                          <ActivityIndicator />
                        ) : popularTracks.length ? (
                          popularTracks.map((track) => (
                            <View
                              key={track.ratingKey}
                              style={[
                                styles.item,
                                { borderColor: colors.border },
                              ]}
                            >
                              <View style={styles.itemText}>
                                <Text style={{ color: colors.text }}>
                                  {track.title}
                                </Text>
                                <Text style={{ color: colors.muted }}>
                                  {track.subtitle}
                                </Text>
                              </View>
                              {button(
                                "Play",
                                () => playItem(track, false),
                                busy,
                              )}
                              {button(
                                "Queue",
                                () => playItem(track, true),
                                busy,
                              )}
                              {button(
                                "Download",
                                () => downloadItem(track),
                                busy,
                              )}
                            </View>
                          ))
                        ) : (
                          <Text style={{ color: colors.muted }}>
                            No popular tracks available.
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.section, { color: colors.text }]}>
                        Albums
                      </Text>
                    </View>
                  )}
    </>
  );
  const filterInput = (
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={
                      page === "search" && !detail ? "Search Plex" : "Filter"
                    }
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border },
                    ]}
                  />
  );

  const queueTrack = (track: PlayerTrack, activeTrack = false) => (
    <View style={[styles.queueTrack, activeTrack && { backgroundColor: colors.button }]}>
      <CachedArtwork
        cache={runtime.artwork}
        uri={track.thumb ?? null}
        offline={offline}
        label={track.album}
        style={styles.artwork}
        background={colors.button}
        color={colors.muted}
      />
      <View style={styles.itemText}>
        <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "600" }}>{track.title}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted }}>{[track.artist, track.album].filter(Boolean).join(" · ")}</Text>
      </View>
    </View>
  );

  const showMainPhase = (next: Phase) => {
    setPhase(next);
    if (Platform.OS === "macos") NativeModules.RaynaWindow?.showMainWindow();
  };

  const settingsContent = (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
      <ScrollView>
                  <Text style={[styles.section, { color: colors.text }]}>
                    Appearance
                  </Text>
                  {!runtime.session.snapshot.theme && (
                    <Text style={{ color: colors.muted }}>
                      Using system appearance. Themes from the previous app
                      cannot be imported automatically.
                    </Text>
                  )}
                  <View style={styles.row}>
                    {(["system", "light", "dark"] as Theme[]).map((value) => (
                      <View key={value}>
                        {button(
                          value === theme ? `${value} ✓` : value,
                          () =>
                            void run(async () => {
                              await runtime.session.setTheme(value);
                              setTheme(value);
                            }),
                        )}
                      </View>
                    ))}
                  </View>
                  {button(
                    `UltraBlur: ${ultraBlurEnabled ? "on" : "off"}`,
                    () =>
                      void run(async () => {
                        const enabled = !ultraBlurEnabled;
                        await runtime.session.setUltraBlur(enabled);
                        setUltraBlurEnabled(enabled);
                      }),
                  )}
                  <Text style={[styles.section, { color: colors.text }]}>
                    Plex
                  </Text>
                  {button(
                    offline ? "Go online" : "Go offline",
                    () =>
                      void run(async () => {
                        const next = !offline;
                        if (next) {
                          await runtime.artwork.pause();
                          await runtime.downloads.pauseAll();
                          if (
                            runtime.player.currentConnection &&
                            runtime.player.currentConnection !== "offline"
                          )
                            await runtime.player.stop();
                        }
                        runtime.session.setOffline(next);
                        setOffline(next);
                        if (!next) {
                          runtime.artwork.resume();
                          const serverId =
                            runtime.session.snapshot.selectedServer
                              ?.clientIdentifier;
                          if (serverId)
                            void runtime.sync
                              .run(serverId, "network-restored")
                              .then((status) => {
                                if (active.current) setSyncStatus(status);
                              })
                              .catch(() => undefined);
                        }
                        setNavigationVersion((value) => value + 1);
                      }),
                    busy,
                  )}
                  {storageLocation && (
                    <Text style={{ color: colors.muted }}>
                      Download location: {storageLocation}
                    </Text>
                  )}
                  <TextInput
                    accessibilityLabel="Download directory"
                    value={storageInput}
                    onChangeText={setStorageInput}
                    placeholder="Absolute download directory"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border },
                    ]}
                  />
                  {button(
                    "Move downloads",
                    () =>
                      Alert.alert(
                        "Move downloads?",
                        "Active downloads will pause while files are copied. Original files imported from the previous app will be kept.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Move",
                            onPress: () =>
                              void run(async () => {
                                setStorageNotice("");
                                const wasPlaying =
                                  runtime.player.snapshot().playing;
                                if (wasPlaying) await runtime.player.pause();
                                try {
                                  const result =
                                    await runtime.downloads.moveDirectory(
                                      storageInput,
                                    );
                                  await runtime.player.remapLocalPaths(
                                    result.relocatedPaths,
                                  );
                                  setStorageLocation(result.directory);
                                  setStorageInput(result.directory);
                                  const notes = [
                                    result.retainedLegacyFiles
                                      ? `${result.retainedLegacyFiles} original file(s) retained for the previous app`
                                      : "",
                                    result.skippedFiles
                                      ? `${result.skippedFiles} file(s) outside the previous directory left in place`
                                      : "",
                                    result.cleanupFailures.length
                                      ? `${result.cleanupFailures.length} original file(s) could not be removed`
                                      : "",
                                  ].filter(Boolean);
                                  setStorageNotice(
                                    notes.length
                                      ? notes.join("; ")
                                      : "Downloads moved.",
                                  );
                                } finally {
                                  if (wasPlaying) await runtime.player.resume();
                                }
                              }),
                          },
                        ],
                      ),
                    busy,
                  )}
                  {!!storageNotice && (
                    <Text style={{ color: colors.muted }}>{storageNotice}</Text>
                  )}
                  {button(
                    `320 kbps Opus streaming: ${transcodeEnabled ? "on" : "off"}`,
                    () =>
                      void run(async () => {
                        const previous =
                          runtime.session.snapshot.transcodeAudio === true;
                        const next = !previous;
                        const track = runtime.player.snapshot().currentTrack;
                        const source = track
                          ? await runtime.library.remoteSource(track, next)
                          : null;
                        await runtime.session.setTranscodeAudio(next);
                        try {
                          if (
                            source &&
                            !(await runtime.player.replaceCurrentSource(source))
                          )
                            throw new Error(
                              "Unable to switch the current playback source",
                            );
                        } catch (failure) {
                          await runtime.session.setTranscodeAudio(previous);
                          throw failure;
                        }
                        setTranscodeEnabled(next);
                      }),
                    busy,
                  )}
                  <Text style={{ color: colors.muted }}>
                    Opus streaming is experimental; some streams cannot seek
                    until buffered.
                  </Text>
                  {button(
                    `Playback reporting: ${timelineEnabled ? "on" : "off"}`,
                    () =>
                      void run(async () => {
                        const enabled = !timelineEnabled;
                        await runtime.session.setTimelineReporting(enabled);
                        setTimelineEnabled(enabled);
                        runtime.timeline.refresh();
                      }),
                  )}
                  {button("Change server", () => showMainPhase("servers"))}
                  {button("Choose libraries", () => showMainPhase("libraries"))}
                  <Text style={[styles.section, { color: colors.text }]}>
                    Library synchronization
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    {syncStatus?.state || "idle"}
                    {syncStatus?.error ? `: ${syncStatus.error}` : ""}
                  </Text>
                  {button(
                    "Sync now",
                    () =>
                      void run(async () => {
                        const serverId =
                          runtime.session.snapshot.selectedServer
                            ?.clientIdentifier;
                        if (serverId)
                          setSyncStatus(
                            await runtime.sync.run(serverId, "manual"),
                          );
                      }),
                    busy,
                  )}
                  {button(
                    "Sign out",
                    () =>
                      void run(async () => {
                        await runtime.artwork.pause();
                        await runtime.downloads.pauseAll();
                        await runtime.player.stop(true);
                        await runtime.session.logout();
                        runtime.artwork.resume();
                        setOffline(false);
                        showMainPhase("auth");
                      }),
                  )}
                </ScrollView>
    </View>
  );
  settingsContentRef.current = phase === "app" ? settingsContent : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, Platform.OS === "macos" && styles.macHeader, { borderColor: colors.border }]}>
        <Text style={[styles.brand, { color: colors.text }]}>Rayna</Text>
        <Text style={{ color: colors.muted }}>Plex music for your desktop</Text>
        {offline && <Text style={{ color: colors.accent }}>Offline</Text>}
        {profile && (
          <Text style={{ color: colors.muted }}>
            {profile.title || profile.username}
          </Text>
        )}
      </View>
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: colors.error }]}
        >
          {error}
        </Text>
      )}
      {busy && <ActivityIndicator style={styles.busy} />}
      {phase === "auth" && (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.text }]}>
            Sign in to Plex
          </Text>
          <Text style={{ color: colors.muted }}>
            Continue in your browser, then return to Rayna.
          </Text>
          {button(busy ? "Waiting for Plex…" : "Sign in", signIn, busy)}
        </View>
      )}
      {phase === "servers" && (
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>
            Choose a server
          </Text>
          <ScrollView>
            {servers.map((server) => (
              <View key={server.clientIdentifier} style={styles.item}>
                <Text style={[styles.itemText, { color: colors.text }]}>
                  {server.name}
                </Text>
                {button("Select", () => selectServer(server), busy)}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      {phase === "libraries" && (
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>
            Choose music libraries
          </Text>
          <Text style={{ color: colors.muted }}>
            Leave all unchecked to use every music library.
          </Text>
          <ScrollView>
            {libraries.map((library) => (
              <Pressable
                key={library.uuid}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: selected.includes(library.uuid),
                }}
                onPress={() =>
                  setSelected((previous) =>
                    previous.includes(library.uuid)
                      ? previous.filter((id) => id !== library.uuid)
                      : [...previous, library.uuid],
                  )
                }
                style={styles.item}
              >
                <Text style={{ color: colors.text }}>
                  {selected.includes(library.uuid) ? "☑" : "☐"} {library.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {button("Continue", selectLibraries, busy)}
        </View>
      )}
      {phase === "app" && (
        <>
          <View style={styles.body}>
            {NativeSidebar ? (
              <NativeSidebar
                style={styles.nativeSidebar}
                dark={dark}
                selectedPage={page}
                onSelect={(event) => navigateTo(event.nativeEvent.page as Page)}
              />
            ) : (
              <View style={[styles.sidebar, { borderColor: colors.border }]}>
                {navigationItems.map(([id, label]) => (
                  <Pressable key={id} accessibilityRole="button" onPress={() => navigateTo(id)} style={styles.navItem}>
                    <Text style={{ color: page === id ? colors.accent : colors.text }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.content} onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}>
              {ultraBlurUri && (
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Image
                    source={{ uri: ultraBlurUri }}
                    resizeMode="cover"
                    onError={() => setUltraBlurUri(null)}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.78)" }]} />
                </View>
              )}
              <Text style={[styles.title, { color: colors.text }]}>
                {detail?.title || pageTitle(page)}
              </Text>
              {page === "settings" ? (
                settingsContent
              ) : page === "home" && !detail ? (
                <ScrollView style={{ flex: 1 }}>
                  {!homeData ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <View style={styles.quickAccess}>
                        {homeData.quickAccess.map((item) => (
                          <Pressable
                            key={`${item.kind}-${item.ratingKey}`}
                            accessibilityRole="button"
                            accessibilityLabel={item.title}
                            onPress={() => openItem(item)}
                            style={[styles.quickAccessItem, { backgroundColor: colors.button }]}
                          >
                            <CachedArtwork
                              cache={runtime.artwork}
                              uri={item.thumb}
                              offline={offline}
                              label={item.title}
                              style={styles.quickAccessArtwork}
                              background={colors.button}
                              color={colors.muted}
                            />
                            <Text numberOfLines={2} style={[styles.quickAccessTitle, { color: colors.text }]}>
                              {item.title}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {homeSection("Recently played", homeData.recentlyPlayed)}
                      {homeSection("Recently added", homeData.recentlyAdded)}
                      {homeSection("Playlists", homeData.playlists)}
                    </>
                  )}
                </ScrollView>
              ) : (
                <>
                  {detail?.kind !== "artist" && detailHeader}
                  {page === "downloads" && (
                    <ScrollView style={styles.downloadActivity}>
                      {button(
                        "Clear completed activity",
                        () =>
                          void run(async () => {
                            const serverId =
                              runtime.session.snapshot.selectedServer
                                ?.clientIdentifier;
                            if (serverId)
                              await runtime.downloads.clearActivity(serverId);
                          }),
                        busy,
                      )}
                      {downloadRecords
                        .filter((record) => {
                          if (
                            record.status === "queued" ||
                            record.status === "downloading" ||
                            record.status === "paused"
                          )
                            return true;
                          try {
                            return !JSON.parse(record.metadata)
                              ?.activityClearedAt;
                          } catch {
                            return true;
                          }
                        })
                        .map((record) => (
                          <View
                            key={record.id}
                            style={[
                              styles.item,
                              { borderColor: colors.border },
                            ]}
                          >
                            <View style={styles.itemText}>
                              <Text style={{ color: colors.text }}>
                                {record.title}
                              </Text>
                              <Text style={{ color: colors.muted }}>
                                {record.status} ·{" "}
                                {formatBytes(record.bytes_downloaded)}
                                {record.total_bytes
                                  ? ` / ${formatBytes(record.total_bytes)} (${Math.min(100, Math.round((record.bytes_downloaded / record.total_bytes) * 100))}%)`
                                  : ""}
                                {record.error ? ` · ${record.error}` : ""}
                              </Text>
                            </View>
                            {(record.status === "queued" ||
                              record.status === "downloading") &&
                              button(
                                "Pause",
                                () =>
                                  void run(() =>
                                    runtime.downloads.pause(record.id),
                                  ),
                                busy,
                              )}
                            {(record.status === "paused" ||
                              record.status === "failed") &&
                              button(
                                record.status === "failed" ? "Retry" : "Resume",
                                () =>
                                  void run(() =>
                                    runtime.downloads.resume(record.id),
                                  ),
                                busy,
                              )}
                            {button(
                              "Remove",
                              () =>
                                Alert.alert(
                                  "Remove download?",
                                  `Remove ${record.title} and its downloaded file?`,
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                      text: "Remove",
                                      style: "destructive",
                                      onPress: () =>
                                        void run(() =>
                                          runtime.downloads.remove(record.id),
                                        ),
                                    },
                                  ],
                                ),
                              busy,
                            )}
                          </View>
                        ))}
                    </ScrollView>
                  )}
                  {detail?.kind !== "artist" && filterInput}
                  {!detail && page !== "search" && (
                    <View style={styles.row}>
                      {button(
                        `Sort: ${{ title: "Title", artist: "Artist", album: "Album", year: "Year", dateAdded: "Date added" }[sortField]}`,
                        () => {
                          const fields: SortField[] =
                            page === "track"
                              ? ["title", "artist", "album", "dateAdded"]
                              : page === "album"
                                ? ["title", "artist", "year", "dateAdded"]
                                : ["title", "dateAdded"];
                          setSortField(
                            fields[
                              (fields.indexOf(sortField) + 1) % fields.length
                            ]!,
                          );
                        },
                      )}
                      {button(
                        sortDirection === "asc" ? "Ascending" : "Descending",
                        () =>
                          setSortDirection(
                            sortDirection === "asc" ? "desc" : "asc",
                          ),
                      )}
                      {!detail &&
                        (page === "album" || page === "track") &&
                        (
                          [
                            "artist",
                            page === "track" ? "album" : "year",
                          ] as const
                        ).map((facet) => {
                          const current = filters[facet];
                          const label =
                            facet === "year"
                              ? current
                              : (facet === "artist"
                                  ? facets.artists
                                  : facets.albums
                                ).find((option) => option.id === current)
                                  ?.title;
                          return (
                            <View key={facet}>
                              {button(
                                `${facet[0]!.toUpperCase()}${facet.slice(1)}: ${label || "All"}`,
                                () => {
                                  setFacetQuery("");
                                  setOpenFacet(
                                    openFacet === facet ? null : facet,
                                  );
                                },
                              )}
                            </View>
                          );
                        })}
                    </View>
                  )}
                  {openFacet &&
                    !detail &&
                    (page === "album" || page === "track") && (
                      <View
                        style={[
                          styles.facetPanel,
                          { borderColor: colors.border },
                        ]}
                      >
                        <TextInput
                          accessibilityLabel={`Filter ${openFacet} options`}
                          value={facetQuery}
                          onChangeText={setFacetQuery}
                          placeholder={`Find ${openFacet}`}
                          placeholderTextColor={colors.muted}
                          style={[
                            styles.input,
                            { color: colors.text, borderColor: colors.border },
                          ]}
                        />
                        <FlatList
                          data={[
                            { id: "", title: `All ${openFacet}s` },
                            ...(openFacet === "artist"
                              ? facets.artists
                              : openFacet === "album"
                                ? facets.albums
                                : facets.years.map((year) => ({
                                    id: String(year),
                                    title: String(year),
                                  }))
                            ).filter((option) =>
                              option.title
                                .toLocaleLowerCase()
                                .includes(
                                  facetQuery.trim().toLocaleLowerCase(),
                                ),
                            ),
                          ]}
                          keyExtractor={(option) => option.id}
                          renderItem={({ item: option }) => (
                            <Pressable
                              accessibilityRole="button"
                              style={styles.facetOption}
                              onPress={() => {
                                setFilters((previous) => ({
                                  ...previous,
                                  [openFacet]: option.id
                                    ? openFacet === "year"
                                      ? Number(option.id)
                                      : option.id
                                    : undefined,
                                }));
                                setOpenFacet(null);
                              }}
                            >
                              <Text style={{ color: colors.text }}>
                                {option.title}
                              </Text>
                            </Pressable>
                          )}
                        />
                      </View>
                    )}
                  <FlatList
                    key={showLibraryGrid ? `grid-${gridColumns}` : "list"}
                    ListHeaderComponent={detail?.kind === "artist" ? <>{detailHeader}{filterInput}</> : null}
                    data={visibleItems}
                    numColumns={showLibraryGrid ? gridColumns : 1}
                    ListEmptyComponent={detailLoading || (page === "search" && !detail && searchLoading) ? <ActivityIndicator /> : page === "search" && !detail ? <Text style={{ color: colors.muted, paddingVertical: 20 }}>{searchError || (query.trim() ? `No results for “${query.trim()}”` : "Enter a search to find music.")}</Text> : null}
                    keyExtractor={(item, index) => `${item.kind}-${item.ratingKey}-${index}`}
                    renderItem={({ item, index }) => showLibraryGrid ? (
                      <View style={[styles.libraryCard, { width: gridItemWidth }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={[item.title, item.subtitle].filter(Boolean).join(", ")}
                          onPress={() => openItem(item)}
                        >
                          <CachedArtwork
                            cache={runtime.artwork}
                            uri={item.thumb}
                            offline={offline}
                            label={item.title}
                            style={{ width: gridItemWidth - 16, height: gridItemWidth - 16, borderRadius: 8 }}
                            background={colors.button}
                            color={colors.muted}
                          />
                          <Text numberOfLines={1} style={[styles.libraryCardTitle, { color: colors.text }]}>{item.title}</Text>
                          {!!item.subtitle && <Text numberOfLines={1} style={{ color: colors.muted }}>{item.subtitle}</Text>}
                        </Pressable>
                        <View style={styles.libraryCardActions}>
                          {[
                            { label: "Play", icon: "▶", action: () => playItem(item, false) },
                            { label: "Add to queue", icon: "+", action: () => playItem(item, true) },
                            ...(item.kind === "artist" ? [] : [{ label: "Download", icon: "↓", action: () => downloadItem(item) }]),
                          ].map(({ label, icon, action }) => (
                            <Pressable
                              key={label}
                              accessibilityRole="button"
                              accessibilityLabel={`${label} ${item.title}`}
                              disabled={busy}
                              onPress={action}
                              style={styles.libraryCardAction}
                            >
                              <Text style={{ color: colors.muted, fontSize: 17 }}>{icon}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <>
                      {page === "search" && !detail && (index === 0 || visibleItems[index - 1]?.kind !== item.kind) && (
                        <Text style={[styles.section, { color: colors.text }]}>{searchKindLabels[item.kind]}</Text>
                      )}
                      <View style={[styles.item, { borderColor: colors.border }]}>
                        <CachedArtwork
                          cache={runtime.artwork}
                          uri={item.thumb}
                          offline={offline}
                          label={item.title}
                          style={styles.artwork}
                          background={colors.button}
                          color={colors.muted}
                        />
                        <Pressable accessibilityRole="button" onPress={() => openItem(item)} style={styles.itemText}>
                          <Text style={{ color: colors.text }}>{item.title}</Text>
                          {!!item.subtitle && <Text style={{ color: colors.muted }}>{item.subtitle}</Text>}
                        </Pressable>
                        {button("Play", () => playItem(item, false), busy)}
                        {button("Queue", () => playItem(item, true), busy)}
                        {page !== "downloads" && item.kind !== "artist" && button("Download", () => downloadItem(item), busy)}
                      </View>
                      </>
                    )}
                  />
                </>
              )}
            </View>
            {showQueue && (
              <View style={[styles.queue, { borderColor: colors.border }]}>
                <View style={styles.queueHeader}>
                  <View>
                    <Text style={[styles.section, { color: colors.text }]}>Queue</Text>
                    <Text style={{ color: colors.muted }}>{playback?.queue.length || 0} up next</Text>
                  </View>
                  {button("Clear", () => void run(() => runtime.player.clearQueue()), !playback?.queue.length)}
                </View>
                <FlatList
                  data={playback?.queue || []}
                  keyExtractor={(track, index) => `${track.ratingKey}-${index}`}
                  ListHeaderComponent={
                    <>
                      {!!playback?.previousTrack && (
                        <View>
                          <Text style={[styles.queueHeading, { color: colors.muted }]}>Previous</Text>
                          {queueTrack(playback.previousTrack)}
                        </View>
                      )}
                      {!!playback?.currentTrack && (
                        <View>
                          <Text style={[styles.queueHeading, { color: colors.muted }]}>Now playing</Text>
                          {queueTrack(playback.currentTrack, true)}
                        </View>
                      )}
                      <Text style={[styles.queueHeading, { color: colors.muted }]}>Up next</Text>
                    </>
                  }
                  ListEmptyComponent={<Text style={{ color: colors.muted }}>No tracks queued</Text>}
                  renderItem={({ item }) => queueTrack(item)}
                />
              </View>
            )}
            {showLyrics && (
              <View style={[styles.queue, { borderColor: colors.border }]}>
                <Text style={[styles.section, { color: colors.text }]}>
                  Lyrics
                </Text>
                {lyricsError ? (
                  <Text style={{ color: colors.muted }}>{lyricsError}</Text>
                ) : !lyrics ? (
                  <ActivityIndicator />
                ) : (
                  <ScrollView>
                    {lyrics.lines.map((line, index) => {
                      const position = (playback?.position || 0) * 1000;
                      const next = lyrics.lines
                        .slice(index + 1)
                        .find((candidate) => candidate.startTimeMs !== null);
                      const activeLine =
                        line.startTimeMs !== null &&
                        position >= line.startTimeMs &&
                        (!next || position < (next.startTimeMs || 0));
                      return (
                        <Text
                          key={`${line.startTimeMs}-${index}`}
                          style={{
                            color: activeLine ? colors.accent : colors.text,
                            paddingVertical: 5,
                          }}
                        >
                          {line.text}
                        </Text>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}
          </View>
          <View style={[styles.footer, { borderColor: colors.border }]}>
            {!!playback?.currentTrack && (
              <CachedArtwork
                cache={runtime.artwork}
                uri={playback.currentTrack.thumb ?? null}
                offline={offline}
                label={playback.currentTrack.album}
                style={styles.artwork}
                background={colors.button}
                color={colors.muted}
              />
            )}
            <View style={styles.nowPlaying}>
              {playback?.currentTrack?.albumRatingKey ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Open album ${playback.currentTrack.album}`} onPress={() => openRelated("album", playback.currentTrack!.albumRatingKey, playback.currentTrack!.album)}>
                  <Text style={{ color: colors.text }} numberOfLines={1}>{playback.currentTrack.title}</Text>
                </Pressable>
              ) : <Text style={{ color: colors.text }} numberOfLines={1}>{playback?.currentTrack?.title || "Nothing playing"}</Text>}
              {!!playback?.currentTrack && (
                <View style={styles.nowPlayingDetails}>
                  {playback.currentTrack.artistRatingKey ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Open artist ${playback.currentTrack.artist}`} onPress={() => openRelated("artist", playback.currentTrack!.artistRatingKey, playback.currentTrack!.artist)} style={{ flexShrink: 1 }}>
                      <Text style={{ color: colors.muted }} numberOfLines={1}>{playback.currentTrack.artist}</Text>
                    </Pressable>
                  ) : <Text style={{ color: colors.muted }} numberOfLines={1}>{playback.currentTrack.artist}</Text>}
                  {!!playback.currentTrack.album && <Text style={{ color: colors.muted, flexShrink: 1 }} numberOfLines={1}> · {playback.currentTrack.album}</Text>}
                </View>
              )}
            </View>
            {!!playback?.connectionError && (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.error }}
                numberOfLines={2}
              >
                {playback.connectionError}
              </Text>
            )}
            {NativePlayerControls ? (
              <NativePlayerControls
                style={styles.nativePlayerControls}
                dark={dark}
                playing={playback?.playing ?? false}
                hasTrack={!!playback?.currentTrack}
                position={playback?.position ?? 0}
                duration={playback?.duration ?? 0}
                volume={playback?.volume ?? 1}
                onCommand={({ nativeEvent: { action, value } }) => {
                  switch (action) {
                    case "previous": void run(() => runtime.player.previous()); break;
                    case "toggle": void run(() => playback?.playing ? runtime.player.pause() : runtime.player.resume()); break;
                    case "next": void run(() => runtime.player.next()); break;
                    case "seek": void run(() => runtime.player.seek(value)); break;
                    case "volume": void run(() => runtime.player.setVolume(value)); break;
                    case "mute": void run(() => runtime.player.setMuted(playback?.volume !== 0)); break;
                    case "lyrics": setShowLyrics((shown) => !shown); break;
                    case "queue": setShowQueue((shown) => !shown); break;
                  }
                }}
              />
            ) : (
              <>
            {button(
              "Previous",
              () => void run(() => runtime.player.previous()),
              busy,
            )}
            {button(
              playback?.playing ? "Pause" : "Play",
              () =>
                void run(() =>
                  playback?.playing
                    ? runtime.player.pause()
                    : runtime.player.resume(),
                ),
              busy,
            )}
            {button("Next", () => void run(() => runtime.player.next()), busy)}
            <Text style={{ color: colors.muted }}>
              {formatTime(playback?.position || 0)} /{" "}
              {formatTime(playback?.duration || 0)}
            </Text>
            <TextInput
              accessibilityLabel="Seek to seconds"
              value={seekText}
              onChangeText={setSeekText}
              keyboardType="numeric"
              placeholder="Seconds"
              placeholderTextColor={colors.muted}
              style={[
                styles.seek,
                { borderColor: colors.border, color: colors.text },
              ]}
              onSubmitEditing={() =>
                void run(async () => {
                  const position = Number(seekText);
                  if (!Number.isFinite(position))
                    throw new Error("Enter a valid position");
                  await runtime.player.seek(position);
                  setSeekText("");
                })
              }
            />
            {button(
              "−",
              () =>
                void run(() =>
                  runtime.player.setVolume((playback?.volume ?? 1) - 0.1),
                ),
            )}
            {button(
              playback?.volume === 0 ? "Unmute" : "Mute",
              () =>
                void run(() => runtime.player.setMuted(playback?.volume !== 0)),
            )}
            {button(
              "+",
              () =>
                void run(() =>
                  runtime.player.setVolume((playback?.volume ?? 1) + 0.1),
                ),
            )}
            {button("Lyrics", () => setShowLyrics(!showLyrics))}
            {button("Queue", () => setShowQueue(!showQueue))}
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function CachedArtwork({
  cache,
  uri,
  offline,
  label,
  style,
  background,
  color,
}: {
  cache: ArtworkCache;
  uri: string | null;
  offline: boolean;
  label: string;
  style: StyleProp<ImageStyle>;
  background: string;
  color: string;
}) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setImageUri(uri && (!offline || uri.startsWith("file://")) ? uri : null);
    if (uri)
      void cache.resolve(uri).then((value) => {
        if (!cancelled && value) setImageUri(value);
      });
    return () => {
      cancelled = true;
    };
  }, [cache, uri, offline]);
  return imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={style}
      onError={() => setImageUri(null)}
    />
  ) : (
    <View style={[style, styles.placeholder, { backgroundColor: background }]}>
      <Text style={{ color }}>{label.slice(0, 1)}</Text>
    </View>
  );
}
function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
function pageTitle(page: Page): string {
  return {
    home: "Home",
    artist: "Artists",
    album: "Albums",
    track: "Tracks",
    playlist: "Playlists",
    downloads: "Downloads",
    search: "Search",
    settings: "Settings",
  }[page];
}
const palette = {
  dark: {
    background: "#111315",
    text: "#f4f4f5",
    muted: "#a1a1aa",
    border: "#303036",
    button: "#303036",
    accent: "#f5bd4e",
    error: "#ff8b82",
  },
  light: {
    background: "#fafafa",
    text: "#18181b",
    muted: "#71717a",
    border: "#dddddf",
    button: "#e8e8eb",
    accent: "#946100",
    error: "#a92323",
  },
};
const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  header: {
    height: 58,
    borderBottomWidth: 1,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  macHeader: { height: 86, paddingTop: 28 },
  brand: { fontSize: 22, fontWeight: "700" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  section: { fontSize: 18, fontWeight: "600", marginVertical: 12 },
  body: { flex: 1, flexDirection: "row" },
  sidebar: { width: 170, borderRightWidth: 1, padding: 12 },
  nativeSidebar: { width: 200 },
  navItem: { paddingVertical: 12, paddingHorizontal: 10 },
  content: { flex: 1, padding: 20, gap: 10 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { flex: 1 },
  libraryCard: { paddingRight: 16, paddingBottom: 20 },
  libraryCardTitle: { fontSize: 14, fontWeight: "600", marginTop: 7 },
  libraryCardActions: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  libraryCardAction: { width: 34, height: 30, alignItems: "center", justifyContent: "center" },
  artwork: { width: 44, height: 44, borderRadius: 4 },
  button: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
    marginVertical: 3,
  },
  input: { borderWidth: 1, borderRadius: 6, padding: 9, marginVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  facetPanel: {
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
  },
  facetOption: { paddingVertical: 7 },
  downloadActivity: { maxHeight: 190 },
  quickAccess: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  quickAccessItem: { width: "49%", flexDirection: "row", alignItems: "center", borderRadius: 8, overflow: "hidden" },
  quickAccessArtwork: { width: 48, height: 48 },
  quickAccessTitle: { flex: 1, paddingHorizontal: 12, fontWeight: "600" },
  homeSection: { marginBottom: 14 },
  homeSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  carouselArrow: { paddingHorizontal: 10, paddingVertical: 2 },
  homeCard: { width: 150, marginRight: 14, gap: 5 },
  homeArtwork: { width: 150, height: 150, borderRadius: 6 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailArtwork: { width: 96, height: 96, borderRadius: 6 },
  queue: { width: 260, borderLeftWidth: 1, padding: 16 },
  queueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  queueHeading: { fontSize: 12, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  queueTrack: { flexDirection: "row", alignItems: "center", gap: 8, padding: 6, borderRadius: 6 },
  footer: {
    borderTopWidth: 1,
    minHeight: 68,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nowPlaying: { minWidth: 100, maxWidth: 220, flex: 1 },
  nowPlayingDetails: { flexDirection: "row", alignItems: "center" },
  nativePlayerControls: { flex: 3, height: 68 },
  seek: { width: 75, borderWidth: 1, borderRadius: 5, padding: 6 },
  error: { paddingHorizontal: 20, paddingVertical: 8 },
  busy: { position: "absolute", right: 18, top: 18 },
});
