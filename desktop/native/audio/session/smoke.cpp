#include "SessionFile.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
  if (argc != 2) return 2;
  try {
    const std::filesystem::path directory(argv[1]);
    std::filesystem::create_directories(directory);
    { std::ofstream original(directory / "auth.json"); original << "legacy"; }
    rayna::SessionFile session(directory);
    if (session.read() != "legacy") throw std::runtime_error("Legacy session was not read");
    session.write("desktop");
    if (session.read() != "desktop") throw std::runtime_error("Desktop session was not written");
    std::ifstream original(directory / "auth.json");
    std::string content; original >> content;
    if (content != "legacy") throw std::runtime_error("Legacy session was modified");
    std::cout << "Session migration smoke test passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
