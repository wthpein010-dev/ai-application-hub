import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { extractValidatedZip, readZipEntries, validateZipEntries } from "./helpers/zip-central-directory.mjs";

function zipExtraField(id, payload) {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(id, 0);
  header.writeUInt16LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function buildZip({
  centralName,
  localName = centralName,
  centralExtra = Buffer.alloc(0),
  localExtra = Buffer.alloc(0),
  data = Buffer.from("x"),
  externalAttributes = ((0o100644 << 16) >>> 0),
  uncompressedSize = data.length,
  compressionMethod = 0,
  crc32 = 0,
} = {}) {
  const centralNameBytes = Buffer.from(centralName, "utf8");
  const localNameBytes = Buffer.from(localName, "utf8");
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(compressionMethod, 8);
  localHeader.writeUInt32LE(crc32, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(uncompressedSize, 22);
  localHeader.writeUInt16LE(localNameBytes.length, 26);
  localHeader.writeUInt16LE(localExtra.length, 28);
  const localRecord = Buffer.concat([localHeader, localNameBytes, localExtra, data]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(0x0314, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(compressionMethod, 10);
  centralHeader.writeUInt32LE(crc32, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(uncompressedSize, 24);
  centralHeader.writeUInt16LE(centralNameBytes.length, 28);
  centralHeader.writeUInt16LE(centralExtra.length, 30);
  centralHeader.writeUInt32LE(externalAttributes, 38);
  centralHeader.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([centralHeader, centralNameBytes, centralExtra]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  return Buffer.concat([localRecord, centralRecord, end]);
}

function withZip(buffer, callback) {
  const directory = mkdtempSync(join(tmpdir(), "zip-gate-test-"));
  const path = join(directory, "fixture.zip");
  writeFileSync(path, buffer);
  try {
    return callback(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function regularEntry(name, uncompressedSize = 1) {
  return {
    name,
    compressedSize: Math.min(uncompressedSize, 1),
    uncompressedSize,
    compressionMethod: 8,
    encrypted: false,
    unixType: 0o100000,
    isDirectory: false,
    isSymlink: false,
  };
}

test("ZIP validation canonicalizes dot prefixes before rejecting drive-qualified paths", () => {
  assert.throws(
    () => validateZipEntries([regularEntry("./C:/payload.txt")]),
    /drive-qualified archive path: \.\/C:\/payload\.txt/,
  );
});

test("ZIP validation rejects symbolic links before extraction", () => {
  assert.throws(
    () => validateZipEntries([{
      ...regularEntry("Packages/manifest.json"),
      unixType: 0o120000,
      isSymlink: true,
    }]),
    /symbolic link archive entry: Packages\/manifest\.json/,
  );
});

test("ZIP validation rejects archives that exceed the expansion limit", () => {
  assert.throws(
    () => validateZipEntries([
      regularEntry("Assets/one.bin", 70),
      regularEntry("Assets/two.bin", 40),
    ], { maxEntryBytes: 100, maxEntries: 10, maxTotalBytes: 100 }),
    /archive expands to 110 bytes; limit is 100/,
  );
});

test("ZIP validation returns portable normalized paths for regular entries", () => {
  const entries = validateZipEntries([
    regularEntry("./Assets\\Scenes\\Main.unity", 12),
    regularEntry("Packages/manifest.json", 20),
  ]);

  assert.deepEqual(entries.map((entry) => entry.normalizedPath), [
    "Assets/Scenes/Main.unity",
    "Packages/manifest.json",
  ]);
});

test("ZIP parsing rejects a local-header path that differs from the central directory", () => {
  withZip(buildZip({ centralName: "Assets/safe.txt", localName: "../escape.txt" }), (path) => {
    assert.throws(() => readZipEntries(path), /local header path .* does not match central directory path/);
  });
});

test("ZIP parsing rejects Unicode path extras that can rewrite an entry name", () => {
  const unicodePath = zipExtraField(0x7075, Buffer.from([1, 0, 0, 0, 0, ...Buffer.from("../escape.txt")]));
  withZip(buildZip({ centralName: "Assets/safe.txt", centralExtra: unicodePath }), (path) => {
    assert.throws(() => readZipEntries(path), /Unicode path extra field/);
  });
});

test("ZIP validation rejects Windows device names and forbidden characters", () => {
  for (const name of ["Assets/NUL.txt", "Assets/COM¹.txt", "Assets/LPT².log", "Assets/bad?.txt"]) {
    withZip(buildZip({ centralName: name }), (path) => {
      assert.throws(() => validateZipEntries(readZipEntries(path)), /non-portable Windows archive path segment/);
    });
  }
});

test("ZIP validation rejects names that collide after macOS Unicode normalization", () => {
  assert.throws(
    () => validateZipEntries([
      regularEntry("Assets/é.txt"),
      regularEntry("Assets/é.txt"),
    ]),
    /archive path collision/,
  );
});

test("ZIP parsing carries Unix link metadata into validation", () => {
  const symlinkAttributes = ((0o120777 << 16) >>> 0);
  withZip(buildZip({ centralName: "Packages/manifest.json", externalAttributes: symlinkAttributes }), (path) => {
    const entries = readZipEntries(path);
    assert.equal(entries[0].isSymlink, true);
    assert.throws(() => validateZipEntries(entries), /symbolic link archive entry/);
  });
});

test("ZIP binary metadata is subject to the expansion limit", () => {
  const compressed = deflateRawSync(Buffer.alloc(101, 0x61));
  withZip(buildZip({
    centralName: "Assets/large.bin",
    data: compressed,
    compressionMethod: 8,
    uncompressedSize: 101,
  }), (path) => {
    const entries = readZipEntries(path);
    assert.throws(
      () => validateZipEntries(entries, { maxEntryBytes: 100, maxEntries: 10, maxTotalBytes: 100 }),
      /archive entry expands to 101 bytes; limit is 100/,
    );
  });
});

test("ZIP validation rejects stored entries whose compressed and declared sizes differ", () => {
  withZip(buildZip({
    centralName: "Assets/underreported-stored.bin",
    data: Buffer.alloc(101, 0x61),
    compressionMethod: 0,
    uncompressedSize: 1,
  }), (path) => {
    assert.throws(
      () => validateZipEntries(readZipEntries(path), {
        maxEntryBytes: 100,
        maxEntries: 10,
        maxTotalBytes: 100,
      }),
      /stored entry sizes do not match/,
    );
  });
});

test("bounded extraction rejects a deflate stream larger than its declared size before writing", () => {
  const compressed = deflateRawSync(Buffer.alloc(101, 0x61));
  withZip(buildZip({
    centralName: "Assets/underreported.bin",
    data: compressed,
    compressionMethod: 8,
    uncompressedSize: 1,
  }), (path) => {
    const entries = validateZipEntries(readZipEntries(path), {
      maxEntryBytes: 100,
      maxEntries: 10,
      maxTotalBytes: 100,
    });
    const destination = mkdtempSync(join(tmpdir(), "zip-extract-test-"));
    try {
      assert.throws(
        () => extractValidatedZip(path, entries, destination, { maxEntryBytes: 100, maxTotalBytes: 100 }),
        /exceeds its declared uncompressed size/,
      );
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  });
});
