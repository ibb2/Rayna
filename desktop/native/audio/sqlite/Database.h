#pragma once

#include <filesystem>
#include <memory>
#include <string>

namespace rayna {
// Uses a private database and snapshots a legacy WAL database on first open.
class Database final {
 public:
  explicit Database(std::filesystem::path directory);
  ~Database();
  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;

  bool open();
  std::string execute(const std::string& sql, const std::string& argumentsJson);
  void transaction(const std::string& statementsJson);
  void close();

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}  // namespace rayna
