#pragma once

#ifdef _WIN32
#include <cstdlib>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>

namespace rayna {
inline std::optional<std::wstring> windowsEnvironment(const wchar_t* name) {
  wchar_t* value = nullptr;
  size_t length = 0;
  const auto error = _wdupenv_s(&value, &length, name);
  std::unique_ptr<wchar_t, decltype(&std::free)> owned(value, &std::free);
  if (error != 0) throw std::runtime_error("Cannot read Windows environment");
  if (!owned) return std::nullopt;
  return std::wstring(owned.get());
}
}  // namespace rayna
#endif
