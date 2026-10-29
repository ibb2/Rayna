#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX
#endif
#include "Transfer.h"
#include "../Utf8Path.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <map>
#include <mutex>
#include <stdexcept>
#include <system_error>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <signal.h>
#include <spawn.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>
#ifdef __APPLE__
#include <crt_externs.h>
#else
extern char** environ;
#endif
#endif

namespace rayna {
namespace {
namespace fs = std::filesystem;
std::atomic<unsigned long> restartCounter{0};

std::string safeSegment(const std::string& value, size_t limit) {
  std::string result;
  for (const unsigned char c : value) {
    if (result.size() >= limit) break;
    result += (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' ? static_cast<char>(c) : '_';
  }
  return result.empty() ? "item" : result;
}

bool isInside(const fs::path& root, const fs::path& child) {
  auto base = root.begin();
  auto candidate = child.begin();
  for (; base != root.end(); ++base, ++candidate) {
    if (candidate == child.end() || *base != *candidate) return false;
  }
  return candidate != child.end();
}

void validatePaths(const fs::path& directory, const fs::path& partial, const fs::path& destination) {
  if (!directory.is_absolute() || !partial.is_absolute() || !destination.is_absolute()) throw std::runtime_error("Download paths must be absolute");
  if (partial != fs::path(destination.native() + fs::path(".partial").native())) throw std::runtime_error("The partial path does not match its destination");
  fs::create_directories(directory);
  const auto root = fs::canonical(directory);
  const auto parent = fs::weakly_canonical(destination.parent_path());
  if (!isInside(root, parent) || partial.parent_path() != destination.parent_path()) throw std::runtime_error("The download is outside the configured storage directory");
  fs::create_directories(parent);
  for (const auto& path : {partial, destination}) {
    std::error_code error;
    const auto status = fs::symlink_status(path, error);
    if (error && error != std::errc::no_such_file_or_directory) throw std::system_error(error, "Cannot inspect download path");
    if (fs::is_symlink(status) || (fs::exists(status) && !fs::is_regular_file(status))) throw std::runtime_error("A download path is not a regular file");
  }
}

std::string configValue(const std::string& value) {
  std::string result = "\"";
  for (const char c : value) {
    if (c == '\n' || c == '\r' || c == '\0') throw std::runtime_error("Download URL or path contains a control character");
    if (c == '\\' || c == '"') result += '\\';
    result += c;
  }
  return result + "\"";
}

struct Job {
  std::atomic<bool> cancelled{false};
  std::mutex mutex;
  fs::path destination;
  bool finished = false;
#ifdef _WIN32
  HANDLE process = nullptr;
#else
  pid_t process = -1;
#endif
};

#ifdef _WIN32
int runCurl(const std::shared_ptr<Job>& job, const std::string& config) {
  SECURITY_ATTRIBUTES security{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
  HANDLE input = nullptr, output = nullptr;
  if (!CreatePipe(&input, &output, &security, 0)) throw std::runtime_error("Cannot create download pipe");
  SetHandleInformation(output, HANDLE_FLAG_INHERIT, 0);
  HANDLE nullFile = CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &security, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (nullFile == INVALID_HANDLE_VALUE) { CloseHandle(input); CloseHandle(output); throw std::runtime_error("Cannot create download process"); }
  wchar_t system[MAX_PATH];
  const auto length = GetSystemDirectoryW(system, MAX_PATH);
  if (!length || length >= MAX_PATH) { CloseHandle(input); CloseHandle(output); CloseHandle(nullFile); throw std::runtime_error("Cannot locate system curl"); }
  const auto executable = (fs::path(system) / L"curl.exe").wstring();
  std::wstring command = L"\"" + executable + L"\" --config -";
  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = input;
  startup.StartupInfo.hStdOutput = nullFile;
  startup.StartupInfo.hStdError = nullFile;
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
  std::vector<unsigned char> attributes(size);
  startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
  const bool initialized = InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &size) != 0;
  bool ok = initialized;
  HANDLE inherited[] = {input, nullFile};
  if (ok) ok = UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited, sizeof(inherited), nullptr, nullptr) != 0;
  PROCESS_INFORMATION process{};
  if (ok) ok = CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE, EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr, nullptr, &startup.StartupInfo, &process) != 0;
  if (initialized) DeleteProcThreadAttributeList(startup.lpAttributeList);
  CloseHandle(input); CloseHandle(nullFile);
  if (!ok) { CloseHandle(output); throw std::runtime_error("Cannot start system curl"); }
  CloseHandle(process.hThread);
  {
    const std::lock_guard<std::mutex> lock(job->mutex);
    job->process = process.hProcess;
    if (job->cancelled) TerminateProcess(process.hProcess, 1);
  }
  size_t offset = 0;
  while (offset < config.size()) {
    DWORD written = 0;
    const DWORD chunk = static_cast<DWORD>(std::min<size_t>(config.size() - offset, 1 << 16));
    if (!WriteFile(output, config.data() + offset, chunk, &written, nullptr) || !written) break;
    offset += written;
  }
  CloseHandle(output);
  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD code = 1;
  GetExitCodeProcess(process.hProcess, &code);
  {
    const std::lock_guard<std::mutex> lock(job->mutex);
    job->process = nullptr;
    CloseHandle(process.hProcess);
  }
  return offset == config.size() ? static_cast<int>(code) : 1;
}
#else
bool moveOutOfStandardDescriptors(int& descriptor) {
  if (descriptor >= 3) return true;
  const int duplicate = fcntl(descriptor, F_DUPFD_CLOEXEC, 3);
  if (duplicate < 0) return false;
  ::close(descriptor);
  descriptor = duplicate;
  return true;
}

int runCurl(const std::shared_ptr<Job>& job, const std::string& config) {
  int input[2];
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, input) != 0) throw std::runtime_error("Cannot create download pipe");
  if (!moveOutOfStandardDescriptors(input[0]) || !moveOutOfStandardDescriptors(input[1])) {
    ::close(input[0]); ::close(input[1]); throw std::runtime_error("Cannot prepare download pipe");
  }
