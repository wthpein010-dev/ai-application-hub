#!/usr/bin/env bash
set -euo pipefail

archive_path="${1:-}"
runtime="${2:-}"
if [[ ! -f "${archive_path}" ]]; then
  echo "Archive not found: ${archive_path}" >&2
  exit 66
fi

case "${runtime}" in
  osx-arm64) expected_architecture="arm64" ;;
  osx-x64) expected_architecture="x86_64" ;;
  *)
    echo "Runtime must be osx-arm64 or osx-x64." >&2
    exit 64
    ;;
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
app_directory="${temporary_directory}/CodexThreadWorkbench.app"
executable="${app_directory}/Contents/MacOS/CodexThreadWorkbench"
test -f "${app_directory}/Contents/Info.plist"
test -x "${executable}"

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
