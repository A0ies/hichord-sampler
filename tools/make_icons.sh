#!/bin/sh
# Usage: sh tools/make_icons.sh   (from the repo root; macOS: qlmanage renders the SVG, sips resizes)
# Makes every app icon from icons/icon.svg ("Layers": four takes on a timeline, a playhead):
#   icons/icon-1024.png        square, no transparency (iOS rounds the corners itself)
#   icons/apple-touch-icon.png 180 px, square, no transparency (home screen web clip)
#   icons/favicon-32.png       32 px, rounded (the browser tab, next to icons/icon.svg)
#   ios/HiChordSampler/Assets.xcassets/AppIcon.appiconset/icon-1024.png
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
# the square version: the same drawing without the rounded corners
sed 's/rx="22" //' icons/icon.svg > "$T/square.svg"
qlmanage -t -s 1024 -o "$T" "$T/square.svg" >/dev/null 2>&1
qlmanage -t -s 1024 -o "$T" icons/icon.svg >/dev/null 2>&1
# no alpha channel for iOS: through a full-quality JPEG and back
sips -s format jpeg -s formatOptions 100 "$T/square.svg.png" --out "$T/square.jpg" >/dev/null
sips -s format png "$T/square.jpg" --out icons/icon-1024.png >/dev/null
sips -z 180 180 icons/icon-1024.png --out icons/apple-touch-icon.png >/dev/null
sips -z 32 32 "$T/icon.svg.png" --out icons/favicon-32.png >/dev/null
A=ios/HiChordSampler/Assets.xcassets/AppIcon.appiconset
mkdir -p "$A"
cp icons/icon-1024.png "$A/icon-1024.png"
cat > ios/HiChordSampler/Assets.xcassets/Contents.json <<'J'
{ "info" : { "author" : "xcode", "version" : 1 } }
J
cat > "$A/Contents.json" <<'J'
{
  "images" : [ { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" } ],
  "info" : { "author" : "xcode", "version" : 1 }
}
J
rm -rf "$T"
for f in icons/icon-1024.png icons/apple-touch-icon.png icons/favicon-32.png; do
  echo "$f $(sips -g pixelWidth -g hasAlpha "$f" | tail -2 | awk '{print $2}' | tr '\n' ' ')"
done
