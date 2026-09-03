import { randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultProjectRoot = join(repositoryRoot, "projects", "brick-character-copy-preview");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const previewIdMinimum = 10;
const previewIdMaximum = 44;
const maximumPngSourceBytes = 8 * 1024 * 1024;
const maximumInflatedBytes = 16 * 1024 * 1024;
const pngChannels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
const pngBitDepths = new Map([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);
const adam7Passes = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

async function readCatalog(projectRoot) {
  return JSON.parse(await readFile(join(projectRoot, "data", "characters.json"), "utf8"));
}

function managedPreviewId(fileName) {
  const match = /^(\d+)\.png$/iu.exec(fileName);
  return match ? Number(match[1]) : null;
}

function sourcePreviewDescriptor(fileName) {
  const match = /^(\d+)(.*)\.png$/iu.exec(fileName);
  return match ? { id: Number(match[1]), label: match[2] } : null;
}

function isPublishedPreviewId(id) {
  return Number.isInteger(id) && id >= previewIdMinimum && id <= previewIdMaximum;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function passSize(size, start, step) {
  return size <= start ? 0 : Math.ceil((size - start) / step);
}

function pngResourceLimit(message) {
  const error = new Error(message);
  error.code = "PNG_RESOURCE_LIMIT";
  throw error;
}

function expectedInflatedLength({ width, height, bitDepth, colorType, interlace }) {
  const channels = pngChannels.get(colorType);
  const bitsPerPixel = channels * bitDepth;
  const passes = interlace === 1 ? adam7Passes : [[0, 0, 1, 1]];
  let total = 0;
  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = passSize(width, startX, stepX);
    const passHeight = passSize(height, startY, stepY);
    if (!passWidth || !passHeight) continue;
    total += passHeight * (Math.ceil((passWidth * bitsPerPixel) / 8) + 1);
    if (total > maximumInflatedBytes) pngResourceLimit("decoded pixel data is too large");
  }
  return total;
}

function validateInflatedPixels(inflated, { width, height, bitDepth, colorType, interlace }) {
  const channels = pngChannels.get(colorType);
  const bitsPerPixel = channels * bitDepth;
  const passes = interlace === 1 ? adam7Passes : [[0, 0, 1, 1]];
  let offset = 0;

  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = passSize(width, startX, stepX);
    const passHeight = passSize(height, startY, stepY);
    if (!passWidth || !passHeight) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    for (let row = 0; row < passHeight; row += 1) {
      if (offset + rowBytes + 1 > inflated.length || inflated[offset] > 4) {
        throw new Error("invalid decompressed scanline");
      }
      offset += rowBytes + 1;
    }
  }

  if (offset !== inflated.length) throw new Error("unexpected decompressed byte length");
}

function validatePng(bytes) {
  if (bytes.length < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("invalid signature");
  }

  let offset = pngSignature.length;
  let header = null;
  let hasPalette = false;
  let hasImageData = false;
  let hasEnd = false;
  const imageData = [];

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("truncated chunk header");
    const length = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) throw new Error("truncated chunk data");
    const typeBytes = bytes.subarray(typeStart, dataStart);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/u.test(type)) throw new Error("invalid chunk type");
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    if (crc32(bytes.subarray(typeStart, dataEnd)) !== expectedCrc) throw new Error(`invalid ${type} CRC`);
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      if (header || offset !== pngSignature.length || length !== 13) throw new Error("invalid IHDR");
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
      if (!header.width || !header.height || header.width > 16384 || header.height > 16384) throw new Error("invalid dimensions");
      if (!pngBitDepths.get(header.colorType)?.has(header.bitDepth)) throw new Error("invalid color format");
      if (header.compression !== 0 || header.filter !== 0 || ![0, 1].includes(header.interlace)) throw new Error("invalid PNG method");
    } else if (!header) {
      throw new Error("IHDR must be first");
    } else if (type === "PLTE") {
      if (hasImageData || !length || length % 3 !== 0 || length > 768) throw new Error("invalid PLTE");
      hasPalette = true;
    } else if (type === "IDAT") {
      if (!length) throw new Error("empty IDAT");
      hasImageData = true;
      imageData.push(data);
    } else if (type === "IEND") {
      if (length !== 0 || !hasImageData || chunkEnd !== bytes.length) throw new Error("invalid IEND");
      hasEnd = true;
      offset = chunkEnd;
      break;
    } else if ((typeBytes[0] & 0x20) === 0) {
      throw new Error(`unknown critical chunk ${type}`);
    }

    offset = chunkEnd;
  }

  if (!header || !hasImageData || !hasEnd) throw new Error("incomplete PNG structure");
  if (header.colorType === 3 && !hasPalette) throw new Error("indexed PNG requires PLTE");
  const inflatedLength = expectedInflatedLength(header);
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: inflatedLength });
  } catch (error) {
    if (error?.code === "PNG_RESOURCE_LIMIT") throw error;
    throw new Error("invalid compressed image data");
  }
  validateInflatedPixels(inflated, header);
}

