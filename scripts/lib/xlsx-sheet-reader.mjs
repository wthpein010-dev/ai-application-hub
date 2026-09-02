import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_XLSX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

function xmlAttribute(source, name) {
  const safeName = [...String(name)].map((character) => "\\.^$|?*+()[]{}".includes(character) ? `\\${character}` : character).join("");
  const match = source.match(new RegExp(`\\b${safeName}=[\"']([^\"']*)[\"']`, "u"));
  return match ? decodeXml(match[1]) : "";
}

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

function readTextNodes(xml) {
  return [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gu)]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/gu, "")))
    .join("");
}

function requireRange(buffer, offset, length, label) {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`Invalid XLSX ${label}`);
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    if (offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) return offset;
  }
  throw new Error("Invalid XLSX ZIP end of central directory");
}

function readZipIndex(buffer) {
  if (buffer.length < 22 || buffer.length > MAX_XLSX_BYTES) throw new Error("XLSX file exceeds supported size");
  const endOffset = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries || totalEntries > 4096) {
    throw new Error("Unsupported XLSX ZIP layout");
  }
  requireRange(buffer, centralOffset, centralSize, "central directory");

  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    requireRange(buffer, offset, 46, "central directory entry");
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) throw new Error("Invalid XLSX central directory entry");
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const entryLength = 46 + nameLength + extraLength + commentLength;
    requireRange(buffer, offset, entryLength, "central directory entry range");
    if ((flags & 0x0001) !== 0 || ![0, 8].includes(compressionMethod) || uncompressedSize > MAX_ENTRY_BYTES) {
      throw new Error("Unsupported XLSX entry encoding");
    }
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (!name || name.includes("..") || name.includes("\\") || entries.has(name)) throw new Error("Unsafe XLSX entry name");
    requireRange(buffer, localOffset, 30, `local header for ${name}`);
    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER_SIGNATURE) throw new Error(`Invalid XLSX local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(buffer, dataOffset, compressedSize, `compressed data for ${name}`);
    entries.set(name, { compressionMethod, compressedSize, uncompressedSize, dataOffset });
    offset += entryLength;
  }
  return entries;
}

function readZipText(buffer, entries, name, required = true) {
  const entry = entries.get(name);
  if (!entry) {
    if (!required) return "";
    throw new Error(`Missing XLSX entry ${name}`);
  }
  const compressed = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  const output = entry.compressionMethod === 0
    ? Buffer.from(compressed)
    : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
  if (output.length !== entry.uncompressedSize) throw new Error(`Invalid XLSX entry size for ${name}`);
  return output.toString("utf8");
}

function sheetPath(workbookXml, relationshipsXml, sheetName) {
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/gu)];
  const targetSheet = sheets.find((match) => xmlAttribute(match[1], "name") === sheetName);
  if (!targetSheet) throw new Error(`Missing XLSX sheet ${sheetName}`);
  const relationId = xmlAttribute(targetSheet[1], "r:id");
  const relationships = [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gu)];
  const relationship = relationships.find((match) => xmlAttribute(match[1], "Id") === relationId);
  const target = relationship ? xmlAttribute(relationship[1], "Target") : "";
  if (!target || target.includes("..") || target.startsWith("/")) throw new Error(`Invalid XLSX sheet relationship for ${sheetName}`);
  return `xl/${target.replace(/^\.\//u, "")}`;
}

function readSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu)].map((match) => readTextNodes(match[1]));
}

function columnIndex(reference) {
  const letters = String(reference).match(/[A-Z]+/iu)?.[0];
  if (!letters) throw new Error(`Invalid XLSX cell reference ${reference}`);
  return [...letters.toUpperCase()].reduce((value, letter) => (value * 26) + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    const rowIndex = Number(xmlAttribute(rowMatch[1], "r"));
    if (!Number.isInteger(rowIndex) || rowIndex < 1 || rowIndex > 10000) throw new Error("Invalid XLSX row reference");
    const values = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const reference = xmlAttribute(cellMatch[1], "r");
      const type = xmlAttribute(cellMatch[1], "t");
      const content = cellMatch[2] || "";
      const value = content.match(/<v>([\s\S]*?)<\/v>/u)?.[1] ?? "";
      const index = columnIndex(reference);
      if (!content) continue;
      if (type === "s") {
        const sharedIndex = Number(value);
        if (!Number.isInteger(sharedIndex) || sharedIndex < 0 || sharedIndex >= sharedStrings.length) throw new Error("Invalid XLSX shared string reference");
        values[index] = sharedStrings[sharedIndex];
      } else if (type === "inlineStr") {
        values[index] = readTextNodes(content);
      } else {
        values[index] = decodeXml(value);
      }
    }
    rows[rowIndex - 1] = values;
  }
  return rows.map((row) => row || []);
}

export function readWorkbookSheet(xlsxPath, sheetName) {
  const buffer = readFileSync(xlsxPath);
  const entries = readZipIndex(buffer);
  const workbookXml = readZipText(buffer, entries, "xl/workbook.xml");
  const relationshipsXml = readZipText(buffer, entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = readSharedStrings(readZipText(buffer, entries, "xl/sharedStrings.xml", false));
  return parseSheetRows(readZipText(buffer, entries, sheetPath(workbookXml, relationshipsXml, sheetName)), sharedStrings);
}
