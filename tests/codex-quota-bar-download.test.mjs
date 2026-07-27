import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const downloads = join(root, "downloads");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}

function zipEntries(path) {
  const result = spawnSync("tar", ["-tf", path], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.replace(/\r/g, "").split("\n").filter(Boolean);
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
  assert.equal(statSync(archive).size, 63_795_422);
  assert.equal(
    sha256(archive),
    "31160179A15DC23E9C02B6137F4D4E0F45F59035CF41AAB15C9282E6C9C710DF",
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