#ifdef __APPLE__
  int noSigpipe = 1;
  setsockopt(input[0], SOL_SOCKET, SO_NOSIGPIPE, &noSigpipe, sizeof(noSigpipe));
#endif
  int nullFile = ::open("/dev/null", O_WRONLY);
  if (nullFile < 0 || !moveOutOfStandardDescriptors(nullFile)) { if (nullFile >= 0) ::close(nullFile); ::close(input[0]); ::close(input[1]); throw std::runtime_error("Cannot create download process"); }
  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_adddup2(&actions, input[1], STDIN_FILENO);
  posix_spawn_file_actions_adddup2(&actions, nullFile, STDOUT_FILENO);
  posix_spawn_file_actions_adddup2(&actions, nullFile, STDERR_FILENO);
  posix_spawn_file_actions_addclose(&actions, input[0]);
  posix_spawn_file_actions_addclose(&actions, input[1]);
  posix_spawn_file_actions_addclose(&actions, nullFile);
  char executable[] = "/usr/bin/curl";
  char option[] = "--config";
  char stdinArg[] = "-";
  char* argv[] = {executable, option, stdinArg, nullptr};
  pid_t process = -1;
#ifdef __APPLE__
  char** environment = *_NSGetEnviron();
#else
  char** environment = environ;
#endif
  const int spawned = posix_spawn(&process, executable, &actions, nullptr, argv, environment);
  posix_spawn_file_actions_destroy(&actions);
  ::close(input[1]); ::close(nullFile);
  if (spawned != 0) { ::close(input[0]); throw std::runtime_error("Cannot start system curl"); }
  {
    const std::lock_guard<std::mutex> lock(job->mutex);
    job->process = process;
    if (job->cancelled) ::kill(process, SIGTERM);
  }
  size_t offset = 0;
  while (offset < config.size()) {
#ifdef __APPLE__
    const auto written = send(input[0], config.data() + offset, config.size() - offset, 0);
#else
    const auto written = send(input[0], config.data() + offset, config.size() - offset, MSG_NOSIGNAL);
#endif
    if (written <= 0) break;
    offset += static_cast<size_t>(written);
  }
  ::close(input[0]);
  int status = 0;
  for (;;) {
    pid_t result;
    {
      const std::lock_guard<std::mutex> lock(job->mutex);
      result = waitpid(process, &status, WNOHANG);
      if (result != 0) job->process = -1;
    }
    if (result == process) break;
    if (result < 0) return 1;
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }
  return offset == config.size() && WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
#endif

void publish(const fs::path& source, const fs::path& destination) {
#ifdef _WIN32
  if (!MoveFileW(source.c_str(), destination.c_str())) throw std::runtime_error("Cannot publish download without replacing an existing file");
#else
  if (::link(source.c_str(), destination.c_str()) != 0) throw std::runtime_error("Cannot publish download without replacing an existing file");
  std::error_code ignored;
  fs::remove(source, ignored);
#endif
}

