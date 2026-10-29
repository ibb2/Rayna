#pragma once

#include <memory>
#include <string>
#include <vector>

namespace rayna {

struct PluginStatus {
  std::string name;
  bool loaded;
  int error;
};

struct AudioStatus {
  bool playing;
  bool stalled;
  bool stopped;
  double position;
  double duration;
};

// The engine owns one BASS device and one stream. Callers serialize commands;
// no callback is invoked on BASS's audio thread.
class BassEngine final {
 public:
  BassEngine();
  ~BassEngine();
  BassEngine(const BassEngine&) = delete;
  BassEngine& operator=(const BassEngine&) = delete;

  void initialize(const std::string& libraryDirectory, bool noSound = false);
  std::vector<PluginStatus> plugins() const;
  unsigned int version() const;
  void openFile(const std::string& utf8Path);
  void openUrl(const std::string& url);
  void play();
  void pause();
  void seek(double seconds);
  void setVolume(double value);
  AudioStatus status() const;
  void close();
  void shutdown();

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace rayna
