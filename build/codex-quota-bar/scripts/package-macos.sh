#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
project_path="$repository_root/src/CodexQuotaBar.App/CodexQuotaBar.App.csproj"
build_root="$repository_root/artifacts/package/macos"
publish_root="$repository_root/artifacts/publish"
package_root="$build_root/CodexQuotaBar-macOS"
output_dir="$repository_root/dist/macos"
archive_path="$output_dir/CodexQuotaBar-macOS.zip"

case "$build_root" in "$repository_root"/*) ;; *) echo "Unsafe build path" >&2; exit 1 ;; esac
case "$publish_root" in "$repository_root"/*) ;; *) echo "Unsafe publish path" >&2; exit 1 ;; esac
case "$output_dir" in "$repository_root"/*) ;; *) echo "Unsafe output path" >&2; exit 1 ;; esac

architectures="${CODEX_QUOTA_ARCHITECTURES:-arm64 x64}"

rm -rf "$build_root"
mkdir -p "$package_root" "$output_dir"
rm -f "$archive_path"

for architecture in $architectures; do
  case "$architecture" in
    arm64|x64) ;;
    *) echo "Unsupported macOS architecture: $architecture" >&2; exit 1 ;;
  esac

  runtime="osx-$architecture"
  publish_dir="$publish_root/$runtime"
  app_root="$package_root/$architecture/CodexQuotaBar.app"
  contents="$app_root/Contents"

  rm -rf "$publish_dir"

  dotnet publish "$project_path" \
    --configuration Release \
    --runtime "$runtime" \
    --self-contained true \
    --output "$publish_dir" \
    -p:PublishSingleFile=true \
    -p:IncludeNativeLibrariesForSelfExtract=false \
    -p:DebugType=None \
    -p:DebugSymbols=false

  mkdir -p "$contents/MacOS" "$contents/Resources"
  cp -R "$publish_dir/." "$contents/MacOS/"
  chmod +x "$contents/MacOS/CodexQuotaBar"

  for library in \
    libAvaloniaNative.dylib \
    libHarfBuzzSharp.dylib \
    libSkiaSharp.dylib; do
    library_path="$contents/MacOS/$library"
    test -f "$library_path"
    chmod +x "$library_path"
    test -x "$library_path"
  done

  cat > "$contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Codex Quota Bar</string>
  <key>CFBundleExecutable</key>
  <string>CodexQuotaBar</string>
  <key>CFBundleIdentifier</key>
  <string>com.codexquotabar.app</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>CodexQuotaBar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST
done

cp "$repository_root/README.md" "$package_root/README-zh-CN.md"

if command -v ditto >/dev/null 2>&1; then
  (cd "$build_root" && ditto -c -k --sequesterRsrc --keepParent "CodexQuotaBar-macOS" "$archive_path")
elif command -v zip >/dev/null 2>&1; then
  (cd "$build_root" && zip -qry "$archive_path" "CodexQuotaBar-macOS")
else
  echo "Neither ditto nor zip is available." >&2
  exit 1
fi

echo "Created macOS package: $archive_path"
