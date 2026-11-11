#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#include "../session/SessionFile.h"
#include "../sqlite/Database.h"
#include <memory>

@interface RaynaDatabase : NSObject <RCTBridgeModule>
@end
@implementation RaynaDatabase {
  std::unique_ptr<rayna::Database> _database;
  dispatch_queue_t _queue;
}
RCT_EXPORT_MODULE(RaynaDatabase)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) _queue = dispatch_queue_create("com.ib.rayna.database", DISPATCH_QUEUE_SERIAL);
  return self;
}
- (dispatch_queue_t)methodQueue { return _queue; }
- (rayna::Database *)database {
  if (!_database) _database = std::make_unique<rayna::Database>(rayna::SessionFile::legacyDirectory());
  return _database.get();
}
RCT_EXPORT_METHOD(open:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { resolve(@{ @"migrated": @([self database]->open()) }); }
  catch (const std::exception& error) { reject(@"E_DATABASE", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(execute:(NSString *)sql arguments:(NSString *)arguments resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try {
    const auto result = [self database]->execute(sql.UTF8String, arguments.UTF8String);
    resolve([NSString stringWithUTF8String:result.c_str()]);
  } catch (const std::exception& error) { reject(@"E_DATABASE", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(close:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { if (_database) _database->close(); resolve(nil); }
  catch (const std::exception& error) { reject(@"E_DATABASE", [NSString stringWithUTF8String:error.what()], nil); }
}
RCT_EXPORT_METHOD(transaction:(NSString *)statements resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  try { [self database]->transaction(statements.UTF8String); resolve(nil); }
  catch (const std::exception& error) { reject(@"E_DATABASE", [NSString stringWithUTF8String:error.what()], nil); }
}
@end
