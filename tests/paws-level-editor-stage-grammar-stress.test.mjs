import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proofUrl = new URL(
  "./artifacts/paws-ai-v11-corpus-proof.json",
  import.meta.url,
);

test("v11 corpus proof covers the full geometry and play stress matrix", async () => {
  const proof = JSON.parse(await readFile(proofUrl, "utf8"));

  assert.equal(proof.algorithmVersion, "paws-local-stat-v11-stage-grammar");
  assert.equal(proof.corpus.activeSecondRoundFiles, 16);
  assert.equal(proof.corpus.trashFilesRead, 0);
  assert.equal(proof.geometry.cases >= 500, true);
  assert.deepEqual(proof.geometry.failures, {
    build: 0,
    count: 0,
    layers: 0,
    bounds: 0,
    overlap: 0,
    density: 0,
    structure: 0,
    solve: 0,
  });
  assert.equal(proof.play.cases >= 600, true);
  assert.deepEqual(proof.play.failures, {
    oddTypes: 0,
    assignment: 0,
    solve: 0,
  });
  assert.equal(proof.diversity.fixedSeedCount, 30);
  assert.equal(proof.diversity.uniqueTopologyHashes >= 24, true);
  assert.equal(proof.diversity.maximumFamilyUseRatio <= 0.4, true);
  assert.equal(proof.default200x15.maximumLayerPeak <= 22, true);
  assert.equal(proof.ok, true);
});

test("v11 corpus proof records structure, semantics, and performance distributions", async () => {
  const proof = JSON.parse(await readFile(proofUrl, "utf8"));

  assert.equal(Object.keys(proof.geometry.layerPeakHistogram).length > 0, true);
  assert.equal(Object.keys(proof.geometry.componentCountHistogram).length > 0, true);
  assert.equal(Object.keys(proof.geometry.maximumComponentHistogram).length > 0, true);
  assert.equal(Object.keys(proof.geometry.towerEntranceHistogram).length > 0, true);
  assert.equal(Object.keys(proof.geometry.maximumTowerDepthHistogram).length > 0, true);
  assert.equal(proof.geometry.towerRoleTotals.high > 0, true);
  assert.equal(proof.geometry.towerRoleTotals.medium > 0, true);
  assert.equal(proof.geometry.towerRoleTotals.small > 0, true);
  assert.equal(proof.geometry.releaseDependencyDrop.minimum > 0, true);
  assert.equal(
    proof.geometry.defaultDifficultyScores.normal.average
      > proof.geometry.defaultDifficultyScores.easy.average,
    true,
  );
  assert.equal(
    proof.geometry.defaultDifficultyScores.hard.average
      > proof.geometry.defaultDifficultyScores.normal.average,
    true,
  );
  assert.deepEqual(
    Object.keys(proof.geometry.fillTrackHistogram)
      .map(Number)
      .sort((left, right) => left - right),
    [0, 2, 4],
  );
  assert.equal(proof.performance.geometryP95Ms >= 0, true);
  assert.equal(proof.performance.playP95Ms >= 0, true);
  assert.equal(proof.failures.length, 0);
});
