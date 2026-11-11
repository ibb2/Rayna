#import <AppKit/AppKit.h>
#import <React/RCTViewManager.h>

@interface RaynaSidebar : NSVisualEffectView <NSTableViewDataSource, NSTableViewDelegate>
@property (nonatomic) BOOL dark;
@property (nonatomic, copy) RCTDirectEventBlock onSelect;
@property (nonatomic, copy) NSString *selectedPage;
@end

@implementation RaynaSidebar {
  NSTableView *_table;
  NSArray<NSDictionary<NSString *, NSString *> *> *_items;
  BOOL _updatingSelection;
}

- (instancetype)init {
  if ((self = [super init])) {
    self.material = NSVisualEffectMaterialSidebar;
    self.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    self.state = NSVisualEffectStateActive;
    _items = @[
      @{ @"id": @"home", @"title": @"Home", @"symbol": @"house" },
      @{ @"id": @"album", @"title": @"Albums", @"symbol": @"square.stack" },
      @{ @"id": @"track", @"title": @"Tracks", @"symbol": @"waveform" },
      @{ @"id": @"artist", @"title": @"Artists", @"symbol": @"music.mic" },
      @{ @"id": @"playlist", @"title": @"Playlists", @"symbol": @"music.note.list" },
      @{ @"id": @"downloads", @"title": @"Downloads", @"symbol": @"arrow.down.circle" },
      @{ @"id": @"search", @"title": @"Search", @"symbol": @"magnifyingglass" },
    ];
    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:self.bounds];
    scroll.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    scroll.drawsBackground = NO;
    scroll.hasVerticalScroller = YES;
    _table = [[NSTableView alloc] initWithFrame:scroll.bounds];
    _table.headerView = nil;
    _table.backgroundColor = NSColor.clearColor;
    _table.selectionHighlightStyle = NSTableViewSelectionHighlightStyleSourceList;
    _table.rowHeight = 32;
    _table.intercellSpacing = NSMakeSize(0, 3);
    _table.delegate = self;
    _table.dataSource = self;
    NSTableColumn *column = [[NSTableColumn alloc] initWithIdentifier:@"navigation"];
    column.width = 200;
    column.minWidth = 140;
    [_table addTableColumn:column];
    _table.columnAutoresizingStyle = NSTableViewUniformColumnAutoresizingStyle;
    scroll.documentView = _table;
    [self addSubview:scroll];
  }
  return self;
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView { return _items.count; }

- (NSView *)tableView:(NSTableView *)tableView viewForTableColumn:(NSTableColumn *)column row:(NSInteger)row {
  NSTableCellView *cell = [tableView makeViewWithIdentifier:@"item" owner:self];
  if (!cell) {
    cell = [[NSTableCellView alloc] initWithFrame:NSMakeRect(0, 0, 180, 32)];
    cell.identifier = @"item";
    NSImageView *icon = [[NSImageView alloc] initWithFrame:NSMakeRect(12, 7, 18, 18)];
    icon.imageScaling = NSImageScaleProportionallyDown;
    cell.imageView = icon;
    [cell addSubview:icon];
    NSTextField *label = [NSTextField labelWithString:@""];
    label.frame = NSMakeRect(38, 6, 132, 20);
    label.autoresizingMask = NSViewWidthSizable;
    label.font = [NSFont systemFontOfSize:13];
    cell.textField = label;
    [cell addSubview:label];
  }
  NSDictionary *item = _items[row];
  cell.textField.stringValue = item[@"title"];
  cell.imageView.image = [NSImage imageWithSystemSymbolName:item[@"symbol"] accessibilityDescription:item[@"title"]];
  return cell;
}

- (void)setSelectedPage:(NSString *)selectedPage {
  _selectedPage = [selectedPage copy];
  NSUInteger index = [_items indexOfObjectPassingTest:^BOOL(NSDictionary *item, NSUInteger idx, BOOL *stop) {
    return [item[@"id"] isEqualToString:selectedPage];
  }];
  _updatingSelection = YES;
  if (index == NSNotFound) [_table deselectAll:nil];
  else [_table selectRowIndexes:[NSIndexSet indexSetWithIndex:index] byExtendingSelection:NO];
  _updatingSelection = NO;
}

- (void)tableViewSelectionDidChange:(NSNotification *)notification {
  NSInteger row = _table.selectedRow;
  if (!_updatingSelection && row >= 0 && row < (NSInteger)_items.count && self.onSelect)
    self.onSelect(@{ @"page": _items[row][@"id"] });
}
- (void)setDark:(BOOL)dark {
  _dark = dark;
  self.appearance = [NSAppearance appearanceNamed:dark ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua];
}
@end

@interface RaynaSidebarManager : RCTViewManager
@end
@implementation RaynaSidebarManager
RCT_EXPORT_MODULE(RaynaSidebar)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (NSView *)view { return [RaynaSidebar new]; }
RCT_EXPORT_VIEW_PROPERTY(selectedPage, NSString)
RCT_EXPORT_VIEW_PROPERTY(onSelect, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(dark, BOOL)
@end
