#include "Database.h"
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
  if (argc != 2 && argc != 3) return 2;
  try {
    rayna::Database database(argv[1]);
    if (argc == 3 && std::string(argv[2]) == "fresh") {
      if (database.open()) throw std::runtime_error("A new database was reported as migrated");
      database.execute("INSERT INTO settings(key, value) VALUES (?, ?)", "[\"key\",\"hello \\\"world\\\"\"]");
      const auto result = database.execute("SELECT value FROM settings WHERE key=?", "[\"key\"]");
      if (result.find("hello \\\"world\\\"") == std::string::npos) throw std::runtime_error("SQLite text was not escaped correctly");
      if (result.find("\"changes\":0") == std::string::npos) throw std::runtime_error("Read query reported changed rows");
      try {
        database.transaction(R"JSON([{"sql":"INSERT INTO settings(key,value) VALUES(?,?)","parameters":["transaction","first"]},{"sql":"INSERT INTO settings(key,value) VALUES(?,?)","parameters":["transaction","duplicate"]}])JSON");
        throw std::runtime_error("Invalid transaction unexpectedly succeeded");
      } catch (const std::runtime_error& error) {
        if (std::string(error.what()) == "Invalid transaction unexpectedly succeeded") throw;
      }
      if (database.execute("SELECT value FROM settings WHERE key=?", "[\"transaction\"]").find("first") != std::string::npos) throw std::runtime_error("Failed transaction was not rolled back");
      database.transaction(R"JSON([{"sql":"INSERT INTO settings(key,value) VALUES(?,?)","parameters":["transaction","committed"]},{"sql":"UPDATE settings SET value=? WHERE key=?","parameters":["updated","key"]}])JSON");
      if (database.execute("SELECT value FROM settings WHERE key=?", "[\"transaction\"]").find("committed") == std::string::npos) throw std::runtime_error("Valid transaction was not committed");
      database.execute(R"SQL(INSERT INTO downloads(id,server_id,rating_key,media_type,title,status,metadata,created_at,updated_at) VALUES ('test','server','7','track','Song','completed','{"artist":"Artist"}',1,1))SQL", "[]");
      database.execute("UPDATE downloads SET metadata=json_set(metadata, '$.activityClearedAt', ?) WHERE id=?", "[100,\"test\"]");
      database.execute("UPDATE downloads SET metadata=json_patch(metadata, ?) WHERE id=?", R"JSON(["{\"orphaned\":true}","test"])JSON");
      const auto metadata = database.execute("SELECT metadata FROM downloads WHERE id=?", "[\"test\"]");
      if (metadata.find("Artist") == std::string::npos || metadata.find("activityClearedAt") == std::string::npos || metadata.find("orphaned") == std::string::npos) throw std::runtime_error("SQLite JSON metadata updates lost data");
      database.close();
      if (database.open()) throw std::runtime_error("Reopening reported a new migration");
      std::cout << "Fresh SQLite database smoke test passed\n";
      return 0;
    }
    if (!database.open()) throw std::runtime_error("Legacy database was not imported");
    const auto legacy = database.execute("SELECT value FROM settings WHERE key=?", "[\"example\"]");
    if (legacy.find("from-wal") == std::string::npos) throw std::runtime_error("WAL-backed row was not imported");
    database.execute("UPDATE settings SET value=? WHERE key=?", "[\"desktop-only\",\"example\"]");
    const auto updated = database.execute("SELECT value FROM settings WHERE key=?", "[\"example\"]");
    if (updated.find("desktop-only") == std::string::npos) throw std::runtime_error("Desktop database was not updated");
    database.close();
    std::cout << "WAL-aware SQLite migration smoke test passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
