import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const UNICODE_PATH_EXTRA_FIELD = 0x7075;
const UNIX_DIRECTORY = 0o040000;
const UNIX_REGULAR_FILE = 0o100000;
const UNIX_SYMBOLIC_LINK = 0o120000;
const UNIX_TYPE_MASK = 0o170000;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function ensureRange(buffer, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`invalid ZIP ${label}`);
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 22 - MAX_ZIP_COMMENT_BYTES);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new Error("invalid ZIP end of central directory");
}

function decodeEntryName(bytes, flags) {
  if ((flags & 0x0800) === 0 && bytes.some((byte) => byte > 0x7f)) {
    throw new Error("ZIP entry name uses an unsupported legacy encoding");
  }
  const name = bytes.toString("utf8");
  if (!name || name.includes("\u0000") || name.includes("\ufffd")) {
    throw new Error("ZIP entry name is empty or malformed");
  }
  return name;
}

function rejectPathRewritingExtraFields(buffer, offset, length, entryName) {
  const end = offset + length;
  ensureRange(buffer, offset, length, `extra fields for ${entryName}`);
  while (offset < end) {
    if (offset + 4 > end) throw new Error(`malformed ZIP extra field for ${entryName}`);
    const id = buffer.readUInt16LE(offset);
    const size = buffer.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > end) throw new Error(`malformed ZIP extra field for ${entryName}`);
    if (id === UNICODE_PATH_EXTRA_FIELD) {
      throw new Error(`Unicode path extra field is not allowed: ${entryName}`);
    }
    offset += size;
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZipEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  if (buffer.length < 22) throw new Error("invalid ZIP: file is too short");

  const endOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error("multi-disk ZIP archives are not supported");
  }
  if (totalEntries === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported by this publication gate");
  }
  ensureRange(buffer, centralDirectoryOffset, centralDirectorySize, "central directory range");
  if (centralDirectoryOffset + centralDirectorySize > endOffset) {
    throw new Error("invalid ZIP central directory placement");
  }

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    ensureRange(buffer, offset, 46, "central directory header");
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`invalid ZIP central directory entry ${index + 1}`);
    }

    const versionMadeBy = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const startingDisk = buffer.readUInt16LE(offset + 34);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entryLength = 46 + nameLength + extraLength + commentLength;

    if (startingDisk !== 0) throw new Error("multi-disk ZIP entries are not supported");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("ZIP64 entries are not supported by this publication gate");
    }
    ensureRange(buffer, offset, entryLength, "central directory entry range");

    const centralNameOffset = offset + 46;
    const centralExtraOffset = centralNameOffset + nameLength;
    const name = decodeEntryName(buffer.subarray(centralNameOffset, centralExtraOffset), flags);
    rejectPathRewritingExtraFields(buffer, centralExtraOffset, extraLength, name);

    ensureRange(buffer, localHeaderOffset, 30, `local header for ${name}`);
    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`invalid ZIP local header for ${name}`);
    }
    const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
    const localCompressionMethod = buffer.readUInt16LE(localHeaderOffset + 8);
    const localCrc32 = buffer.readUInt32LE(localHeaderOffset + 14);
    const localCompressedSize = buffer.readUInt32LE(localHeaderOffset + 18);
    const localUncompressedSize = buffer.readUInt32LE(localHeaderOffset + 22);
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const localNameOffset = localHeaderOffset + 30;
    const localExtraOffset = localNameOffset + localNameLength;
    ensureRange(buffer, localNameOffset, localNameLength + localExtraLength, `local path for ${name}`);
    const localName = decodeEntryName(buffer.subarray(localNameOffset, localExtraOffset), localFlags);
    if (localName !== name) {
      throw new Error(`local header path ${localName} does not match central directory path ${name}`);
    }
    rejectPathRewritingExtraFields(buffer, localExtraOffset, localExtraLength, name);
    if (localFlags !== flags || localCompressionMethod !== compressionMethod) {
      throw new Error(`local header metadata does not match central directory: ${name}`);
    }
    if ((flags & 0x0008) === 0
      && (localCrc32 !== crc32
        || localCompressedSize !== compressedSize
        || localUncompressedSize !== uncompressedSize)) {
      throw new Error(`local header sizes or checksum do not match central directory: ${name}`);
    }
    const dataOffset = localExtraOffset + localExtraLength;
    ensureRange(buffer, dataOffset, compressedSize, `compressed data for ${name}`);
    if (dataOffset + compressedSize > centralDirectoryOffset) {
      throw new Error(`compressed data overlaps the central directory: ${name}`);
    }

    const unixMode = (externalAttributes >>> 16) & 0xffff;
    const unixType = unixMode & UNIX_TYPE_MASK;
    const isSymlink = unixType === UNIX_SYMBOLIC_LINK;
    const isDirectory = name.endsWith("/")
      || name.endsWith("\\")
      || unixType === UNIX_DIRECTORY
      || (externalAttributes & 0x10) !== 0;

    entries.push({
      name,
      crc32,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      encrypted: (flags & 0x0001) !== 0,
      hostSystem: versionMadeBy >>> 8,
      unixMode,
      unixType,
      isDirectory,
      isSymlink,
      dataOffset,
    });
    offset += entryLength;
  }

  if (offset !== centralDirectoryOffset + centralDirectorySize) {
    throw new Error("invalid ZIP central directory size");
  }
  return entries;
}

