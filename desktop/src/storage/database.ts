export type SqlValue = string | number | boolean | null;
export type QueryResult<T> = { rows: T[]; changes: number };
export interface NativeDatabaseModule {
  open(): Promise<{ migrated: boolean }>;
  execute(sql: string, argumentsJson: string): Promise<string>;
  transaction?(statementsJson: string): Promise<void>;
  close(): Promise<void>;
}

export class DesktopDatabase {
  constructor(private readonly native: NativeDatabaseModule) {}
  open(): Promise<{ migrated: boolean }> {
    return this.native.open();
  }
  close(): Promise<void> {
    return this.native.close();
  }
  transaction(
    statements: Array<{ sql: string; parameters: SqlValue[] }>,
  ): Promise<void> {
    if (!this.native.transaction)
      throw new Error("The desktop database transaction module is unavailable");
    return this.native.transaction(JSON.stringify(statements));
  }
  async execute<T>(
    sql: string,
    parameters: SqlValue[] = [],
  ): Promise<QueryResult<T>> {
    const result: unknown = JSON.parse(
      await this.native.execute(sql, JSON.stringify(parameters)),
    );
    if (
      !result ||
      typeof result !== "object" ||
      !("rows" in result) ||
      !Array.isArray(result.rows) ||
      !("changes" in result) ||
      typeof result.changes !== "number"
    ) {
      throw new Error("The desktop database returned an invalid result");
    }
    return result as QueryResult<T>;
  }
}
