import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime);
const projectRoot = join(root, "projects", "lunar-freight");

test("lunar freight is the final game with one explicit no-video exemption", () => {
  const lunar = apps.find(({ id }) => id === "lunar-freight");
  assert.ok(lunar);
  assert.equal(apps.at(-1)?.id, "lunar-freight");
  assert.equal(lunar.name, "月面货运");
  assert.equal(lunar.status, "game");
  assert.equal(lunar.entry, "./projects/lunar-freight/index.html");
  assert.equal(lunar.video, "");
  assert.equal(lunar.videoExemption, "user-request-no-video");
  assert.deepEqual(
    JSON.parse(JSON.stringify(
      apps.filter(({ video }) => !video).map(({ id, videoExemption }) => ({ id, videoExemption })),
    )),
    [{ id: "lunar-freight", videoExemption: "user-request-no-video" }],
  );

  const rankSource = runtime.slice(
    runtime.indexOf("function gameDisplayRank"),
    runtime.indexOf("function handleAppCardClick"),
  );
  const context = { defaultApps: apps };
  vm.runInNewContext(`${rankSource}\nglobalThis.rankGame = gameDisplayRank;`, context);
  const rankedGames = apps
    .filter(({ status }) => status === "game")
    .sort((left, right) => context.rankGame(left) - context.rankGame(right));
  assert.equal(rankedGames.at(-1)?.id, "lunar-freight");
});

test("the project wrapper keeps the Hub shell and opens the same-name game", () => {
  const html = readFileSync(join(projectRoot, "index.html"), "utf8");
  assert.match(html, /<title>月面货运<\/title>/u);
  assert.match(html, /<body class="hub-subpage">/u);
  assert.match(html, /href="\.\.\/\.\.\/assets\/subpage-shell\.css"/u);
  assert.match(html, /class="hub-home-link" href="\.\.\/\.\.\/index\.html#games"/u);
  assert.match(html, /<iframe[^>]+src="\.\/game\/index\.html"[^>]+title="月面货运实时 3D 游戏"/u);
});

test("the standalone build uses only existing relative asset targets", () => {
  const gameRoot = join(projectRoot, "game");
  const html = readFileSync(join(gameRoot, "index.html"), "utf8");
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//iu);
  assert.doesNotMatch(html, /(?:src|href)=["']\/_next(?:\/|["'])/iu);

  const targets = Array.from(
    html.matchAll(/(?:src|href)=["']([^"']+)["']/giu),
    (match) => match[1],
  ).filter((target) => !target.startsWith("data:"));
  assert.ok(targets.length >= 2);
  for (const target of targets) {
    assert.match(target, /^\.\//u, `asset target must remain relative: ${target}`);
    assert.equal(existsSync(resolve(gameRoot, target)), true, `missing built asset: ${target}`);
  }
});

test("the Hub thumbnail and reproducible capture metadata are present", () => {
  const thumbnail = join(root, "assets", "hub-showcase", "lunar-freight.webp");
  assert.equal(existsSync(thumbnail), true);
  assert.ok(statSync(thumbnail).size > 0);

  const sources = JSON.parse(readFileSync(join(root, "scripts", "hub-showcase-media-sources.json"), "utf8"));
  const capture = sources["lunar-freight"];
  assert.equal(capture.mode, "capture");
  assert.equal(capture.entry, "./projects/lunar-freight/game/index.html");
  assert.equal(capture.readySelector, ".launch-button");
  assert.equal(capture.clickSelector, ".launch-button");
  assert.equal(capture.focusSelector, "canvas");
  assert.match(capture.feature, /低重力|货物|能源/u);
});
