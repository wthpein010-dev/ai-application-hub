import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export function bundleArtifactNames(version) {
  const executableStem = `V曲线对比工具-${version}-Windows-x64`;
  const bundleStem = `V曲线对比工具-${version}-开箱即用`;
  const zip = `${bundleStem}-Windows-x64.zip`;
  return {
    directory: bundleStem,
    executable: `${executableStem}.exe`,
    executableChecksum: `${executableStem}.sha256.txt`,
    zip,
    zipChecksum: `${zip}.sha256.txt`,
  };
}

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) count += await countFiles(path.join(directory, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function checksumLine(bytes, name) {
  return `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`;
}

function assertDirectChild(parent, child) {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (path.dirname(resolvedChild) !== resolvedParent) {
    throw new Error(`打包目录必须直接位于 release：${resolvedChild}`);
  }
}

export async function stageBundledRelease({ releaseDirectory, levelsDirectory, version }) {
  const resolvedRelease = path.resolve(releaseDirectory);
  const resolvedLevels = path.resolve(levelsDirectory);
  if (!["editorlevel", "editorlevels-v150"].includes(path.basename(resolvedLevels).toLowerCase())) {
    throw new Error(`本开箱即用包只接受已确认的 Editorlevel：${resolvedLevels}`);
  }
  const levelInfo = await stat(resolvedLevels);
  if (!levelInfo.isDirectory()) throw new Error(`Editorlevel 不是目录：${resolvedLevels}`);

  const names = bundleArtifactNames(version);
  const executablePath = path.join(resolvedRelease, names.executable);
  const executableBytes = await readFile(executablePath);
  const bundleDirectory = path.join(resolvedRelease, names.directory);
  assertDirectChild(resolvedRelease, bundleDirectory);

  await rm(bundleDirectory, { recursive: true, force: true });
  await mkdir(bundleDirectory, { recursive: true });
  await cp(executablePath, path.join(bundleDirectory, names.executable));
  await cp(resolvedLevels, path.join(bundleDirectory, "Editorlevel"), { recursive: true });

  const executableChecksum = checksumLine(executableBytes, names.executable);
  await writeFile(
    path.join(bundleDirectory, names.executableChecksum),
    executableChecksum,
    "utf8",
  );
  await writeFile(
    path.join(bundleDirectory, "使用说明.txt"),
    [
      `V 曲线对比工具 ${version} 开箱即用版`,
      "",
      `1. 解压整个压缩包。`,
      `2. 保持 Editorlevel 文件夹与 ${names.executable} 在同一目录。`,
      `3. 双击 ${names.executable}，工具自动加载 Editorlevel 的 32 个关卡，并先展示 900121 与 level_0020 的参考截图样例。`,
      "4. 默认使用参考模型复现原图。参考右关卡图案池为17种；切换导入的当前 level_0020 后读取真实文件的19种。",
      "5. 左右两侧都可使用“选择文件夹”或“选择 JSON”导入并切换其他关卡。",
      "6. 工程模型（简化无道具）关闭侧锁，读取当前随机区间、爽消与平铺配牌；横轴仅计算真实消除进度。",
      "7. 参考模型横轴包含入槽，原图锯齿有统计条件差异；河道下界尾段已修复截断，有限重启包络不是数学绝对边界。",
      "",
      "说明：此本地构建未进行商业数字签名，Windows 首次运行可能显示“未知发布者”。",
      "",
    ].join("\r\n"),
    "utf8",
  );

  return {
    bundleDirectory,
    sourceFileCount: await countFiles(resolvedLevels),
    executableSha256: executableChecksum.slice(0, 64),
    names,
  };
}
