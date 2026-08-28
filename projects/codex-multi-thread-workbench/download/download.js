import {
  assembleDownload,
  sha256Hex,
  validateManifest
} from "./download-core.js";

const elements = {
  downloadButton: document.querySelector('[data-role="download-button"]'),
  retryButton: document.querySelector('[data-role="retry-button"]'),
  progress: document.querySelector('[data-role="progress"]'),
  progressText: document.querySelector('[data-role="progress-text"]'),
  status: document.querySelector('[data-role="status"]'),
  error: document.querySelector('[data-role="error"]'),
  fileName: document.querySelector('[data-role="file-name"]'),
  fileSize: document.querySelector('[data-role="file-size"]'),
  partCount: document.querySelector('[data-role="part-count"]'),
  sha256: document.querySelector('[data-role="sha256"]')
};

let manifest;
let running = false;

const formatBytes = bytes =>
  new Intl.NumberFormat("zh-CN", {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1
  }).format(bytes / 1_000_000);

const renderProgress = event => {
  const percent = Math.min(
    100,
    Math.round((event.loadedBytes / manifest.totalSize) * 100)
  );
  elements.progress.value = percent;

  if (event.phase === "part-start") {
    elements.status.textContent = `正在下载第 ${event.partIndex + 1} / ${
      manifest.parts.length
    } 个分片`;
    elements.progressText.textContent = `${formatBytes(
      event.loadedBytes
    )} / ${formatBytes(manifest.totalSize)} · ${percent}%`;
  } else if (event.phase === "retry") {
    elements.status.textContent = `第 ${event.partIndex + 1} 个分片失败，正在重试（${
      event.attempt + 1
    } / 3）`;
  } else if (event.phase === "part-complete") {
    elements.progress.value = Math.round(
      (event.loadedBytes / manifest.totalSize) * 100
    );
    elements.progressText.textContent = `${formatBytes(
      event.loadedBytes
    )} / ${formatBytes(manifest.totalSize)} · ${elements.progress.value}%`;
  } else if (event.phase === "verifying") {
    elements.status.textContent = "全部分片已下载，正在校验完整 ZIP…";
    elements.progressText.textContent = `${formatBytes(
      event.loadedBytes
    )} / ${formatBytes(manifest.totalSize)} · 100%`;
  }
};

const triggerDownload = bytes => {
  const blob = new Blob([bytes], { type: "application/zip" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = manifest.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
};

const setIdleControls = () => {
  running = false;
  elements.downloadButton.disabled = false;
};

const startDownload = async () => {
  if (running || !manifest) {
    return;
  }

  running = true;
  elements.downloadButton.disabled = true;
  elements.retryButton.hidden = true;
  elements.error.hidden = true;
  elements.error.textContent = "";
  elements.progress.value = 0;
  elements.progressText.textContent = `0 MB / ${formatBytes(manifest.totalSize)} · 0%`;
  elements.status.textContent = "正在准备安全下载…";

  try {
    const bytes = await assembleDownload(manifest, {
      fetchImpl: path => fetch(path, { cache: "no-store" }),
      digestHex: sha256Hex,
      onProgress: renderProgress,
      maxAttempts: 3
    });

    triggerDownload(bytes);
    elements.status.textContent = "校验通过，Windows 安装包已开始下载";
    elements.progress.value = 100;
    elements.progressText.textContent = `${formatBytes(
      manifest.totalSize
    )} / ${formatBytes(manifest.totalSize)} · 100%`;
  } catch (error) {
    elements.status.textContent = "下载未完成";
    elements.error.textContent =
      error instanceof Error ? error.message : String(error);
    elements.error.hidden = false;
    elements.retryButton.hidden = false;
  } finally {
    setIdleControls();
  }
};

const loadManifest = async () => {
  elements.downloadButton.disabled = true;
  elements.status.textContent = "正在读取下载清单…";

  try {
    const response = await fetch("./manifest.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`下载清单读取失败：HTTP ${response.status}`);
    }
    manifest = validateManifest(await response.json());
    elements.fileName.textContent = manifest.fileName;
    elements.fileSize.textContent = formatBytes(manifest.totalSize);
    elements.partCount.textContent = `${manifest.parts.length} 个`;
    elements.sha256.textContent = manifest.sha256;
    elements.progressText.textContent = `0 MB / ${formatBytes(
      manifest.totalSize
    )} · 0%`;
    elements.status.textContent = "清单已验证，可以开始下载";
    elements.downloadButton.disabled = false;
  } catch (error) {
    elements.status.textContent = "下载服务暂时不可用";
    elements.error.textContent =
      error instanceof Error ? error.message : String(error);
    elements.error.hidden = false;
    elements.retryButton.hidden = false;
  }
};

elements.downloadButton.addEventListener("click", startDownload);
elements.retryButton.addEventListener("click", () => {
  if (manifest) {
    startDownload();
  } else {
    elements.retryButton.hidden = true;
    elements.error.hidden = true;
    loadManifest();
  }
});

loadManifest();