fs::path createRestart(const fs::path& partial) {
  auto path = partial;
#ifdef _WIN32
  path += ".restart." + std::to_string(GetCurrentProcessId()) + "." + std::to_string(restartCounter.fetch_add(1));
  HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("Cannot create a restart file");
  CloseHandle(file);
#else
  path += ".restart." + std::to_string(getpid()) + "." + std::to_string(restartCounter.fetch_add(1));
  const int file = ::open(path.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600);
  if (file < 0) throw std::runtime_error("Cannot create a restart file");
  ::close(file);
#endif
  return path;
}

void flushFile(const fs::path& path) {
#ifdef _WIN32
  HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("Cannot open the copied file for flushing");
  const bool flushed = FlushFileBuffers(file) != 0;
  CloseHandle(file);
#else
  const int file = ::open(path.c_str(), O_RDONLY);
  if (file < 0) throw std::runtime_error("Cannot open the copied file for flushing");
  const bool flushed = ::fsync(file) == 0;
  ::close(file);
#endif
  if (!flushed) throw std::runtime_error("Cannot flush the copied download");
}
}  // namespace

struct Transfer::Impl {
  std::mutex mutex;
  std::map<std::string, std::shared_ptr<Job>> jobs;
};

Transfer::Transfer() : impl_(std::make_unique<Impl>()) {}
Transfer::~Transfer() = default;

std::string Transfer::defaultDirectory() {
#ifdef _WIN32
  const auto* home = _wgetenv(L"USERPROFILE");
  if (home) return utf8Path(fs::path(home) / L"Music" / L"Rayna");
#else
  const auto* home = std::getenv("HOME");
  if (home) return utf8Path(fs::path(home) / "Music" / "Rayna");
#endif
  throw std::runtime_error("Cannot determine the default download directory");
}

std::string Transfer::legacyArtworkDirectory() {
#ifdef _WIN32
  const auto* home = _wgetenv(L"USERPROFILE");
  if (home) return utf8Path(fs::path(home) / L".rayna" / L"artwork-cache");
#else
  const auto* home = std::getenv("HOME");
  if (home) return utf8Path(fs::path(home) / ".rayna" / "artwork-cache");
#endif
  throw std::runtime_error("Cannot determine the legacy artwork cache directory");
}

DownloadPaths Transfer::paths(const std::string& directory, const std::string& server, const std::string& id, const std::string& title, const std::string& extension) {
  const auto root = pathFromUtf8(directory);
  if (!root.is_absolute()) throw std::runtime_error("Choose an absolute download directory");
  const auto suffix = extension.size() > 1 && extension.size() < 12 && extension[0] == '.' &&
      std::all_of(extension.begin() + 1, extension.end(), [](unsigned char c) { return std::isalnum(c); }) ? extension : ".audio";
  const auto destination = root / ("server-" + safeSegment(server, 80)) / ("track-" + safeSegment(title, 80) + "-" + safeSegment(id, 80) + suffix);
  auto partial = destination;
  partial += ".partial";
  return {utf8Path(destination), utf8Path(partial)};
}

double Transfer::size(const std::string& path) {
  std::error_code error;
  const auto status = fs::symlink_status(pathFromUtf8(path), error);
  if (error == std::errc::no_such_file_or_directory || (!error && !fs::exists(status))) return -1;
  if (error || fs::is_symlink(status) || !fs::is_regular_file(status)) throw std::runtime_error("Cannot inspect download file");
  const auto bytes = fs::file_size(pathFromUtf8(path));
  if (bytes > 9007199254740991ULL) throw std::runtime_error("Download is too large");
  return static_cast<double>(bytes);
}

void Transfer::remove(const std::string& directory, const std::string& name) {
  const auto root = pathFromUtf8(directory), path = pathFromUtf8(name);
  if (!root.is_absolute() || !path.is_absolute()) throw std::runtime_error("Cannot remove a file outside the configured download directory");
  if (size(name) < 0) return;
  if (!fs::exists(root)) throw std::runtime_error("Cannot remove a file outside the configured download directory");
  const auto canonicalRoot = fs::canonical(root);
  const auto parent = fs::weakly_canonical(path.parent_path());
  if (!isInside(canonicalRoot, parent / path.filename())) throw std::runtime_error("Cannot remove a file outside the configured download directory");
  fs::remove(path);
}

