import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

export class DatabaseManager {
  private db: Database.Database

  constructor() {
    const dbPath = join(app.getPath('userData'), 'rayna.db')
    this.db = new Database(dbPath)
    this.init()
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS playback_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
  }

  public get(key: string) {
    const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?')
    const row = stmt.get(key) as { value: string } | undefined
    return row ? JSON.parse(row.value) : null
  }

  public set(key: string, value: any) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    stmt.run(key, JSON.stringify(value))
  }
}
