#pragma once
#include "NativeModules.h"
#include "../transfer/Transfer.h"
#include <memory>
#include <thread>

namespace rayna::windows {
using namespace winrt::Microsoft::ReactNative;
REACT_MODULE(RaynaTransfer, L"RaynaTransfer")
struct RaynaTransfer {
  std::shared_ptr<rayna::Transfer> transfer = std::make_shared<rayna::Transfer>();
  REACT_METHOD(defaultDirectory)
  void defaultDirectory(ReactPromise<std::string>&& result) noexcept {
    try { result.Resolve(rayna::Transfer::defaultDirectory()); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(paths)
  void paths(std::string directory, std::string server, std::string id, std::string title, std::string extension, ReactPromise<JSValue>&& result) noexcept {
    try {
      const auto value = rayna::Transfer::paths(directory, server, id, title, extension);
      result.Resolve(JSValueObject{{"file", value.file}, {"partial", value.partial}});
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(legacyArtworkDirectory)
  void legacyArtworkDirectory(ReactPromise<std::string>&& result) noexcept {
    try { result.Resolve(rayna::Transfer::legacyArtworkDirectory()); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(size)
  void size(std::string path, ReactPromise<double>&& result) noexcept {
    try { result.Resolve(rayna::Transfer::size(path)); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(download)
  void download(std::string id, std::string url, std::string directory, std::string partial, std::string destination, double maximumBytes, ReactPromise<double>&& result) noexcept {
    try {
      const auto current = transfer;
      std::thread([current, id = std::move(id), url = std::move(url), directory = std::move(directory), partial = std::move(partial), destination = std::move(destination), maximumBytes, result = std::move(result)]() {
        try { result.Resolve(current->download(id, url, directory, partial, destination, maximumBytes)); }
        catch (const std::exception& error) { result.Reject(error.what()); }
      }).detach();
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(remove)
  void remove(std::string directory, std::string path, ReactPromise<void>&& result) noexcept {
    try { rayna::Transfer::remove(directory, path); result.Resolve(); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(prepareDirectory)
  void prepareDirectory(std::string directory, ReactPromise<std::string>&& result) noexcept {
    try { result.Resolve(rayna::Transfer::prepareDirectory(directory)); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(rebase)
  void rebase(std::string oldDirectory, std::string newDirectory, std::string path, ReactPromise<JSValue>&& result) noexcept {
    try {
      const auto value = rayna::Transfer::rebase(oldDirectory, newDirectory, path);
      result.Resolve(value ? JSValue(*value) : JSValue(nullptr));
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(copyForMove)
  void copyForMove(std::string oldDirectory, std::string newDirectory, std::string source, std::string destination, ReactPromise<bool>&& result) noexcept {
    try {
      std::thread([oldDirectory = std::move(oldDirectory), newDirectory = std::move(newDirectory), source = std::move(source), destination = std::move(destination), result = std::move(result)]() {
        try { result.Resolve(rayna::Transfer::copyForMove(oldDirectory, newDirectory, source, destination)); }
        catch (const std::exception& error) { result.Reject(error.what()); }
      }).detach();
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(removeIfSame)
  void removeIfSame(std::string oldDirectory, std::string newDirectory, std::string source, std::string destination, ReactPromise<bool>&& result) noexcept {
    try {
      std::thread([oldDirectory = std::move(oldDirectory), newDirectory = std::move(newDirectory), source = std::move(source), destination = std::move(destination), result = std::move(result)]() {
        try { result.Resolve(rayna::Transfer::removeIfSame(oldDirectory, newDirectory, source, destination)); }
        catch (const std::exception& error) { result.Reject(error.what()); }
      }).detach();
    } catch (const std::exception& error) { result.Reject(error.what()); }
  }
  REACT_METHOD(cancel)
  void cancel(std::string id, ReactPromise<bool>&& result) noexcept {
    try { result.Resolve(transfer->cancel(id)); }
    catch (const std::exception& error) { result.Reject(error.what()); }
  }
};
}  // namespace rayna::windows
