import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPawsLanServer } from "../tools/paws-level-editor-lan/server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webRoot = path.join(repositoryRoot, "projects", "paws-level-editor");
const publishedLevelDir = process.env.PAWS_LAN_BROWSER_LEVEL_SOURCE_DIR
  || path.join(webRoot, "levels");
const blockAssetDir = process.env.PAWS_LAN_BROWSER_BLOCK_ASSET_DIR
  || path.join(webRoot, "assets", "blocks");
const defaultFileName = "level_0021_r2_第二关模板12.json";
const password = "browser-test-only";

function collectBrowserErrors(page, label, errors) {
  page.on("pageerror", (error) => errors.push(`${label} page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label} console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(`${label} request: ${request.method()} ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${label} http: ${response.status()} ${response.url()}`);
    }
  });
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "paws-lan-browser-"));
  const levelDir = path.join(root, "EditorLevels");
  await mkdir(levelDir, { recursive: true });
  const published = (await readdir(publishedLevelDir))
    .filter((name) => name.endsWith(".json") && name !== "index.json");
  const fallbackFileName = published.find((name) => name !== defaultFileName);
  assert.ok(fallbackFileName, "a fallback published level is required");
  for (const fileName of [defaultFileName, fallbackFileName]) {
    await copyFile(path.join(publishedLevelDir, fileName), path.join(levelDir, fileName));
    try {
      await copyFile(
        path.join(publishedLevelDir, `${fileName}.meta`),
        path.join(levelDir, `${fileName}.meta`),
      );
    } catch {
      const guid = createHash("md5").update(fileName, "utf8").digest("hex");
      await writeFile(path.join(levelDir, `${fileName}.meta`), `guid: ${guid}\n`, "utf8");
    }
  }
  return { root, levelDir, fallbackFileName };
}

async function launchBrowser() {
  const attempts = [
    { headless: true },
    { channel: "chrome", headless: true },
    { channel: "msedge", headless: true },
  ];
  const failures = [];
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(`No Chromium browser available:\n${failures.join("\n")}`);
}

async function waitForWorkbench(page, fileName = defaultFileName) {
  await page.waitForFunction((expectedFileName) => {
    const controller = window.pawsWorkbench;
    return controller?.runtimeMode === "lan"
      && controller.document?.fileName === expectedFileName
      && controller.catalogUnsubscribe;
  }, fileName);
}

async function completeLogin(page) {
  await page.locator("#login-dialog").waitFor({ state: "visible" });
  await page.locator("#login-password").fill(password);
  await page.locator('#login-form button[value="login"]').click();
  await page.locator("#login-dialog").waitFor({ state: "hidden" });
}

async function deleteCurrentLevel(page, { login = false } = {}) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#delete-local-level").click();
  if (login) await completeLogin(page);
}

async function openAndRestoreFirstTrashItem(page, { login = false } = {}) {
  await page.locator("#open-trash").click();
  const restore = page.locator("#trash-list .trash-card button").first();
  await restore.waitFor({ state: "visible" });
  await restore.click();
  if (login) await completeLogin(page);
}

const fixture = await createFixture();
const server = createPawsLanServer({
  levelDir: fixture.levelDir,
  blockAssetDir,
  webRoot,
  password,
  defaultFileName,
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await launchBrowser();
const browserErrors = [];

try {
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  collectBrowserErrors(pageA, "A", browserErrors);
  collectBrowserErrors(pageB, "B", browserErrors);
  await Promise.all([
    pageA.goto(`${baseUrl}/index.html`),
    pageB.goto(`${baseUrl}/index.html`),
  ]);
  await Promise.all([waitForWorkbench(pageA), waitForWorkbench(pageB)]);

  await deleteCurrentLevel(pageA, { login: true });
  await Promise.all([
    pageA.waitForFunction((name) => window.pawsWorkbench.document?.fileName === name, fixture.fallbackFileName),
    pageB.waitForFunction((name) => window.pawsWorkbench.document?.fileName === name, fixture.fallbackFileName),
    pageB.waitForFunction(() => window.pawsWorkbench.trashLevels.length === 1),
  ]);
  const trashed = await readdir(path.join(fixture.levelDir, "_Trash"));
  assert.equal(trashed.filter((name) => name.endsWith(".json")).length, 1);
  assert.equal(trashed.filter((name) => name.endsWith(".json.meta")).length, 1);
  await assert.rejects(access(path.join(fixture.levelDir, defaultFileName)));
  await assert.rejects(access(path.join(fixture.levelDir, `${defaultFileName}.meta`)));

  await openAndRestoreFirstTrashItem(pageB, { login: true });
  await Promise.all([
    waitForWorkbench(pageB),
    pageA.waitForFunction((name) =>
      window.pawsWorkbench.levels.some((level) => level.fileName === name), defaultFileName),
  ]);
  assert.match(
    await readFile(path.join(fixture.levelDir, `${defaultFileName}.meta`), "utf8"),
    /^guid:\s*[0-9a-f]+$/im,
  );
  await pageA.waitForTimeout(50);
  assert.equal(browserErrors.length, 4, `unexpected authentication errors:\n${browserErrors.join("\n")}`);
  assert.equal(
    browserErrors.every((message) =>
      message.includes("401")
      || message.includes("/api/levels/delete")
      || message.includes("/api/trash/restore")),
    true,
    `only the two expected write-authentication challenges are allowed:\n${browserErrors.join("\n")}`,
  );
  browserErrors.length = 0;

  await pageA.evaluate((name) => window.pawsWorkbench.openLevel(name, { discardDirty: true }), defaultFileName);
  await waitForWorkbench(pageA);
  await pageB.evaluate(() => {
    const controller = window.pawsWorkbench;
    const tile = controller.document.tiles[0];
    controller.history.execute({
      apply(document) { document.tiles[0].x += 0.25; },
      revert(document) { document.tiles[0].x -= 0.25; },
    });
    controller.updateUI();
    return { uid: tile.uid, dirty: controller.isDirty() };
  });
  assert.equal(await pageB.evaluate(() => window.pawsWorkbench.isDirty()), true);

  await deleteCurrentLevel(pageA);
  await Promise.all([
    pageA.waitForFunction((name) => window.pawsWorkbench.document?.fileName === name, fixture.fallbackFileName),
    pageB.waitForFunction((name) => {
      const controller = window.pawsWorkbench;
      return controller.document?.fileName === name
        && controller.isDirty()
        && !controller.levels.some((level) => level.fileName === name);
    }, defaultFileName),
  ]);
  assert.equal(
    await pageB.evaluate(() => document.querySelector("#stage-toast")?.textContent.includes("未保存内容仍保留")),
    true,
  );

  await openAndRestoreFirstTrashItem(pageA);
  await Promise.all([
    waitForWorkbench(pageA),
    pageB.waitForFunction((name) => {
      const controller = window.pawsWorkbench;
      return controller.isDirty()
        && controller.document?.fileName === name
        && controller.levels.some((level) => level.fileName === name);
    }, defaultFileName),
  ]);
  assert.deepEqual(browserErrors, []);
  console.log("Paws LAN browser smoke passed: two-client delete, restore, SSE, meta and dirty preservation.");
} finally {
  await browser.close();
  server.close();
  await once(server, "close");
  await rm(fixture.root, { recursive: true, force: true });
}
