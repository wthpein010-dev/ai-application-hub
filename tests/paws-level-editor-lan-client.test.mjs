import assert from "node:assert/strict";
import test from "node:test";

import { createLanApiClient } from "../projects/paws-level-editor/lan-api-client.mjs";
import { createRuntimeApiClient } from "../projects/paws-level-editor/runtime-api-client.mjs";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("runtime selection uses LAN only after an explicit same-origin LAN health response", async () => {
  const requests = [];
  const api = await createRuntimeApiClient({
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return jsonResponse({ mode: "lan", online: true, canDeleteBundled: true });
    },
    storage: storage(),
  });

  assert.equal(api.runtimeMode, "lan");
  assert.equal(api.canDeleteBundled, true);
  assert.equal(requests[0].url, "/api/health");
  assert.equal(requests[0].options.credentials, "same-origin");
});

test("runtime selection silently falls back to browser storage for Pages or invalid health", async () => {
  for (const response of [
    new Response("Not found", { status: 404 }),
    jsonResponse({ mode: "static", online: true }),
    new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }),
  ]) {
    const api = await createRuntimeApiClient({
      fetchImpl: async () => response.clone(),
      storage: storage(),
    });
    assert.equal(api.runtimeMode, "static");
    assert.equal(api.canDeleteBundled, false);
  }
});

test("LAN client sends credentials, optimistic versions and trash IDs to fixed endpoints", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/levels") {
      return jsonResponse({ defaultFileName: "level_1.json", levels: [] });
    }
    if (url === "/api/trash") return jsonResponse({ levels: [{ trashId: "old_20260723_010203.json" }] });
    return jsonResponse({ fileName: "level_1.json", version: "v2", value: {} });
  };
  const api = createLanApiClient({ fetchImpl, EventSourceImpl: null });

  assert.deepEqual(await api.listLevelCatalog(), {
    defaultFileName: "level_1.json",
    levels: [],
  });
  assert.equal((await api.listTrash()).length, 1);
  await api.deleteLevel("level_1.json", { expectedVersion: "v1" });
  await api.restoreLevel("old_20260723_010203.json");
  await api.login("session-only");

  const deletion = requests.find(({ url }) => url === "/api/levels/delete");
  assert.equal(deletion.options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(deletion.options.body), {
    fileName: "level_1.json",
    expectedVersion: "v1",
  });
  assert.deepEqual(
    JSON.parse(requests.find(({ url }) => url === "/api/trash/restore").options.body),
    { trashId: "old_20260723_010203.json" },
  );
  assert.deepEqual(
    JSON.parse(requests.find(({ url }) => url === "/api/auth/login").options.body),
    { password: "session-only" },
  );
});

test("LAN catalog subscription parses catalog events and closes cleanly", () => {
  class FakeEventSource {
    static instances = [];
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listeners = new Map();
      FakeEventSource.instances.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    close() { this.closed = true; }
  }
  const api = createLanApiClient({ fetchImpl: async () => jsonResponse({}), EventSourceImpl: FakeEventSource });
  const events = [];
  const unsubscribe = api.subscribeCatalog((event) => events.push(event));
  const source = FakeEventSource.instances[0];

  assert.equal(source.url, "/api/events");
  assert.equal(source.options.withCredentials, true);
  source.listeners.get("catalog")({ data: JSON.stringify({ revision: 2, reason: "level-deleted" }) });
  assert.deepEqual(events, [{ revision: 2, reason: "level-deleted" }]);
  unsubscribe();
  assert.equal(source.closed, true);
});

