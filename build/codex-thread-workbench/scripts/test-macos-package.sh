#!/usr/bin/env bash
set -euo pipefail

archive_path="${1:-}"
runtime="${2:-}"
profile="${3:-Workbench}"
if [[ ! -f "${archive_path}" ]]; then
  echo "Archive not found: ${archive_path}" >&2
  exit 66
fi

case "${profile}:${runtime}" in
  Workbench:osx-arm64)
    expected_architecture="arm64"
    app_name="CodexThreadWorkbench"
    executable_name="CodexThreadWorkbench"
    expected_bundle_identifier="dev.wthpein010.codex-thread-workbench"
    expected_display_name="Codex 多线程工作台"
    default_mode="workbench"
    ;;
  Workbench:osx-x64)
    expected_architecture="x86_64"
    app_name="CodexThreadWorkbench"
    executable_name="CodexThreadWorkbench"
    expected_bundle_identifier="dev.wthpein010.codex-thread-workbench"
    expected_display_name="Codex 多线程工作台"
    default_mode="workbench"
    ;;
  ConfirmationBar:osx-arm64)
    expected_architecture="arm64"
    app_name="CodexConfirmationBar"
    executable_name="CodexConfirmationBar"
    expected_bundle_identifier="dev.wthpein010.codex-confirmation-bar"
    expected_display_name="Codex 待确认悬浮助手"
    default_mode="confirmation-overlay"
    ;;
  ConfirmationBar:osx-x64)
    expected_architecture="x86_64"
    app_name="CodexConfirmationBar"
    executable_name="CodexConfirmationBar"
    expected_bundle_identifier="dev.wthpein010.codex-confirmation-bar"
    expected_display_name="Codex 待确认悬浮助手"
    default_mode="confirmation-overlay"
    ;;
  *)
    echo "Runtime/profile combination is invalid." >&2
    exit 64
    ;;
esac

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="${repository_root}/src/CodexThreadWorkbench/CodexThreadWorkbench.csproj"
expected_version_lines="$(
  sed -nE \
    's/^[[:space:]]*<Version>[[:space:]]*([^<[:space:]]+)[[:space:]]*<\/Version>[[:space:]]*$/\1/p' \
    "${project}"
)"
expected_version_count="$(
  printf '%s\n' "${expected_version_lines}" |
    awk 'NF { count += 1 } END { print count + 0 }'
)"
if [[ "${expected_version_count}" != "1" ]]; then
  echo "Expected exactly one non-empty <Version> in ${project}." >&2
  exit 65
fi
expected_version="${expected_version_lines}"
if [[ -z "${expected_version}" || ! "${expected_version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid expected project version '${expected_version}'." >&2
  exit 65
fi

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
app_directory="${temporary_directory}/${app_name}.app"
executable="${app_directory}/Contents/MacOS/${executable_name}"
info_plist="${app_directory}/Contents/Info.plist"
launch_profile="${app_directory}/Contents/Resources/codex-launch-profile.json"
test -f "${info_plist}"
test -x "${executable}"
test -f "${launch_profile}"

short_version="$(
  plutil -extract CFBundleShortVersionString raw -o - "${info_plist}"
)"
bundle_version="$(plutil -extract CFBundleVersion raw -o - "${info_plist}")"
bundle_identifier="$(plutil -extract CFBundleIdentifier raw -o - "${info_plist}")"
display_name="$(plutil -extract CFBundleDisplayName raw -o - "${info_plist}")"
if [[ "${short_version}" != "${expected_version}" ]]; then
  echo "CFBundleShortVersionString ${short_version} != ${expected_version}." >&2
  exit 65
fi
if [[ "${bundle_version}" != "${expected_version}" ]]; then
  echo "CFBundleVersion ${bundle_version} != ${expected_version}." >&2
  exit 65
fi
if [[ "${bundle_identifier}" != "${expected_bundle_identifier}" ]]; then
  echo "Unexpected CFBundleIdentifier ${bundle_identifier}." >&2
  exit 65
fi
if [[ "${display_name}" != "${expected_display_name}" ]]; then
  echo "Unexpected CFBundleDisplayName ${display_name}." >&2
  exit 65
fi
grep -Fq "\"defaultMode\":\"${default_mode}\"" "${launch_profile}"
echo "Verified Info.plist versions: CFBundleShortVersionString=${short_version}, CFBundleVersion=${bundle_version}"

file_output="$(file "${executable}")"
echo "${file_output}"
grep -q "${expected_architecture}" <<< "${file_output}"
codesign --verify --deep --strict "${app_directory}"
"${executable}" --smoke-test

"${executable}" >"${temporary_directory}/launch.log" 2>&1 &
app_pid=$!
sleep 5
kill -0 "${app_pid}"
kill "${app_pid}"
wait "${app_pid}" 2>/dev/null || true
app_pid=""

echo "Verified ${runtime} package: ${archive_path}"
