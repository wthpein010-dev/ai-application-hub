import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(desktop, "build", "icon.png");
await mkdir(dirname(output), { recursive: true });

async function launchBrowser() {
  const failures = [];
  for (const options of [{ headless: true }, { channel: "chrome", headless: true }]) {
    try { return await chromium.launch(options); } catch (error) { failures.push(error.message); }
  }
  throw new Error(`No Chromium browser can render the desktop icon.\n${failures.join("\n")}`);
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><style>
    *{box-sizing:border-box}html,body{margin:0;width:512px;height:512px;overflow:hidden}
    body{display:grid;place-items:center;background:#07110f;font-family:"Microsoft YaHei UI","PingFang SC",sans-serif}
    .icon{position:relative;width:456px;height:456px;overflow:hidden;border:3px solid #3da983;border-radius:104px;background:#0b1916;box-shadow:inset 0 0 0 13px #10241f}
    .grid{position:absolute;inset:0;background:linear-gradient(rgba(93,226,179,.07) 2px,transparent 2px),linear-gradient(90deg,rgba(93,226,179,.07) 2px,transparent 2px);background-size:46px 46px}
    .relay{position:absolute;top:78px;right:-44px;width:350px;height:62px;border-radius:40px;background:#5de2b3;transform:rotate(-36deg);box-shadow:0 0 45px rgba(93,226,179,.35)}
    .relay:after{content:"";position:absolute;right:24px;top:15px;width:27px;height:27px;border-top:7px solid #07110f;border-right:7px solid #07110f;transform:rotate(45deg)}
    .letters{position:absolute;left:54px;bottom:66px;color:#eff8f4;font-size:176px;font-weight:900;line-height:.86;text-shadow:0 12px 30px rgba(0,0,0,.35)}
    .label{position:absolute;right:38px;bottom:54px;color:#5de2b3;font-size:28px;font-weight:800;letter-spacing:3px}
  </style><body><div class="icon"><div class="grid"></div><div class="relay"></div><div class="letters">接</div><div class="label">需求接力站</div></div></body></html>`);
  await page.screenshot({ path: output, type: "png" });
} finally {
  await browser.close();
}

console.log(`需求接力站 icon generated: ${output}`);
