import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const levelsPath = path.resolve(process.argv[2]
  ?? "E:\\Mahjong\\PawsHomeClient\\Assets\\Editor\\Res\\Config\\Gameplay\\EditorLevels");
const sourceHtml = path.join(projectRoot, "dist", "V曲线对比工具.html");
const fixtureDirectory = path.join(projectRoot, "artifacts", ".qa-temp");
const fixtureHtml = path.join(fixtureDirectory, "V曲线对比工具-QA.html");

const entries = (await readdir(levelsPath, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
  .sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
const payload = [];
for (const entry of entries) {
  payload.push({
    name: entry.name,
    text: await readFile(path.join(levelsPath, entry.name), "utf8"),
  });
}

const serialized = JSON.stringify(payload).replaceAll("<", "\\u003c");
const injection = `
<script type="module">
  const payload = ${serialized};
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const transfer = new DataTransfer();
  for (const entry of payload) {
    transfer.items.add(new File([entry.text], entry.name, { type: "application/json" }));
  }
  const input = document.querySelector("#file-input");
  Object.defineProperty(input, "files", { configurable: true, value: transfer.files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
</script>`;

const html = await readFile(sourceHtml, "utf8");
await mkdir(fixtureDirectory, { recursive: true });
await writeFile(fixtureHtml, html.replace("</body>", `${injection}\n</body>`), "utf8");
console.log(JSON.stringify({ fixtureHtml, files: payload.length }));
