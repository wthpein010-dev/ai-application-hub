import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDefaultAppsFromRuntime } from "../tests/helpers/default-apps.mjs";

const PUBLIC_BASE_URL = "https://wthpein010-dev.github.io/ai-application-hub/";
const ARCHITECTURES = ["arm64", "x64"];
const SHA256 = /^[A-F0-9]{64}$/;
const TOP_LEVEL_KEYS = new Set(["version", "downloads"]);
const COMMON_RECORD_KEYS = new Set(["id", "name", "kind", "catalogUrl"]);
const COMBINED_NATIVE_KEYS = new Set([
  ...COMMON_RECORD_KEYS,
  "archiveUrl",
  "bytes",
  "sha256",
  "architectures",
]);
const WORKBENCH_NATIVE_KEYS = new Set([...COMMON_RECORD_KEYS, "artifacts"]);
const EXTENSION_KEYS = new Set([
  ...COMMON_RECORD_KEYS,
  "archiveUrl",
  "bytes",
  "sha256",
  "extension",
]);
const ARTIFACT_KEYS = new Set(["url", "bytes", "sha256", "manifestUrl"]);
const EXTENSION_METADATA_KEYS = new Set(["format", "browser"]);

function fail(message) {
  throw new Error(`Mac download manifest: ${message}`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has unknown key ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) fail(`${label} is missing key ${key}`);
  }
}

function assertPublicUrl(value, label) {
  if (typeof value !== "string") fail(`${label} must be a URL string`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid public URL`);
  }
  if (url.protocol !== "https:") fail(`${label} must use HTTPS`);
  return url.href;
}

function assertArtifact(value, label) {
  assertPlainObject(value, label);
  assertExactKeys(value, ARTIFACT_KEYS, label);
  assertPublicUrl(value.url, `${label}.url`);
  assertPublicUrl(value.manifestUrl, `${label}.manifestUrl`);
  assertBytes(value.bytes, `${label}.bytes`);
  assertDigest(value.sha256, `${label}.sha256`);
}

function assertBytes(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive safe integer`);
  }
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be an uppercase SHA-256 digest`);
  }
}

function platformHref(value) {
  return typeof value === "string" ? value : value?.href || "";
}

function macCatalog(apps) {
  if (!Array.isArray(apps)) fail("apps must be an array");
  const catalog = new Map();
  for (const app of apps) {
    const href = platformHref(app?.platforms?.mac);
    if (!href) continue;
    if (typeof app.id !== "string" || !app.id) fail("catalog Mac action has no ID");
    if (catalog.has(app.id)) fail(`catalog has duplicate Mac action ID ${app.id}`);
    catalog.set(app.id, {
      id: app.id,
      name: app.name,
      catalogUrl: new URL(href, PUBLIC_BASE_URL).href,
      kind: app.status === "plugin" ? "extension" : "native",
    });
  }
  return catalog;
}

function validateCombinedNative(record) {
  assertExactKeys(record, COMBINED_NATIVE_KEYS, `record ${record.id}`);
  assertPublicUrl(record.archiveUrl, `record ${record.id}.archiveUrl`);
  assertBytes(record.bytes, `record ${record.id}.bytes`);
  assertDigest(record.sha256, `record ${record.id}.sha256`);
  if (
    !Array.isArray(record.architectures)
    || record.architectures.length !== ARCHITECTURES.length
    || record.architectures.some((architecture, index) => architecture !== ARCHITECTURES[index])
  ) {
    fail(`record ${record.id}.architectures must be ${ARCHITECTURES.join(", ")}`);
  }
}

function validateWorkbenchNative(record) {
  assertExactKeys(record, WORKBENCH_NATIVE_KEYS, `record ${record.id}`);
  assertPlainObject(record.artifacts, `record ${record.id}.artifacts`);
  assertExactKeys(
    record.artifacts,
    new Set(ARCHITECTURES),
    `record ${record.id}.artifacts`,
  );
  for (const architecture of ARCHITECTURES) {
    assertArtifact(record.artifacts[architecture], `record ${record.id}.artifacts.${architecture}`);
  }
}

function validateExtension(record) {
  assertExactKeys(record, EXTENSION_KEYS, `record ${record.id}`);
  assertPublicUrl(record.archiveUrl, `record ${record.id}.archiveUrl`);
  assertBytes(record.bytes, `record ${record.id}.bytes`);
  assertDigest(record.sha256, `record ${record.id}.sha256`);
  assertPlainObject(record.extension, `record ${record.id}.extension`);
  assertExactKeys(record.extension, EXTENSION_METADATA_KEYS, `record ${record.id}.extension`);
  if (record.extension.format !== "zip" || record.extension.browser !== "chromium") {
    fail(`record ${record.id}.extension must describe a Chromium ZIP extension`);
  }
}

export function validateMacDownloadManifest({ apps, manifest }) {
  assertPlainObject(manifest, "manifest");
  assertExactKeys(manifest, TOP_LEVEL_KEYS, "manifest");
  if (manifest.version !== 1) fail("manifest.version must be 1");
  if (!Array.isArray(manifest.downloads)) fail("manifest.downloads must be an array");

  const catalog = macCatalog(apps);
  const seenIds = new Set();
  const native = [];
  const extension = [];

  for (const record of manifest.downloads) {
    assertPlainObject(record, "download record");
    if (typeof record.id !== "string" || !record.id) fail("download record has invalid ID");
    if (seenIds.has(record.id)) fail(`duplicate ID ${record.id}`);
    seenIds.add(record.id);

    const catalogAction = catalog.get(record.id);
    if (!catalogAction) fail(`stale entry ${record.id} has no public Mac action`);
    if (record.name !== catalogAction.name) fail(`record ${record.id} name does not match catalog`);
    if (record.kind !== catalogAction.kind) fail(`record ${record.id} kind does not match catalog`);
    if (assertPublicUrl(record.catalogUrl, `record ${record.id}.catalogUrl`) !== catalogAction.catalogUrl) {
      fail(`record ${record.id} catalog URL does not match public catalog action`);
    }

    if (record.kind === "extension") {
      validateExtension(record);
      extension.push(record);
    } else if (record.id === "codex-thread-workbench") {
      validateWorkbenchNative(record);
      native.push(record);
    } else {
      validateCombinedNative(record);
      native.push(record);
    }
  }

  for (const id of catalog.keys()) {
    if (!seenIds.has(id)) fail(`missing public Mac action ${id}`);
  }

  return { native, extension };
}

async function main() {
  if (process.argv.length > 2 && !process.argv.slice(2).every((argument) => argument === "--check")) {
    fail("only --check is supported");
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const [runtime, rawManifest] = await Promise.all([
    readFile(join(root, "app-20260706-restore-games.js"), "utf8"),
    readFile(
      join(root, "docs", "audits", "evidence", "2026-08-07-macos-download-manifest.json"),
      "utf8",
    ),
  ]);
  const result = validateMacDownloadManifest({
    apps: loadDefaultAppsFromRuntime(runtime),
    manifest: JSON.parse(rawManifest),
  });
  process.stdout.write(
    `${result.native.length + result.extension.length} Mac downloads: ${result.native.length} native, ${result.extension.length} extension\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
