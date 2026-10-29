import type { SyncStatus, SyncTrigger } from "../../../src/shared/types";
import type { DesktopDatabase } from "../storage/database";

export interface SyncResolver {
  selectedLibraries(serverId: string): Promise<string[]>;
  refreshLibrary(serverId: string, libraryKey: string): Promise<number>;
  trackExists(serverId: string, ratingKey: string): Promise<boolean>;
}

type Details = {
  trigger: SyncTrigger;
  refreshedLibraries: number;
  failedLibraries: number;
  reconciledDownloads: number;
  errors: string[];
};
type RecordRow = {
  status: string;
  last_started_at: number | null;
  last_completed_at: number | null;
  error: string | null;
  details: string;
};

/** One job per server; failures never remove downloaded files or metadata. */
export class SyncService {
  private readonly active = new Map<string, Promise<SyncStatus>>();
  constructor(
    private readonly database: DesktopDatabase,
    private readonly resolver: SyncResolver,
    private readonly now: () => number = Date.now,
  ) {}

  run(serverId: string, trigger: SyncTrigger): Promise<SyncStatus> {
    const existing = this.active.get(serverId);
    if (existing) return existing;
    const operation = this.execute(serverId, trigger).finally(() => {
      if (this.active.get(serverId) === operation) this.active.delete(serverId);
    });
    this.active.set(serverId, operation);
    return operation;
  }

  async status(serverId: string): Promise<SyncStatus> {
    const result = await this.database.execute<RecordRow>(
      "SELECT status, last_started_at, last_completed_at, error, details FROM sync_status WHERE server_id=? AND library_key=?",
      [serverId, "__all__"],
    );
    const row = result.rows[0];
    if (!row)
      return {
        serverId,
        state: "idle",
        trigger: null,
        startedAt: null,
        completedAt: null,
        refreshedLibraries: 0,
        failedLibraries: 0,
        reconciledDownloads: 0,
        error: null,
      };
    let details: Partial<Details> = {};
    try {
      details = JSON.parse(row.details) || {};
    } catch {
      /* Preserve the record and display its basic status. */
    }
    return {
      serverId,
      state:
        row.status === "running"
          ? "running"
          : row.status === "failed"
            ? "failed"
            : details.errors?.length
              ? "partial"
              : "succeeded",
      trigger: details.trigger || null,
      startedAt:
        row.last_started_at === null
          ? null
          : new Date(row.last_started_at).toISOString(),
      completedAt:
        row.last_completed_at === null
          ? null
          : new Date(row.last_completed_at).toISOString(),
      refreshedLibraries: details.refreshedLibraries || 0,
      failedLibraries: details.failedLibraries || 0,
      reconciledDownloads: details.reconciledDownloads || 0,
      error: row.error,
    };
  }

  private async execute(
    serverId: string,
    trigger: SyncTrigger,
  ): Promise<SyncStatus> {
    const started = this.now();
    const details: Details = {
      trigger,
      refreshedLibraries: 0,
      failedLibraries: 0,
      reconciledDownloads: 0,
      errors: [],
    };
    await this.writeStatus(
      serverId,
      "__all__",
      "running",
      started,
      null,
      null,
      details,
    );
    try {
      const libraries = [
        ...new Set(await this.resolver.selectedLibraries(serverId)),
      ];
      for (const library of libraries) {
        await this.writeStatus(
          serverId,
          library,
          "running",
          started,
          null,
          null,
          null,
        );
        try {
          const count = await this.resolver.refreshLibrary(serverId, library);
          await this.writeStatus(
            serverId,
            library,
            "completed",
            started,
            this.now(),
            null,
            { refreshedItems: count },
          );
          details.refreshedLibraries++;
        } catch (error) {
          const reason = errorMessage(error);
          await this.writeStatus(
            serverId,
            library,
            "failed",
            started,
            null,
            reason,
            null,
          );
          details.failedLibraries++;
          details.errors.push(`Library ${library}: ${reason}`);
        }
      }
      const downloads = await this.database.execute<{
        id: string;
        rating_key: string;
        metadata: string;
      }>("SELECT id, rating_key, metadata FROM downloads WHERE server_id=?", [
        serverId,
      ]);
      for (const download of downloads.rows) {
        try {
          const exists = await this.resolver.trackExists(
            serverId,
            download.rating_key,
          );
          const parsed = JSON.parse(download.metadata || "null");
          if (
            parsed !== null &&
            (typeof parsed !== "object" || Array.isArray(parsed))
          )
            throw new Error("Invalid download metadata");
          const metadata = parsed || {};
          const at = this.now();
          const patch = {
            orphaned: !exists,
            orphanedAt: exists ? null : metadata.orphanedAt || at,
            lastReconciledAt: at,
          };
          const updated = await this.database.execute(
            "UPDATE downloads SET metadata=json_patch(CASE WHEN json_type(metadata)='object' THEN metadata ELSE '{}' END, ?), updated_at=? WHERE id=? AND server_id=? AND CASE WHEN json_valid(metadata) THEN json_type(metadata) IN ('object', 'null') ELSE 0 END",
            [JSON.stringify(patch), at, download.id, serverId],
          );
          if (updated.changes) details.reconciledDownloads++;
        } catch (error) {
          details.errors.push(
            `Download ${download.rating_key}: ${errorMessage(error)}`,
          );
        }
      }
    } catch (error) {
      details.errors.push(errorMessage(error));
    }
    const workDone =
      details.refreshedLibraries > 0 || details.reconciledDownloads > 0;
    const state = details.errors.length && !workDone ? "failed" : "completed";
    await this.writeStatus(
      serverId,
      "__all__",
      state,
      started,
      this.now(),
      details.errors.length ? details.errors.join("; ") : null,
      details,
    );
    return this.status(serverId);
  }

  private async writeStatus(
    serverId: string,
    key: string,
    status: string,
    started: number,
    completed: number | null,
    error: string | null,
    details: unknown,
  ): Promise<void> {
    await this.database.execute(
      "INSERT INTO sync_status(server_id, library_key, status, cursor, last_started_at, last_completed_at, error, details) VALUES (?, ?, ?, NULL, ?, ?, ?, ?) ON CONFLICT(server_id, library_key) DO UPDATE SET status=excluded.status, last_started_at=excluded.last_started_at, last_completed_at=COALESCE(excluded.last_completed_at, sync_status.last_completed_at), error=excluded.error, details=excluded.details",
      [
        serverId,
        key,
        status,
        started,
        completed,
        error,
        JSON.stringify(details),
      ],
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
