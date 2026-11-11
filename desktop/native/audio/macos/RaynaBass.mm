#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#include "../BassEngine.h"
#include <memory>
#include <stdexcept>

@interface RaynaBass : NSObject <RCTBridgeModule>
@end

@implementation RaynaBass {
  std::unique_ptr<rayna::BassEngine> _engine;
  dispatch_queue_t _queue;
}

RCT_EXPORT_MODULE(RaynaBass)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if ((self = [super init])) {
    _engine = std::make_unique<rayna::BassEngine>();
    _queue = dispatch_queue_create("com.ib.rayna.bass", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (dispatch_queue_t)methodQueue { return _queue; }

#define RAYNA_CATCH catch (const std::exception& error) { reject(@"E_BASS", [NSString stringWithUTF8String:error.what()], nil); }

RCT_EXPORT_METHOD(initialize:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    NSString *directory = NSBundle.mainBundle.resourcePath;
    if (!directory) throw std::runtime_error("The app resource directory is unavailable");
    _engine->initialize(directory.UTF8String);
    NSMutableArray *plugins = [NSMutableArray array];
    for (const auto& plugin : _engine->plugins()) {
      [plugins addObject:@{ @"name": [NSString stringWithUTF8String:plugin.name.c_str()], @"loaded": @(plugin.loaded), @"error": @(plugin.error) }];
    }
    resolve(@{ @"version": @(_engine->version()), @"plugins": plugins });
  } RAYNA_CATCH
}

RCT_EXPORT_METHOD(openFile:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->openFile(path.UTF8String); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(openUrl:(NSString *)url resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->openUrl(url.UTF8String); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(play:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->play(); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(pause:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->pause(); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(seek:(double)position resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->seek(position); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(setVolume:(double)volume resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->setVolume(volume); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(status:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    const auto status = _engine->status();
    resolve(@{ @"playing": @(status.playing), @"stalled": @(status.stalled), @"stopped": @(status.stopped), @"position": @(status.position), @"duration": @(status.duration) });
  } RAYNA_CATCH
}
RCT_EXPORT_METHOD(close:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->close(); resolve(nil); } RAYNA_CATCH
}
RCT_EXPORT_METHOD(dispose:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _engine->shutdown(); resolve(nil); } RAYNA_CATCH
}

#undef RAYNA_CATCH
@end
