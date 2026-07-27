import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = (...parts) => join(root, "projects", "codex-quota-bar", ...parts);

test("Codex quota page explains the pet dashboard without simulating live quota", () => {
  const html = readFileSync(project("index.html"), "utf8");
  const script = readFileSync(project("app.js"), "utf8");
  const css = readFileSync(project("styles.css"), "utf8");

  assert.match(html, /返回主页/);
  assert.match(html, /<h1[^>]*>Codex 用量悬浮条<\/h1>/);
  assert.match(html, /效果示意/);
  assert.match(html, /任务已完成/);
  assert.match(html, /Codex 桌宠优先/);
  assert.match(html, /内置西装仓鼠/);
  assert.match(html, /只显示一个宠物/);
  assert.match(html, /开机启动与托盘/);
  assert.match(html, /本机数据与隐私/);
  assert.match(html, /Windows 与 macOS/);
  assert.match(html, /CodexQuotaBar-Windows-x64\.zip/);
  assert.match(html, /CodexQuotaBar-macOS\.zip/);
  assert.equal(
    (html.match(/releases\/download\/codex-quota-bar-v1\.0\.0/g) || []).length,
    2,
  );
  assert.match(html, /\.\/video\/index\.html/);
  assert.match(html, /\.\/assets\/suit-hamster\.gif/);
  assert.equal(existsSync(project("assets", "suit-hamster.gif")), true);
  assert.match(css, /body\.quota-page::before\s*\{\s*background:\s*none;/);
  assert.match(css, /body\.quota-page::after\s*\{\s*background:\s*rgba\(16, 16, 16, 0\.92\);/);
  assert.doesNotMatch(css, /clamp\([^)]*\bvw\b/);
  assert.doesNotMatch(html + script, /实时模拟|codexRange|sparkRange|localStorage|fetch\(/);
});
