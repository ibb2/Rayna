#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'A macOS machine with Xcode is required to build rayna-dev.\n' >&2
  exit 1
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
architecture="${RAYNA_BUILD_ARCH:-$(uname -m)}"
case "$architecture" in
  arm64|x86_64) ;;
  *) printf 'Unsupported macOS architecture: %s\n' "$architecture" >&2; exit 1 ;;
esac

output_dir="${RAYNA_DMG_OUTPUT_DIR:-$project_dir/dist}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/rayna-dev.XXXXXXXX")"
trap 'rm -rf "$temporary_dir"' EXIT

xcodebuild \
  -quiet \
  -workspace "$project_dir/macos/Rayna.xcworkspace" \
  -scheme Rayna-macOS \
  -configuration Release \
  -destination 'platform=macOS' \
  -derivedDataPath "$temporary_dir/build" \
  "ARCHS=$architecture" ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO \
  build

product="$temporary_dir/build/Build/Products/Release/Rayna.app"
test -d "$product"
test -f "$product/Contents/Resources/main.jsbundle"
for library in libbass.dylib libbassflac.dylib libbasshls.dylib libbassopus.dylib; do
  test -f "$product/Contents/Resources/$library"
  lipo "$product/Contents/Resources/$library" -verify_arch "$architecture"
done
lipo "$product/Contents/MacOS/Rayna" -verify_arch "$architecture"

stage="$temporary_dir/image"
mkdir -p "$stage"
app="$stage/rayna-dev.app"
ditto "$product" "$app"
plist="$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName rayna-dev' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName rayna-dev' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier com.ib.rayna.desktop.dev' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 com.ib.rayna.desktop.dev' "$plist"

# An ad-hoc signature supports local testing but does not notarize the app.
codesign --force --deep --sign - --timestamp=none \
  --entitlements "$project_dir/macos/Rayna-macOS/Rayna.entitlements" "$app"
codesign --verify --deep --strict "$app"
ln -s /Applications "$stage/Applications"

image="$output_dir/rayna-dev-$architecture.dmg"
hdiutil create -volname rayna-dev -srcfolder "$stage" -format UDZO -ov "$image"
hdiutil verify "$image"
shasum -a 256 "$image" > "$image.sha256"
printf 'Created %s\n' "$image"
