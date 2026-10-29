#include "BassEngine.h"

#include <cmath>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
  if (argc < 3 || argc > 5) {
    std::cerr << "Usage: bass-smoke <library-directory> <wav-file> [authenticated-url] [seek]\n";
    return 2;
  }
  try {
    rayna::BassEngine audio;
    audio.initialize(argv[1], true);
    if (audio.version() == 0) throw std::runtime_error("BASS version was zero");
    for (const auto& plugin : audio.plugins()) {
      if (!plugin.loaded) throw std::runtime_error("Could not load plugin " + plugin.name);
    }
    audio.openFile(argv[2]);
    audio.setVolume(0.5);
    audio.play();
    audio.seek(1.0);
    audio.pause();
    const auto status = audio.status();
    if (std::abs(status.position - 1.0) > 0.05 || std::abs(status.duration - 2.0) > 0.05) {
      throw std::runtime_error("Unexpected position or duration");
    }
    audio.play();
    audio.close();
    audio.close();
    if (argc >= 4) {
      audio.openUrl(argv[3]);
      audio.play();
      const auto streamed = audio.status();
      if (!streamed.playing && !streamed.stalled) throw std::runtime_error("HTTP stream did not start");
      if (argc == 5 && std::string(argv[4]) == "seek") {
        audio.seek(1.0);
        audio.pause();
        if (std::abs(audio.status().position - 1.0) > 0.1) throw std::runtime_error("Unexpected streamed seek position");
      }
      audio.close();
      std::cout << "BASS authenticated HTTP playback smoke test passed\n";
    }
    std::cout << "BASS local playback smoke test passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
