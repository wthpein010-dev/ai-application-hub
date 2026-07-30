const EXTENSIONS = {
  image: new Set(["png", "jpg", "jpeg", "webp", "avif", "heic", "heif"]),
  gif: new Set(["gif"]),
  video: new Set(["mp4", "mov", "mkv", "webm", "avi", "m4v", "mpeg", "mpg"]),
  audio: new Set(["mp3", "m4a", "wav", "flac", "ogg", "oga", "aac", "opus"]),
};

const FIDELITY_PLANS = {
  image: {
    outputExtension: "webp",
    strategy: "高保真 WebP 重编码",
  },
  gif: {
    outputExtension: "gif",
    strategy: "高保真 GIF 调色板优化",
  },
  video: {
    outputExtension: "mp4",
    strategy: "高保真 H.264 / AAC 重编码",
  },
  audio: {
    outputExtension: "m4a",
    strategy: "高保真 AAC 重编码",
  },
  archive: {
    outputExtension: "zip",
    strategy: "字节级无损 ZIP 归档",
  },
};

function extensionOf(name = "") {
  const lastSegment = String(name).toLowerCase().split(/[\\/]/).pop() || "";
  const dot = lastSegment.lastIndexOf(".");
  return dot > 0 ? lastSegment.slice(dot + 1) : "";
}

export function classifyFile(file = {}) {
  const extension = extensionOf(file.name);
  const extensionMatch = Object.entries(EXTENSIONS)
    .find(([, values]) => values.has(extension));
  if (extensionMatch) return extensionMatch[0];

  const mime = String(file.type || "").toLowerCase();
  if (mime === "image/gif") return "gif";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "archive";
}

export function createPlan(file = {}, mode = "lossless") {
  const kind = classifyFile(file);
  const recommendedDesktop = Number(file.size || 0) > 500_000_000;

  if (mode === "fidelity" && kind !== "archive") {
    return {
      kind,
      mode,
      ...FIDELITY_PLANS[kind],
      isLossless: false,
      recommendedDesktop,
    };
  }

  if (kind === "archive") {
    return {
      kind,
      mode: "lossless",
      outputExtension: "zip",
      strategy: "字节级无损 ZIP 归档",
      isLossless: true,
      recommendedDesktop,
    };
  }

  const outputExtension = extensionOf(file.name) || (
    kind === "image" ? "png" : kind === "gif" ? "gif" : kind === "video" ? "mp4" : "m4a"
  );

  return {
    kind,
    mode: "lossless",
    outputExtension,
    strategy: kind === "image" && outputExtension === "png"
      ? "像素无损 PNG 重编码"
      : "码流复制与元数据精简",
    isLossless: true,
    recommendedDesktop,
  };
}

export function outputNameFor(fileName, outputExtension) {
  const name = String(fileName || "resource");
  const lastDot = name.lastIndexOf(".");
  const stem = lastDot > 0 ? name.slice(0, lastDot) : name;
  return `${stem}-pureshrink.${outputExtension}`;
}
