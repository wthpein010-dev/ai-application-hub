import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(root, "build", "v-curve-tool");
const workflowPath = join(root, ".github", "workflows", "build-v-curve-tool-release.yml");
const hubPackagePath = join(root, "package.json");
const hubVerificationWorkflowPath = join(
  root,
  ".github",
  "workflows",
  "verify-clickflow-publish.yml",
);
const publisherWorkflowPath = join(
  root,
  ".github",
  "workflows",
  "publish-v-curve-tool-release.yml",
);

const releaseManifestFixture = {
  schemaVersion: "v-curve-tool-release/1",
  version: "1.2.0",
  assets: {
    windows: {
      file: "V-Curve-Comparison-Tool-1.2.0-Windows-x64.zip",
      bytes: 99_701_005,
      sha256: "7AD80A5926FE7B7F110CE4C845B5F466BA0C276D77300790DDFA1C0D3919AB97",
    },
    mac: {
      file: "V-Curve-Comparison-Tool-1.2.0-macOS.zip",
      bytes: 261_380_371,
      sha256: "A355EEA4BBB98D66E6C976363C970F2ADBAFB4A99D95E5AE72166C8341A793B7",
      architectures: ["arm64", "x64"],
    },
  },
  bundledLevels: { files: 62 },
};
const sourceShaFixture = "a".repeat(40);
const macArtifactMetadataFixture = {
  version: "1.2.0",
  sourceCommit: sourceShaFixture,
  asset: releaseManifestFixture.assets.mac.file,
  bytes: releaseManifestFixture.assets.mac.bytes,
  sha256: releaseManifestFixture.assets.mac.sha256,
  architectures: ["arm64", "x64"],
  bundledFiles: 62,
};
const staleSourceManifestFixture = {
  ...releaseManifestFixture,
  assets: {
    ...releaseManifestFixture.assets,
    mac: {
      ...releaseManifestFixture.assets.mac,
      bytes: 261_378_127,
      sha256: "F992C85AFAFC207D5C2B76220D2297C6AF4829C58DC6A3794414E1208A9D22C4",
    },
  },
};

function draftReleaseFixture() {
  return {
    id: 378411760,
    tag_name: "v-curve-tool-v1.2.0",
    draft: true,
    upload_url: "https://uploads.github.com/repos/wthpein010-dev/ai-application-hub/releases/378411760/assets{?name,label}",
    assets: [
      { id: 101, name: releaseManifestFixture.assets.windows.file },
      { id: 102, name: releaseManifestFixture.assets.mac.file },
      { id: 103, name: `${releaseManifestFixture.assets.mac.file}.sha256.txt` },
      { id: 104, name: "v-curve-tool-macos-release.json" },
    ],
  };
}

test("the tracked V curve source builds both native macOS architectures", async () => {
  assert.ok(existsSync(join(sourceRoot, "package.json")), "missing tracked V curve source snapshot");
  const packageJson = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));

  assert.equal(packageJson.version, "1.2.0");
  assert.equal(packageJson.scripts["build:mac:arm64"], "npm run build && electron-builder --mac zip --arm64");
  assert.equal(packageJson.scripts["build:mac:x64"], "npm run build && electron-builder --mac zip --x64");
  assert.deepEqual(packageJson.build.mac.extraResources, [{
    from: "bundled-levels/Editorlevel",
    to: "Editorlevel",
  }]);
});

test("the tracked source contains the confirmed opening level payload", async () => {
  const levelsDirectory = join(sourceRoot, "bundled-levels", "Editorlevel");
  assert.ok(existsSync(levelsDirectory), "missing tracked Editorlevel payload");
  const names = await readdir(levelsDirectory);

  assert.equal(names.length, 62);
  assert.equal(names.filter((name) => name.endsWith(".json")).length, 31);
  assert.equal(names.filter((name) => name.endsWith(".meta")).length, 31);
  assert.ok(names.some((name) => /^level_0020.*\.json$/u.test(name)), "level_0020 must be bundled");
});

