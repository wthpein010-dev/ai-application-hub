import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const source = await readFile(new URL("./app-20260706-restore-games.js", import.meta.url), "utf8");
const home = await readFile(new URL("./index.html", import.meta.url), "utf8");

assert.match(source, /id: "ai-game-requirements-workshop"/);
assert.match(source, /name: "AI游戏需求工坊"/);
assert.match(source, /https:\/\/gamepop-studio-20260713\.polite-chord-7994\.chatgpt\.site/);
assert.match(source, /projects\/ai-game-requirements-workshop\/video\/index\.html/);
assert.match(source, /web: \{ href: "https:\/\/gamepop-studio-20260713\.polite-chord-7994\.chatgpt\.site", label: "演示" \}/);

const defaultAppsSource = source.match(/const defaultApps = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const ids = [...defaultAppsSource.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]);
assert.ok(ids.length > 0, "defaultApps should contain application ids");
assert.equal(new Set(ids).size, ids.length, "application ids must be unique");
assert.match(home, /app-20260706-restore-games\.js\?v=20260715-ai-game-requirements-workshop/);

await access(new URL("./projects/ai-game-requirements-workshop/video/index.html", import.meta.url));
await access(new URL("./projects/ai-game-requirements-workshop/video/ai-game-requirements-workshop.mp4", import.meta.url));
await access(new URL("./projects/ai-game-requirements-workshop/video/ai-game-requirements-workshop.vtt", import.meta.url));
await access(new URL("./projects/ai-game-requirements-workshop/video/poster.jpg", import.meta.url));

console.log("AI游戏需求工坊应用中心资源校验通过。");
