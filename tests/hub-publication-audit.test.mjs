import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");

async function loadAuditor() {
  try {
    return await import("../scripts/hub-publication-audit.mjs");
  } catch (error) {
    assert.fail(`hub publication auditor should be available: ${error.message}`);
  }
}

test("public cards expose only truthful platform actions", async () => {
  const { auditCatalog } = await loadAuditor();
  const report = await auditCatalog({ root, runtime });

  assert.deepEqual(
    report.findings.filter((item) => item.rule === "platform-artifact"),
    [],
  );
});

test("every video returns to the owning catalog section", async () => {
  const { auditCatalog } = await loadAuditor();
  const report = await auditCatalog({ root, runtime });

  assert.deepEqual(
    report.findings.filter((item) => item.rule === "video-home-target"),
    [],
  );
});

test("CI external mode reports broken public actions without requiring a Pages base", async () => {
  const { auditCatalog } = await loadAuditor();
  const requests = [];
  const report = await auditCatalog({
    root,
    runtime,
    checkExternalTargets: true,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), method: options.method });
      return { ok: false, status: 404 };
    },
  });

  assert.ok(requests.length > 0);
  assert.equal(requests.every(({ url }) => /^https?:\/\//.test(url)), true);
  assert.ok(report.findings.some((item) =>
    item.rule === "online-target"
    && item.projectId === "gamepulse-mini-radar"
    && /HTTP 404/.test(item.message)));
});
