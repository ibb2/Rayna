#pragma once
#include <memory>
#include <string>

namespace rayna {
// A loopback-only, opaque mapping for BASS HTTP streams. Credentials never
// appear in the local URL or curl's command line.
class StreamProxy final {
 public:
  StreamProxy();
  ~StreamProxy();
  StreamProxy(const StreamProxy&) = delete;
  StreamProxy& operator=(const StreamProxy&) = delete;
  std::string registerUrl(const std::string& url);
  void stop();
 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}  // namespace rayna
