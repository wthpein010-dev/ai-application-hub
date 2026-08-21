import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const SHA256_PATTERN = /^[A-F0-9]{64}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function parseArguments(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options.set(key.slice(2), value);
  }
  return options;
}

function requireOption(options, key) {
  const value = options.get(key);
  if (!value) throw new Error(`Missing required --${key} option.`);
  return value;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return number;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

try {
  const options = parseArguments(process.argv.slice(2));
  const sourcePath = resolve(requireOption(options, "source"));
  const outputDirectory = resolve(requireOption(options, "output"));
  const fileName = requireOption(options, "file-name");
  const releaseVersion = requireOption(options, "version");
  const product = requireOption(options, "product");
  const platform = requireOption(options, "platform");
  const totalSize = positiveInteger(requireOption(options, "expected-size"), "expected-size");
  const expectedSha256 = requireOption(options, "expected-sha256").toUpperCase();
  const chunkSize = positiveInteger(options.get("chunk-size") || "8388608", "chunk-size");

  if (basename(fileName) !== fileName || !fileName.endsWith(".zip")) {
    throw new Error("file-name must be a safe ZIP file name.");
  }
  if (!VERSION_PATTERN.test(releaseVersion)) {
    throw new Error("version must use semantic x.y.z form.");
  }
  if (!/^[a-z0-9-]+$/.test(platform)) {
    throw new Error("platform must use lowercase letters, digits, and hyphens.");
  }
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error("expected-sha256 must be a 64-character SHA-256 hash.");
  }
  if (basename(sourcePath) !== fileName) {
    throw new Error(`Expected source file name ${fileName}.`);
  }

  const source = await readFile(sourcePath);
  const sourceSha256 = sha256(source);
  if (source.byteLength !== totalSize) {
    throw new Error(`Source size ${source.byteLength} does not match expected ${totalSize}.`);
  }
  if (sourceSha256 !== expectedSha256) {
    throw new Error(`Source SHA-256 ${sourceSha256} does not match expected ${expectedSha256}.`);
  }

  const releaseDirectory = `v${releaseVersion}`;
  const partsDirectory = join(outputDirectory, "parts", releaseDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await rm(partsDirectory, { recursive: true, force: true });
  await mkdir(partsDirectory, { recursive: true });

  const parts = [];
  for (let offset = 0, index = 0; offset < source.byteLength; index += 1) {
    const end = Math.min(offset + chunkSize, source.byteLength);
    const bytes = source.subarray(offset, end);
    const partName = `part-${String(index).padStart(3, "0")}.bin`;
    await writeFile(join(partsDirectory, partName), bytes);
    parts.push({
      index,
      path: `parts/${releaseDirectory}/${partName}`,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    });
    offset = end;
  }

  const manifest = {
    version: 1,
    releaseVersion,
    product,
    platform,
    fileName,
    totalSize,
    chunkSize,
    sha256: expectedSha256,
    parts,
  };
  await writeFile(join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Created ${parts.length} verified parts for ${fileName} in ${outputDirectory}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
