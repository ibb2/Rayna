#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX
#endif
#define CPPHTTPLIB_REQUEST_URI_MAX_LENGTH 2048
#include "vendor/httplib.h"
#include "StreamProxy.h"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <deque>
#include <iomanip>
#include <map>
#include <mutex>
#include <random>
#include <sstream>
#include <stdexcept>
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
std::string configValue(const std::string& value) {
  std::string result = "\"";
  for (const char c : value) {
    if (c == '\n' || c == '\r' || c == '\0') throw std::runtime_error("Invalid stream URL or header");
    if (c == '\\' || c == '"') result += '\\';
    result += c;
  }
  return result + "\"";
}

std::string lower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return value;
}

#ifndef _WIN32
bool moveOutOfStandardDescriptors(int& descriptor) {
  if (descriptor >= 3) return true;
  const int duplicate = fcntl(descriptor, F_DUPFD_CLOEXEC, 3);
  if (duplicate < 0) return false;
  ::close(descriptor);
  descriptor = duplicate;
  return true;
}
#endif

struct UpstreamHeaders {
  int status = 502;
  std::map<std::string, std::string> headers;
};

// curl handles TLS and redirects. Its URL is sent through stdin, and its
// response is consumed incrementally so audio is not buffered in JS memory.
class CurlReader {
 public:
  explicit CurlReader(const std::string& config) { start(config); }
  ~CurlReader() { close(); }
  CurlReader(const CurlReader&) = delete;
  CurlReader& operator=(const CurlReader&) = delete;

