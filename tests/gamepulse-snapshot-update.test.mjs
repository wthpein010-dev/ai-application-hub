import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const updaterPath = join(root, "scripts", "update-gamepulse-snapshot.mjs");

function makePayload() {
  const verifiedAt = "2026-08-30T00:00:00.000Z";
  const domestic = Array.from({ length: 10 }, (_, index) => ({
    id: `cn-${index + 1}`,
    rank: index + 1,
    title: `国内游戏 ${index + 1}`,
    developer: `开发者 ${index + 1}`,
    icon: `https://example.com/cn-${index + 1}.png`,
    monogram: "游",
    platforms: ["微信"],
    category: "轻度休闲",
    subCategory: "益智",
    wechatRank: index + 1,
    popularRank: index + 1,
    grossingRank: index + 1,
    change: null,
    evidence: [`证据 ${index + 1}`],
    sourceUrl: "https://example.com/domestic",
    sourceLabel: "国内榜",
    verifiedAt,
  }));
  const overseas = Array.from({ length: 10 }, (_, index) => ({
    id: `us-${index + 1}`,
    rank: index + 1,
    title: `海外游戏 ${index + 1}`,
    developer: `海外开发者 ${index + 1}`,
    icon: `https://example.com/us-${index + 1}.png`,
    monogram: "G",
    platforms: ["iOS"],
    category: "Games",
    subCategory: "Casual",
    popularRank: null,
    grossingRank: null,
    change: null,
    evidence: [`海外证据 ${index + 1}`],
    sourceUrl: "https://example.com/overseas",
    sourceLabel: "海外 iOS 休闲榜",
    verifiedAt,
  }));
  const sourceHealth = ["wechat", "popular", "grossing", "overseas"].map((id) => ({
    id,
    label: id,
    status: "fresh",
    checkedAt: verifiedAt,
  }));

  return {
    snapshot: {
      domestic,
      overseas,
      updatedAt: verifiedAt,
      displayDate: "2026-08-30",
      stale: false,
      sourceHealth,
    },
    history: { days: [] },
    stale: false,
    sourceHealth,
    storage: "d1",
  };
}

async function loadUpdater() {
  assert.equal(existsSync(updaterPath), true, `missing ${updaterPath}`);
  return import(`${pathToFileURL(updaterPath).href}?test=${Date.now()}-${Math.random()}`);
}

test("snapshot updater produces four sanitized Top 10 rankings", async () => {
  const { buildPublishedSnapshot } = await loadUpdater();
  const result = buildPublishedSnapshot(makePayload(), {
    mirroredAt: "2026-08-30T00:05:00.000Z",
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.mirroredAt, "2026-08-30T00:05:00.000Z");
  assert.deepEqual(Object.keys(result.rankings), ["wechat", "popular", "grossing", "overseas"]);
  for (const ranking of Object.values(result.rankings)) {
    assert.equal(ranking.length, 10);
    assert.deepEqual(ranking.map((item) => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(
      Object.keys(ranking[0]),
      ["rank", "title", "developer", "category", "subCategory", "sourceLabel", "verifiedAt"],
    );
    assert.equal("sourceUrl" in ranking[0], false);
  }
});

test("snapshot updater rejects an incomplete source response", async () => {
  const { buildPublishedSnapshot } = await loadUpdater();
  const payload = makePayload();
  payload.snapshot.domestic = payload.snapshot.domestic.slice(0, 9);

  assert.throws(
    () => buildPublishedSnapshot(payload),
    /wechat.*10|popular.*10|grossing.*10/i,
  );
});

test("failed refresh preserves the previous published snapshot", async () => {
  const { updateSnapshot } = await loadUpdater();
  const directory = mkdtempSync(join(tmpdir(), "gamepulse-snapshot-"));
  const targetPath = join(directory, "rankings.json");
  const previous = '{"previous":true}\n';
  writeFileSync(targetPath, previous, "utf8");

  try {
    await assert.rejects(
      updateSnapshot({
        targetPath,
        fetchImpl: async () => new Response("blocked", {
          status: 403,
          headers: { "content-type": "text/html" },
        }),
      }),
      /403|JSON/i,
    );
    assert.equal(readFileSync(targetPath, "utf8"), previous);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("oversized chunked responses are stopped before they can exhaust memory", async () => {
  const { updateSnapshot } = await loadUpdater();
  const directory = mkdtempSync(join(tmpdir(), "gamepulse-snapshot-"));
  const targetPath = join(directory, "rankings.json");
  const previous = '{"previous":true}\n';
  const chunk = new Uint8Array(512 * 1024);
  let pulls = 0;
  writeFileSync(targetPath, previous, "utf8");

  try {
    await assert.rejects(
      updateSnapshot({
        targetPath,
        fetchImpl: async () => new Response(new ReadableStream({
          pull(controller) {
            pulls += 1;
            if (pulls > 20) {
              controller.close();
              return;
            }
            controller.enqueue(chunk);
          },
        }), { headers: { "content-type": "application/json" } }),
      }),
      /larger than 2 MiB|invalid size/i,
    );
    assert.ok(pulls <= 6, `read ${pulls} oversized chunks before stopping`);
    assert.equal(readFileSync(targetPath, "utf8"), previous);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("snapshot updater rejects an off-origin redirect before following it", async () => {
  const { updateSnapshot } = await loadUpdater();
  let requests = 0;
  await assert.rejects(
    updateSnapshot({
      targetPath: join(tmpdir(), `gamepulse-redirect-${Date.now()}.json`),
      fetchImpl: async () => {
        requests += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/return-to-source" },
        });
      },
    }),
    /redirected to another origin/i,
  );
  assert.equal(requests, 1);
});

test("snapshot updater follows a bounded same-origin redirect manually", async () => {
  const { SOURCE_URL, updateSnapshot } = await loadUpdater();
  const directory = mkdtempSync(join(tmpdir(), "gamepulse-snapshot-"));
  const targetPath = join(directory, "rankings.json");
  const requested = [];

  try {
    await updateSnapshot({
      targetPath,
      fetchImpl: async (url, options) => {
        requested.push({ url: String(url), redirect: options.redirect });
        if (requested.length === 1) {
          return new Response(null, {
            status: 307,
            headers: { location: "/api/rankings?refresh=1&retry=1" },
          });
        }
        return Response.json(makePayload());
      },
    });
    assert.equal(requested.length, 2);
    assert.equal(requested[0].redirect, "manual");
    assert.equal(new URL(requested[1].url).origin, new URL(SOURCE_URL).origin);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("successful refresh atomically replaces the snapshot", async () => {
  const { updateSnapshot } = await loadUpdater();
  const directory = mkdtempSync(join(tmpdir(), "gamepulse-snapshot-"));
  const targetPath = join(directory, "rankings.json");

  try {
    await updateSnapshot({
      targetPath,
      mirroredAt: "2026-08-30T00:05:00.000Z",
      fetchImpl: async () => Response.json(makePayload()),
    });
    const stored = JSON.parse(readFileSync(targetPath, "utf8"));
    assert.equal(stored.schemaVersion, 1);
    assert.equal(stored.rankings.overseas.length, 10);
    assert.equal(existsSync(`${targetPath}.tmp`), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
