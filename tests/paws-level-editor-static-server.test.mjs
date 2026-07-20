import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  StaticPathError,
  resolveStaticAsset,
  startStaticServer,
} from "./support/paws-static-server.mjs";

async function createEscapeFixture(t) {
  const parent = await mkdtemp(join(tmpdir(), "paws-static-server-"));
  const root = join(parent, "root");
  const outside = join(parent, "outside");
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(root, "index.html"), "inside", "utf8");
  await writeFile(join(outside, "secret.txt"), "outside-secret", "utf8");
  await writeFile(join(outside, "index.html"), "outside-index", "utf8");
  await symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { outside, root };
}

async function assertForbidden(operation) {
  await assert.rejects(
    operation,
    (error) => error instanceof StaticPathError && error.status === 403,
  );
}

test("resolver rejects a symlink or junction that escapes the real static root", async (t) => {
  const { root } = await createEscapeFixture(t);

  await assertForbidden(() => resolveStaticAsset(root, "/escape/secret.txt"));
  await assertForbidden(() => resolveStaticAsset(root, "/escape/"));
});

test("resolver rechecks a symlinked directory index when file symlinks are available", async (t) => {
  const { outside, root } = await createEscapeFixture(t);
  const nested = join(root, "nested");
  await mkdir(nested);
  try {
    await symlink(
      join(outside, "index.html"),
      join(nested, "index.html"),
      process.platform === "win32" ? "file" : undefined,
    );
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("Windows file symlink permission unavailable; directory junction coverage ran");
      return;
    }
    throw error;
  }

  await assertForbidden(() => resolveStaticAsset(root, "/nested/"));
});

test("server binds loopback and never serves content through an escaping link", async (t) => {
  const { root } = await createEscapeFixture(t);
  const server = await startStaticServer({ root });
  t.after(() => server.close());

  assert.equal(server.address.address, "127.0.0.1");
  for (const pathname of ["/escape/secret.txt", "/escape/"]) {
    const response = await fetch(`${server.baseUrl}${pathname}`);
    const body = await response.text();
    assert.equal([403, 404].includes(response.status), true, `${pathname}: ${response.status}`);
    assert.doesNotMatch(body, /outside-secret|outside-index/);
  }
});
