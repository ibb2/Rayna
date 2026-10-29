#if defined(_WIN32) && !defined(NOMINMAX)
#define NOMINMAX
#endif
#define BASSDEF(f) WINAPI f
#include "../../../vendor/bass/macos/bass.h"
#include "BassEngine.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace rayna {
namespace {
#ifdef _WIN32
using LibraryHandle = HMODULE;
LibraryHandle loadLibrary(const std::filesystem::path& path) { return LoadLibraryW(path.c_str()); }
void* findSymbol(LibraryHandle library, const char* symbol) { return reinterpret_cast<void*>(GetProcAddress(library, symbol)); }
void unloadLibrary(LibraryHandle library) { if (library) FreeLibrary(library); }
constexpr const char* kMainLibrary = "bass.dll";
constexpr const char* kPluginNames[] = {"bassflac.dll", "basshls.dll", "bassopus.dll"};
#else
using LibraryHandle = void*;
LibraryHandle loadLibrary(const std::filesystem::path& path) { return dlopen(path.c_str(), RTLD_NOW | RTLD_LOCAL); }
void* findSymbol(LibraryHandle library, const char* symbol) { return dlsym(library, symbol); }
void unloadLibrary(LibraryHandle library) { if (library) dlclose(library); }
#ifdef __APPLE__
constexpr const char* kMainLibrary = "libbass.dylib";
constexpr const char* kPluginNames[] = {"libbassflac.dylib", "libbasshls.dylib", "libbassopus.dylib"};
#else
constexpr const char* kMainLibrary = "libbass.so";
constexpr const char* kPluginNames[] = {"libbassflac.so", "libbasshls.so", "libbassopus.so"};
#endif
#endif

template <typename T>
T symbol(LibraryHandle library, const char* name) {
  auto result = reinterpret_cast<T>(findSymbol(library, name));
  if (!result) throw std::runtime_error(std::string("BASS symbol is missing: ") + name);
  return result;
}

constexpr QWORD kInvalidPosition = static_cast<QWORD>(-1);
}  // namespace

struct BassEngine::Impl {
  mutable std::mutex mutex;
  LibraryHandle library = nullptr;
  bool initialized = false;
  HSTREAM stream = 0;
  bool networkStream = false;
  std::vector<HPLUGIN> pluginHandles;
  std::vector<PluginStatus> pluginStatuses;
  decltype(&BASS_Init) init = nullptr;
  decltype(&BASS_Free) free = nullptr;
  decltype(&BASS_GetVersion) getVersion = nullptr;
  decltype(&BASS_ErrorGetCode) getError = nullptr;
  decltype(&BASS_SetConfig) setConfig = nullptr;
  decltype(&BASS_PluginLoad) pluginLoad = nullptr;
  decltype(&BASS_PluginFree) pluginFree = nullptr;
  decltype(&BASS_StreamCreateFile) createFile = nullptr;
  decltype(&BASS_StreamCreateURL) createUrl = nullptr;
  decltype(&BASS_StreamFree) streamFree = nullptr;
  decltype(&BASS_ChannelPlay) channelPlay = nullptr;
  decltype(&BASS_ChannelPause) channelPause = nullptr;
  decltype(&BASS_ChannelStop) channelStop = nullptr;
  decltype(&BASS_ChannelIsActive) channelIsActive = nullptr;
  decltype(&BASS_ChannelSetAttribute) setAttribute = nullptr;
  decltype(&BASS_ChannelGetPosition) getPosition = nullptr;
  decltype(&BASS_ChannelGetLength) getLength = nullptr;
  decltype(&BASS_ChannelSetPosition) setPosition = nullptr;
  decltype(&BASS_ChannelBytes2Seconds) bytesToSeconds = nullptr;
  decltype(&BASS_ChannelSeconds2Bytes) secondsToBytes = nullptr;

  void requireInitialized() const {
    if (!initialized) throw std::runtime_error("BASS has not been initialized");
  }
  void requireStream() const {
    requireInitialized();
    if (!stream) throw std::runtime_error("No audio stream is open");
  }
  void check(bool ok, const char* operation) const {
    if (!ok) throw std::runtime_error(std::string(operation) + " failed (BASS error " + std::to_string(getError()) + ")");
  }
  void closeStream() {
    if (!stream) return;
    channelStop(stream);
    streamFree(stream);
    stream = 0;
    networkStream = false;
  }
  void release() {
    if (initialized) {
      closeStream();
      for (auto handle : pluginHandles) pluginFree(handle);
      pluginHandles.clear();
      free();
      initialized = false;
    }
    unloadLibrary(library);
    library = nullptr;
  }
};

BassEngine::BassEngine() : impl_(std::make_unique<Impl>()) {}
BassEngine::~BassEngine() { impl_->release(); }