async function readValidPng(path, fileName) {
  const metadata = await stat(path);
  if (metadata.size > maximumPngSourceBytes) pngResourceLimit(`PNG resource limit exceeded: ${fileName}`);
  const bytes = await readFile(path);
  if (bytes.length > maximumPngSourceBytes) pngResourceLimit(`PNG resource limit exceeded: ${fileName}`);
  try {
    validatePng(bytes);
  } catch (error) {
    if (error?.code === "PNG_RESOURCE_LIMIT") {
      throw new Error(`PNG resource limit exceeded: ${fileName}`);
    }
    throw new Error(`Invalid PNG preview: ${fileName}`);
  }
  return bytes;
}

function applyPublishedPreviewIds(characters, available) {
  return characters.map((character) => {
    const { preview: _previousPreview, ...base } = character;
    return available.has(character.id) && isPublishedPreviewId(character.id)
      ? { ...base, preview: `assets/preview/${character.id}.png` }
      : base;
  });
}

export async function withPublishedCharacterPreviews(characters, projectRoot = defaultProjectRoot) {
  const previewRoot = join(projectRoot, "assets", "preview");
  let entries = [];
  try {
    entries = await readdir(previewRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const available = new Set(entries
    .filter((entry) => entry.isFile())
    .map((entry) => managedPreviewId(entry.name))
    .filter(isPublishedPreviewId));

  return applyPublishedPreviewIds(characters, available);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function commitCharacterPreviewTransaction({
  publishedRoot,
  stagedRoot,
  dataPath,
  stagedDataPath,
  transactionId = randomUUID(),
}) {
  const publishedBackup = `${publishedRoot}.backup-${transactionId}`;
  const dataBackup = `${dataPath}.backup-${transactionId}`;
  const hadPublishedRoot = await exists(publishedRoot);
  let publishedBackedUp = false;
  let stagedPublished = false;
  let dataBackedUp = false;
  let dataPublished = false;

  try {
    if (hadPublishedRoot) {
      await rename(publishedRoot, publishedBackup);
      publishedBackedUp = true;
    }
    await rename(stagedRoot, publishedRoot);
    stagedPublished = true;
    await rename(dataPath, dataBackup);
    dataBackedUp = true;
    await rename(stagedDataPath, dataPath);
    dataPublished = true;
  } catch (error) {
    const rollbackErrors = [];
    if (dataPublished) {
      try { await rm(dataPath, { force: true }); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (dataBackedUp) {
      try { await rename(dataBackup, dataPath); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (stagedPublished) {
      try { await rm(publishedRoot, { recursive: true, force: true }); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (publishedBackedUp) {
      try { await rename(publishedBackup, publishedRoot); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], "Character preview transaction and rollback failed");
    }
    throw error;
  }

  if (publishedBackedUp) await rm(publishedBackup, { recursive: true, force: true });
  if (dataBackedUp) await rm(dataBackup, { force: true });
}

export async function syncBrickCharacterPreviews({
  previewRoot = process.env.BRICK_CHARACTER_PREVIEW_ROOT,
  projectRoot = process.env.BRICK_GALLERY_PROJECT_ROOT || defaultProjectRoot,
} = {}) {
  if (!previewRoot) throw new Error("Set BRICK_CHARACTER_PREVIEW_ROOT to the local preview directory");
  const resolvedPreviewRoot = resolve(previewRoot);
  const resolvedProjectRoot = resolve(projectRoot);
  const characters = await readCatalog(resolvedProjectRoot);
  const charactersById = new Map(characters.map((character) => [Number(character.id), character]));
  const sourceEntries = await readdir(resolvedPreviewRoot, { withFileTypes: true });
  const previews = new Map();
  const sourcePreviewsById = new Map();

  for (const entry of sourceEntries) {
    if (!entry.isFile() || !/\.png$/iu.test(entry.name)) continue;
    const sourcePreview = sourcePreviewDescriptor(entry.name);
    if (!sourcePreview || !Number.isInteger(sourcePreview.id)) {
      throw new Error(`Preview filename must start with a character ID: ${entry.name}`);
    }
    const { id, label } = sourcePreview;
    const character = charactersById.get(id);
    if (!character) throw new Error(`Unknown preview ID ${id}: ${entry.name}`);
    if (!isPublishedPreviewId(id)) throw new Error(`Preview ID ${id} must use Unity layered rendering`);
    if (sourcePreviewsById.has(id)) {
      throw new Error(`Duplicate preview ID ${id}: ${sourcePreviewsById.get(id).name}, ${entry.name}`);
    }
    sourcePreviewsById.set(id, entry);
    if (label !== character.name) continue;
    const bytes = await readValidPng(join(resolvedPreviewRoot, entry.name), entry.name);
    previews.set(id, { entry, bytes });
  }

  if (!sourcePreviewsById.size) throw new Error("No character preview PNG files found");

  const transactionId = randomUUID();
  const assetsRoot = join(resolvedProjectRoot, "assets");
  const publishedRoot = join(resolvedProjectRoot, "assets", "preview");
  const stagedRoot = join(assetsRoot, `.preview-staging-${transactionId}`);
  const dataPath = join(resolvedProjectRoot, "data", "characters.json");
  const stagedDataPath = join(dirname(dataPath), `.characters-${transactionId}.json`);
  const updated = applyPublishedPreviewIds(characters, new Set(previews.keys()));

  try {
    await mkdir(stagedRoot, { recursive: false });
    let publishedEntries = [];
    try {
      publishedEntries = await readdir(publishedRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await Promise.all(publishedEntries
      .filter((entry) => managedPreviewId(entry.name) === null)
      .map((entry) => cp(join(publishedRoot, entry.name), join(stagedRoot, entry.name), {
        recursive: entry.isDirectory(),
        errorOnExist: true,
        force: false,
      })));
    await Promise.all([...previews].map(([id, { bytes }]) => writeFile(join(stagedRoot, `${id}.png`), bytes)));
    await Promise.all([...previews].map(([id]) => readValidPng(join(stagedRoot, `${id}.png`), `${id}.png`)));
    await mkdir(dirname(dataPath), { recursive: true });
    await writeFile(stagedDataPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    await commitCharacterPreviewTransaction({
      publishedRoot,
      stagedRoot,
      dataPath,
      stagedDataPath,
      transactionId,
    });
    return updated;
  } catch (error) {
    await Promise.allSettled([
      rm(stagedRoot, { recursive: true, force: true }),
      rm(stagedDataPath, { force: true }),
    ]);
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const characters = await syncBrickCharacterPreviews();
  const previewCount = characters.filter(({ preview }) => preview).length;
  console.log(`Synced ${previewCount} character preview images.`);
}
