const SHA256_PATTERN = /^[A-F0-9]{64}$/;

const requirePositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
};

const requireSha256 = (value, label) => {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be an uppercase SHA-256 hash.`);
  }
};

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Manifest must be an object.");
  }
  if (manifest.version !== 1) {
    throw new Error("Manifest version must be 1.");
  }
  if (
    typeof manifest.fileName !== "string" ||
    !manifest.fileName.endsWith(".zip") ||
    /[\\/]/.test(manifest.fileName)
  ) {
    throw new Error("Manifest fileName must be a safe ZIP file name.");
  }

  requirePositiveInteger(manifest.totalSize, "Manifest totalSize");
  requirePositiveInteger(manifest.chunkSize, "Manifest chunkSize");
  requireSha256(manifest.sha256, "Manifest sha256");

  if (!Array.isArray(manifest.parts) || manifest.parts.length === 0) {
    throw new Error("Manifest parts must be a non-empty array.");
  }

  const paths = new Set();
  let sizeSum = 0;

  manifest.parts.forEach((part, position) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      throw new Error(`Part ${position} must be an object.`);
    }
    if (part.index !== position) {
      throw new Error(`Part index order is invalid at position ${position}.`);
    }
    if (
      typeof part.path !== "string" ||
      part.path.length === 0 ||
      part.path.startsWith("/") ||
      part.path.includes("\\") ||
      part.path.split("/").includes("..")
    ) {
      throw new Error(`Part ${position} has an unsafe path.`);
    }
    if (paths.has(part.path)) {
      throw new Error(`Part path is duplicated: ${part.path}`);
    }
    paths.add(part.path);

    requirePositiveInteger(part.size, `Part ${position} size`);
    if (part.size > manifest.chunkSize) {
      throw new Error(`Part ${position} size exceeds chunkSize.`);
    }
    if (position < manifest.parts.length - 1 && part.size !== manifest.chunkSize) {
      throw new Error(`Part ${position} size must equal chunkSize.`);
    }
    requireSha256(part.sha256, `Part ${position} sha256`);
    sizeSum += part.size;
  });

  if (sizeSum !== manifest.totalSize) {
    throw new Error(
      `Manifest part size sum ${sizeSum} does not match totalSize ${manifest.totalSize}.`
    );
  }

  return manifest;
}

export async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in this browser.");
  }

  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view);

  return Array.from(new Uint8Array(digest), value =>
    value.toString(16).padStart(2, "0")
  )
    .join("")
    .toUpperCase();
}

const fetchPart = async ({
  part,
  fetchImpl,
  digestHex,
  maxAttempts,
  onProgress,
  loadedBytes
}) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onProgress({
      phase: "part-start",
      partIndex: part.index,
      attempt,
      loadedBytes
    });

    try {
      const response = await fetchImpl(part.path);
      if (!response?.ok) {
        throw new Error(`HTTP ${response?.status ?? "error"}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== part.size) {
        throw new Error(
          `length ${bytes.byteLength} does not match expected size ${part.size}`
        );
      }

      const actualSha256 = (await digestHex(bytes)).toUpperCase();
      if (actualSha256 !== part.sha256) {
        throw new Error(
          `SHA-256 checksum ${actualSha256} does not match ${part.sha256}`
        );
      }

      return bytes;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        onProgress({
          phase: "retry",
          partIndex: part.index,
          attempt,
          loadedBytes,
          message: lastError.message
        });
      }
    }
  }

  throw new Error(
    `Failed to download ${part.path} after ${maxAttempts} attempts: ${lastError?.message}`
  );
};

export async function assembleDownload(
  manifest,
  {
    fetchImpl = globalThis.fetch?.bind(globalThis),
    digestHex = sha256Hex,
    onProgress = () => {},
    maxAttempts = 3
  } = {}
) {
  validateManifest(manifest);

  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch implementation is required.");
  }
  if (typeof digestHex !== "function") {
    throw new Error("A SHA-256 digest function is required.");
  }
  if (typeof onProgress !== "function") {
    throw new Error("onProgress must be a function.");
  }
  requirePositiveInteger(maxAttempts, "maxAttempts");

  const chunks = [];
  let loadedBytes = 0;

  for (const part of manifest.parts) {
    const bytes = await fetchPart({
      part,
      fetchImpl,
      digestHex,
      maxAttempts,
      onProgress,
      loadedBytes
    });
    chunks.push(bytes);
    loadedBytes += bytes.byteLength;
    onProgress({
      phase: "part-complete",
      partIndex: part.index,
      attempt: 1,
      loadedBytes
    });
  }

  const archive = new Uint8Array(manifest.totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (offset !== manifest.totalSize) {
    throw new Error(
      `Final archive length ${offset} does not match ${manifest.totalSize}.`
    );
  }

  onProgress({
    phase: "verifying",
    partIndex: manifest.parts.length - 1,
    loadedBytes
  });

  const actualSha256 = (await digestHex(archive)).toUpperCase();
  if (actualSha256 !== manifest.sha256) {
    throw new Error(
      `Final archive SHA-256 ${actualSha256} does not match ${manifest.sha256}.`
    );
  }

  return archive;
}
