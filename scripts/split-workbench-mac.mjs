import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const CHUNK_SIZE = 8_388_608;
const SUPPORTED_ARCHITECTURES = new Set(["arm64", "x64"]);

const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex").toUpperCase();

const [sourceArgument, outputArgument, architecture] = process.argv.slice(2);

if (
  !sourceArgument ||
  !outputArgument ||
  !SUPPORTED_ARCHITECTURES.has(architecture)
) {
  console.error(
    "Usage: node scripts/split-workbench-mac.mjs <source-app-zip> <download-directory> <arm64|x64>",
  );
  process.exitCode = 64;
} else {
  try {
    const sourcePath = resolve(sourceArgument);
    const outputDirectory = resolve(outputArgument);
    const fileName = `CodexConfirmationBar-macOS-${architecture}.app.zip`;
    const partsDirectory = join(outputDirectory, "parts", architecture);
    const manifestPath = join(
      outputDirectory,
      `manifest-${architecture}.json`,
    );

    if (basename(sourcePath) !== fileName) {
      throw new Error(`Expected source file name ${fileName}.`);
    }

    const source = await readFile(sourcePath);
    if (source.byteLength === 0) {
      throw new Error("Source archive must not be empty.");
    }

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
      fileName,
      totalSize: source.byteLength,
      chunkSize: CHUNK_SIZE,
      sha256: sha256(source),
      parts,
    };

    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    console.log(
      `Created ${parts.length} verified ${architecture} parts for ${fileName}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