test("the release workflow builds and launches V curve on Apple silicon and Intel", async () => {
  assert.ok(existsSync(workflowPath), "missing V curve native release workflow");
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /push:[\s\S]*feat\/v-curve-tool-20260828/u);
  assert.match(workflow, /runner:\s*macos-14/u);
  assert.match(workflow, /runner:\s*macos-15-intel/u);
  assert.match(workflow, /npm run build:mac:\$\{\{ matrix\.arch \}\}/u);
  assert.match(workflow, /codesign --verify --deep --strict/u);
  assert.match(workflow, /open -n/u);
  assert.match(workflow, /V-Curve-Comparison-Tool-1\.2\.0-macOS\.zip/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
});

test("the release workflow uploads the ad-hoc signed macOS applications", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const sign = 'codesign --force --deep --sign - "$app"';
  const verify = 'codesign --verify --deep --strict "$app"';
  const rearchive = 'ditto -c -k --sequesterRsrc --keepParent "$app" "$archive"';

  assert.ok(workflow.includes(sign), "the built app must receive an ad-hoc signature");
  assert.ok(workflow.includes(verify), "the ad-hoc signature must be strictly verified");
  assert.ok(workflow.includes(rearchive), "the signed app must replace the unsigned builder archive");
  assert.ok(workflow.indexOf(sign) < workflow.indexOf(verify));
  assert.ok(workflow.indexOf(verify) < workflow.indexOf(rearchive));
});

test("the macOS checksum files record portable archive basenames", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const portableChecksum = '(cd "$(dirname "$archive")" && shasum -a 256 "$(basename "$archive")") > "$archive.sha256.txt"';

  assert.equal(workflow.split(portableChecksum).length - 1, 2);
  assert.doesNotMatch(workflow, /shasum -a 256 "\$archive"/u);
});

test("the publisher promotes the exact verified Mac artifact without overwriting assets", async () => {
  assert.ok(existsSync(publisherWorkflowPath), "missing immutable V curve release publisher");
  const workflow = await readFile(publisherWorkflowPath, "utf8");

  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s*push:/u);
  assert.match(workflow, /artifact_run_id:/u);
  assert.match(workflow, /expected_source_sha:/u);
  assert.match(workflow, /actions:\s*read/u);
  assert.match(workflow, /contents:\s*write/u);
  assert.match(workflow, /ARTIFACT_RUN_ID:\s*\$\{\{ inputs\.artifact_run_id \}\}/u);
  assert.match(workflow, /EXPECTED_SOURCE_SHA:\s*\$\{\{ inputs\.expected_source_sha \}\}/u);
  assert.match(workflow, /ARTIFACT_NAME:\s*v-curve-tool-macos-release/u);
  assert.match(workflow, /RELEASE_TAG:\s*v-curve-tool-v1\.2\.0/u);
  assert.doesNotMatch(workflow, /EXPECTED_ARCHIVE_BYTES/u);
  assert.doesNotMatch(workflow, /EXPECTED_ARCHIVE_SHA256/u);
  assert.match(workflow, /metadata\.bytes/u);
  assert.match(workflow, /metadata\.sha256/u);
  assert.match(workflow, /recordedName/u);
  assert.match(workflow, /gh run download/u);
  assert.match(workflow, /Require a current main dispatch before reading the manifest/u);
  assert.match(workflow, /repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/main/u);
  assert.match(workflow, /curl --fail --silent --show-error/u);
  assert.match(workflow, /createExactReleaseUploadPlan/u);
  assert.doesNotMatch(workflow, /gh release upload/u);
  assert.doesNotMatch(workflow, /--clobber/u);
});

