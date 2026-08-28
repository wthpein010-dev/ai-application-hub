import { inflateRawSync } from "node:zlib";

const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT_BYTES = 0xffff;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MACHO_64_MAGIC = 0xfeedfacf;
const CPU_TYPES = { arm64: 0x0100000c, x64: 0x01000007 };
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function fail(message) {
  throw new Error(`Workbench macOS ZIP: ${message}`);
}

function ensureRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
    || offset < 0 || length < 0 || offset + length > buffer.length) {
    fail(`invalid ${label}`);
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEnd(buffer) {
  if (buffer.length < 22) fail("invalid end of central directory");
  const minimum = Math.max(0, buffer.length - 22 - MAX_COMMENT_BYTES);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  fail("invalid end of central directory");
}

function decodeName(bytes, flags) {
  if ((flags & 0x0800) === 0 && bytes.some((byte) => byte > 0x7f)) {
    fail("entry path uses unsupported legacy encoding");
  }
  const name = bytes.toString("utf8").replaceAll("\\", "/");
  if (!name || name.includes("\0") || name.includes("\ufffd")) fail("entry path is malformed");
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) fail(`entry path is absolute: ${name}`);
  const segments = name.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) fail(`entry path is unsafe: ${name}`);
  return name.replace(/^\.\//, "");
}

function entryBytes(archive, entry) {
  const compressed = archive.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  let output;
  if (entry.compressionMethod === 0) output = Buffer.from(compressed);
  else {
    try {
      output = inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
    } catch (error) {
      fail(`cannot decompress ${entry.name}: ${error.message}`);
    }
  }
  if (output.length !== entry.uncompressedSize) fail(`uncompressed size mismatch: ${entry.name}`);
  if (crc32(output) !== entry.checksum) fail(`CRC32 mismatch: ${entry.name}`);
  return output;
}

function readEntries(archive) {
  const endOffset = findEnd(archive);
  const disk = archive.readUInt16LE(endOffset + 4);
  const centralDisk = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const totalEntries = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) fail("multi-disk ZIP is unsupported");
  if (totalEntries === 0) fail("ZIP has no entries");
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail("ZIP64 is unsupported by this activation gate");
  }
  ensureRange(archive, centralOffset, centralSize, "central directory range");
  if (centralOffset + centralSize > endOffset) fail("invalid central directory placement");

  const entries = new Map();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    ensureRange(archive, offset, 46, "central directory header");
    if (archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE) fail(`invalid central directory entry ${index + 1}`);
    const flags = archive.readUInt16LE(offset + 8);
    const compressionMethod = archive.readUInt16LE(offset + 10);
    const checksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const startingDisk = archive.readUInt16LE(offset + 34);
    const localOffset = archive.readUInt32LE(offset + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    ensureRange(archive, offset, recordLength, "central directory record");
    if (startingDisk !== 0) fail("multi-disk entry is unsupported");
    if ((flags & 0x0001) !== 0) fail("encrypted entries are unsupported");
    if (![0, 8].includes(compressionMethod)) fail(`unsupported compression method ${compressionMethod}`);
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) fail("ZIP64 entry is unsupported");
    if (uncompressedSize > MAX_ENTRY_BYTES) fail("entry exceeds activation size limit");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_BYTES) fail("archive exceeds activation size limit");

    const name = decodeName(archive.subarray(offset + 46, offset + 46 + nameLength), flags);
    if (entries.has(name) || [...entries.keys()].some((value) => value.toLowerCase() === name.toLowerCase())) {
      fail(`duplicate or colliding entry path: ${name}`);
    }
    ensureRange(archive, localOffset, 30, `local header for ${name}`);
    if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) fail(`invalid local header for ${name}`);
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localMethod = archive.readUInt16LE(localOffset + 8);
    const localChecksum = archive.readUInt32LE(localOffset + 14);
    const localCompressedSize = archive.readUInt32LE(localOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localNameOffset = localOffset + 30;
    ensureRange(archive, localNameOffset, localNameLength + localExtraLength, `local path for ${name}`);
    const localName = decodeName(
      archive.subarray(localNameOffset, localNameOffset + localNameLength),
      localFlags,
    );
    if (localName !== name || localFlags !== flags || localMethod !== compressionMethod) {
      fail(`local header does not match central directory: ${name}`);
    }
    if ((flags & 0x0008) === 0
      && (localChecksum !== checksum
        || localCompressedSize !== compressedSize
        || localUncompressedSize !== uncompressedSize)) {
      fail(`local sizes or checksum do not match central directory: ${name}`);
    }
    const dataOffset = localNameOffset + localNameLength + localExtraLength;
    ensureRange(archive, dataOffset, compressedSize, `compressed data for ${name}`);
    if (dataOffset + compressedSize > centralOffset) fail(`entry data overlaps central directory: ${name}`);
    const entry = { name, compressionMethod, checksum, compressedSize, uncompressedSize, dataOffset };
    entries.set(name, entryBytes(archive, entry));
    offset += recordLength;
  }
  if (offset !== centralOffset + centralSize) fail("invalid central directory size");
  return entries;
}

