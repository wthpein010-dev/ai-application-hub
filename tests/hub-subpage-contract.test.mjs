import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDefaultAppsFromRuntime } from "./helpers/default-apps.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = readFileSync(join(root, "app-20260706-restore-games.js"), "utf8");
const apps = loadDefaultAppsFromRuntime(runtime).filter((app) => app.entry?.startsWith("./projects/"));

function sectionFor(app) {
  if (app.status === "game") return "games";
  if (app.status === "ai" || app.status === "engineering") return "engineering";
  return "apps";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function attribute(tag, name) {
  return new RegExp(`\\b${name}=["']([^"']*)["']`, "i").exec(tag)?.[1] || "";
}

function hasClass(tag, className) {
  return attribute(tag, "class").split(/\s+/).includes(className);
}

function localLinkTarget(pagePath, href) {
  const clean = decodeHtml(href).split(/[?#]/, 1)[0];
  if (!clean || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(clean)) return null;
  return resolve(dirname(pagePath), decodeURIComponent(clean).replaceAll("/", sep));
}

test("all local entries use one shared fixed return control", () => {
  assert.equal(apps.length, 26);
  for (const app of apps) {
    const pagePath = join(root, ...app.entry.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    const rootFromPage = relative(dirname(pagePath), root).replaceAll(sep, "/") || ".";
    const expectedHome = `${rootFromPage}/index.html#${sectionFor(app)}`;
    const expectedShell = `${rootFromPage}/assets/subpage-shell.css`;
    const bodyTag = /<body\b[^>]*>/i.exec(html)?.[0] || "";
    const anchors = html.match(/<a\b[^>]*>/gi) || [];
    const homeAnchors = anchors.filter((tag) => hasClass(tag, "hub-home-link"));

    assert.equal(hasClass(bodyTag, "hub-subpage"), true, `${app.id} body shell`);
    assert.match(html, new RegExp(`href=["']${expectedShell.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`), `${app.id} shell stylesheet`);
    assert.equal(homeAnchors.length, 1, `${app.id} should have one shared home control`);
    assert.equal(attribute(homeAnchors[0], "href"), expectedHome, `${app.id} home section`);
    assert.doesNotMatch(html, /全部项目总览\.html/, `${app.id} obsolete home path`);
  }
});

test("entry document titles match their current catalog names", () => {
  for (const app of apps) {
    const pagePath = join(root, ...app.entry.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    const title = decodeHtml(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]).replace(/\s+/g, " ").trim();
    assert.equal(title, app.name, app.id);
  }
});

test("every local entry declares an icon without a root favicon request", () => {
  for (const app of apps) {
    const pagePath = join(root, ...app.entry.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    assert.match(html, /<link\b[^>]*\brel=["'][^"']*icon[^"']*["'][^>]*>/i, app.id);
  }
});

test("every visible local entry link resolves inside the publication", () => {
  for (const app of apps) {
    const pagePath = join(root, ...app.entry.replace(/^\.\//, "").split("/"));
    const html = readFileSync(pagePath, "utf8");
    for (const tag of html.match(/<a\b[^>]*>/gi) || []) {
      const href = attribute(tag, "href");
      const target = localLinkTarget(pagePath, href);
      if (!target) continue;
      const fromRoot = relative(root, target);
      assert.equal(isAbsolute(fromRoot) || fromRoot.startsWith(`..${sep}`), false, `${app.id} link escapes root: ${href}`);
      const resolvedTarget = existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
      assert.equal(existsSync(resolvedTarget), true, `${app.id} missing link: ${href}`);
    }
  }
});

test("the shared return control remains fixed on desktop and mobile", () => {
  const css = readFileSync(join(root, "assets", "subpage-shell.css"), "utf8");
  const mobile = /@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] || "";
  const bodyRule = /body\.hub-subpage\s*\{([\s\S]*?)\}/.exec(css)?.[1] || "";

  assert.match(css, /\.hub-home-link\s*\{[\s\S]*?position:\s*fixed/);
  assert.doesNotMatch(mobile, /\.hub-home-link\s*\{[\s\S]*?position:\s*absolute/);
  assert.doesNotMatch(bodyRule, /\bbackground\s*:/);
  assert.doesNotMatch(css, /body\.hub-subpage::(?:before|after)/);
});