std::string Transfer::prepareDirectory(const std::string& directory) {
  const auto root = pathFromUtf8(directory);
  if (!root.is_absolute()) throw std::runtime_error("Choose an absolute download directory");
  fs::create_directories(root);
  return utf8Path(fs::canonical(root));
}

std::optional<std::string> Transfer::rebase(const std::string& oldDirectory, const std::string& newDirectory, const std::string& name) {
  const auto oldRoot = pathFromUtf8(oldDirectory), newRoot = pathFromUtf8(newDirectory), path = pathFromUtf8(name);
  if (!oldRoot.is_absolute() || !newRoot.is_absolute() || !path.is_absolute()) throw std::runtime_error("Storage paths must be absolute");
  const auto root = fs::weakly_canonical(oldRoot);
  const auto parent = fs::weakly_canonical(path.parent_path());
  const auto source = parent / path.filename();
  if (!isInside(root, source)) return std::nullopt;
  std::error_code error;
  const auto status = fs::symlink_status(source, error);
  if (error && error != std::errc::no_such_file_or_directory) throw std::system_error(error, "Cannot inspect a download to move");
  if (fs::is_symlink(status) || (fs::exists(status) && !fs::is_regular_file(status))) throw std::runtime_error("Cannot move a download that is not a regular file");
  return utf8Path(fs::weakly_canonical(newRoot) / source.lexically_relative(root));
}

bool Transfer::copyForMove(const std::string& oldDirectory, const std::string& newDirectory, const std::string& sourceName, const std::string& destinationName) {
  const auto mapped = rebase(oldDirectory, newDirectory, sourceName);
  if (!mapped || fs::weakly_canonical(pathFromUtf8(*mapped)) != fs::weakly_canonical(pathFromUtf8(destinationName))) throw std::runtime_error("Invalid storage move destination");
  const auto source = pathFromUtf8(sourceName), destination = pathFromUtf8(destinationName);
  const auto root = fs::canonical(pathFromUtf8(newDirectory));
  const auto parent = fs::weakly_canonical(destination.parent_path());
  if (!isInside(root, parent / destination.filename())) throw std::runtime_error("Storage move destination is outside the selected directory");
  fs::create_directories(parent);
  if (size(destinationName) >= 0) throw std::runtime_error("A file already exists at the new download location");
  const auto sourceSize = size(sourceName);
  if (sourceSize < 0) return false;
  const auto modified = fs::last_write_time(source);
  const auto temporary = createRestart(destination);
  try {
    std::ifstream input(source, std::ios::binary);
    std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
    if (!input || !output) throw std::runtime_error("Cannot copy a download");
    char buffer[64 * 1024];
    while (input) {
      input.read(buffer, sizeof(buffer));
      output.write(buffer, input.gcount());
    }
    if (!input.eof() || !output) throw std::runtime_error("Cannot copy a download");
    output.flush();
    if (!output) throw std::runtime_error("Cannot flush a copied download");
    output.close(); input.close();
    if (size(sourceName) != sourceSize || fs::last_write_time(source) != modified || size(utf8Path(temporary)) != sourceSize) throw std::runtime_error("A download changed while it was being copied");
    flushFile(temporary);
    publish(temporary, destination);
    return true;
  } catch (...) {
    std::error_code ignored;
    fs::remove(temporary, ignored);
    throw;
  }
}

bool Transfer::removeIfSame(const std::string& oldDirectory, const std::string& newDirectory, const std::string& sourceName, const std::string& destinationName) {
  const auto mapped = rebase(oldDirectory, newDirectory, sourceName);
  if (!mapped || fs::weakly_canonical(pathFromUtf8(*mapped)) != fs::weakly_canonical(pathFromUtf8(destinationName))) throw std::runtime_error("Invalid storage cleanup destination");
  const auto sourceSize = size(sourceName);
  if (sourceSize < 0) return true;
  if (size(destinationName) != sourceSize) return false;
  const auto modified = fs::last_write_time(pathFromUtf8(sourceName));
  std::ifstream source(pathFromUtf8(sourceName), std::ios::binary), destination(pathFromUtf8(destinationName), std::ios::binary);
  if (!source || !destination) throw std::runtime_error("Cannot verify copied downloads");
  char left[64 * 1024], right[64 * 1024];
  while (source && destination) {
    source.read(left, sizeof(left)); destination.read(right, sizeof(right));
    if (source.gcount() != destination.gcount() || !std::equal(left, left + source.gcount(), right)) return false;
  }
  if (!source.eof() || !destination.eof()) throw std::runtime_error("Cannot verify copied downloads");
  source.close(); destination.close();
  if (size(sourceName) != sourceSize || fs::last_write_time(pathFromUtf8(sourceName)) != modified) return false;
  remove(oldDirectory, sourceName);
  return true;
}

