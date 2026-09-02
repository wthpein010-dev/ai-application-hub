#!/usr/bin/env bash
set -euo pipefail

runtime="${1:-}"
output_root="${2:-}"
profile="${3:-Workbench}"

case "${profile}:${runtime}" in
  Workbench:osx-arm64)
    archive_name="CodexThreadWorkbench-macOS-arm64.app.zip"
    ;;
  Workbench:osx-x64)
    archive_name="CodexThreadWorkbench-macOS-x64.app.zip"
    ;;
  ConfirmationBar:osx-arm64)
    archive_name="CodexConfirmationBar-macOS-arm64.app.zip"
    ;;
  ConfirmationBar:osx-x64)
    archive_name="CodexConfirmationBar-macOS-x64.app.zip"
    ;;
  *)
    echo "Usage: $0 <osx-arm64|osx-x64> [output-root] [Workbench|ConfirmationBar]" >&2
    exit 64
    ;;
esac

if [[ "${profile}" == "ConfirmationBar" ]]; then
  distribution_name="CodexConfirmationBar"
  display_name="Codex 待确认悬浮助手"
  bundle_identifier="dev.wthpein010.codex-confirmation-bar"
  readme_name="README.confirmation-bar.md"
  default_mode="confirmation-overlay"
else
  distribution_name="CodexThreadWorkbench"
  display_name="Codex 多线程工作台"
  bundle_identifier="dev.wthpein010.codex-thread-workbench"
  readme_name="README.md"
  default_mode="workbench"
fi

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
app_directory="${output_root}/${distribution_name}.app"
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
if [[ "${distribution_name}" != "CodexThreadWorkbench" ]]; then
  mv "${macos_directory}/CodexThreadWorkbench" "${macos_directory}/${distribution_name}"
fi
chmod +x "${macos_directory}/${distribution_name}"
cp "${repository_root}/${readme_name}" "${resources_directory}/README.md"
cat > "${resources_directory}/codex-launch-profile.json" <<PROFILE
{"defaultMode":"${default_mode}"}
PROFILE

cat > "${contents_directory}/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>${display_name}</string>
  <key>CFBundleExecutable</key>
  <string>${distribution_name}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundle_identifier}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${distribution_name}</string>
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
