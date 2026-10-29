#include "StreamProxy.h"
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>
#ifndef _WIN32
#include <unistd.h>
#endif

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  try {
    rayna::StreamProxy proxy;
    const bool closeStreams = std::string(argv[argc - 1]) == "--close-stdio";
    for (int index = 1; index < argc - (closeStreams ? 1 : 0); ++index) std::cout << proxy.registerUrl(argv[index]) << std::endl;
#ifndef _WIN32
    if (closeStreams) {
      ::close(STDIN_FILENO); ::close(STDOUT_FILENO); ::close(STDERR_FILENO);
      std::this_thread::sleep_for(std::chrono::seconds(2));
      proxy.stop();
      return 0;
    }
#endif
    std::string line;
    std::getline(std::cin, line);
    proxy.stop();
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
