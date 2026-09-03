import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as windowsArtifact from "../../scripts/windows-artifact.mjs";
import {
  artifactNames,
  assertPortableArchitectures,
  checksumLine,
  readPeMachine,
} from "../../scripts/windows-artifact.mjs";

function x64PeFixture() {
  const buffer = Buffer.alloc(128);
  buffer.write("MZ", 0, "ascii");
  buffer.writeUInt32LE(64, 0x3c);
  buffer.write("PE\0\0", 64, "binary");
  buffer.writeUInt16LE(0x8664, 68);
  return buffer;
}

describe("Windows artifact verification", () => {
  it("uses deterministic Chinese portable artifact names", () => {
    expect(artifactNames("1.1.0")).toEqual({
      exe: "V曲线对比工具-1.1.0-Windows-x64.exe",
      checksum: "V曲线对比工具-1.1.0-Windows-x64.sha256.txt",
    });
  });

  it("reads the x64 PE machine code and rejects malformed files", () => {
    expect(readPeMachine(x64PeFixture())).toBe(0x8664);
    expect(() => readPeMachine(Buffer.from("not an exe"))).toThrow(/PE/);
  });

  it("writes a lowercase sha256sum-compatible line", () => {
    const bytes = Buffer.from("vcurve");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(checksumLine(bytes, "tool.exe")).toBe(`${expected}  tool.exe\n`);
  });

  it("accepts the NSIS bootstrapper only when the embedded app is x64", () => {
    expect(() => assertPortableArchitectures({
      bootstrapperMachine: 0x014c,
      appMachine: 0x8664,
    })).not.toThrow();
    expect(() => assertPortableArchitectures({
      bootstrapperMachine: 0x014c,
      appMachine: 0x014c,
    })).toThrow(/内层应用.*x64/);
    expect(() => assertPortableArchitectures({
      bootstrapperMachine: 0xaa64,
      appMachine: 0x8664,
    })).toThrow(/NSIS/);
  });

  it("rejects a portable package whose embedded renderer is stale", () => {
    const current = Buffer.from("current renderer");

    expect(() => windowsArtifact.assertMatchingArtifactBytes(current, Buffer.from(current)))
      .not.toThrow();
    expect(() => windowsArtifact.assertMatchingArtifactBytes(current, Buffer.from("stale renderer")))
      .toThrow(/内嵌 HTML.*dist.*不一致/);
  });
});