test("the publisher anchors both packages to the committed manifest before explicitly publishing only a complete draft", async () => {
  const workflow = await readFile(publisherWorkflowPath, "utf8");

  assert.match(workflow, /RELEASE_ID:\s*378411760/u);
  assert.match(workflow, /actions\/checkout@v4/u);
  assert.match(workflow, /ref:\s*\$\{\{ github\.sha \}\}/u);
  assert.doesNotMatch(workflow, /ref:\s*\$\{\{ inputs\.expected_source_sha \}\}/u);
  assert.match(workflow, /projects\/v-curve-tool\/release-manifest\.json/u);
  assert.match(workflow, /const manifest = JSON\.parse\(readFileSync\(/u);
  assert.match(workflow, /manifest\.assets\.windows\.bytes/u);
  assert.match(workflow, /manifest\.assets\.windows\.sha256/u);
  assert.match(workflow, /EXPECTED_WINDOWS_ARCHIVE/u);
  assert.match(workflow, /releases\/assets\/\$asset_id/u);
  assert.match(workflow, /scripts\/v-curve-release-publisher\.mjs/u);
  assert.match(workflow, /createCompleteDraftReleasePlan/u);
  assert.match(workflow, /publishVerifiedDraftRelease/u);
  assert.match(workflow, /releases\/\$\{id\}/u);
  assert.doesNotMatch(workflow, /gh release download/u);
  assert.ok(
    workflow.indexOf("Verify the complete manifest-bound assets before publication")
      < workflow.lastIndexOf("publishVerifiedDraftRelease"),
    "the Release must remain a draft until all manifest-bound assets are verified",
  );
});

test("the publisher refuses incomplete or manifest-mismatched draft assets before PATCH and promotes only the exact Release", async () => {
  const {
    assertCurrentMainDispatch,
    createExactReleaseUploadPlan,
    publishVerifiedDraftRelease,
  } = await import("../scripts/v-curve-release-publisher.mjs");
  let verifyCalls = 0;
  let publishCalls = 0;
  const verifyAssets = async () => { verifyCalls += 1; };
  const publish = async () => { publishCalls += 1; };

  await assert.rejects(
    publishVerifiedDraftRelease({
      manifest: releaseManifestFixture,
      sourceSha: sourceShaFixture,
      release: { ...draftReleaseFixture(), assets: draftReleaseFixture().assets.slice(0, 3) },
      macArtifactMetadata: macArtifactMetadataFixture,
      verifyAssets,
      publish,
    }),
    /complete verified V curve asset set/u,
  );
  await assert.rejects(
    publishVerifiedDraftRelease({
      manifest: releaseManifestFixture,
      sourceSha: sourceShaFixture,
      release: draftReleaseFixture(),
      macArtifactMetadata: { ...macArtifactMetadataFixture, sha256: "0".repeat(64) },
      verifyAssets,
      publish,
    }),
    /artifact metadata drift/u,
  );
  await assert.rejects(
    publishVerifiedDraftRelease({
      manifest: staleSourceManifestFixture,
      sourceSha: sourceShaFixture,
      release: draftReleaseFixture(),
      macArtifactMetadata: macArtifactMetadataFixture,
      verifyAssets,
      publish,
    }),
    /artifact metadata drift/u,
    "the stale build-source manifest must not become the publishing contract",
  );
  assert.equal(verifyCalls, 0, "failed release contracts must not fetch or verify assets");
  assert.equal(publishCalls, 0, "failed release contracts must never reach PATCH");
  let corruptedVerifyCalls = 0;
  let corruptedPublishCalls = 0;
  await assert.rejects(
    publishVerifiedDraftRelease({
      manifest: releaseManifestFixture,
      sourceSha: sourceShaFixture,
      release: draftReleaseFixture(),
      macArtifactMetadata: macArtifactMetadataFixture,
      verifyAssets: async () => {
        corruptedVerifyCalls += 1;
        throw new Error("downloaded checksum does not match the manifest");
      },
      publish: async () => { corruptedPublishCalls += 1; },
    }),
    /downloaded checksum does not match/u,
  );
  assert.equal(corruptedVerifyCalls, 1, "the corrupt download must enter the verifier");
  assert.equal(corruptedPublishCalls, 0, "a corrupt download must never reach PATCH");

  const published = await publishVerifiedDraftRelease({
    manifest: releaseManifestFixture,
    sourceSha: sourceShaFixture,
    release: draftReleaseFixture(),
    macArtifactMetadata: macArtifactMetadataFixture,
    verifyAssets: async (plan) => {
      verifyCalls += 1;
      assert.equal(plan.releaseId, 378411760);
      assert.deepEqual(plan.assets, [
        { id: 101, name: releaseManifestFixture.assets.windows.file },
        { id: 102, name: releaseManifestFixture.assets.mac.file },
        { id: 103, name: `${releaseManifestFixture.assets.mac.file}.sha256.txt` },
        { id: 104, name: "v-curve-tool-macos-release.json" },
      ]);
    },
    publish: async (releaseId) => {
      publishCalls += 1;
      assert.equal(releaseId, 378411760);
      return { id: releaseId, tag_name: "v-curve-tool-v1.2.0", draft: false };
    },
  });
  assert.equal(verifyCalls, 1);
  assert.equal(publishCalls, 1);
  assert.equal(published.draft, false);

  let replacementVerifyCalls = 0;
  let replacementPublishCalls = 0;
  await assert.rejects(
    publishVerifiedDraftRelease({
      manifest: releaseManifestFixture,
      sourceSha: sourceShaFixture,
      release: {
        ...draftReleaseFixture(),
        assets: draftReleaseFixture().assets.map((asset) => (
          asset.name === releaseManifestFixture.assets.mac.file ? { ...asset, id: 202 } : asset
        )),
      },
      expectedPlan: {
        releaseId: 378411760,
        assets: [
          { id: 101, name: releaseManifestFixture.assets.windows.file },
          { id: 102, name: releaseManifestFixture.assets.mac.file },
          { id: 103, name: `${releaseManifestFixture.assets.mac.file}.sha256.txt` },
          { id: 104, name: "v-curve-tool-macos-release.json" },
        ],
      },
      macArtifactMetadata: macArtifactMetadataFixture,
      verifyAssets: async () => { replacementVerifyCalls += 1; },
      publish: async (releaseId) => {
        replacementPublishCalls += 1;
        return { id: releaseId, tag_name: "v-curve-tool-v1.2.0", draft: false };
      },
    }),
    /asset IDs changed/u,
  );
  assert.equal(replacementVerifyCalls, 0, "replacement IDs must not enter final verification");
  assert.equal(replacementPublishCalls, 0, "replacement IDs must not reach PATCH");

  assert.doesNotThrow(() => assertCurrentMainDispatch({
    githubRef: "refs/heads/main",
    githubSha: "b".repeat(40),
    mainRefSha: "b".repeat(40),
  }));
  assert.throws(
    () => assertCurrentMainDispatch({
      githubRef: "refs/heads/feature/release",
      githubSha: "b".repeat(40),
      mainRefSha: "b".repeat(40),
    }),
    /must be dispatched from refs\/heads\/main/u,
  );
  assert.throws(
    () => assertCurrentMainDispatch({
      githubRef: "refs/heads/main",
      githubSha: "b".repeat(40),
      mainRefSha: "c".repeat(40),
    }),
    /does not equal the current main ref/u,
  );
  assert.deepEqual(createExactReleaseUploadPlan({ release: draftReleaseFixture() }), {
    releaseId: 378411760,
    uploadUrl: "https://uploads.github.com/repos/wthpein010-dev/ai-application-hub/releases/378411760/assets",
  });
});

test("the Hub suite includes both root and Xiang Le Ge Xiang Node tests while excluding nested Vitest", async () => {
  const packageJson = JSON.parse(await readFile(hubPackagePath, "utf8"));
  const workflow = await readFile(hubVerificationWorkflowPath, "utf8");

  assert.equal(
    packageJson.scripts.test,
    'node --test "tests/**/*.test.mjs" "projects/xiang-le-ge-xiang/tests/**/*.test.mjs"',
  );
  assert.match(workflow, /xvfb-run -a npm test/u);
  assert.doesNotMatch(workflow, /xvfb-run -a node --test(?:\s|$)/u);
});
