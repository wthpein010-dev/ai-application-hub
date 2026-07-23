import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createPawsLanServer } from "../tools/paws-level-editor-lan/server.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "paws-lan-server-"));
  const levelDir = path.join(root, "EditorLevels");
  const blockAssetDir = path.join(root, "Blocks");
  const webRoot = path.join(root, "web");
  await Promise.all([
    mkdir(levelDir, { recursive: true }),
    mkdir(blockAssetDir, { recursive: true }),
    mkdir(webRoot, { recursive: true }),
  ]);
  const fileName = "level_0001_第一关.json";
  await writeFile(
    path.join(levelDir, fileName),
    `${JSON.stringify({ id: 1, name: "第一关", tiles: [] })}\n`,
    "utf8",
  );
  await writeFile(path.join(levelDir, `${fileName}.meta`), "guid: one\n", "utf8");
  await writeFile(path.join(blockAssetDir, "block_1.png"), Buffer.from([137, 80, 78, 71]));
  await writeFile(path.join(webRoot, "index.html"), "<!doctype html><title>LAN</title>", "utf8");
  return { root, levelDir, blockAssetDir, webRoot, fileName };
}

async function start(data) {
  const server = createPawsLanServer({
    levelDir: data.levelDir,
    blockAssetDir: data.blockAssetDir,
    webRoot: data.webRoot,
    password: "test-secret",
    defaultFileName: data.fileName,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ password: "test-secret" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

async function closeServer(server) {
  server.close();
  await once(server, "close");
}

test("LAN server protects writes and supports delete, trash listing and restore", async (t) => {
  const data = await fixture();
  const { server, baseUrl } = await start(data);
  t.after(async () => {
    await closeServer(server);
    await rm(data.root, { recursive: true, force: true });
  });

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.mode, "lan");
  assert.equal(health.online, true);
  assert.equal(health.canDeleteBundled, true);
  const catalog = await fetch(`${baseUrl}/api/levels`).then((response) => response.json());
  const level = catalog.levels[0];
  assert.equal(catalog.defaultFileName, data.fileName);

  const unauthorized = await fetch(`${baseUrl}/api/levels/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ fileName: data.fileName, expectedVersion: level.version }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.code, "authentication-required");

  const cookie = await login(baseUrl);
  const deletedResponse = await fetch(`${baseUrl}/api/levels/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: baseUrl },
    body: JSON.stringify({ fileName: data.fileName, expectedVersion: level.version }),
  });
  assert.equal(deletedResponse.status, 200);
  const deleted = await deletedResponse.json();
  const trash = await fetch(`${baseUrl}/api/trash`).then((response) => response.json());
  assert.equal(trash.levels.length, 1);
  assert.equal(trash.levels[0].trashId, deleted.trashId);

  const restoredResponse = await fetch(`${baseUrl}/api/trash/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: baseUrl },
    body: JSON.stringify({ trashId: deleted.trashId }),
  });
  assert.equal(restoredResponse.status, 200);
  assert.equal((await restoredResponse.json()).fileName, data.fileName);
  assert.equal((await fetch(`${baseUrl}/api/trash`).then((response) => response.json())).levels.length, 0);

  const block = await fetch(`${baseUrl}/api/assets/blocks/1`);
  assert.equal(block.status, 200);
  assert.equal(block.headers.get("content-type"), "image/png");
  assert.equal(block.headers.get("cache-control"), "no-cache");
  assert.equal((await fetch(`${baseUrl}/api/assets/blocks/999`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/levels/..%2Fsecret.json`)).status, 400);
});
test("SSE sends an initial catalog event and an immediate service mutation event", async (t) => {
  const data = await fixture();
  const { server, baseUrl } = await start(data);
  const abort = new AbortController();
  t.after(async () => {
    abort.abort();
    await closeServer(server);
    await rm(data.root, { recursive: true, force: true });
  });
  const cookie = await login(baseUrl);
  const stream = await fetch(`${baseUrl}/api/events`, { signal: abort.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let received = decoder.decode((await reader.read()).value, { stream: true });
  assert.match(received, /event: catalog/);
  assert.match(received, /"reason":"connected"/);

  const catalog = await fetch(`${baseUrl}/api/levels`).then((response) => response.json());
  await fetch(`${baseUrl}/api/levels/delete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: baseUrl },
    body: JSON.stringify({
      fileName: data.fileName,
      expectedVersion: catalog.levels[0].version,
    }),
  });
  const deadline = Date.now() + 3000;
  while (!received.includes('"reason":"level-deleted"') && Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += decoder.decode(chunk.value, { stream: true });
  }
  assert.match(received, /"reason":"level-deleted"/);
});

test("SSE reports JSON files added directly to the Unity level directory", async (t) => {
  const data = await fixture();
  const { server, baseUrl } = await start(data);
  const abort = new AbortController();
  t.after(async () => {
    abort.abort();
    await closeServer(server);
    await rm(data.root, { recursive: true, force: true });
  });

  const stream = await fetch(`${baseUrl}/api/events`, { signal: abort.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let received = decoder.decode((await reader.read()).value, { stream: true });
  assert.match(received, /"reason":"connected"/);

  await writeFile(
    path.join(data.levelDir, "level_0002_外部新增.json"),
    `${JSON.stringify({ id: 2, name: "外部新增", tiles: [] })}\n`,
    "utf8",
  );

  const deadline = Date.now() + 3000;
  while (!received.includes('"reason":"filesystem-change"') && Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += decoder.decode(chunk.value, { stream: true });
  }
  assert.match(received, /"reason":"filesystem-change"/);
});
