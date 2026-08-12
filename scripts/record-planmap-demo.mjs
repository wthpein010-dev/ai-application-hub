import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const videoRoot = join(root, "projects", "planmap", "video");
const mime = new Map([[".html","text/html; charset=utf-8"],[".js","text/javascript; charset=utf-8"],[".css","text/css; charset=utf-8"],[".svg","image/svg+xml"]]);
const server = createServer(async (request,response) => {
  try {
    const url = new URL(request.url,"http://127.0.0.1");
    let path = join(root,decodeURIComponent(url.pathname).replace(/^\/+/,""));
    if (url.pathname.endsWith("/")) path = join(path,"index.html");
    const data = await readFile(path); response.writeHead(200,{"Content-Type":mime.get(extname(path)) || "application/octet-stream"}); response.end(data);
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise((resolve) => server.listen(0,"127.0.0.1",resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(videoRoot,{recursive:true});

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined),
});
const context = await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:videoRoot,size:{width:1280,height:720}},deviceScaleFactor:1,reducedMotion:"reduce"});
const page = await context.newPage();
page.on("dialog",(dialog) => dialog.dismiss());
await page.goto(`${origin}/projects/planmap/app/index.html`,{waitUntil:"networkidle"});
await page.evaluate(() => localStorage.clear());
await page.reload({waitUntil:"networkidle"});
const recording = page.video();

await page.waitForTimeout(8000);
await page.getByPlaceholder("描述你的策划，或告诉我怎么调整…").fill("重新做一个校园音乐节完整策划");
await page.getByLabel("发送消息").click();
await page.getByText("校园音乐节策划",{exact:true}).waitFor();
await page.screenshot({path:join(videoRoot,"poster.jpg"),type:"jpeg",quality:91});
await page.waitForTimeout(9000);
await page.getByText("执行保障",{exact:true}).click();
await page.waitForTimeout(2000);
await page.getByPlaceholder(/告诉我怎么调整/).fill("展开这部分，补充风险预案");
await page.getByLabel("发送消息").click();
await page.getByText("天气备选方案",{exact:true}).waitFor();
await page.waitForTimeout(8000);
await page.getByLabel("打开设置").click();
await page.getByRole("button",{name:"清新青绿"}).click();
await page.waitForTimeout(5000);
await page.getByRole("button",{name:"向右展开"}).click();
await page.waitForTimeout(7000);
await page.getByRole("button",{name:"完成"}).click();
await page.waitForTimeout(3000);
await page.getByRole("button",{name:/导出/}).click();
await page.getByText("XMind 文件",{exact:true}).waitFor();
await page.waitForTimeout(22000);
await context.close(); await browser.close(); server.close();

const webmPath = await recording.path();
const outputPath = join(videoRoot,"planmap-demo.mp4");
const result = spawnSync(process.env.FFMPEG_PATH || ffmpegPath,["-y","-hide_banner","-i",webmPath,"-vf","scale=1280:720:flags=lanczos,fps=30","-an","-c:v","libx264","-profile:v","high","-level","4.0","-pix_fmt","yuv420p","-preset","medium","-crf","20","-movflags","+faststart",outputPath],{encoding:"utf8"});
if (result.status !== 0) throw new Error(result.stderr || "ffmpeg failed");
console.log(outputPath);
