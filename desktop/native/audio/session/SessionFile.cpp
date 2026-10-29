#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX
#endif
#include "SessionFile.h"

#include <algorithm>
#include <atomic>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <system_error>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

namespace rayna {
namespace {
std::atomic<unsigned long> tempCounter{0};

std::optional<std::string> readFile(const std::filesystem::path& path) {
  std::error_code error;
  if (!std::filesystem::exists(path, error)) {
    if (error) throw std::system_error(error, "Cannot check session file");
    return std::nullopt;
  }
  std::ifstream input(path, std::ios::binary);
  if (!input) throw std::runtime_error("Cannot read session file");
  std::string contents((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  if (input.bad()) throw std::runtime_error("Cannot read session file");
  return contents;
}
}  // namespace

SessionFile::SessionFile(std::filesystem::path directory) : directory_(std::move(directory)) {}

std::filesystem::path SessionFile::legacyDirectory() {
#ifdef _WIN32
  if (const auto* local = _wgetenv(L"LOCALAPPDATA")) return std::filesystem::path(local) / L"com.ib.rayna";
  if (const auto* user = _wgetenv(L"USERPROFILE")) return std::filesystem::path(user) / L"AppData" / L"Local" / L"com.ib.rayna";
#else
  if (const auto* home = std::getenv("HOME")) {
#ifdef __APPLE__
    return std::filesystem::path(home) / "Library" / "Application Support" / "com.ib.rayna";
#else
    return std::filesystem::path(home) / ".local" / "share" / "com.ib.rayna";
#endif
  }
#endif
  throw std::runtime_error("Cannot determine the Rayna user data directory");
}

std::optional<std::string> SessionFile::read() const {
  if (auto current = readFile(directory_ / "auth.desktop.json")) return current;
  return readFile(directory_ / "auth.json");
}

void SessionFile::write(const std::string& json) const {
  std::filesystem::create_directories(directory_);
  const auto destination = directory_ / "auth.desktop.json";
  const auto processId =
#ifdef _WIN32
      GetCurrentProcessId();
#else
      getpid();
#endif
  const auto temporary = directory_ / ("auth.desktop.tmp." + std::to_string(processId) + "." + std::to_string(tempCounter.fetch_add(1)));
#ifdef _WIN32
  HANDLE file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("Cannot create temporary session file");
  bool ok = true;
  size_t offset = 0;
  while (offset < json.size()) {
    DWORD written = 0;
    const DWORD chunk = static_cast<DWORD>(std::min<size_t>(json.size() - offset, 1 << 20));
    if (!WriteFile(file, json.data() + offset, chunk, &written, nullptr) || !written) { ok = false; break; }
    offset += written;
  }
  if (ok) ok = FlushFileBuffers(file) != 0;
  CloseHandle(file);
  if (ok) ok = MoveFileExW(temporary.c_str(), destination.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
#else
  const int file = ::open(temporary.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (file < 0) throw std::runtime_error("Cannot create temporary session file");
  bool ok = true;
  size_t offset = 0;
  while (offset < json.size()) {
    const auto written = ::write(file, json.data() + offset, json.size() - offset);
    if (written <= 0) { ok = false; break; }
    offset += static_cast<size_t>(written);
  }
  if (ok) ok = ::fsync(file) == 0;
  if (::close(file) != 0) ok = false;
  if (ok) ok = ::rename(temporary.c_str(), destination.c_str()) == 0;
#endif
  if (!ok) {
    std::error_code ignored;
    std::filesystem::remove(temporary, ignored);
    throw std::runtime_error("Cannot save session file");
  }
}
}  // namespace rayna
