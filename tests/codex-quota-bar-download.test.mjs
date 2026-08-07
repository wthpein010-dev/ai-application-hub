import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const downloads = join(root, "downloads");
const macManifest = JSON.parse(
  readFileSync(
    join(root, "docs", "audits", "evidence", "2026-08-07-macos-download-manifest.json"),
    "utf8",
  ),
).downloads.find((item) => item.id === "codex-quota-bar");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

function zipEntries(path) {
  return [...zipEntryPermissions(path).keys()];
}

function zipEntryPermissions(path) {
  const archive = readFileSync(path);
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (archive.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  assert.notEqual(endOffset, -1, "ZIP end-of-central-directory record is missing");

  const entryCount = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  const permissions = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50, "Invalid ZIP central-directory entry");
    const versionMadeBy = archive.readUInt16LE(offset + 4);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const name = archive
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8")
      .replaceAll("\\", "/");
    permissions.set(name, {
      creatorPlatform: versionMadeBy >>> 8,
      mode: (externalAttributes >>> 16) & 0xffff,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return permissions;
}

test("Windows download is the verified bundled-pet x64 release", () => {
  const archive = join(downloads, "CodexQuotaBar-Windows-x64.zip");
  assert.equal(statSync(archive).size, 39_898_961);
  assert.equal(
    sha256(archive),
    "B3E36D368D50AEB3704F849C6715CF68109408B288A90AE9B86E97B5A5760CC8",
  );
  assert.deepEqual(zipEntries(archive), [
    "CodexQuotaBar-Windows-x64/CodexQuotaBar.exe",
    "CodexQuotaBar-Windows-x64/README-zh-CN.md",
  ]);
});

test("macOS download contains independently packaged arm64 and x64 apps", () => {
  const archive = join(downloads, "CodexQuotaBar-macOS.zip");
  assert.ok(macManifest, "Mac audit evidence should include Codex Quota Bar");
  assert.equal(statSync(archive).size, macManifest.bytes);
  assert.equal(
    sha256(archive),
    macManifest.sha256,
  );
  const entries = zipEntries(archive);
  for (const architecture of ["arm64", "x64"]) {
    assert.ok(
      entries.includes(
        `CodexQuotaBar-macOS/${architecture}/CodexQuotaBar.app/Contents/Info.plist`,
      ),
    );
    assert.ok(
      entries.includes(
        `CodexQuotaBar-macOS/${architecture}/CodexQuotaBar.app/Contents/MacOS/CodexQuotaBar`,
      ),
    );
  }
});

test("macOS app launchers retain executable permissions in the ZIP", () => {
  const archive = join(downloads, "CodexQuotaBar-macOS.zip");
  const permissions = zipEntryPermissions(archive);
  for (const architecture of ["arm64", "x64"]) {
    const executable =
      `CodexQuotaBar-macOS/${architecture}/CodexQuotaBar.app/Contents/MacOS/CodexQuotaBar`;
    const permission = permissions.get(executable);
    assert.notEqual(permission, undefined, `${executable} is missing from the ZIP central directory`);
    assert.equal(
      permission.creatorPlatform,
      3,
      `${executable} must declare Unix ZIP metadata so macOS preserves its mode`,
    );
    assert.notEqual(
      permission.mode & 0o111,
      0,
      `${executable} must be executable after macOS extraction; stored mode is ${permission.mode.toString(8)}`,
    );
  }
});
