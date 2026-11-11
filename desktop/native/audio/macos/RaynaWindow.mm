#import <AppKit/AppKit.h>
#import <React/RCTBridgeModule.h>

@interface RaynaWindow : NSObject <RCTBridgeModule>
@end
@implementation RaynaWindow
RCT_EXPORT_MODULE(RaynaWindow)
+ (BOOL)requiresMainQueueSetup { return YES; }
RCT_EXPORT_METHOD(showMainWindow) {
  dispatch_async(dispatch_get_main_queue(), ^{
    for (NSWindow *window in NSApp.windows) {
      if ([window.identifier isEqualToString:@"com_apple_SwiftUI_Settings_window"]) [window close];
    }
    for (NSWindow *window in NSApp.windows) {
      if ([window.identifier isEqualToString:@"main"] || [window.title isEqualToString:@"Rayna"]) {
        if (window.miniaturized) [window deminiaturize:nil];
        [window makeKeyAndOrderFront:nil];
        break;
      }
    }
  });
}
@end
