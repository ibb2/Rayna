#pragma once

#include <filesystem>
#include <optional>
#include <string>

namespace rayna {
class SessionFile final {
 public:
  explicit SessionFile(std::filesystem::path directory);
  static std::filesystem::path legacyDirectory();
  // The original auth.json is read only until a desktop-specific copy exists.
  std::optional<std::string> read() const;
  void write(const std::string& json) const;

 private:
  std::filesystem::path directory_;
};
}  // namespace rayna
