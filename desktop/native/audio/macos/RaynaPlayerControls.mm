#import <AppKit/AppKit.h>
#import <React/RCTViewManager.h>

@interface RaynaPlayerControls : NSView
@property (nonatomic) BOOL dark;
@property (nonatomic, copy) RCTDirectEventBlock onCommand;
@property (nonatomic) BOOL playing;
@property (nonatomic) BOOL hasTrack;
@property (nonatomic) double position;
@property (nonatomic) double duration;
@property (nonatomic) double volume;
@end

@implementation RaynaPlayerControls {
  NSButton *_previous, *_play, *_next, *_lyrics, *_queue, *_mute;
  NSSlider *_seek, *_volumeSlider;
  NSTextField *_elapsed, *_remaining;
  __weak NSView *_controls;
  NSView *_glass;
}

- (NSButton *)button:(NSString *)symbol label:(NSString *)label action:(SEL)action {
  NSButton *button = [NSButton buttonWithImage:[NSImage imageWithSystemSymbolName:symbol accessibilityDescription:label] target:self action:action];
  button.bezelStyle = NSBezelStyleTexturedRounded;
  button.bordered = NO;
  button.toolTip = label;
  [button setAccessibilityLabel:label];
  [_controls addSubview:button];
  return button;
}
- (NSTextField *)timeLabel {
  NSTextField *label = [NSTextField labelWithString:@"0:00"];
  label.font = [NSFont monospacedDigitSystemFontOfSize:11 weight:NSFontWeightRegular];
  label.textColor = NSColor.secondaryLabelColor;
  [_controls addSubview:label];
  return label;
}
- (instancetype)init {
  if ((self = [super init])) {
    _controls = self;
#if __MAC_OS_X_VERSION_MAX_ALLOWED >= 260000
    if (@available(macOS 26.0, *)) {
      NSGlassEffectView *glass = [NSGlassEffectView new];
      glass.cornerRadius = 16;
      glass.style = NSGlassEffectViewStyleRegular;
      NSView *content = [NSView new];
      glass.contentView = content;
      _controls = content;
      _glass = glass;
      [self addSubview:glass];
    }
#endif
    _previous = [self button:@"backward.end.fill" label:@"Previous" action:@selector(previous:)];
    _play = [self button:@"play.fill" label:@"Play" action:@selector(togglePlayback:)];
    _next = [self button:@"forward.end.fill" label:@"Next" action:@selector(next:)];
    _lyrics = [self button:@"mic" label:@"Lyrics" action:@selector(lyrics:)];
    _queue = [self button:@"list.bullet" label:@"Queue" action:@selector(queue:)];
    _mute = [self button:@"speaker.wave.2" label:@"Mute" action:@selector(mute:)];
    _seek = [NSSlider sliderWithValue:0 minValue:0 maxValue:1 target:self action:@selector(seek:)];
    _seek.continuous = NO;
    [_seek setAccessibilityLabel:@"Playback position"];
    [_controls addSubview:_seek];
    _volumeSlider = [NSSlider sliderWithValue:1 minValue:0 maxValue:1 target:self action:@selector(changeVolume:)];
    [_volumeSlider setAccessibilityLabel:@"Volume"];
    [_controls addSubview:_volumeSlider];
    _elapsed = [self timeLabel];
    _remaining = [self timeLabel];
  }
  return self;
}
- (void)layout {
  [super layout];
  if (_glass) {
    _glass.frame = NSInsetRect(self.bounds, 4, 4);
    _controls.frame = _glass.bounds;
  }
  CGFloat width = _controls.bounds.size.width, center = MAX(120, (width - 170) / 2);
  CGFloat inset = _glass ? 4 : 0;
  _previous.frame = NSMakeRect(center - 48, 36 - inset, 30, 26);
  _play.frame = NSMakeRect(center - 15, 36 - inset, 30, 26);
  _next.frame = NSMakeRect(center + 18, 36 - inset, 30, 26);
  CGFloat seekWidth = MAX(80, MIN(330, width - 240));
  CGFloat seekX = center - seekWidth / 2;
  _seek.frame = NSMakeRect(seekX, 9 - inset, seekWidth, 20);
  _elapsed.frame = NSMakeRect(seekX - 38, 11 - inset, 36, 16);
  _remaining.frame = NSMakeRect(seekX + seekWidth + 4, 11 - inset, 36, 16);
  _lyrics.frame = NSMakeRect(width - 170, 25 - inset, 28, 26);
  _queue.frame = NSMakeRect(width - 140, 25 - inset, 28, 26);
  _mute.frame = NSMakeRect(width - 110, 25 - inset, 28, 26);
  _volumeSlider.frame = NSMakeRect(width - 80, 28 - inset, 76, 20);
}
- (NSString *)time:(double)seconds {
  NSInteger value = MAX(0, (NSInteger)seconds);
  return [NSString stringWithFormat:@"%ld:%02ld", (long)(value / 60), (long)(value % 60)];
}
- (void)setPlaying:(BOOL)playing {
  _playing = playing;
  NSString *label = playing ? @"Pause" : @"Play";
  _play.image = [NSImage imageWithSystemSymbolName:playing ? @"pause.fill" : @"play.fill" accessibilityDescription:label];
  _play.toolTip = label;
  [_play setAccessibilityLabel:label];
}
- (void)setHasTrack:(BOOL)hasTrack { _hasTrack = hasTrack; _seek.enabled = hasTrack && _duration > 0; }
- (void)setPosition:(double)position { _position = position; _seek.doubleValue = position; _elapsed.stringValue = [self time:position]; }
- (void)setDuration:(double)duration { _duration = duration; _seek.maxValue = MAX(duration, 1); _seek.enabled = _hasTrack && duration > 0; _remaining.stringValue = [self time:duration]; }
- (void)setVolume:(double)volume { _volume = volume; _volumeSlider.doubleValue = volume; _mute.image = [NSImage imageWithSystemSymbolName:volume == 0 ? @"speaker.slash" : @"speaker.wave.2" accessibilityDescription:volume == 0 ? @"Unmute" : @"Mute"]; [_mute setAccessibilityLabel:volume == 0 ? @"Unmute" : @"Mute"]; }
- (void)send:(NSString *)action value:(double)value { if (self.onCommand) self.onCommand(@{ @"action": action, @"value": @(value) }); }
- (void)previous:(id)sender { [self send:@"previous" value:0]; }
- (void)togglePlayback:(id)sender { [self send:@"toggle" value:0]; }
- (void)next:(id)sender { [self send:@"next" value:0]; }
- (void)lyrics:(id)sender { [self send:@"lyrics" value:0]; }
- (void)queue:(id)sender { [self send:@"queue" value:0]; }
- (void)mute:(id)sender { [self send:@"mute" value:0]; }
- (void)seek:(NSSlider *)sender { [self send:@"seek" value:sender.doubleValue]; }
- (void)changeVolume:(NSSlider *)sender { [self send:@"volume" value:sender.doubleValue]; }
- (void)setDark:(BOOL)dark {
  _dark = dark;
  self.appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
}
@end

@interface RaynaPlayerControlsManager : RCTViewManager
@end
@implementation RaynaPlayerControlsManager
RCT_EXPORT_MODULE(RaynaPlayerControls)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (NSView *)view { return [RaynaPlayerControls new]; }
RCT_EXPORT_VIEW_PROPERTY(playing, BOOL)
RCT_EXPORT_VIEW_PROPERTY(hasTrack, BOOL)
RCT_EXPORT_VIEW_PROPERTY(position, double)
RCT_EXPORT_VIEW_PROPERTY(duration, double)
RCT_EXPORT_VIEW_PROPERTY(volume, double)
RCT_EXPORT_VIEW_PROPERTY(onCommand, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(dark, BOOL)
@end
