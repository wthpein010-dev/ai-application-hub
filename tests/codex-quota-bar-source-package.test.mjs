import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("Quota Bar macOS packaging keeps required native libraries", async () => {
  const script = await readFile(
    join(root, "build", "codex-quota-bar", "scripts", "package-macos.sh"),
    "utf8",
  );

  assert.match(script, /CODEX_QUOTA_ARCHITECTURES/);
  assert.match(script, /IncludeNativeLibrariesForSelfExtract=false/);
  assert.match(script, /cp -R "\$publish_dir\/\." "\$contents\/MacOS\/"/);
  for (const library of [
    "libAvaloniaNative.dylib",
    "libHarfBuzzSharp.dylib",
    "libSkiaSharp.dylib",
  ]) {
    assert.match(script, new RegExp(library.replaceAll(".", "\\.")));
  }
});

test("the PowerShell macOS packager keeps the native runtime beside the app", async () => {
  const script = await readFile(
    join(root, "build", "codex-quota-bar", "scripts", "package-macos.ps1"),
    "utf8",
  );

  assert.match(script, /IncludeNativeLibrariesForSelfExtract=false/);
  assert.match(
    script,
    /Get-ChildItem -LiteralPath \$publishDirectory -Force \| Copy-Item -Destination \$macOsDirectory -Recurse -Force/,
  );
  assert.match(script, /Set-ZipUnixCreatorPlatform/);
  assert.match(script, /\$bytes\[\$offset \+ 5\] = 3/);
  for (const library of [
    "libAvaloniaNative.dylib",
    "libHarfBuzzSharp.dylib",
    "libSkiaSharp.dylib",
  ]) {
    assert.match(script, new RegExp(library.replaceAll(".", "\\.")));
  }
});

test("the repair workflow rebuilds Quota Bar from its locked source snapshot", async () => {
  const workflow = await readFile(
    join(root, ".github", "workflows", "repair-codex-quota-bar-macos.yml"),
    "utf8",
  );

  assert.match(workflow, /actions\/setup-dotnet@v4/);
  assert.match(workflow, /build\/codex-quota-bar\/CodexQuotaBar\.sln/);
  assert.match(workflow, /build\/codex-quota-bar\/scripts\/package-macos\.sh/);
  assert.match(workflow, /CODEX_QUOTA_ARCHITECTURES/);
});
