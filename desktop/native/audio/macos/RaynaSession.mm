#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#include "../session/SessionFile.h"
#include <memory>

@interface RaynaSession : NSObject <RCTBridgeModule>
@end

@implementation RaynaSession {
  std::unique_ptr<rayna::SessionFile> _session;
  dispatch_queue_t _queue;
}
RCT_EXPORT_MODULE(RaynaSession)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) _queue = dispatch_queue_create("com.ib.rayna.session", DISPATCH_QUEUE_SERIAL);
  return self;
}
- (dispatch_queue_t)methodQueue { return _queue; }
- (rayna::SessionFile *)session {
  if (!_session) _session = std::make_unique<rayna::SessionFile>(rayna::SessionFile::legacyDirectory());
  return _session.get();
}
RCT_EXPORT_METHOD(read:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    const auto value = [self session]->read();
    resolve(value ? [NSString stringWithUTF8String:value->c_str()] : nil);
  } catch (const std::exception& error) { reject(@"E_SESSION", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(write:(NSString *)json resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    [self session]->write(json.UTF8String);
    resolve(nil);
  } catch (const std::exception& error) { reject(@"E_SESSION", [NSString stringWithUTF8String:error.what()], nil); }
}
@end
