"""Exercise migration while the original database has uncheckpointed WAL data."""
import os
import sqlite3
import subprocess
import sys
import tempfile

if len(sys.argv) != 2:
    raise SystemExit("Usage: test_migration.py <sqlite-smoke-executable>")

with tempfile.TemporaryDirectory(prefix="rayna-migration-") as directory:
    original = sqlite3.connect(os.path.join(directory, "rayna.db"))
    original.execute("PRAGMA journal_mode=WAL")
    original.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    original.execute("PRAGMA user_version=1")
    original.commit()
    original.execute("INSERT INTO settings VALUES ('example', 'from-wal')")
    original.commit()
    if not os.path.exists(os.path.join(directory, "rayna.db-wal")):
        raise RuntimeError("Test did not create a WAL file")
    subprocess.run([sys.argv[1], directory], check=True)
    if original.execute("SELECT value FROM settings WHERE key='example'").fetchone()[0] != "from-wal":
        raise RuntimeError("Migration changed the legacy database")
    original.close()

with tempfile.TemporaryDirectory(prefix="rayna-new-database-") as directory:
    subprocess.run([sys.argv[1], directory, "fresh"], check=True)

with tempfile.TemporaryDirectory(prefix="rayna-unsupported-") as directory:
    original = sqlite3.connect(os.path.join(directory, "rayna.db"))
    original.execute("PRAGMA user_version=42")
    original.execute("CREATE TABLE important (value TEXT)")
    original.execute("INSERT INTO important VALUES ('preserve')")
    original.commit()
    original.close()
    result = subprocess.run([sys.argv[1], directory], capture_output=True, text=True)
    if result.returncode == 0 or "Unsupported" not in result.stderr:
        raise RuntimeError("Unsupported database version was not rejected")
    original = sqlite3.connect(os.path.join(directory, "rayna.db"))
    if original.execute("SELECT value FROM important").fetchone()[0] != "preserve":
        raise RuntimeError("Unsupported legacy data was changed")
    original.close()
