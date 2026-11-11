#pragma once
#include "NativeModules.h"
#include "../proxy/StreamProxy.h"
#include <memory>
#include <mutex>

namespace rayna::windows {
using namespace winrt::Microsoft::ReactNative;
REACT_MODULE(RaynaProxy, L"RaynaProxy")
struct RaynaProxy {
  std::mutex mutex;
  std::unique_ptr<rayna::StreamProxy> proxy;
  REACT_METHOD(registerUrl)
  void registerUrl(std::string url, ReactPromise<std::string>&& result) noexcept {
    try {
      const std::lock_guard<std::mutex> lock(mutex);
      if (!proxy) proxy = std::make_unique<rayna::StreamProxy>();
      result.Resolve(proxy->registerUrl(url));
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(stop)
  void stop(ReactPromise<void>&& result) noexcept {
    try { const std::lock_guard<std::mutex> lock(mutex); proxy.reset(); result.Resolve(); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
};
}  // namespace rayna::windows
