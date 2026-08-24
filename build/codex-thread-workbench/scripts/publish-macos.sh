#!/usr/bin/env bash
set -euo pipefail

runtime="${1:-}"
output_root="${2:-}"

case "${runtime}" in
  osx-arm64)
    archive_name="CodexConfirmationBar-macOS-arm64.app.zip"
    ;;
  osx-x64)
    archive_name="CodexConfirmationBar-macOS-x64.app.zip"
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
project_version_lines="$(
  sed -nE \
    's/^[[:space:]]*<Version>[[:space:]]*([^<[:space:]]+)[[:space:]]*<\/Version>[[:space:]]*$/\1/p' \
    "${project}"
)"
project_version_count="$(
  printf '%s\n' "${project_version_lines}" |
    awk 'NF { count += 1 } END { print count + 0 }'
)"
if [[ "${project_version_count}" != "1" ]]; then
  echo "Expected exactly one non-empty <Version> in ${project}." >&2
  exit 65
fi
project_version="${project_version_lines}"
if [[ -z "${project_version}" || ! "${project_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid project version '${project_version}'. Expected major.minor.patch." >&2
  exit 65
fi

publish_directory="${output_root}/publish-${runtime}"
app_directory="${output_root}/CodexConfirmationBar.app"
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

test -s "${publish_directory}/CodexConfirmationBar"
cp -R "${publish_directory}/." "${macos_directory}/"
chmod +x "${macos_directory}/CodexConfirmationBar"
cp "${repository_root}/README.md" "${resources_directory}/README.md"

cat > "${contents_directory}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Codex 待确认悬浮助手</string>
  <key>CFBundleExecutable</key>
  <string>CodexConfirmationBar</string>
  <key>CFBundleIdentifier</key>
  <string>dev.wthpein010.codex-confirmation-bar</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>CodexConfirmationBar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${project_version}</string>
  <key>CFBundleVersion</key>
  <string>${project_version}</string>
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
