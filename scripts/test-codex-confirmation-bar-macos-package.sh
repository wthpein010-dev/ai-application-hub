#!/usr/bin/env bash
set -euo pipefail

archive_path="${1:-}"
runtime="${2:-}"
[[ -f "${archive_path}" ]] || { echo "Archive not found: ${archive_path}" >&2; exit 66; }
case "${runtime}" in
  osx-arm64) expected_architecture="arm64" ;;
  osx-x64) expected_architecture="x86_64" ;;
  *) echo "Runtime must be osx-arm64 or osx-x64." >&2; exit 64 ;;
esac

temporary_directory="$(mktemp -d)"
app_pid=""
cleanup() {
  if [[ -n "${app_pid}" ]] && kill -0 "${app_pid}" 2>/dev/null; then
    kill "${app_pid}" || true
    wait "${app_pid}" 2>/dev/null || true
  fi
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

ditto -x -k "${archive_path}" "${temporary_directory}"
app_directory="${temporary_directory}/CodexConfirmationBar.app"
executable="${app_directory}/Contents/MacOS/CodexConfirmationBar"
info_plist="${app_directory}/Contents/Info.plist"
launch_profile="${app_directory}/Contents/Resources/codex-launch-profile.json"
test -f "${info_plist}"
test -x "${executable}"
test -f "${launch_profile}"

[[ "$(plutil -extract CFBundleShortVersionString raw -o - "${info_plist}")" == "2.3.3" ]]
[[ "$(plutil -extract CFBundleVersion raw -o - "${info_plist}")" == "2.3.3" ]]
[[ "$(plutil -extract CFBundleIdentifier raw -o - "${info_plist}")" == "dev.wthpein010.codex-confirmation-bar" ]]
[[ "$(plutil -extract CFBundleDisplayName raw -o - "${info_plist}")" == "Codex 待确认悬浮助手" ]]
grep -Fq '"defaultMode":"confirmation-overlay"' "${launch_profile}"
file "${executable}" | grep -q "${expected_architecture}"
codesign --verify --deep --strict "${app_directory}"
"${executable}" --smoke-test
"${executable}" >"${temporary_directory}/launch.log" 2>&1 &
app_pid=$!
sleep 5
kill -0 "${app_pid}"
kill "${app_pid}"
wait "${app_pid}" 2>/dev/null || true
app_pid=""
echo "Verified legacy Confirmation Bar ${runtime} package: ${archive_path}"
