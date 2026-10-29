#include "Transfer.h"
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <thread>

int main(int argc, char** argv) {
  try {
    if (argc == 3 && std::string(argv[1]) == "prepare") {
      std::cout << rayna::Transfer::prepareDirectory(argv[2]) << '\n';
      return 0;
    }
    if (argc == 5 && std::string(argv[1]) == "rebase") {
      const auto value = rayna::Transfer::rebase(argv[2], argv[3], argv[4]);
      std::cout << (value ? *value : "") << '\n';
      return 0;
    }
    if (argc == 6 && std::string(argv[1]) == "copy") {
      std::cout << rayna::Transfer::copyForMove(argv[2], argv[3], argv[4], argv[5]) << '\n';
      return 0;
    }
    if (argc == 6 && std::string(argv[1]) == "clean") {
      std::cout << rayna::Transfer::removeIfSame(argv[2], argv[3], argv[4], argv[5]) << '\n';
      return 0;
    }
    if (argc == 4 && std::string(argv[1]) == "remove") {
      rayna::Transfer::remove(argv[2], argv[3]);
      return 0;
    }
    if (argc == 7 && std::string(argv[1]) == "paths") {
      const auto paths = rayna::Transfer::paths(argv[2], argv[3], argv[4], argv[5], argv[6]);
      std::cout << paths.file << '\n' << paths.partial << '\n';
      return 0;
    }
    if (argc != 6 && argc != 7 && argc != 8) return 2;
    rayna::Transfer transfer;
    const bool cancel = argc == 7 && std::string(argv[6]) == "cancel";
    const double maximumBytes = argc == 8 && std::string(argv[6]) == "limit" ? std::stod(argv[7]) : 0;
    if (!cancel) {
      std::cout << transfer.download(argv[1], argv[2], argv[3], argv[4], argv[5], maximumBytes) << '\n';
    } else {
      std::string failure;
      std::thread worker([&] {
        try { transfer.download(argv[1], argv[2], argv[3], argv[4], argv[5]); }
        catch (const std::exception& error) { failure = error.what(); }
      });
      std::this_thread::sleep_for(std::chrono::milliseconds(300));
      if (!transfer.cancel(argv[1])) { worker.join(); throw std::runtime_error("Download was not active"); }
      worker.join();
      if (failure != "Download paused") throw std::runtime_error("Cancellation did not stop the download");
      std::cout << failure << '\n';
    }
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