function plistValue(xml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<key>\\s*${escaped}\\s*</key>\\s*<string>([^<]*)</string>`).exec(xml);
  if (!match) fail(`Info.plist is missing ${key}`);
  return match[1].trim();
}

function validatePlist(bytes) {
  const xml = bytes.toString("utf8");
  if (xml.includes("\ufffd") || !/<plist\b/.test(xml) || !/<dict>/.test(xml)) fail("Info.plist is not valid XML plist text");
  if (plistValue(xml, "CFBundleDisplayName") !== "Codex 多线程工作台") fail("Info.plist display name does not match product identity");
  if (plistValue(xml, "CFBundleExecutable") !== "CodexThreadWorkbench") fail("Info.plist executable does not match product identity");
  if (plistValue(xml, "CFBundleIdentifier") !== "dev.wthpein010.codex-thread-workbench") fail("Info.plist bundle identifier does not match product identity");
  if (plistValue(xml, "CFBundleShortVersionString") !== "2.2.1") fail("Info.plist short version must be 2.2.1");
  if (plistValue(xml, "CFBundleVersion") !== "2.2.1") fail("Info.plist bundle version must be 2.2.1");
}

function validateMachO(bytes, architecture) {
  if (bytes.length < 8) fail("CodexThreadWorkbench executable is too short for a Mach-O header");
  let cpuType;
  if (bytes.readUInt32LE(0) === MACHO_64_MAGIC) cpuType = bytes.readInt32LE(4);
  else if (bytes.readUInt32BE(0) === MACHO_64_MAGIC) cpuType = bytes.readInt32BE(4);
  else fail("CodexThreadWorkbench executable has invalid 64-bit Mach-O magic");
  if (cpuType !== CPU_TYPES[architecture]) {
    fail(`CodexThreadWorkbench Mach-O cputype ${cpuType} does not match ${architecture}`);
  }
}

export function validateWorkbenchMacZip(bytes, architecture) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Workbench Mac ZIP must be bytes");
  if (!(architecture in CPU_TYPES)) throw new TypeError("architecture must be arm64 or x64");
  const archive = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readEntries(archive);
  const prefix = "CodexThreadWorkbench.app/Contents/";
  const plistPath = `${prefix}Info.plist`;
  const executablePath = `${prefix}MacOS/CodexThreadWorkbench`;
  if (!entries.has(plistPath)) fail(`missing ${plistPath}`);
  if (!entries.has(executablePath)) fail(`missing ${executablePath}`);
  validatePlist(entries.get(plistPath));
  validateMachO(entries.get(executablePath), architecture);
  return { entryCount: entries.size, architecture };
}
