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

test("publication audit exposes the Workbench iOS Web App without treating it as a native archive", async () => {
  const { auditCatalog } = await loadAuditor();
  const report = await auditCatalog({ root, runtime });
  const workbench = report.projects.find(
    (project) => project.id === "codex-thread-workbench",
  );

  assert.deepEqual(
    workbench.actions.map((action) => action.type),
    ["web", "video", "windows", "mac", "ios"],
  );
  assert.equal(
    report.findings.some(
      (item) =>
        item.rule === "platform-artifact" &&
        item.projectId === "codex-thread-workbench" &&
        item.path === "ios",
    ),
    false,
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

test("CI external mode retries one transient request failure", async () => {
  const { auditCatalog } = await loadAuditor();
  const attempts = new Map();
  const report = await auditCatalog({
    root,
    runtime,
    checkExternalTargets: true,
    fetchImpl: async (url) => {
      const key = String(url);
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      if (count === 1) throw new TypeError("transient fetch failure");
      return { ok: true, status: 200 };
    },
  });

  assert.ok(attempts.size > 0);
  assert.equal(Array.from(attempts.values()).every((count) => count === 2), true);
  assert.deepEqual(report.findings.filter((item) => item.rule === "online-target"), []);
});

test("CI external mode stops after two failed attempts and reports each target once", async () => {
  const { auditCatalog } = await loadAuditor();
  const attempts = new Map();
  const report = await auditCatalog({
    root,
    runtime,
    checkExternalTargets: true,
    fetchImpl: async (url) => {
      const key = String(url);
      attempts.set(key, (attempts.get(key) || 0) + 1);
      throw new TypeError("persistent fetch failure");
    },
  });

  const onlineFindings = report.findings.filter((item) => item.rule === "online-target");
  assert.ok(attempts.size > 0);
  assert.equal(Array.from(attempts.values()).every((count) => count === 2), true);
  assert.equal(onlineFindings.length, attempts.size);
  assert.equal(onlineFindings.every((item) => /persistent fetch failure/.test(item.message)), true);
});
