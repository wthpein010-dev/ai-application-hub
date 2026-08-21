import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const CHUNK_SIZE = 8_388_608;
const ARCHITECTURES = new Set(["arm64", "x64"]);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();

function parseArguments(values) {
  const options = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    options.set(key.slice(2), value);
  }
  return options;
}

function required(options, key) {
  const value = options.get(key);
  if (!value) throw new Error(`Missing required --${key} option.`);
  return value;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const sourcePath = resolve(required(options, "source"));
  const outputDirectory = resolve(required(options, "output"));
  const architecture = required(options, "architecture");
  const releaseVersion = required(options, "version");
  const product = required(options, "product");
  if (!ARCHITECTURES.has(architecture)) throw new Error("architecture must be arm64 or x64.");
  if (!VERSION_PATTERN.test(releaseVersion)) throw new Error("version must use semantic x.y.z form.");

  const fileName = `CodexConfirmationBar-macOS-${architecture}.app.zip`;
  if (basename(sourcePath) !== fileName) throw new Error(`Expected source file name ${fileName}.`);
  const source = await readFile(sourcePath);
  if (source.byteLength === 0) throw new Error("Source archive must not be empty.");

  const partsDirectory = join(outputDirectory, "parts", architecture);
  const manifestPath = join(outputDirectory, `manifest-${architecture}.json`);
  await mkdir(outputDirectory, { recursive: true });
  await rm(partsDirectory, { recursive: true, force: true });
  await rm(manifestPath, { force: true });
  await mkdir(partsDirectory, { recursive: true });

  const parts = [];
  for (let offset = 0, index = 0; offset < source.byteLength; index += 1) {
    const end = Math.min(offset + CHUNK_SIZE, source.byteLength);
    const bytes = source.subarray(offset, end);
    const partName = `part-${String(index).padStart(3, "0")}.bin`;
    await writeFile(join(partsDirectory, partName), bytes);
    parts.push({
      index,
      path: `parts/${architecture}/${partName}`,
      size: bytes.byteLength,
      sha256: sha256(bytes),
    });
    offset = end;
  }

  const manifest = {
    version: 1,
    releaseVersion,
    product,
    platform: `macos-${architecture}`,
    architecture,
    fileName,
    totalSize: source.byteLength,
    chunkSize: CHUNK_SIZE,
    sha256: sha256(source),
    parts,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Created ${parts.length} verified ${architecture} parts for ${fileName}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
