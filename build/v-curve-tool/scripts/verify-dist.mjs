import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distPath = path.join(projectRoot, "dist");
const expectedName = "V曲线对比工具.html";
const files = await readdir(distPath);

assert.deepEqual(files, [expectedName], "dist 必须只包含一个最终 HTML");
const htmlPath = path.join(distPath, expectedName);
const html = await readFile(htmlPath, "utf8");
const info = await stat(htmlPath);

assert.ok(info.size > 200_000, "最终 HTML 体积异常，可能没有内联依赖");
assert.match(html, /900121/, "最终 HTML 必须内置羊 900121 数据");
assert.match(html, /vcurve-comparison\/1/, "最终 HTML 必须内置报告逻辑");
assert.match(html, /new Worker/, "最终 HTML 必须内置分析 Worker 启动代码");
assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, "不得引用外部脚本");
assert.doesNotMatch(html, /<link\b[^>]*\brel=["']?stylesheet[^>]*\bhref\s*=/i, "不得引用外部样式");

const urls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
const externalUrls = urls.filter((url) => url !== "http://www.w3.org/2000/svg");
assert.deepEqual(externalUrls, [], "最终 HTML 不得包含网络资源 URL");

console.log(JSON.stringify({
  file: htmlPath,
  bytes: info.size,
  files: files.length,
  workerInlined: true,
  sheepInlined: true,
  externalUrls: externalUrls.length,
  note: "两个 W3C SVG namespace 字符串来自 PNG 渲染库，不会发起网络请求。",
}, null, 2));
