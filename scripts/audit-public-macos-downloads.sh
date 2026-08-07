#!/usr/bin/env bash
set -Eeuo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
default_manifest="${repository_root}/docs/audits/evidence/2026-08-07-macos-download-manifest.json"

architecture=""
manifest_path="${default_manifest}"
evidence_directory="${repository_root}/artifacts/macos-download-audit"
fixture_root=""
cache_nonce="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$-$(date +%s)"

usage() {
  cat <<'EOF'
Usage: audit-public-macos-downloads.sh --arch arm64|x64 [options]

Options:
  --manifest PATH       Audit manifest (defaults to the repository manifest).
  --evidence-dir PATH   Directory for JSON and Markdown evidence.
  --fixture-root PATH   Resolve archive paths locally and skip macOS-only checks.
  --help                Show this help.
EOF
}

die() {
  echo "macOS download audit: $*" >&2
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      [[ $# -ge 2 ]] || die "--arch requires a value"
      architecture="$2"
      shift 2
      ;;
    --manifest)
      [[ $# -ge 2 ]] || die "--manifest requires a path"
      manifest_path="$2"
      shift 2
      ;;
    --evidence-dir)
      [[ $# -ge 2 ]] || die "--evidence-dir requires a path"
      evidence_directory="$2"
      shift 2
      ;;
    --fixture-root)
      [[ $# -ge 2 ]] || die "--fixture-root requires a path"
      fixture_root="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown option $1"
      ;;
  esac
done

case "${architecture}" in
  arm64)
    archive_architecture="arm64"
    expected_machine="arm64"
    workbench_runtime="osx-arm64"
    ;;
  x64)
    archive_architecture="x64"
    expected_machine="x86_64"
    workbench_runtime="osx-x64"
    ;;
  *)
    die "--arch must be arm64 or x64"
    ;;
esac

[[ -f "${manifest_path}" ]] || die "manifest not found: ${manifest_path}"
if [[ -n "${fixture_root}" ]]; then
  [[ -d "${fixture_root}" ]] || die "fixture root not found: ${fixture_root}"
  fixture_mode="true"
else
  fixture_mode="false"
fi

mkdir -p "${evidence_directory}"
work_directory="$(mktemp -d "${TMPDIR:-/tmp}/hub-macos-audit.XXXXXX")"
records_file="${work_directory}/records.tsv"
results_file="${work_directory}/results.tsv"
touch "${results_file}"

run_status="failed"
failure_command=""
active_pid=""
total_records="0"

remember_failure() {
  failure_command="${BASH_COMMAND}"
}
trap remember_failure ERR

write_evidence() {
  local exit_code="$1"
  local json_path="${evidence_directory}/macos-download-audit-${architecture}.json"
  local markdown_path="${evidence_directory}/macos-download-audit-${architecture}.md"
  local final_status="failed"
  if [[ "${exit_code}" -eq 0 && "${run_status}" == "passed" ]]; then
    final_status="passed"
  fi

  AUDIT_ARCHITECTURE="${architecture}" \
  AUDIT_EXIT_CODE="${exit_code}" \
  AUDIT_FAILURE_COMMAND="${failure_command}" \
  AUDIT_MANIFEST="${manifest_path}" \
  AUDIT_STATUS="${final_status}" \
  AUDIT_TOTAL_RECORDS="${total_records}" \
  node - "${results_file}" "${json_path}" "${markdown_path}" <<'NODE'
const fs = require("node:fs");
const os = require("node:os");

const [resultsPath, jsonPath, markdownPath] = process.argv.slice(2);
const lines = fs.readFileSync(resultsPath, "utf8").split(/\r?\n/).filter(Boolean);
const downloads = lines.map((line) => {
  const [id, kind, sourceUrl, bytes, sha256, checks] = line.split("\t");
  return {
    id,
    kind,
    sourceUrl,
    bytes: Number(bytes),
    sha256,
    status: "passed",
    checks: checks.split(",").filter(Boolean),
  };
});
const exitCode = Number(process.env.AUDIT_EXIT_CODE);
const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  architecture: process.env.AUDIT_ARCHITECTURE,
  runner: `${os.platform()} ${os.release()} ${os.arch()}`,
  manifest: process.env.AUDIT_MANIFEST,
  status: process.env.AUDIT_STATUS,
  expectedDownloads: Number(process.env.AUDIT_TOTAL_RECORDS),
  verifiedDownloads: downloads.length,
  downloads,
  failure: exitCode === 0 ? null : {
    exitCode,
    command: process.env.AUDIT_FAILURE_COMMAND || "unknown",
  },
};
fs.writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);

const rows = downloads.length
  ? downloads.map((item) => `| ${item.id} | ${item.kind} | ${item.bytes} | \`${item.sha256}\` | ${item.checks.join(", ")} |`)
  : ["| _No completed downloads_ | - | - | - | - |"];
const markdown = [
  "# Public macOS download audit",
  "",
  `- Status: **${evidence.status}**`,
  `- Architecture: \`${evidence.architecture}\``,
  `- Verified: ${evidence.verifiedDownloads}/${evidence.expectedDownloads}`,
  `- Generated: ${evidence.generatedAt}`,
  "",
  "| Product | Kind | Bytes | SHA-256 | Checks |",
  "| --- | --- | ---: | --- | --- |",
  ...rows,
];
if (evidence.failure) {
  markdown.push("", `Failure command: \`${evidence.failure.command.replaceAll("`", "'")}\``);
}
fs.writeFileSync(markdownPath, `${markdown.join("\n")}\n`);
NODE

  echo "Evidence JSON: ${json_path}"
  echo "Evidence Markdown: ${markdown_path}"
}

finish() {
  local exit_code="$?"
  set +e
  trap - ERR EXIT
  if [[ -n "${active_pid}" ]] && kill -0 "${active_pid}" 2>/dev/null; then
    kill "${active_pid}" 2>/dev/null
    wait "${active_pid}" 2>/dev/null
  fi
  write_evidence "${exit_code}"
  rm -rf "${work_directory}"
  exit "${exit_code}"
}
trap finish EXIT

download_url() {
  local source="$1"
  local destination="$2"
  local request_attempt="${3:-1}"
  mkdir -p "$(dirname "${destination}")"
  if [[ "${fixture_mode}" == "true" ]]; then
    local fixture_path="${source}"
    case "${fixture_path}" in
      /*|[A-Za-z]:/*) ;;
      *) fixture_path="${fixture_root}/${fixture_path}" ;;
    esac
    [[ -f "${fixture_path}" ]] || die "fixture file not found: ${fixture_path}"
    cp "${fixture_path}" "${destination}"
  else
    local separator="?"
    case "${source}" in
      *\?*) separator="&" ;;
    esac
    local refreshed_source="${source}${separator}audit_nonce=${cache_nonce}-${request_attempt}"
    curl --fail --location --retry 3 \
      --header "Cache-Control: no-cache, no-store, max-age=0" \
      --header "Pragma: no-cache" \
      --output "${destination}" \
      "${refreshed_source}"
  fi
}

sha256_file() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${path}" | awk '{ print $1 }' | tr '[:lower:]' '[:upper:]'
  else
    sha256sum "${path}" | awk '{ print $1 }' | tr '[:lower:]' '[:upper:]'
  fi
}

verified_bytes=""
verified_sha256=""
verify_bytes_and_sha256() {
  local path="$1"
  local expected_bytes="$2"
  local expected_sha256="$3"
  verified_bytes="$(wc -c < "${path}" | tr -d '[:space:]')"
  if [[ "${verified_bytes}" != "${expected_bytes}" ]]; then
    die "byte-size mismatch for ${path}: expected ${expected_bytes}, got ${verified_bytes}"
    return 1
  fi
  verified_sha256="$(sha256_file "${path}")"
  if [[ "${verified_sha256}" != "${expected_sha256}" ]]; then
    die "SHA-256 mismatch for ${path}: expected ${expected_sha256}, got ${verified_sha256}"
    return 1
  fi
}

download_and_verify() {
  local source="$1"
  local destination="$2"
  local expected_bytes="$3"
  local expected_sha256="$4"

  if [[ "${fixture_mode}" == "true" ]]; then
    download_url "${source}" "${destination}"
    verify_bytes_and_sha256 "${destination}" "${expected_bytes}" "${expected_sha256}"
    return
  fi

  local integrity_attempt
  for integrity_attempt in 1 2 3; do
    rm -f "${destination}"
    if download_url "${source}" "${destination}" "${integrity_attempt}" && \
      verify_bytes_and_sha256 "${destination}" "${expected_bytes}" "${expected_sha256}"; then
      return 0
    fi
    if [[ "${integrity_attempt}" -lt 3 ]]; then
      echo "Integrity check failed; bypassing caches and downloading ${source} again (attempt $((integrity_attempt + 1))/3)." >&2
      sleep $((integrity_attempt * 5))
    fi
  done
  die "public download still has a byte-size or SHA-256 mismatch after 3 integrity attempts: ${source}"
}

extract_zip() {
  local archive="$1"
  local destination="$2"
  mkdir -p "${destination}"
  if [[ "${fixture_mode}" == "true" ]]; then
    unzip -q "${archive}" -d "${destination}"
  else
    ditto -x -k "${archive}" "${destination}"
  fi
}

record_result() {
  local id="$1"
  local kind="$2"
  local source_url="$3"
  local bytes="$4"
  local sha256="$5"
  local checks="$6"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${id}" "${kind}" "${source_url}" "${bytes}" "${sha256}" "${checks}" \
    >> "${results_file}"
  echo "Verified ${id} (${kind}, ${architecture})"
}

verify_macho_architecture() {
  local path="$1"
  local label="$2"
  local file_output
  file_output="$(file "${path}")"
  echo "${file_output}"
  grep -q "Mach-O" <<< "${file_output}" || die "${label} is not a Mach-O binary"
  grep -q "${expected_machine}" <<< "${file_output}" || \
    die "${label} does not match ${expected_machine}"
}

launch_for_five_seconds() {
  local executable="$1"
  local log_path="$2"
  "${executable}" >"${log_path}" 2>&1 &
  active_pid=$!
  sleep 5
  if ! kill -0 "${active_pid}" 2>/dev/null; then
    wait "${active_pid}" 2>/dev/null || true
    active_pid=""
    die "application exited before the five-second launch check: ${executable}"
  fi
  kill "${active_pid}" 2>/dev/null || true
  wait "${active_pid}" 2>/dev/null || true
  active_pid=""
}

audit_extension() {
  local id="$1"
  local source_url="$2"
  local expected_bytes="$3"
  local expected_sha256="$4"
  local archive="${work_directory}/${id}.zip"
  local extracted="${work_directory}/${id}-extracted"

  download_and_verify "${source_url}" "${archive}" "${expected_bytes}" "${expected_sha256}"
  local actual_bytes="${verified_bytes}"
  local actual_sha256="${verified_sha256}"
  extract_zip "${archive}" "${extracted}"

  local extension_manifest=""
  local manifest_count="0"
  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] || continue
    extension_manifest="${candidate}"
    manifest_count=$((manifest_count + 1))
  done < <(find "${extracted}" -type f -name manifest.json -print)
  [[ "${manifest_count}" -gt 0 ]] || die "Missing manifest.json in ${id} extension ZIP"
  [[ "${manifest_count}" -eq 1 ]] || die "Expected one manifest.json in ${id} extension ZIP"

  node - "${extension_manifest}" <<'NODE'
const fs = require("node:fs");
const path = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Number.isInteger(manifest.manifest_version) || !manifest.name) {
  throw new Error("Chromium manifest.json must contain manifest_version and name");
}
NODE

  local script_count="0"
  while IFS= read -r -d '' javascript; do
    node --check "${javascript}"
    script_count=$((script_count + 1))
  done < <(find "${extracted}" -type f -name '*.js' -print0)
  [[ "${script_count}" -gt 0 ]] || die "No published JavaScript found in ${id} extension ZIP"

  record_result \
    "${id}" "extension" "${source_url}" "${actual_bytes}" "${actual_sha256}" \
    "bytes,sha256,zip,manifest-json,javascript-syntax"
}

audit_combined_native() {
  local id="$1"
  local source_url="$2"
  local expected_bytes="$3"
  local expected_sha256="$4"
  local archive="${work_directory}/${id}.zip"
  local extracted="${work_directory}/${id}-extracted"
  local app=""
  local executable=""

  download_and_verify "${source_url}" "${archive}" "${expected_bytes}" "${expected_sha256}"
  local actual_bytes="${verified_bytes}"
  local actual_sha256="${verified_sha256}"
  extract_zip "${archive}" "${extracted}"

  case "${id}" in
    codex-quota-bar)
      app="${extracted}/CodexQuotaBar-macOS/${archive_architecture}/CodexQuotaBar.app"
      executable="${app}/Contents/MacOS/CodexQuotaBar"
      ;;
    clickflow)
      app="${extracted}/${archive_architecture}/ClickFlow.app"
      executable="${app}/Contents/MacOS/ClickFlow"
      ;;
    pureshrink)
      app="${extracted}/${archive_architecture}/PureShrink.app"
      executable="${app}/Contents/MacOS/PureShrink"
      ;;
    *)
      die "unsupported native product ${id}"
      ;;
  esac

  [[ -f "${app}/Contents/Info.plist" ]] || die "Missing Info.plist for ${id}"
  [[ -f "${executable}" ]] || die "Missing executable for ${id}: ${executable}"

  if [[ "${fixture_mode}" == "true" ]]; then
    record_result \
      "${id}" "native" "${source_url}" "${actual_bytes}" "${actual_sha256}" \
      "bytes,sha256,zip,app-layout,architecture-metadata"
    return
  fi

  [[ -x "${executable}" ]] || die "Missing executable permission for ${id}: ${executable}"
  plutil -lint "${app}/Contents/Info.plist"
  verify_macho_architecture "${executable}" "${id} executable"
  codesign --verify --deep --strict "${app}"

  case "${id}" in
    codex-quota-bar|clickflow)
      launch_for_five_seconds "${executable}" "${work_directory}/${id}-launch.log"
      ;;
    pureshrink)
      local ffmpeg="${app}/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
      [[ -x "${ffmpeg}" ]] || die "Missing executable bundled FFmpeg for ${id}"
      verify_macho_architecture "${ffmpeg}" "${id} bundled FFmpeg"
      "${executable}" --smoke-test
      ;;
  esac

  local checks="bytes,sha256,zip,info-plist,macho-${expected_machine},codesign"
  if [[ "${id}" == "pureshrink" ]]; then
    checks="${checks},ffmpeg-${expected_machine},smoke-test"
  else
    checks="${checks},launch-5s"
  fi
  record_result "${id}" "native" "${source_url}" "${actual_bytes}" "${actual_sha256}" "${checks}"
}

public_relative_url() {
  local relative_path="$1"
  local base_url="$2"
  node -e 'process.stdout.write(new URL(process.argv[1], process.argv[2]).href)' \
    "${relative_path}" "${base_url}"
}

reconstruct_workbench() {
  local manifest_url="$1"
  local expected_bytes="$2"
  local expected_sha256="$3"
  local output_archive="$4"
  local public_manifest="${work_directory}/workbench-${architecture}-manifest.json"
  local parts_file="${work_directory}/workbench-${architecture}-parts.tsv"

  download_url "${manifest_url}" "${public_manifest}"
  node - "${public_manifest}" "${expected_bytes}" "${expected_sha256}" "${architecture}" > "${parts_file}" <<'NODE'
const fs = require("node:fs");
const [path, expectedBytesText, expectedSha, architecture] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
const expectedBytes = Number(expectedBytesText);
if (manifest.version !== 1 || !Array.isArray(manifest.parts) || manifest.parts.length === 0) {
  throw new Error("Invalid public Workbench parts manifest");
}
if (manifest.totalSize !== expectedBytes || String(manifest.sha256).toUpperCase() !== expectedSha) {
  throw new Error("Public Workbench manifest does not match the Hub audit manifest");
}
const expectedToken = architecture === "arm64" ? "arm64" : "x64";
if (!String(manifest.fileName).includes(expectedToken)) {
  throw new Error(`Workbench fileName does not match ${architecture}`);
}
manifest.parts.forEach((part, index) => {
  if (part.index !== index || !Number.isSafeInteger(part.size) || part.size <= 0) {
    throw new Error(`Invalid Workbench part metadata at index ${index}`);
  }
  if (typeof part.path !== "string" || part.path.startsWith("/") || part.path.includes("..")) {
    throw new Error(`Unsafe Workbench part path at index ${index}`);
  }
  const digest = String(part.sha256 || "").toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(digest)) {
    throw new Error(`Invalid Workbench part digest at index ${index}`);
  }
  process.stdout.write(`${part.path}\t${part.size}\t${digest}\n`);
});
NODE

  : > "${output_archive}"
  local part_index="0"
  while IFS=$'\t' read -r part_path part_bytes part_sha256; do
    [[ -n "${part_path}" ]] || continue
    local part_url
    part_url="$(public_relative_url "${part_path}" "${manifest_url}")"
    local part_file="${work_directory}/workbench-part-${part_index}.bin"
    download_and_verify "${part_url}" "${part_file}" "${part_bytes}" "${part_sha256}"
    cat "${part_file}" >> "${output_archive}"
    part_index=$((part_index + 1))
  done < "${parts_file}"
  [[ "${part_index}" -gt 0 ]] || die "Workbench public manifest contains no parts"
  verify_bytes_and_sha256 "${output_archive}" "${expected_bytes}" "${expected_sha256}"
}

audit_workbench() {
  local id="$1"
  local manifest_url="$2"
  local expected_bytes="$3"
  local expected_sha256="$4"
  local archive="${work_directory}/CodexThreadWorkbench-${architecture}.app.zip"

  reconstruct_workbench "${manifest_url}" "${expected_bytes}" "${expected_sha256}" "${archive}"
  local actual_bytes="${verified_bytes}"
  local actual_sha256="${verified_sha256}"

  if [[ "${fixture_mode}" == "true" ]]; then
    die "Workbench fixture audits are not supported"
  fi
  chmod +x "${repository_root}/build/codex-thread-workbench/scripts/test-macos-package.sh"
  "${repository_root}/build/codex-thread-workbench/scripts/test-macos-package.sh" \
    "${archive}" "${workbench_runtime}"

  record_result \
    "${id}" "native" "${manifest_url}" "${actual_bytes}" "${actual_sha256}" \
    "public-parts,bytes,sha256,info-plist,macho-${expected_machine},codesign,smoke-test,launch-5s"
}

node - "${manifest_path}" "${architecture}" "${fixture_mode}" > "${records_file}" <<'NODE'
const fs = require("node:fs");
const [path, architecture, fixtureModeText] = process.argv.slice(2);
const fixtureMode = fixtureModeText === "true";
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.downloads)) {
  throw new Error("Audit manifest must use version 1 and contain downloads");
}

if (!fixtureMode) {
  const expected = new Map([
    ["codex-quota-bar", "native"],
    ["codex-thread-workbench", "native"],
    ["feishu-downloader", "extension"],
    ["clickflow", "native"],
    ["pureshrink", "native"],
  ]);
  if (manifest.downloads.length !== expected.size) {
    throw new Error(`Expected exactly ${expected.size} public Mac downloads`);
  }
  for (const item of manifest.downloads) {
    if (expected.get(item.id) !== item.kind) {
      throw new Error(`Unexpected public Mac download ${item.id}`);
    }
    expected.delete(item.id);
  }
  if (expected.size !== 0) throw new Error("Audit manifest is missing a public Mac download");
}

for (const item of manifest.downloads) {
  let sourceUrl;
  let bytes;
  let sha256;
  let publicManifestUrl = "";
  if (item.kind === "extension") {
    sourceUrl = item.archiveUrl;
    bytes = item.bytes;
    sha256 = item.sha256;
  } else if (item.id === "codex-thread-workbench") {
    const artifact = item.artifacts && item.artifacts[architecture];
    if (!artifact) throw new Error(`Workbench has no ${architecture} artifact`);
    sourceUrl = artifact.manifestUrl;
    publicManifestUrl = artifact.manifestUrl;
    bytes = artifact.bytes;
    sha256 = artifact.sha256;
  } else {
    if (!Array.isArray(item.architectures) || !item.architectures.includes(architecture)) {
      throw new Error(`${item.id} does not declare architecture ${architecture}`);
    }
    sourceUrl = item.archiveUrl;
    bytes = item.bytes;
    sha256 = item.sha256;
  }

  if (!fixtureMode) {
    for (const [label, value] of [["source URL", sourceUrl], ["public manifest URL", publicManifestUrl]]) {
      if (!value) continue;
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error(`${item.id} ${label} must use HTTPS`);
    }
  }
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[A-F0-9]{64}$/.test(String(sha256))) {
    throw new Error(`${item.id} has invalid bytes or SHA-256 metadata`);
  }
  process.stdout.write([item.id, item.kind, sourceUrl, bytes, sha256, publicManifestUrl].join("\t") + "\n");
}
NODE

total_records="$(wc -l < "${records_file}" | tr -d '[:space:]')"
[[ "${total_records}" -gt 0 ]] || die "manifest contains no downloads"

while IFS=$'\t' read -r id kind source_url expected_bytes expected_sha256 public_manifest_url; do
  [[ -n "${id}" ]] || continue
  case "${kind}" in
    extension)
      audit_extension "${id}" "${source_url}" "${expected_bytes}" "${expected_sha256}"
      ;;
    native)
      if [[ "${id}" == "codex-thread-workbench" ]]; then
        audit_workbench "${id}" "${public_manifest_url}" "${expected_bytes}" "${expected_sha256}"
      else
        audit_combined_native "${id}" "${source_url}" "${expected_bytes}" "${expected_sha256}"
      fi
      ;;
    *)
      die "unsupported product kind ${kind} for ${id}"
      ;;
  esac
done < "${records_file}"

verified_count="$(wc -l < "${results_file}" | tr -d '[:space:]')"
[[ "${verified_count}" == "${total_records}" ]] || \
  die "verified ${verified_count} of ${total_records} downloads"
run_status="passed"
echo "Verified all ${verified_count} public Mac downloads for ${architecture}."
