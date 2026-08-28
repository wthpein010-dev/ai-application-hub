const releaseId = 378411760;
const releaseTag = "v-curve-tool-v1.2.0";

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedMacMetadata(manifest, sourceSha) {
  return {
    version: manifest.version,
    sourceCommit: sourceSha,
    asset: manifest.assets.mac.file,
    bytes: manifest.assets.mac.bytes,
    sha256: manifest.assets.mac.sha256,
    architectures: manifest.assets.mac.architectures,
    bundledFiles: manifest.bundledLevels.files,
  };
}

function assertReleaseManifest(manifest) {
  if (manifest?.schemaVersion !== "v-curve-tool-release/1" || manifest.version !== "1.2.0") {
    throw new Error(`unexpected release manifest: ${JSON.stringify(manifest)}`);
  }
}

function assertExactDraftRelease(release) {
  if (release?.id !== releaseId || release.tag_name !== releaseTag || release.draft !== true) {
    throw new Error(`Release is not the expected draft: ${JSON.stringify(release)}`);
  }
}

export function assertCurrentMainDispatch({ githubRef, githubSha, mainRefSha }) {
  if (githubRef !== "refs/heads/main") {
    throw new Error(`Release publisher must be dispatched from refs/heads/main, got ${githubRef}`);
  }
  if (githubSha !== mainRefSha) {
    throw new Error(`workflow SHA ${githubSha} does not equal the current main ref ${mainRefSha}`);
  }
}

export function createExactReleaseUploadPlan({ release }) {
  assertExactDraftRelease(release);
  const uploadUrl = release.upload_url?.replace(/\{.*$/u, "");
  if (!uploadUrl?.endsWith(`/releases/${releaseId}/assets`)) {
    throw new Error(`unexpected Release upload URL: ${release.upload_url}`);
  }
  return { releaseId, uploadUrl };
}

export function assertMacArtifactMatchesManifest({ manifest, sourceSha, macArtifactMetadata }) {
  assertReleaseManifest(manifest);
  const expected = expectedMacMetadata(manifest, sourceSha);
  if (!sameJson(macArtifactMetadata, expected)) {
    throw new Error(`artifact metadata drift: ${JSON.stringify(macArtifactMetadata)}`);
  }
}

export function createCompleteDraftReleasePlan({ manifest, sourceSha, release, macArtifactMetadata }) {
  assertMacArtifactMatchesManifest({ manifest, sourceSha, macArtifactMetadata });
  assertExactDraftRelease(release);

  const expectedAssetNames = [
    manifest.assets.windows.file,
    manifest.assets.mac.file,
    `${manifest.assets.mac.file}.sha256.txt`,
    "v-curve-tool-macos-release.json",
  ];
  const assetsByName = new Map(release.assets.map((asset) => [asset.name, asset]));
  if (assetsByName.size !== expectedAssetNames.length
    || !expectedAssetNames.every((name) => Number.isSafeInteger(assetsByName.get(name)?.id))) {
    throw new Error("The Release does not contain the complete verified V curve asset set");
  }

  return {
    releaseId,
    assets: expectedAssetNames.map((name) => ({ id: assetsByName.get(name).id, name })),
  };
}

export async function publishVerifiedDraftRelease({
  manifest,
  sourceSha,
  release,
  expectedPlan,
  macArtifactMetadata,
  verifyAssets,
  publish,
}) {
  const plan = createCompleteDraftReleasePlan({
    manifest,
    sourceSha,
    release,
    macArtifactMetadata,
  });
  if (expectedPlan && !sameJson(plan, expectedPlan)) {
    throw new Error(`Release asset IDs changed: ${JSON.stringify(plan.assets)}`);
  }
  await verifyAssets(plan);
  const published = await publish(plan.releaseId);
  if (published?.id !== plan.releaseId || published.tag_name !== releaseTag || published.draft !== false) {
    throw new Error(`Release publication drift: ${JSON.stringify(published)}`);
  }
  return published;
}
