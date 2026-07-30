import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { parseLevelDocument } from "../projects/paws-level-editor/core/level-adapter.mjs";
import {
  extractLevelStatistics,
  mergeLevelStatistics,
} from "../projects/paws-level-editor/core/level-statistics.mjs";
import {
  extractStructureGrammar,
  mergeStructureGrammars,
  spatialComponents,
  topologyHash,
} from "../projects/paws-level-editor/core/structure-corpus.mjs";

const levelsRoot = process.env.PAWS_EDITOR_LEVELS?.trim();

function tile(uid, x, y, layer, {
  type = -1,
  moldType = 1,
  presetColorType = 1,
} = {}) {
  return {
    uid,
    x,
    y,
    layer,
    type,
    moldType,
    metaType: 0,
    metaData: 0,
    presetColorType,
  };
}

function makeDocument(tiles, {
  fileName = "reference_r2_sample.json",
  width = 7,
  height = 8,
} = {}) {
  return {
    fileName,
    board: { width, height, scale: 1 },
    designerNote: {},
    tiles,
  };
}

test("spatial components use a four-microcell maximum footprint gap", () => {
  const layer = [
    tile("a", 0, 0, 1),
    tile("b", 12, 0, 1),
    tile("c", 32, 0, 1),
  ];

  assert.deepEqual(
    spatialComponents(layer).map((component) =>
      component.map(({ uid }) => uid)),
    [["a", "b"], ["c"]],
  );
});

test("grammar records split and merge transitions plus adjacent-layer tower chains", () => {
  const grammar = extractStructureGrammar(makeDocument([
    tile("base-a", 0, 0, 1),
    tile("base-b", 24, 0, 1),
    tile("upper-a", 4, 0, 2),
    tile("upper-b", 28, 0, 2),
    tile("top-a", 6, 0, 3),
  ]));

  assert.equal(grammar.layerRoles.length, 3);
  assert.equal(grammar.layerRoles[0].componentCount, 2);
  assert.equal(grammar.layerTransitions.length, 2);
  assert.equal(grammar.layerTransitions[0].overlapEdges.length, 2);
  assert.equal(grammar.layerTransitions[1].overlapEdges.length, 1);
  assert.equal(
    grammar.towerChains.some(({ depth, tileUids }) =>
      depth === 3
      && tileUids.includes("base-a")
      && tileUids.includes("top-a")),
    true,
  );
});

test("grammar recognizes only canonical Unity blind-fill tracks", () => {
  const grammar = extractStructureGrammar(makeDocument([
    tile("ordinary", 40, 40, 1),
    tile("track-a-1", 0, 0, 1, { presetColorType: 3 }),
    tile("track-a-2", 2, 0, 2, { presetColorType: 3 }),
    tile("track-a-top", 4, 0, 3, { moldType: 2 }),
    tile("track-b-1", 32, 0, 1, { presetColorType: 3 }),
    tile("track-b-2", 30, 0, 2, { presetColorType: 3 }),
    tile("track-b-top", 28, 0, 3, { moldType: 2 }),
  ]));

  assert.equal(grammar.fillTracks.length, 2);
  assert.deepEqual(
    grammar.fillTracks.map(({ lowerDepth, explicitTop }) => [
      lowerDepth,
      explicitTop,
    ]),
    [[2, true], [2, true]],
  );
});

test("topology hash ignores uid and pattern-only changes", () => {
  const first = {
    tiles: [
      tile("a", 0, 0, 1, { type: 1 }),
      tile("b", 8, 0, 1, { type: 2 }),
      tile("c", 4, 0, 2, { type: 3 }),
    ],
    stagePlan: [{ key: "release", layerCount: 1, tileCount: 2 }],
    fillTracks: [],
  };
  const patternAndUidOnlyChange = {
    ...first,
    tiles: first.tiles.map((value, index) => ({
      ...value,
      uid: `changed-${index}`,
      type: 20 + index,
    })),
  };
  const movedPlatform = {
    ...first,
    tiles: first.tiles.map((value, index) => ({
      ...value,
      x: index === 1 ? 16 : value.x,
    })),
  };

  assert.equal(topologyHash(first), topologyHash(patternAndUidOnlyChange));
  assert.notEqual(topologyHash(first), topologyHash(movedPlatform));
});

test("corpus aggregation preserves reference families and categorical distributions", () => {
  const first = extractStructureGrammar(makeDocument([
    tile("a", 0, 0, 1),
    tile("b", 4, 0, 2),
  ], { fileName: "first_r2.json" }));
  const second = extractStructureGrammar(makeDocument([
    tile("c", 0, 0, 1),
    tile("d", 24, 0, 1),
    tile("e", 4, 0, 2),
  ], { fileName: "second_r2.json" }));

  const corpus = mergeStructureGrammars([first, second]);

  assert.equal(corpus.sampleCount, 2);
  assert.deepEqual(
    corpus.families.map(({ sourceFileName }) => sourceFileName),
    ["first_r2.json", "second_r2.json"],
  );
  assert.deepEqual(corpus.distributions.fillTrackCounts, { 0: 2 });
  assert.deepEqual(corpus.distributions.layerCounts, { 2: 2 });
  assert.equal(corpus.platformMotifs.length > 0, true);
});

test("level statistics expose structure grammar and the merged corpus", () => {
  const documents = [
    makeDocument([
      tile("a", 0, 0, 1),
      tile("b", 4, 0, 2),
    ], { fileName: "first_r2.json" }),
    makeDocument([
      tile("c", 24, 0, 1),
      tile("d", 28, 0, 2),
    ], { fileName: "second_r2.json" }),
  ];
  const statistics = documents.map(extractLevelStatistics);
  const merged = mergeLevelStatistics(statistics);

  assert.equal(statistics[0].structureGrammar.sourceFileName, "first_r2.json");
  assert.equal(statistics[0].structureGrammar.layerRoles.length, 2);
  assert.equal(merged.structureCorpus.sampleCount, 2);
  assert.deepEqual(
    merged.structureCorpus.families.map(({ sourceFileName }) => sourceFileName),
    ["first_r2.json", "second_r2.json"],
  );
});

test("real Unity corpus reads exactly the 16 active root-only second-round files", {
  skip: levelsRoot
    ? false
    : "PAWS_EDITOR_LEVELS is not set; Unity corpus gate was not requested.",
}, async () => {
  const entries = await readdir(levelsRoot, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) =>
      entry.isFile()
      && /_r2_.*\.json$/i.test(entry.name))
    .map(({ name }) => name)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const grammars = await Promise.all(fileNames.map(async (fileName) =>
    extractStructureGrammar(parseLevelDocument(
      JSON.parse(await readFile(join(levelsRoot, fileName), "utf8")),
      { fileName },
    ))));

  assert.equal(fileNames.length, 16);
  assert.equal(fileNames.some((name) => /_Trash/i.test(name)), false);
  assert.equal(
    grammars.every(({ fillTracks }) => [0, 2, 4].includes(fillTracks.length)),
    true,
  );
  assert.equal(grammars.every(({ layerRoles }) => layerRoles.length > 0), true);
});
