#pragma once

#include "NativeModules.h"
#include "../session/SessionFile.h"
#include <memory>
#include <stdexcept>

namespace rayna::windows {
using namespace winrt::Microsoft::ReactNative;
REACT_MODULE(RaynaSession, L"RaynaSession")
struct RaynaSession {
  std::unique_ptr<rayna::SessionFile> session;
  rayna::SessionFile& getSession() {
    if (!session) session = std::make_unique<rayna::SessionFile>(rayna::SessionFile::legacyDirectory());
    return *session;
  }
  REACT_METHOD(read)
  void read(ReactPromise<JSValue>&& result) noexcept {
    try {
      const auto value = getSession().read();
      result.Resolve(value ? JSValue(*value) : JSValue(nullptr));
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(write)
  void write(std::string value, ReactPromise<void>&& result) noexcept {
    try { getSession().write(value); result.Resolve(); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
};
}  // namespace rayna::windows
