import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';

const root = normalize(fileURLToPath(new URL('../', import.meta.url)));
const output = join(root, 'projects', 'brick-light-motion-lab', 'video', 'brick-light-motion-lab.mp4');
const videoDir = await mkdtemp(join(tmpdir(), 'brick-transition-video-'));
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
]);

const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
    const filePath = normalize(join(root, relative));
    if (!filePath.startsWith(root)) throw new Error('outside root');
    response.writeHead(200, { 'content-type': mime.get(extname(filePath)) ?? 'application/octet-stream' });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

try {
  await page.goto(`http://127.0.0.1:${port}/projects/brick-light-motion-lab/lab/index.html`);
  await page.waitForSelector('body[data-ready="true"]');
  await page.locator('#pause-all').click();
  await page.locator('[data-speed="1"]').click();
  await page.evaluate(() => {
    const caption = document.createElement('div');
    caption.id = 'recording-caption';
    Object.assign(caption.style, {
      position: 'fixed',
      left: '50%',
      bottom: '24px',
      zIndex: '9999',
      transform: 'translateX(-50%)',
      padding: '10px 18px',
      borderRadius: '9px',
      color: '#10200e',
      background: '#d8ff78',
      font: '700 18px/1.2 "Microsoft YaHei UI", sans-serif',
      whiteSpace: 'nowrap',
    });
    caption.textContent = '上层移出时点亮；沿路径返回时严格反向压暗';
    document.body.append(caption);
  });
  await page.waitForTimeout(1500);

  const scenes = [
    ['horizontal-blinds', '横向百叶窗：从上到下依次打开'],
    ['vertical-blinds', '纵向百叶窗：从左到右依次打开'],
    ['checkerboard', '棋盘格拼亮：中心、四角、四边'],
    ['center-expand', '中心展开：亮态由中心扩向四边'],
    ['scale-pop', '缩放弹出：82% → 106% → 100%'],
    ['vertical-unfold', '纵向压扁：从中轴展开并收稳'],
    ['flip-3d', '轻微 3D 翻面：克制的角度变化'],
    ['edge-release', '四边解除压暗：四片覆盖向外退出'],
    ['recommended', '推荐：中心遮罩揭示＋轻回弹'],
  ];

  for (const [id, caption] of scenes) {
    await page.evaluate((text) => {
      document.querySelector('#recording-caption').textContent = text;
    }, caption);
    await page.locator(`article[data-variant="${id}"] [data-action="replay"]`).click();
    await page.waitForTimeout(2200);
  }

  await page.evaluate(() => {
    document.querySelector('#recording-caption').textContent = '所有方案完全点亮后都回到同一普通砖块状态';
  });
  await page.waitForTimeout(1200);

  const video = page.video();
  await context.close();
  const webm = await video.path();
  const conversion = spawnSync(ffmpegPath, [
    '-y',
    '-i', webm,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output,
  ], { encoding: 'utf8' });
  if (conversion.status !== 0) throw new Error(conversion.stderr);
} finally {
  await browser.close().catch(() => {});
  server.close();
  await rm(videoDir, { recursive: true, force: true });
}

console.log(output);