  UpstreamHeaders headers() {
    for (int responseCount = 0; responseCount < 8; ++responseCount) {
      size_t end;
      while ((end = buffer_.find("\r\n\r\n")) == std::string::npos) {
        if (buffer_.size() > 65536) throw std::runtime_error("Upstream headers are too large");
        char chunk[4096];
        const auto count = readRaw(chunk, sizeof(chunk));
        if (count <= 0) throw std::runtime_error("Upstream did not return HTTP headers");
        buffer_.append(chunk, static_cast<size_t>(count));
      }
      if (end > 65536) throw std::runtime_error("Upstream headers are too large");
      const auto block = buffer_.substr(0, end);
      buffer_.erase(0, end + 4);
      std::istringstream lines(block);
      std::string line, version, reason;
      UpstreamHeaders result;
      if (!std::getline(lines, line)) throw std::runtime_error("Invalid upstream HTTP response");
      std::istringstream status(line);
      status >> version >> result.status;
      std::getline(status, reason);
      if (version.rfind("HTTP/", 0) != 0 || result.status < 100 || result.status > 599) throw std::runtime_error("Invalid upstream HTTP status");
      while (std::getline(lines, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        const auto separator = line.find(':');
        if (separator == std::string::npos) continue;
        const auto name = lower(line.substr(0, separator));
        auto value = line.substr(separator + 1);
        const auto start = value.find_first_not_of(" \t");
        value = start == std::string::npos ? "" : value.substr(start);
        result.headers[name] = value;
      }
      const bool redirect = (result.status == 301 || result.status == 302 || result.status == 303 || result.status == 307 || result.status == 308) && result.headers.count("location");
      if ((result.status >= 100 && result.status < 200) || redirect || (result.status == 200 && reason.find("Connection established") != std::string::npos)) continue;
      return result;
    }
    throw std::runtime_error("Too many upstream HTTP responses");
  }

  long read(char* data, size_t length) {
    if (!buffer_.empty()) {
      const auto amount = std::min(length, buffer_.size());
      std::copy_n(buffer_.data(), amount, data);
      buffer_.erase(0, amount);
      return static_cast<long>(amount);
    }
    return readRaw(data, length);
  }

  bool succeeded() {
#ifdef _WIN32
    if (!process_ || WaitForSingleObject(process_, 2000) != WAIT_OBJECT_0) return false;
    DWORD code = 1;
    const bool ok = GetExitCodeProcess(process_, &code) && code == 0;
    CloseHandle(process_); process_ = nullptr;
    return ok;
#else
    if (process_ <= 0) return false;
    int status = 0;
    for (int attempt = 0; attempt < 40; ++attempt) {
      const auto result = waitpid(process_, &status, WNOHANG);
      if (result == process_) { process_ = -1; return WIFEXITED(status) && WEXITSTATUS(status) == 0; }
      if (result < 0) return false;
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
    return false;
#endif
  }

 private:
  std::string buffer_;
#ifdef _WIN32
  HANDLE output_ = nullptr;
  HANDLE process_ = nullptr;

  void start(const std::string& config) {
    SECURITY_ATTRIBUTES security{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
    HANDLE childInput = nullptr, input = nullptr, output = nullptr, childOutput = nullptr;
    if (!CreatePipe(&childInput, &input, &security, 0)) throw std::runtime_error("Cannot create stream process pipe");
    if (!CreatePipe(&output, &childOutput, &security, 0)) { CloseHandle(childInput); CloseHandle(input); throw std::runtime_error("Cannot create stream process pipe"); }
    SetHandleInformation(input, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(output, HANDLE_FLAG_INHERIT, 0);
    HANDLE nullFile = CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &security, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (nullFile == INVALID_HANDLE_VALUE) { CloseHandle(childInput); CloseHandle(input); CloseHandle(output); CloseHandle(childOutput); throw std::runtime_error("Cannot create stream process"); }
    wchar_t system[MAX_PATH];
    const auto length = GetSystemDirectoryW(system, MAX_PATH);
    if (!length || length >= MAX_PATH) { CloseHandle(childInput); CloseHandle(input); CloseHandle(output); CloseHandle(childOutput); CloseHandle(nullFile); throw std::runtime_error("Cannot locate system curl"); }
    const auto executable = std::wstring(system) + L"\\curl.exe";
    std::wstring command = L"\"" + executable + L"\" --config -";
    STARTUPINFOEXW startup{};
    startup.StartupInfo.cb = sizeof(startup);
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = childInput;
    startup.StartupInfo.hStdOutput = childOutput;
    startup.StartupInfo.hStdError = nullFile;
    SIZE_T size = 0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
    std::vector<unsigned char> attributes(size);
    startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
    const bool initialized = InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &size) != 0;
    bool ok = initialized;
    HANDLE inherited[] = {childInput, childOutput, nullFile};
    if (ok) ok = UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited, sizeof(inherited), nullptr, nullptr) != 0;
    PROCESS_INFORMATION process{};
    if (ok) ok = CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE, EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr, nullptr, &startup.StartupInfo, &process) != 0;
    if (initialized) DeleteProcThreadAttributeList(startup.lpAttributeList);
    CloseHandle(childInput); CloseHandle(childOutput); CloseHandle(nullFile);
    if (!ok) { CloseHandle(input); CloseHandle(output); throw std::runtime_error("Cannot start system curl"); }
    CloseHandle(process.hThread);
    process_ = process.hProcess; output_ = output;
    size_t offset = 0;
    while (offset < config.size()) {
      DWORD written = 0;
      const auto chunk = static_cast<DWORD>(std::min<size_t>(config.size() - offset, 1 << 16));
      if (!WriteFile(input, config.data() + offset, chunk, &written, nullptr) || !written) break;
      offset += written;
    }
    CloseHandle(input);
    if (offset != config.size()) { close(); throw std::runtime_error("Cannot configure stream process"); }
  }
  long readRaw(char* data, size_t length) {
    DWORD bytes = 0;
    if (!ReadFile(output_, data, static_cast<DWORD>(std::min<size_t>(length, 1 << 16)), &bytes, nullptr)) return 0;
    return static_cast<long>(bytes);
  }
  void close() {
    if (output_) { CloseHandle(output_); output_ = nullptr; }
    if (process_) {
      if (WaitForSingleObject(process_, 0) == WAIT_TIMEOUT) TerminateProcess(process_, 1);
      WaitForSingleObject(process_, INFINITE); CloseHandle(process_); process_ = nullptr;
    }
  }
#else
  int output_ = -1;
  pid_t process_ = -1;

  void start(const std::string& config) {
    int input[2], output[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, input) != 0) throw std::runtime_error("Cannot create stream process pipe");
    if (!moveOutOfStandardDescriptors(input[0]) || !moveOutOfStandardDescriptors(input[1])) { ::close(input[0]); ::close(input[1]); throw std::runtime_error("Cannot prepare stream process pipe"); }
    if (pipe(output) != 0) { ::close(input[0]); ::close(input[1]); throw std::runtime_error("Cannot create stream process pipe"); }
    if (!moveOutOfStandardDescriptors(output[0]) || !moveOutOfStandardDescriptors(output[1])) { ::close(input[0]); ::close(input[1]); ::close(output[0]); ::close(output[1]); throw std::runtime_error("Cannot prepare stream process pipe"); }
#ifdef __APPLE__
    int noSigpipe = 1;
    setsockopt(input[0], SOL_SOCKET, SO_NOSIGPIPE, &noSigpipe, sizeof(noSigpipe));
#endif
    int nullFile = ::open("/dev/null", O_WRONLY);
    if (nullFile < 0 || !moveOutOfStandardDescriptors(nullFile)) { if (nullFile >= 0) ::close(nullFile); ::close(input[0]); ::close(input[1]); ::close(output[0]); ::close(output[1]); throw std::runtime_error("Cannot create stream process"); }
    posix_spawn_file_actions_t actions;
    posix_spawn_file_actions_init(&actions);
    posix_spawn_file_actions_adddup2(&actions, input[1], STDIN_FILENO);
    posix_spawn_file_actions_adddup2(&actions, output[1], STDOUT_FILENO);
    posix_spawn_file_actions_adddup2(&actions, nullFile, STDERR_FILENO);
    posix_spawn_file_actions_addclose(&actions, input[0]); posix_spawn_file_actions_addclose(&actions, input[1]);
    posix_spawn_file_actions_addclose(&actions, output[0]); posix_spawn_file_actions_addclose(&actions, output[1]);
    posix_spawn_file_actions_addclose(&actions, nullFile);
    char executable[] = "/usr/bin/curl", option[] = "--config", stdinArg[] = "-";
    char* argv[] = {executable, option, stdinArg, nullptr};
#ifdef __APPLE__
    char** environment = *_NSGetEnviron();
#else
    char** environment = environ;
#endif
    const int spawned = posix_spawn(&process_, executable, &actions, nullptr, argv, environment);
    posix_spawn_file_actions_destroy(&actions);
    ::close(input[1]); ::close(output[1]); ::close(nullFile);
    if (spawned != 0) { ::close(input[0]); ::close(output[0]); process_ = -1; throw std::runtime_error("Cannot start system curl"); }
    output_ = output[0];
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
    if (offset != config.size()) { close(); throw std::runtime_error("Cannot configure stream process"); }
  }
  long readRaw(char* data, size_t length) {
    const auto count = ::read(output_, data, length);
    return count > 0 ? static_cast<long>(count) : 0;
  }
  void close() {
    if (output_ >= 0) { ::close(output_); output_ = -1; }
    if (process_ > 0) {
      int status = 0;
      if (waitpid(process_, &status, WNOHANG) == 0) { ::kill(process_, SIGTERM); waitpid(process_, &status, 0); }
      process_ = -1;
    }
  }
#endif
};

