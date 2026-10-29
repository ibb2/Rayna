#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX
#endif
#include "Database.h"
#include "vendor/sqlite3.h"

#include <atomic>
#include <cerrno>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <mutex>
#include <stdexcept>
#include <system_error>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace rayna {
namespace {
std::atomic<unsigned long> migrationCounter{0};

std::string message(sqlite3* db, const char* action) {
  return std::string(action) + ": " + (db ? sqlite3_errmsg(db) : "SQLite error");
}

void runSql(sqlite3* db, const char* sql) {
  char* detail = nullptr;
  const auto result = sqlite3_exec(db, sql, nullptr, nullptr, &detail);
  if (result != SQLITE_OK) {
    std::string error = detail ? detail : sqlite3_errmsg(db);
    sqlite3_free(detail);
    throw std::runtime_error("SQLite: " + error);
  }
}

std::string jsonString(const unsigned char* data, int length) {
  static constexpr char hex[] = "0123456789abcdef";
  std::string result = "\"";
  for (int i = 0; i < length; ++i) {
    const auto value = data[i];
    switch (value) {
      case '"': result += "\\\""; break;
      case '\\': result += "\\\\"; break;
      case '\b': result += "\\b"; break;
      case '\f': result += "\\f"; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (value < 0x20) { result += "\\u00"; result += hex[value >> 4]; result += hex[value & 15]; }
        else result += static_cast<char>(value);
    }
  }
  return result + "\"";
}

std::string columnJson(sqlite3_stmt* statement, int index) {
  switch (sqlite3_column_type(statement, index)) {
    case SQLITE_NULL: return "null";
    case SQLITE_INTEGER: {
      const auto value = sqlite3_column_int64(statement, index);
      if (value > 9007199254740991LL || value < -9007199254740991LL) throw std::runtime_error("SQLite integer is outside JavaScript's safe range");
      return std::to_string(value);
    }
    case SQLITE_FLOAT: {
      const auto value = sqlite3_column_double(statement, index);
      if (!std::isfinite(value)) throw std::runtime_error("SQLite returned a non-finite number");
      char buffer[64]; std::snprintf(buffer, sizeof(buffer), "%.17g", value); return buffer;
    }
    case SQLITE_TEXT: return jsonString(sqlite3_column_text(statement, index), sqlite3_column_bytes(statement, index));
    default: throw std::runtime_error("SQLite BLOB values are not supported by this adapter");
  }
}

struct Statement {
  sqlite3_stmt* value = nullptr;
  ~Statement() { if (value) sqlite3_finalize(value); }
};

// Create the final file without replacing another process's completed import.
void publishSnapshot(const std::filesystem::path& temporary, const std::filesystem::path& destination) {
#ifdef _WIN32
  if (!MoveFileExW(temporary.c_str(), destination.c_str(), MOVEFILE_WRITE_THROUGH)) {
    if (GetLastError() != ERROR_ALREADY_EXISTS && GetLastError() != ERROR_FILE_EXISTS) throw std::runtime_error("Cannot publish the SQLite snapshot");
  }
#else
  if (::link(temporary.c_str(), destination.c_str()) != 0 && errno != EEXIST) throw std::runtime_error("Cannot publish the SQLite snapshot");
#endif
  std::error_code ignored;
  std::filesystem::remove(temporary, ignored);
}

void snapshot(const std::filesystem::path& source, const std::filesystem::path& destination) {
  const auto processId =
#ifdef _WIN32
      GetCurrentProcessId();
#else
      getpid();
#endif
  auto temporary = destination;
  temporary += ".migrating." + std::to_string(processId) + "." + std::to_string(migrationCounter.fetch_add(1));
  sqlite3* from = nullptr;
  sqlite3* to = nullptr;
  try {
    if (sqlite3_open_v2(source.u8string().c_str(), &from, SQLITE_OPEN_READONLY, nullptr) != SQLITE_OK) throw std::runtime_error(message(from, "Cannot open the legacy database"));
    sqlite3_busy_timeout(from, 5000);
    if (sqlite3_open_v2(temporary.u8string().c_str(), &to, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_EXCLUSIVE, nullptr) != SQLITE_OK) throw std::runtime_error(message(to, "Cannot create a database snapshot"));
    sqlite3_backup* backup = sqlite3_backup_init(to, "main", from, "main");
    if (!backup) throw std::runtime_error(message(to, "Cannot begin the database snapshot"));
    int result = SQLITE_OK;
    for (int attempt = 0; attempt < 100; ++attempt) {
      result = sqlite3_backup_step(backup, -1);
      if (result == SQLITE_DONE) break;
      if (result != SQLITE_BUSY && result != SQLITE_LOCKED) break;
      sqlite3_sleep(50);
    }
    const auto finish = sqlite3_backup_finish(backup);
    if (result != SQLITE_DONE || finish != SQLITE_OK) throw std::runtime_error(message(to, "Cannot complete the database snapshot"));
    if (sqlite3_close(to) != SQLITE_OK) throw std::runtime_error("Cannot close the database snapshot");
    to = nullptr;
    sqlite3_close(from); from = nullptr;
    publishSnapshot(temporary, destination);
  } catch (...) {
    if (to) sqlite3_close_v2(to);
    if (from) sqlite3_close_v2(from);
    std::error_code ignored;
    std::filesystem::remove(temporary, ignored);
    throw;
  }
}

constexpr const char* kSchema = R"SQL(
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS playback_history (id INTEGER PRIMARY KEY AUTOINCREMENT, track_id TEXT, played_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS media_cache (server_id TEXT NOT NULL, cache_key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (server_id, cache_key));
CREATE INDEX IF NOT EXISTS media_cache_expiry_idx ON media_cache(expires_at);
CREATE TABLE IF NOT EXISTS downloads (id TEXT PRIMARY KEY, server_id TEXT NOT NULL, rating_key TEXT NOT NULL, media_type TEXT NOT NULL, title TEXT NOT NULL, file_path TEXT, partial_path TEXT, status TEXT NOT NULL, bytes_downloaded INTEGER NOT NULL DEFAULT 0, total_bytes INTEGER, error TEXT, metadata TEXT NOT NULL DEFAULT 'null', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS downloads_server_status_idx ON downloads(server_id, status);
CREATE INDEX IF NOT EXISTS downloads_server_rating_idx ON downloads(server_id, rating_key);
CREATE TABLE IF NOT EXISTS sync_status (server_id TEXT NOT NULL, library_key TEXT NOT NULL, status TEXT NOT NULL, cursor TEXT, last_started_at INTEGER, last_completed_at INTEGER, error TEXT, details TEXT NOT NULL DEFAULT 'null', PRIMARY KEY (server_id, library_key));
CREATE INDEX IF NOT EXISTS sync_status_server_idx ON sync_status(server_id);
PRAGMA user_version = 1;
)SQL";
}  // namespace

struct Database::Impl {
  explicit Impl(std::filesystem::path value) : directory(std::move(value)) {}
  std::filesystem::path directory;
  sqlite3* db = nullptr;
  std::mutex mutex;
};

Database::Database(std::filesystem::path directory) : impl_(std::make_unique<Impl>(std::move(directory))) {}
Database::~Database() { close(); }

bool Database::open() {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  if (impl_->db) return false;
  std::filesystem::create_directories(impl_->directory);
  const auto source = impl_->directory / "rayna.db";
  const auto destination = impl_->directory / "rayna.desktop.db";
  bool imported = false;
  if (!std::filesystem::exists(destination) && std::filesystem::exists(source)) {
    snapshot(source, destination);
    imported = true;
  }
  if (sqlite3_open_v2(destination.u8string().c_str(), &impl_->db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nullptr) != SQLITE_OK) {
    const auto error = message(impl_->db, "Cannot open the desktop database");
    sqlite3_close_v2(impl_->db); impl_->db = nullptr;
    throw std::runtime_error(error);
  }
  try {
    sqlite3_busy_timeout(impl_->db, 5000);
    int value = 0;
    {
      Statement version;
      if (sqlite3_prepare_v2(impl_->db, "PRAGMA user_version", -1, &version.value, nullptr) != SQLITE_OK || sqlite3_step(version.value) != SQLITE_ROW) throw std::runtime_error(message(impl_->db, "Cannot read the database version"));
      value = sqlite3_column_int(version.value, 0);
    }
    if (value != 0 && value != 1) throw std::runtime_error("Unsupported legacy database version; the original data was not changed");
    if (value == 0) {
      {
        Statement tables;
        if (sqlite3_prepare_v2(impl_->db, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", -1, &tables.value, nullptr) != SQLITE_OK || sqlite3_step(tables.value) != SQLITE_ROW) throw std::runtime_error(message(impl_->db, "Cannot inspect the database"));
        if (sqlite3_column_int(tables.value, 0) != 0) throw std::runtime_error("Unsupported unversioned database; the original data was not changed");
      }
      runSql(impl_->db, "BEGIN IMMEDIATE");
      try { runSql(impl_->db, kSchema); runSql(impl_->db, "COMMIT"); }
      catch (...) { sqlite3_exec(impl_->db, "ROLLBACK", nullptr, nullptr, nullptr); throw; }
    }
    runSql(impl_->db, "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  } catch (...) {
    sqlite3_close_v2(impl_->db); impl_->db = nullptr;
    throw;
  }
  return imported;
}

namespace {
std::string executeQuery(sqlite3* db, const std::string& sql, const std::string& argumentsJson) {
  Statement query;
  const char* tail = nullptr;
  if (sqlite3_prepare_v2(db, sql.c_str(), -1, &query.value, &tail) != SQLITE_OK || !query.value) throw std::runtime_error(message(db, "Cannot prepare SQL"));
  while (*tail && (std::isspace(static_cast<unsigned char>(*tail)) || *tail == ';')) ++tail;
  if (*tail) throw std::runtime_error("Only one SQL statement is permitted");
  Statement arguments;
  if (sqlite3_prepare_v2(db, "SELECT value, type FROM json_each(?1)", -1, &arguments.value, nullptr) != SQLITE_OK) throw std::runtime_error(message(db, "Cannot parse SQL parameters"));
  sqlite3_bind_text(arguments.value, 1, argumentsJson.c_str(), static_cast<int>(argumentsJson.size()), SQLITE_TRANSIENT);
  int index = 0;
  int step = SQLITE_OK;
  while ((step = sqlite3_step(arguments.value)) == SQLITE_ROW) {
    ++index;
    const auto* type = reinterpret_cast<const char*>(sqlite3_column_text(arguments.value, 1));
    if (!type || std::string(type) == "array" || std::string(type) == "object") throw std::runtime_error("SQL parameters must be scalar values");
    const int result = sqlite3_bind_value(query.value, index, sqlite3_column_value(arguments.value, 0));
    if (result != SQLITE_OK) throw std::runtime_error(message(db, "Cannot bind SQL parameter"));
  }
  if (step != SQLITE_DONE || index != sqlite3_bind_parameter_count(query.value)) throw std::runtime_error("Invalid SQL parameter list");
  std::string rows = "[";
  bool firstRow = true;
  while ((step = sqlite3_step(query.value)) == SQLITE_ROW) {
    if (!firstRow) rows += ',';
    firstRow = false;
    rows += '{';
    const int count = sqlite3_column_count(query.value);
    for (int column = 0; column < count; ++column) {
      if (column) rows += ',';
      const auto* name = reinterpret_cast<const unsigned char*>(sqlite3_column_name(query.value, column));
      rows += jsonString(name, static_cast<int>(std::char_traits<char>::length(reinterpret_cast<const char*>(name))));
      rows += ':';
      rows += columnJson(query.value, column);
    }
    rows += '}';
  }
  if (step != SQLITE_DONE) throw std::runtime_error(message(db, "Cannot execute SQL"));
  const int changes = sqlite3_stmt_readonly(query.value) ? 0 : sqlite3_changes(db);
  return "{\"rows\":" + rows + "],\"changes\":" + std::to_string(changes) + "}";
}
}  // namespace

std::string Database::execute(const std::string& sql, const std::string& argumentsJson) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  if (!impl_->db) throw std::runtime_error("Database is not open");
  return executeQuery(impl_->db, sql, argumentsJson);
}

void Database::transaction(const std::string& statementsJson) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  if (!impl_->db) throw std::runtime_error("Database is not open");
  Statement statements;
  const char* select = "SELECT json_extract(value,'$.sql'), json_extract(value,'$.parameters'), json_type(value,'$.sql'), json_type(value,'$.parameters') FROM json_each(?1)";
  if (sqlite3_prepare_v2(impl_->db, select, -1, &statements.value, nullptr) != SQLITE_OK) throw std::runtime_error(message(impl_->db, "Cannot prepare transaction"));
  sqlite3_bind_text(statements.value, 1, statementsJson.c_str(), static_cast<int>(statementsJson.size()), SQLITE_TRANSIENT);
  runSql(impl_->db, "BEGIN IMMEDIATE");
  try {
    int step;
    while ((step = sqlite3_step(statements.value)) == SQLITE_ROW) {
      const auto* sql = reinterpret_cast<const char*>(sqlite3_column_text(statements.value, 0));
      const auto* parameters = reinterpret_cast<const char*>(sqlite3_column_text(statements.value, 1));
      const auto* sqlType = reinterpret_cast<const char*>(sqlite3_column_text(statements.value, 2));
      const auto* parameterType = reinterpret_cast<const char*>(sqlite3_column_text(statements.value, 3));
      if (!sql || !parameters || !sqlType || std::string(sqlType) != "text" || !parameterType || std::string(parameterType) != "array") throw std::runtime_error("Invalid transaction statement");
      const std::string command(sql);
      if (command.rfind("UPDATE ", 0) != 0 && command.rfind("INSERT ", 0) != 0 && command.rfind("DELETE ", 0) != 0) throw std::runtime_error("Only data changes are permitted in a transaction");
      executeQuery(impl_->db, command, parameters);
    }
    if (step != SQLITE_DONE) throw std::runtime_error(message(impl_->db, "Cannot read transaction statements"));
    runSql(impl_->db, "COMMIT");
  } catch (...) { sqlite3_exec(impl_->db, "ROLLBACK", nullptr, nullptr, nullptr); throw; }
}

void Database::close() {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  if (impl_->db) sqlite3_close_v2(impl_->db);
  impl_->db = nullptr;
}
}  // namespace rayna
