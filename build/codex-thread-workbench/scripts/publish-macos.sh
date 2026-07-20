#!/usr/bin/env bash
set -euo pipefail

runtime="${1:-}"
output_root="${2:-}"

case "${runtime}" in
  osx-arm64)
    archive_name="CodexThreadWorkbench-macOS-arm64.app.zip"
    ;;
  osx-x64)
    archive_name="CodexThreadWorkbench-macOS-x64.app.zip"
    ;;
  *)
    echo "Usage: $0 <osx-arm64|osx-x64> [output-root]" >&2
    exit 64
    ;;
esac

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${output_root}" ]]; then
  output_root="${repository_root}/artifacts/release"
fi

project="${repository_root}/src/CodexThreadWorkbench/CodexThreadWorkbench.csproj"
publish_directory="${output_root}/publish-${runtime}"
app_directory="${output_root}/CodexThreadWorkbench.app"
contents_directory="${app_directory}/Contents"
macos_directory="${contents_directory}/MacOS"
resources_directory="${contents_directory}/Resources"
archive_path="${output_root}/${archive_name}"

rm -rf "${publish_directory}" "${app_directory}"
rm -f "${archive_path}"
mkdir -p "${publish_directory}" "${macos_directory}" "${resources_directory}"

dotnet publish "${project}" \
  --configuration Release \
  --runtime "${runtime}" \
  --self-contained true \
  --output "${publish_directory}" \
  -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true \
  -p:DebugType=None \
  -p:DebugSymbols=false

test -s "${publish_directory}/CodexThreadWorkbench"
cp -R "${publish_directory}/." "${macos_directory}/"
chmod +x "${macos_directory}/CodexThreadWorkbench"
cp "${repository_root}/README.md" "${resources_directory}/README.md"

cat > "${contents_directory}/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Codex 多会话工作台</string>
  <key>CFBundleExecutable</key>
  <string>CodexThreadWorkbench</string>
  <key>CFBundleIdentifier</key>
  <string>dev.wthpein010.codex-thread-workbench</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>CodexThreadWorkbench</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.1.0</string>
  <key>CFBundleVersion</key>
  <string>1.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

codesign --force --deep --sign - "${app_directory}"
ditto -c -k --sequesterRsrc --keepParent "${app_directory}" "${archive_path}"
test -s "${archive_path}"

echo "macOS package: ${archive_path}"