std::string extension(const std::string& url) {
  const auto end = url.find_first_of("?#");
  const auto path = url.substr(0, end);
  const auto slash = path.find_last_of('/'), dot = path.find_last_of('.');
  if (dot == std::string::npos || (slash != std::string::npos && dot < slash) || path.size() - dot > 11 || path.size() - dot < 2) return "";
  const auto value = path.substr(dot);
  if (!std::all_of(value.begin() + 1, value.end(), [](unsigned char c) { return std::isalnum(c); })) return "";
  return lower(value);
}
}  // namespace

struct StreamProxy::Impl {
  httplib::Server server;
  std::thread thread;
  std::mutex mutex;
  std::map<std::string, std::string> targets;
  std::deque<std::string> order;
  int port = 0;

  Impl() {
    server.new_task_queue = [] { return new httplib::ThreadPool(4, 16); };
    server.set_read_timeout(5, 0).set_write_timeout(15, 0).set_keep_alive_max_count(1).set_payload_max_length(0);
    server.set_exception_handler([](const httplib::Request&, httplib::Response& response, std::exception_ptr) { response.status = 502; response.body = "Stream unavailable"; });
    server.Get(R"(/([a-f0-9]{32})(?:\.[a-z0-9]{1,10})?)", [this](const httplib::Request& request, httplib::Response& response) {
      std::string target;
      {
        const std::lock_guard<std::mutex> lock(mutex);
        const auto found = targets.find(request.matches[1].str());
        if (found == targets.end()) { response.status = 404; return; }
        target = found->second;
      }
      try {
        auto config = "url = " + configValue(target) + "\ninclude\nno-buffer\nhttp1.1\nlocation\nsilent\nsuppress-connect-headers\nmax-redirs = 5\nconnect-timeout = 8\nspeed-time = 10\nspeed-limit = 1\nproto = \"=http,https\"\nproto-redir = \"=http,https\"\nheader = \"Accept-Encoding: identity\"\n";
        if (request.method == "HEAD") config += "head\n";
        for (const auto* name : {"Accept", "Range", "If-Range"}) {
          const auto value = request.get_header_value(name);
          if (!value.empty() && value.size() <= 512) config += "header = " + configValue(std::string(name) + ": " + value) + "\n";
        }
        // cpp-httplib normally applies a Range a second time. The upstream has
        // already applied it, so leave the original header but clear its parsed
        // local range before the response is written.
        const_cast<httplib::Request&>(request).ranges.clear();
        auto reader = std::make_shared<CurlReader>(config);
        const auto upstream = reader->headers();
        response.status = upstream.status;
        for (const auto* name : {"accept-ranges", "cache-control", "content-range", "etag", "last-modified"}) {
          const auto found = upstream.headers.find(name);
          if (found != upstream.headers.end()) response.set_header(name, found->second);
        }
        const auto type = upstream.headers.find("content-type");
        const auto contentType = type == upstream.headers.end() ? "application/octet-stream" : type->second;
        const auto lengthHeader = upstream.headers.find("content-length");
        size_t length = 0;
        bool hasLength = false;
        if (lengthHeader != upstream.headers.end()) {
          size_t used = 0;
          const auto parsed = std::stoull(lengthHeader->second, &used);
          if (used == lengthHeader->second.size() && parsed <= SIZE_MAX) { length = static_cast<size_t>(parsed); hasLength = true; }
        }
        if (request.method == "HEAD") {
          response.set_header("Content-Type", contentType);
          if (hasLength) response.set_header("Content-Length", std::to_string(length));
        } else if (hasLength) {
          response.set_content_provider(length, contentType, [reader](size_t, size_t remaining, httplib::DataSink& sink) {
            char buffer[64 * 1024];
            const auto count = reader->read(buffer, std::min(remaining, sizeof(buffer)));
            return count > 0 && sink.write(buffer, static_cast<size_t>(count));
          });
        } else {
          response.set_chunked_content_provider(contentType, [reader](size_t, httplib::DataSink& sink) {
            char buffer[64 * 1024];
            const auto count = reader->read(buffer, sizeof(buffer));
            if (count <= 0) { if (!reader->succeeded()) return false; sink.done(); return true; }
            return sink.write(buffer, static_cast<size_t>(count));
          });
        }
      } catch (...) { response.status = 502; response.body = "Stream unavailable"; }
    });
    port = server.bind_to_any_port("127.0.0.1");
    if (port <= 0) throw std::runtime_error("Cannot start the loopback stream proxy");
    thread = std::thread([this] { server.listen_after_bind(); });
    server.wait_until_ready();
  }
  ~Impl() { stop(); }
  void stop() {
    server.stop();
    if (thread.joinable()) thread.join();
    const std::lock_guard<std::mutex> lock(mutex);
    targets.clear(); order.clear(); port = 0;
  }
};

StreamProxy::StreamProxy() : impl_(std::make_unique<Impl>()) {}
StreamProxy::~StreamProxy() = default;
std::string StreamProxy::registerUrl(const std::string& url) {
  if ((url.rfind("http://", 0) != 0 && url.rfind("https://", 0) != 0) || url.find_first_of("\r\n") != std::string::npos) throw std::runtime_error("Invalid proxy target");
  std::random_device random;
  std::ostringstream id;
  for (int index = 0; index < 16; ++index) id << std::hex << std::setw(2) << std::setfill('0') << (random() & 0xff);
  const auto key = id.str();
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  if (!impl_->port) throw std::runtime_error("Stream proxy is closed");
  if (!impl_->targets.emplace(key, url).second) throw std::runtime_error("Cannot allocate a stream identifier");
  impl_->order.push_back(key);
  if (impl_->order.size() > 2048) { impl_->targets.erase(impl_->order.front()); impl_->order.pop_front(); }
  return "http://127.0.0.1:" + std::to_string(impl_->port) + "/" + key + extension(url);
}
void StreamProxy::stop() { impl_->stop(); }
}  // namespace rayna
