#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#include "../transfer/Transfer.h"
#include <memory>

@interface RaynaTransfer : NSObject <RCTBridgeModule>
@end

@implementation RaynaTransfer {
  std::shared_ptr<rayna::Transfer> _transfer;
  dispatch_queue_t _queue;
}
RCT_EXPORT_MODULE(RaynaTransfer)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) {
    _transfer = std::make_shared<rayna::Transfer>();
    _queue = dispatch_queue_create("com.ib.rayna.transfer", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}
- (dispatch_queue_t)methodQueue { return _queue; }

RCT_EXPORT_METHOD(defaultDirectory:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { const auto value = rayna::Transfer::defaultDirectory(); resolve([NSString stringWithUTF8String:value.c_str()]); }
  catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(legacyArtworkDirectory:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { const auto value = rayna::Transfer::legacyArtworkDirectory(); resolve([NSString stringWithUTF8String:value.c_str()]); }
  catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(paths:(NSString *)directory server:(NSString *)server identifier:(NSString *)identifier title:(NSString *)title extension:(NSString *)extension resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    const auto value = rayna::Transfer::paths(directory.UTF8String, server.UTF8String, identifier.UTF8String, title.UTF8String, extension.UTF8String);
    resolve(@{ @"file": [NSString stringWithUTF8String:value.file.c_str()], @"partial": [NSString stringWithUTF8String:value.partial.c_str()] });
  } catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(size:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { resolve(@(rayna::Transfer::size(path.UTF8String))); }
  catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(remove:(NSString *)directory path:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { rayna::Transfer::remove(directory.UTF8String, path.UTF8String); resolve(nil); }
  catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(prepareDirectory:(NSString *)directory resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { const auto path = rayna::Transfer::prepareDirectory(directory.UTF8String); resolve([NSString stringWithUTF8String:path.c_str()]); }
  catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(rebase:(NSString *)oldDirectory newDirectory:(NSString *)newDirectory path:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    const auto result = rayna::Transfer::rebase(oldDirectory.UTF8String, newDirectory.UTF8String, path.UTF8String);
    resolve(result ? [NSString stringWithUTF8String:result->c_str()] : nil);
  } catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(copyForMove:(NSString *)oldDirectory newDirectory:(NSString *)newDirectory source:(NSString *)source destination:(NSString *)destination resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  const std::string oldRoot = oldDirectory.UTF8String, newRoot = newDirectory.UTF8String, from = source.UTF8String, to = destination.UTF8String;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    try { resolve(@(rayna::Transfer::copyForMove(oldRoot, newRoot, from, to))); }
    catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
  });
}
RCT_EXPORT_METHOD(removeIfSame:(NSString *)oldDirectory newDirectory:(NSString *)newDirectory source:(NSString *)source destination:(NSString *)destination resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  const std::string oldRoot = oldDirectory.UTF8String, newRoot = newDirectory.UTF8String, from = source.UTF8String, to = destination.UTF8String;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    try { resolve(@(rayna::Transfer::removeIfSame(oldRoot, newRoot, from, to))); }
    catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
  });
}
RCT_EXPORT_METHOD(download:(NSString *)identifier url:(NSString *)url directory:(NSString *)directory partial:(NSString *)partial destination:(NSString *)destination maximumBytes:(double)maximumBytes resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  const auto transfer = _transfer;
  const std::string job = identifier.UTF8String, target = url.UTF8String, root = directory.UTF8String, temp = partial.UTF8String, file = destination.UTF8String;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    try { resolve(@(transfer->download(job, target, root, temp, file, maximumBytes))); }
    catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
  });
}
RCT_EXPORT_METHOD(cancel:(NSString *)identifier resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { resolve(@(_transfer->cancel(identifier.UTF8String))); }
  catch (const std::exception& error) { reject(@"E_TRANSFER", [NSString stringWithUTF8String:error.what()], nil); }
}
@end