function normalizeArchivePath(name) {
  let normalized = name.replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);

  if (normalized.startsWith("/")) throw new Error(`absolute archive path: ${name}`);
  if (/^[A-Za-z]:/.test(normalized)) throw new Error(`drive-qualified archive path: ${name}`);

  const directory = normalized.endsWith("/");
  const rawSegments = normalized.split("/");
  if (directory) rawSegments.pop();
  const segments = [];
  for (const segment of rawSegments) {
    if (!segment) throw new Error(`empty archive path segment: ${name}`);
    if (segment === ".") continue;
    if (segment === "..") throw new Error(`parent traversal archive path: ${name}`);
    const deviceStem = segment.split(".", 1)[0].replace(/[ .]+$/, "");
    if (/[\u0000-\u001f<>:"|?*]/.test(segment)
      || /[. ]$/.test(segment)
      || /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])$/iu.test(deviceStem)) {
      throw new Error(`non-portable Windows archive path segment: ${name}`);
    }
    segments.push(segment);
  }

  if (segments.length === 0) throw new Error(`empty archive path: ${name}`);
  const portablePath = segments.join("/");
  return directory ? `${portablePath}/` : portablePath;
}

export function validateZipEntries(entries, {
  maxEntries = 10_000,
  maxEntryBytes = 64 * 1024 * 1024,
  maxTotalBytes = 128 * 1024 * 1024,
} = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("ZIP archive has no entries");
  if (entries.length > maxEntries) {
    throw new Error(`ZIP archive has ${entries.length} entries; limit is ${maxEntries}`);
  }

  let totalBytes = 0;
  const seen = new Map();
  return entries.map((entry) => {
    const normalizedPath = normalizeArchivePath(entry.name);
    if (entry.encrypted) throw new Error(`encrypted archive entry: ${entry.name}`);
    if (entry.isSymlink || entry.unixType === UNIX_SYMBOLIC_LINK) {
      throw new Error(`symbolic link archive entry: ${entry.name}`);
    }
    if (entry.unixType && ![UNIX_DIRECTORY, UNIX_REGULAR_FILE].includes(entry.unixType)) {
      throw new Error(`special file archive entry: ${entry.name}`);
    }
    if (![0, 8].includes(entry.compressionMethod)) {
      throw new Error(`unsupported compression method ${entry.compressionMethod}: ${entry.name}`);
    }
    if (!Number.isSafeInteger(entry.compressedSize) || entry.compressedSize < 0) {
      throw new Error(`invalid compressed size: ${entry.name}`);
    }
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
      throw new Error(`invalid uncompressed size: ${entry.name}`);
    }
    if (entry.compressionMethod === 0 && entry.compressedSize !== entry.uncompressedSize) {
      throw new Error(`stored entry sizes do not match: ${entry.name}`);
    }
    if (entry.isDirectory && entry.uncompressedSize !== 0) {
      throw new Error(`directory entry has file content: ${entry.name}`);
    }
    if (entry.uncompressedSize > maxEntryBytes) {
      throw new Error(`archive entry expands to ${entry.uncompressedSize} bytes; limit is ${maxEntryBytes}: ${entry.name}`);
    }

    totalBytes += entry.uncompressedSize;
    if (totalBytes > maxTotalBytes) {
      throw new Error(`archive expands to ${totalBytes} bytes; limit is ${maxTotalBytes}`);
    }

    const collisionKey = normalizedPath.replace(/\/$/, "").normalize("NFC").toLowerCase();
    if (seen.has(collisionKey)) {
      throw new Error(`archive path collision: ${seen.get(collisionKey)} and ${entry.name}`);
    }
    seen.set(collisionKey, entry.name);
    return { ...entry, normalizedPath };
  });
}

export function extractValidatedZip(zipPath, entries, destination, limits = {}) {
  const validatedEntries = validateZipEntries(entries, limits);
  const archive = readFileSync(zipPath);
  const destinationRoot = resolve(destination);
  const maxEntryBytes = limits.maxEntryBytes ?? 64 * 1024 * 1024;
  const maxTotalBytes = limits.maxTotalBytes ?? 128 * 1024 * 1024;
  let totalBytes = 0;
  mkdirSync(destinationRoot, { recursive: true });

  for (const entry of validatedEntries) {
    const target = resolve(destinationRoot, entry.normalizedPath);
    if (target !== destinationRoot && !target.startsWith(destinationRoot + sep)) {
      throw new Error(`extraction target escapes destination: ${entry.name}`);
    }
    if (entry.isDirectory) {
      mkdirSync(target, { recursive: true });
      continue;
    }

    ensureRange(archive, entry.dataOffset, entry.compressedSize, `compressed data for ${entry.name}`);
    const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
    let output;
    if (entry.compressionMethod === 0) {
      output = Buffer.from(compressed);
    } else {
      try {
        output = inflateRawSync(compressed, {
          maxOutputLength: Math.max(1, Math.min(entry.uncompressedSize, maxEntryBytes)),
        });
      } catch (error) {
        if (error.code === "ERR_BUFFER_TOO_LARGE") {
          throw new Error(`decompressed data exceeds its declared uncompressed size: ${entry.name}`);
        }
        throw new Error(`cannot decompress archive entry ${entry.name}: ${error.message}`);
      }
    }

    if (output.length > entry.uncompressedSize) {
      throw new Error(`decompressed data exceeds its declared uncompressed size: ${entry.name}`);
    }
    if (output.length !== entry.uncompressedSize) {
      throw new Error(`decompressed size does not match central directory: ${entry.name}`);
    }
    totalBytes += output.length;
    if (totalBytes > maxTotalBytes) {
      throw new Error(`extracted data exceeds ${maxTotalBytes} bytes`);
    }
    if (crc32(output) !== entry.crc32) {
      throw new Error(`CRC32 does not match central directory: ${entry.name}`);
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, output, { flag: "wx" });
  }
}
