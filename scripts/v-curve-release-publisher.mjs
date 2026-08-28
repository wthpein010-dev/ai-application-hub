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
  if (!Number.isSafeInteger(manifest.releaseWorkflow?.runId)
    || manifest.releaseWorkflow.runId <= 0
    || !/^[0-9a-f]{40}$/u.test(manifest.releaseWorkflow?.sourceCommit ?? "")) {
    throw new Error(`invalid release workflow provenance: ${JSON.stringify(manifest.releaseWorkflow)}`);
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

export function assertArtifactProvenance({ manifest, artifactRunId, sourceSha, run }) {
  assertReleaseManifest(manifest);
  if (artifactRunId !== String(manifest.releaseWorkflow.runId)) {
    throw new Error(`artifact run does not match the release manifest: ${artifactRunId}`);
  }
  if (sourceSha !== manifest.releaseWorkflow.sourceCommit) {
    throw new Error(`source SHA does not match the release manifest: ${sourceSha}`);
  }
  if (run?.status !== "completed" || run.conclusion !== "success") {
    throw new Error(`artifact run is not a completed success: ${JSON.stringify(run)}`);
  }
  if (run.headSha !== sourceSha) {
    throw new Error(`artifact run source drift: ${run.headSha}`);
  }
}

export function assertPortableChecksum({ content, expectedSha, expectedFile, label }) {
  const parts = String(content).trim().split(/\s+/u);
  if (parts.length !== 2
    || parts[0].toUpperCase() !== expectedSha
    || parts[1] !== expectedFile) {
    throw new Error(`${label} checksum drift: ${parts.join(" ")}`);
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
  if (sourceSha !== manifest.releaseWorkflow.sourceCommit) {
    throw new Error(`source SHA does not match the release manifest: ${sourceSha}`);
  }
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
    `${manifest.assets.windows.file}.sha256.txt`,
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
  loadRelease,
  loadTagSha,
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
  if (typeof loadRelease !== "function" || typeof loadTagSha !== "function") {
    throw new Error("post-verification Release and tag loaders are required");
  }
  const latestRelease = await loadRelease(plan.releaseId);
  const latestPlan = createCompleteDraftReleasePlan({
    manifest,
    sourceSha,
    release: latestRelease,
    macArtifactMetadata,
  });
  if (!sameJson(latestPlan, plan)) {
    throw new Error(`Release asset IDs changed after verification: ${JSON.stringify(latestPlan.assets)}`);
  }
  const latestTagSha = await loadTagSha(releaseTag);
  if (latestTagSha !== sourceSha) {
    throw new Error(`Release tag source changed after verification: ${latestTagSha}`);
  }
  const published = await publish(plan.releaseId);
  if (published?.id !== plan.releaseId || published.tag_name !== releaseTag || published.draft !== false) {
    throw new Error(`Release publication drift: ${JSON.stringify(published)}`);
  }
  return published;
}
