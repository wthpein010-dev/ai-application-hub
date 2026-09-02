import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const FILE_NAME = "CodexConfirmationBar-Windows-x64.zip";
const RELEASE_DIRECTORY = "v2.3.3-confirmation-overlay-e7d1928";
const TOTAL_SIZE = 41_562_042;
const CHUNK_SIZE = 8_388_608;
const ARCHIVE_SHA256 =
  "E7D1928EA27BCAE0737F9CFF14CEE5D909154BCABCA693610616357ADE7A11A7";

const sha256 = bytes =>
  createHash("sha256").update(bytes).digest("hex").toUpperCase();

const [sourceArgument, outputArgument] = process.argv.slice(2);

if (!sourceArgument || !outputArgument) {
  console.error(
    "Usage: node scripts/split-codex-thread-workbench.mjs <source-zip> <download-directory>"
  );
  process.exitCode = 1;
} else {
  try {
    const sourcePath = resolve(sourceArgument);
    const outputDirectory = resolve(outputArgument);
    const partsDirectory = join(outputDirectory, "parts", RELEASE_DIRECTORY);
    const source = await readFile(sourcePath);
    const sourceSha256 = sha256(source);

    if (basename(sourcePath) !== FILE_NAME) {
      throw new Error(`Expected source file name ${FILE_NAME}.`);
    }
    if (source.byteLength !== TOTAL_SIZE) {
      throw new Error(
        `Source size ${source.byteLength} does not match expected ${TOTAL_SIZE}.`
      );
    }
    if (sourceSha256 !== ARCHIVE_SHA256) {
      throw new Error(
        `Source SHA-256 ${sourceSha256} does not match expected ${ARCHIVE_SHA256}.`
      );
    }

    await mkdir(outputDirectory, { recursive: true });
    await rm(partsDirectory, { recursive: true, force: true });
    await mkdir(partsDirectory, { recursive: true });

    const parts = [];
    for (let offset = 0, index = 0; offset < source.byteLength; index += 1) {
      const end = Math.min(offset + CHUNK_SIZE, source.byteLength);
      const bytes = source.subarray(offset, end);
      const partName = `part-${String(index).padStart(3, "0")}.bin`;
      await writeFile(join(partsDirectory, partName), bytes);
      parts.push({
        index,
        path: `parts/${RELEASE_DIRECTORY}/${partName}`,
        size: bytes.byteLength,
        sha256: sha256(bytes)
      });
      offset = end;
    }

    const manifest = {
      version: 1,
      fileName: FILE_NAME,
      totalSize: TOTAL_SIZE,
      chunkSize: CHUNK_SIZE,
      sha256: ARCHIVE_SHA256,
      parts
    };

    await writeFile(
      join(outputDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    console.log(
      `Created ${parts.length} verified parts for ${FILE_NAME} in ${outputDirectory}.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
