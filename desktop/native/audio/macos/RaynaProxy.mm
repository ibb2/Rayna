#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#include "../proxy/StreamProxy.h"
#include <memory>

@interface RaynaProxy : NSObject <RCTBridgeModule>
@end
@implementation RaynaProxy {
  std::unique_ptr<rayna::StreamProxy> _proxy;
  dispatch_queue_t _queue;
}
RCT_EXPORT_MODULE(RaynaProxy)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) _queue = dispatch_queue_create("com.ib.rayna.proxy", DISPATCH_QUEUE_SERIAL);
  return self;
}
- (dispatch_queue_t)methodQueue { return _queue; }
RCT_EXPORT_METHOD(registerUrl:(NSString *)url resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    if (!_proxy) _proxy = std::make_unique<rayna::StreamProxy>();
    const auto value = _proxy->registerUrl(url.UTF8String);
    resolve([NSString stringWithUTF8String:value.c_str()]);
  } catch (const std::exception& error) { reject(@"E_PROXY", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { _proxy.reset(); resolve(nil); }
  catch (const std::exception& error) { reject(@"E_PROXY", [NSString stringWithUTF8String:error.what()], nil); }
}
@end
