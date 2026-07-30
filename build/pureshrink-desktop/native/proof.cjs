"use strict";

const {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");

function solidBmp(width, height) {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowBytes * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  for (let offset = 54; offset < buffer.length; offset += 3) {
    buffer[offset] = 0x87;
    buffer[offset + 1] = 0xff;
    buffer[offset + 2] = 0xd5;
  }
  return buffer;
}

async function runNativeProof(runner, parentDirectory) {
  const proofRoot = mkdtempSync(path.join(parentDirectory, "pureshrink-native-proof-"));
  try {
    const sourcePath = path.join(proofRoot, "source.bmp");
    const outputDirectory = path.join(proofRoot, "output");
    writeFileSync(sourcePath, solidBmp(128, 128));
    const sourceBytes = statSync(sourcePath).size;
    const result = await runner.compress({
      id: 9001,
      sourcePath,
      name: "source.bmp",
      size: sourceBytes,
      type: "image/bmp",
      plan: {
        kind: "image",
        mode: "lossless",
        outputExtension: "png",
        isLossless: true,
      },
    }, outputDirectory);

    if (result.keptOriginal || !result.path || !existsSync(result.path)) {
      throw new Error("NativeRunner did not create its PNG proof output");
    }
    if (result.outputBytes >= sourceBytes) {
      throw new Error("NativeRunner proof did not shrink the source");
    }
    if (!/指纹一致/.test(result.verification || "")) {
      throw new Error("NativeRunner did not verify the output fingerprint");
    }
    return {
      proof: "PURESHRINK_NATIVE_PROCESSING_OK",
      sourceBytes,
      outputBytes: result.outputBytes,
      verification: result.verification,
    };
  } finally {
    rmSync(proofRoot, { recursive: true, force: true });
  }
}

module.exports = {
  runNativeProof,
  solidBmp,
};
