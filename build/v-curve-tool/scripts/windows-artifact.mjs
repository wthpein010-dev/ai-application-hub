import { createHash } from "node:crypto";

export function artifactNames(version) {
  const stem = `V曲线对比工具-${version}-Windows-x64`;
  return {
    exe: `${stem}.exe`,
    checksum: `${stem}.sha256.txt`,
  };
}

export function readPeMachine(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.length < 70
    || buffer.subarray(0, 2).toString("ascii") !== "MZ"
  ) {
    throw new Error("文件不是有效 PE：缺少 MZ 头");
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (
    peOffset + 6 > buffer.length
    || buffer.subarray(peOffset, peOffset + 4).toString("binary") !== "PE\0\0"
  ) {
    throw new Error("文件不是有效 PE：缺少 PE 签名");
  }
  return buffer.readUInt16LE(peOffset + 4);
}

export function assertPortableArchitectures({ bootstrapperMachine, appMachine }) {
  if (![0x014c, 0x8664].includes(bootstrapperMachine)) {
    throw new Error(`NSIS portable 引导器机器码异常：0x${bootstrapperMachine.toString(16)}`);
  }
  if (appMachine !== 0x8664) {
    throw new Error(`便携包内层应用必须是 x64，实际为 0x${appMachine.toString(16)}`);
  }
}

export function assertMatchingArtifactBytes(expected, actual) {
  const expectedHash = createHash("sha256").update(expected).digest("hex");
  const actualHash = createHash("sha256").update(actual).digest("hex");
  if (expectedHash !== actualHash) {
    throw new Error(
      `便携包内嵌 HTML 与当前 dist 不一致：dist=${expectedHash}，embedded=${actualHash}`,
    );
  }
  return expectedHash;
}

export function checksumLine(buffer, fileName) {
  const hash = createHash("sha256").update(buffer).digest("hex");
  return `${hash}  ${fileName}\n`;
}