double Transfer::download(const std::string& id, const std::string& url, const std::string& directory, const std::string& partialName, const std::string& destinationName, double maximumBytes) {
  if (id.empty() || !std::isfinite(maximumBytes) || maximumBytes < 0 || maximumBytes > 9007199254740991.0 || (url.rfind("https://", 0) != 0 && url.rfind("http://", 0) != 0)) throw std::runtime_error("Invalid download request");
  const auto partial = pathFromUtf8(partialName), destination = pathFromUtf8(destinationName);
  validatePaths(pathFromUtf8(directory), partial, destination);
  if (size(destinationName) >= 0) throw std::runtime_error("The download destination already exists");
  auto job = std::make_shared<Job>();
  job->destination = fs::weakly_canonical(destination);
  {
    const std::lock_guard<std::mutex> lock(impl_->mutex);
    if (impl_->jobs.size() >= 3) throw std::runtime_error("The download transfer limit was reached");
    for (const auto& entry : impl_->jobs) if (entry.second->destination == job->destination) throw std::runtime_error("The destination is already being downloaded");
    if (!impl_->jobs.emplace(id, job).second) throw std::runtime_error("The download is already active");
  }
  auto cleanup = std::unique_ptr<Impl, std::function<void(Impl*)>>(impl_.get(), [id, job](Impl* impl) {
    const std::lock_guard<std::mutex> lock(impl->mutex);
    if (impl->jobs[id] == job) impl->jobs.erase(id);
  });
  auto perform = [&](const fs::path& output, bool resume) {
    const auto config = "url = " + configValue(url) + "\noutput = " + configValue(utf8Path(output)) +
        "\nfail\nlocation\nsilent\nmax-redirs = 5\nconnect-timeout = 15\nspeed-time = 30\nspeed-limit = 1\nproto = \"=http,https\"\nproto-redir = \"=http,https\"\n" + (resume ? "continue-at = \"-\"\n" : "") + (maximumBytes > 0 ? "max-filesize = " + std::to_string(static_cast<unsigned long long>(maximumBytes)) + "\n" : "");
    return runCurl(job, config);
  };
  const bool resume = size(partialName) > 0;
  auto output = partial;
  int code = perform(output, resume);
  if (code == 33 && resume && !job->cancelled) {
    output = createRestart(partial);
    code = perform(output, false);
  }
  if (job->cancelled || code != 0) {
    if (output != partial) { std::error_code ignored; fs::remove(output, ignored); }
    throw std::runtime_error(job->cancelled ? "Download paused" : "Download failed (curl error " + std::to_string(code) + ")");
  }
  const auto bytes = size(utf8Path(output));
  if (bytes <= 0) throw std::runtime_error("The server returned an empty download");
  if (maximumBytes > 0 && bytes > maximumBytes) throw std::runtime_error("The download exceeds its size limit");
  {
    const std::lock_guard<std::mutex> lock(job->mutex);
    if (job->cancelled) {
      if (output != partial) { std::error_code ignored; fs::remove(output, ignored); }
      throw std::runtime_error("Download paused");
    }
    try { publish(output, destination); }
    catch (...) {
      if (output != partial) { std::error_code ignored; fs::remove(output, ignored); }
      throw;
    }
    job->finished = true;
  }
  if (output != partial) { std::error_code ignored; fs::remove(partial, ignored); }
  return bytes;
}

bool Transfer::cancel(const std::string& id) {
  std::shared_ptr<Job> job;
  {
    const std::lock_guard<std::mutex> lock(impl_->mutex);
    const auto found = impl_->jobs.find(id);
    if (found == impl_->jobs.end()) return false;
    job = found->second;
  }
  const std::lock_guard<std::mutex> lock(job->mutex);
  if (job->finished) return false;
  job->cancelled = true;
#ifdef _WIN32
  if (job->process) TerminateProcess(job->process, 1);
#else
  if (job->process > 0) ::kill(job->process, SIGTERM);
#endif
  return true;
}

}  // namespace rayna
