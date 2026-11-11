#pragma once

#include "NativeModules.h"
#include "../BassEngine.h"
#include "../Utf8Path.h"
#include <filesystem>
#include <memory>
#include <stdexcept>
#include <vector>
#include <windows.h>

namespace rayna::windows {
using namespace winrt::Microsoft::ReactNative;

REACT_MODULE(RaynaBass, L"RaynaBass")
struct RaynaBass {
  std::unique_ptr<rayna::BassEngine> engine = std::make_unique<rayna::BassEngine>();

  REACT_METHOD(initialize)
  void initialize(ReactPromise<JSValue>&& result) noexcept {
    try {
      std::vector<wchar_t> path(32768);
      const auto size = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
      if (!size || size == path.size()) throw std::runtime_error("The application directory is unavailable");
      engine->initialize(rayna::utf8Path(std::filesystem::path(std::wstring(path.data(), size)).parent_path()));
      JSValueArray plugins;
      for (const auto& plugin : engine->plugins()) {
        plugins.push_back(JSValueObject{{"name", plugin.name}, {"loaded", plugin.loaded}, {"error", plugin.error}});
      }
      result.Resolve(JSValueObject{{"version", static_cast<double>(engine->version())}, {"plugins", std::move(plugins)}});
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }

  REACT_METHOD(openFile)
  void openFile(std::string path, ReactPromise<void>&& result) noexcept {
    try { engine->openFile(path); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(openUrl)
  void openUrl(std::string url, ReactPromise<void>&& result) noexcept {
    try { engine->openUrl(url); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(play)
  void play(ReactPromise<void>&& result) noexcept {
    try { engine->play(); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(pause)
  void pause(ReactPromise<void>&& result) noexcept {
    try { engine->pause(); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(seek)
  void seek(double position, ReactPromise<void>&& result) noexcept {
    try { engine->seek(position); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(setVolume)
  void setVolume(double volume, ReactPromise<void>&& result) noexcept {
    try { engine->setVolume(volume); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(status)
  void status(ReactPromise<JSValue>&& result) noexcept {
    try {
      const auto status = engine->status();
      result.Resolve(JSValueObject{{"playing", status.playing}, {"stalled", status.stalled}, {"stopped", status.stopped}, {"position", status.position}, {"duration", status.duration}});
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(close)
  void close(ReactPromise<void>&& result) noexcept {
    try { engine->close(); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(dispose)
  void dispose(ReactPromise<void>&& result) noexcept {
    try { engine->shutdown(); result.Resolve(); } catch (const std::exception& error) { result.Reject(error.what()); }
  }
};
}  // namespace rayna::windows
