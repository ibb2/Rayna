#pragma once

#include <memory>
#include <optional>
#include <string>

namespace rayna {

struct DownloadPaths {
  std::string file;
  std::string partial;
};

// Runs bounded transfers without passing Plex URLs or tokens on a command line.
// A partial file is never removed when an ordinary request fails or is stopped.
class Transfer final {
 public:
  Transfer();
  ~Transfer();
  Transfer(const Transfer&) = delete;
  Transfer& operator=(const Transfer&) = delete;

  static std::string defaultDirectory();
  static std::string legacyArtworkDirectory();
  static DownloadPaths paths(const std::string& directory, const std::string& server,
                             const std::string& id, const std::string& title,
                             const std::string& extension);
  static double size(const std::string& path);
  static void remove(const std::string& directory, const std::string& path);
  static std::string prepareDirectory(const std::string& directory);
  static std::optional<std::string> rebase(const std::string& oldDirectory, const std::string& newDirectory, const std::string& path);
  static bool copyForMove(const std::string& oldDirectory, const std::string& newDirectory, const std::string& source, const std::string& destination);
  static bool removeIfSame(const std::string& oldDirectory, const std::string& newDirectory, const std::string& source, const std::string& destination);
  double download(const std::string& id, const std::string& url, const std::string& directory,
                  const std::string& partial, const std::string& destination, double maximumBytes = 0);
  bool cancel(const std::string& id);

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace rayna
