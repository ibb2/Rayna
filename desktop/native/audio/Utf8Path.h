#pragma once

#include <filesystem>
#include <string>

namespace rayna {
inline std::filesystem::path pathFromUtf8(const std::string& value) {
#if defined(__cpp_char8_t)
  std::u8string encoded;
  encoded.reserve(value.size());
  for (const unsigned char byte : value) encoded.push_back(static_cast<char8_t>(byte));
  return std::filesystem::path(encoded);
#else
  return std::filesystem::u8path(value);
#endif
}

// C++20 changed path::u8string() from string to u8string. Keep the exact UTF-8
// bytes at the native module boundary on both standards and on Windows.
inline std::string utf8Path(const std::filesystem::path& path) {
  const auto encoded = path.u8string();
  return std::string(reinterpret_cast<const char*>(encoded.data()), encoded.size());
}
}  // namespace rayna
