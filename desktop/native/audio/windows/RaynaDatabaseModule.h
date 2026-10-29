#pragma once
#include "NativeModules.h"
#include "../session/SessionFile.h"
#include "../sqlite/Database.h"
#include <memory>

namespace rayna::windows {
using namespace winrt::Microsoft::ReactNative;
REACT_MODULE(RaynaDatabase, L"RaynaDatabase")
struct RaynaDatabase {
  std::unique_ptr<rayna::Database> database;
  rayna::Database& getDatabase() {
    if (!database) database = std::make_unique<rayna::Database>(rayna::SessionFile::legacyDirectory());
    return *database;
  }
  REACT_METHOD(open)
  void open(ReactPromise<JSValue>&& result) noexcept {
    try { result.Resolve(JSValueObject{{"migrated", getDatabase().open()}}); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(execute)
  void execute(std::string sql, std::string arguments, ReactPromise<std::string>&& result) noexcept {
    try { result.Resolve(getDatabase().execute(sql, arguments)); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(close)
  void close(ReactPromise<void>&& result) noexcept {
    try { if (database) database->close(); result.Resolve(); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(transaction)
  void transaction(std::string statements, ReactPromise<void>&& result) noexcept {
    try { getDatabase().transaction(statements); result.Resolve(); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
};
}  // namespace rayna::windows