void BassEngine::initialize(const std::string& libraryDirectory, bool noSound) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  if (impl_->initialized) return;
  const auto directory = std::filesystem::u8path(libraryDirectory);
  impl_->library = loadLibrary(directory / kMainLibrary);
  if (!impl_->library) throw std::runtime_error("Unable to load the BASS library");
  try {
#define LOAD(member, name) impl_->member = symbol<decltype(impl_->member)>(impl_->library, #name)
    LOAD(init, BASS_Init); LOAD(free, BASS_Free); LOAD(getVersion, BASS_GetVersion);
    LOAD(getError, BASS_ErrorGetCode); LOAD(setConfig, BASS_SetConfig);
    LOAD(pluginLoad, BASS_PluginLoad); LOAD(pluginFree, BASS_PluginFree);
    LOAD(createFile, BASS_StreamCreateFile); LOAD(createUrl, BASS_StreamCreateURL);
    LOAD(streamFree, BASS_StreamFree); LOAD(channelPlay, BASS_ChannelPlay);
    LOAD(channelPause, BASS_ChannelPause); LOAD(channelStop, BASS_ChannelStop);
    LOAD(channelIsActive, BASS_ChannelIsActive); LOAD(setAttribute, BASS_ChannelSetAttribute);
    LOAD(getPosition, BASS_ChannelGetPosition); LOAD(getLength, BASS_ChannelGetLength);
    LOAD(setPosition, BASS_ChannelSetPosition); LOAD(bytesToSeconds, BASS_ChannelBytes2Seconds);
    LOAD(secondsToBytes, BASS_ChannelSeconds2Bytes);
#undef LOAD
    impl_->check(impl_->init(noSound ? 0 : -1, 44100, 0, nullptr, nullptr), "BASS_Init");
    impl_->initialized = true;
    impl_->setConfig(BASS_CONFIG_NET_TIMEOUT, 8000);
    impl_->setConfig(BASS_CONFIG_NET_READTIMEOUT, 8000);
    impl_->pluginStatuses.clear();
    for (const auto* name : kPluginNames) {
      const auto path = directory / name;
#ifdef _WIN32
      const auto widePath = path.wstring();
      const auto handle = impl_->pluginLoad(reinterpret_cast<const char*>(widePath.c_str()), BASS_UNICODE);
#else
      const auto handle = impl_->pluginLoad(path.c_str(), 0);
#endif
      impl_->pluginStatuses.push_back({name, handle != 0, handle ? 0 : impl_->getError()});
      if (handle) impl_->pluginHandles.push_back(handle);
    }
  } catch (...) {
    impl_->release();
    throw;
  }
}

std::vector<PluginStatus> BassEngine::plugins() const { const std::lock_guard<std::mutex> lock(impl_->mutex); return impl_->pluginStatuses; }
unsigned int BassEngine::version() const { const std::lock_guard<std::mutex> lock(impl_->mutex); impl_->requireInitialized(); return impl_->getVersion(); }

void BassEngine::openFile(const std::string& utf8Path) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->requireInitialized();
  impl_->closeStream();
#ifdef _WIN32
  const auto widePath = std::filesystem::u8path(utf8Path).wstring();
  impl_->stream = impl_->createFile(false, widePath.c_str(), 0, 0, BASS_UNICODE);
#else
  impl_->stream = impl_->createFile(false, utf8Path.c_str(), 0, 0, 0);
#endif
  impl_->check(impl_->stream != 0, "BASS_StreamCreateFile");
}

void BassEngine::openUrl(const std::string& url) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->requireInitialized();
  impl_->closeStream();
  impl_->stream = impl_->createUrl(url.c_str(), 0, 0, nullptr, nullptr);
  impl_->check(impl_->stream != 0, "BASS_StreamCreateURL");
  impl_->networkStream = true;
}

void BassEngine::play() { const std::lock_guard<std::mutex> lock(impl_->mutex); impl_->requireStream(); impl_->check(impl_->channelPlay(impl_->stream, false), "BASS_ChannelPlay"); }
void BassEngine::pause() { const std::lock_guard<std::mutex> lock(impl_->mutex); impl_->requireStream(); impl_->check(impl_->channelPause(impl_->stream), "BASS_ChannelPause"); }
void BassEngine::seek(double seconds) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->requireStream();
  if (!std::isfinite(seconds) || seconds < 0) throw std::invalid_argument("Position must be a nonnegative finite number");
  const auto bytes = impl_->secondsToBytes(impl_->stream, seconds);
  impl_->check(bytes != kInvalidPosition, "BASS_ChannelSeconds2Bytes");
  const int attempts = impl_->networkStream ? 21 : 1;
  for (int attempt = 0; attempt < attempts; ++attempt) {
    if (impl_->setPosition(impl_->stream, bytes, BASS_POS_BYTE)) return;
    const int error = impl_->getError();
    if (error != BASS_ERROR_POSITION || attempt + 1 == attempts) throw std::runtime_error("BASS_ChannelSetPosition failed (BASS error " + std::to_string(error) + ")");
    // A just-opened network stream may not have buffered the requested bytes.
    // Give BASS a short, bounded window before reporting an unavailable seek.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
  }
}
void BassEngine::setVolume(double value) {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->requireStream();
  if (!std::isfinite(value)) throw std::invalid_argument("Volume must be finite");
  impl_->check(impl_->setAttribute(impl_->stream, BASS_ATTRIB_VOL, static_cast<float>(std::clamp(value, 0.0, 1.0))), "BASS_ChannelSetAttribute");
}
AudioStatus BassEngine::status() const {
  const std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->requireStream();
  const auto active = impl_->channelIsActive(impl_->stream);
  const auto position = impl_->getPosition(impl_->stream, BASS_POS_BYTE);
  const auto length = impl_->getLength(impl_->stream, BASS_POS_BYTE);
  const auto toSeconds = [this](QWORD bytes) {
    return bytes == kInvalidPosition ? 0.0 : std::max(0.0, impl_->bytesToSeconds(impl_->stream, bytes));
  };
  return {active == BASS_ACTIVE_PLAYING, active == BASS_ACTIVE_STALLED,
          active == BASS_ACTIVE_STOPPED, toSeconds(position), toSeconds(length)};
}
void BassEngine::close() { const std::lock_guard<std::mutex> lock(impl_->mutex); impl_->closeStream(); }
void BassEngine::shutdown() { const std::lock_guard<std::mutex> lock(impl_->mutex); impl_->release(); }

}  // namespace rayna
