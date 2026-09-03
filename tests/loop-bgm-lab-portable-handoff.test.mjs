import test from "node:test";
import assert from "node:assert/strict";

import {
  exportProjectJson,
  validateProject,
  recordCreateRun,
  updateRunOutputs,
} from "../projects/loop-bgm-lab/core/project-state.mjs";
import { createDailyPlan } from "../projects/loop-bgm-lab/core/prompt-engine.mjs";
import { recommendNextVariant } from "../projects/loop-bgm-lab/core/candidate-score.mjs";
import {
  MAX_PROJECT_DOCUMENT_BYTES,
  MAX_EMBEDDED_PROJECT_BYTES,
  exportProjectHandoffMarkdown,
  importProjectDocument,
} from "../projects/loop-bgm-lab/core/portable-handoff.mjs";

function analysisFixture() {
  return {
    durationSeconds: 60,
    sampleRate: 44100,
    channelCount: 2,
    peak: 0.8,
    rms: 0.2,
    tempo: { bpm: 112, confidence: 0.9 },
    key: { name: "D minor", tonic: "D", mode: "minor", confidence: 0.8, chroma: [0.01, 0.02, 0.24, 0.02, 0.03, 0.18, 0.02, 0.17, 0.03, 0.12, 0.02, 0.14] },
    spectrum: { centroidHz: 1800, brightness: 0.4 },
    loop: { score: 0.88, components: { envelope: 0.9, chroma: 0.9, centroid: 0.85, boundary: 0.82 } },
    warnings: [],
  };
}

function referenceBasisFixture() {
  const analysis = analysisFixture();
  return {
    durationSeconds: analysis.durationSeconds,
    rms: analysis.rms,
    tempo: analysis.tempo,
    key: { name: analysis.key.name, tonic: analysis.key.tonic, mode: analysis.key.mode, confidence: analysis.key.confidence },
    spectrum: { brightness: analysis.spectrum.brightness },
    loop: { score: analysis.loop.score },
  };
}

function comparisonFixture() {
  return {
    components: {
      tempo: { available: true, weight: 0.25, score: 1, deltaBpm: 0 },
      key: { available: true, weight: 0.2, score: 1, relationship: "same-key" },
      brightness: { available: true, weight: 0.15, score: 1, delta: 0 },
      dynamics: { available: true, weight: 0.1, score: 1, delta: 0 },
      loop: { available: true, weight: 0.2, score: 1, delta: 0 },
      duration: { available: true, weight: 0.1, score: 1, deltaSeconds: 0 },
    },
    coverage: 1,
    similarity: 1,
    coreMatches: true,
  };
}

function adviceFixture() {
  return recommendNextVariant(comparisonFixture());
}

function completeProject() {
  let project = createDailyPlan({
    extensions: { futureSetting: { enabled: true }, displayLabel: "循环交接 🐑" },
  });
  project = recordCreateRun(project, "batch-1");
  const run = project.runs[0];
  const reviewNote = "保留原文 LOOP-BGM-LAB-PORTABLE-STATE-BEGIN marker";
  project = updateRunOutputs(project, run.id, [
    { generatedUrl: "https://suno.com/song/example-a", subjectiveScore: 4, reviewNote, disposition: "accepted" },
    { generatedUrl: "https://suno.com/song/example-b", subjectiveScore: 5, reviewNote: "备用结果", disposition: "accepted" },
  ]);
  const candidate = {
    id: "candidate-1",
    displayName: "欢乐版本 A 🎵",
    batchId: "batch-1",
    hash: "b".repeat(64),
    analysis: analysisFixture(),
    referenceBasis: referenceBasisFixture(),
    comparison: comparisonFixture(),
    similarityClass: "too-close",
    advice: adviceFixture(),
    candidateSource: { kind: "legacy-unknown", legacyRunId: run.id },
  };
  const experiment = {
    id: "experiment-1",
    runId: run.id,
    batchId: "batch-1",
    candidateId: candidate.id,
    candidateHash: candidate.hash,
    generatedUrl: project.runs[0].outputs[1].generatedUrl,
    subjectiveScore: project.runs[0].outputs[1].subjectiveScore,
    reviewNote: project.runs[0].outputs[1].reviewNote,
    disposition: project.runs[0].outputs[1].disposition,
    referenceBasis: referenceBasisFixture(),
    comparison: comparisonFixture(),
    advice: candidate.advice,
    generationConditions: run.generationConditions,
    outputIndex: 1,
  };
  project = validateProject({
    ...project,
    batches: project.batches.map(batch => batch.id === "batch-1" ? {
      ...batch,
      currentCandidateId: candidate.id,
      candidateHash: candidate.hash,
      generatedUrl: experiment.generatedUrl,
      subjectiveScore: experiment.subjectiveScore,
      reviewNote: experiment.reviewNote,
      disposition: experiment.disposition,
    } : batch),
    candidates: [candidate],
    experiments: [experiment],
    licenses: [{
      id: "license-1",
      source: "Example",
      sourceUrl: "https://example.test/license",
      license: "CC0",
      licenseIdentifier: "CC0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      evidenceUrl: "https://example.test/license",
      evidenceCheckedAt: "2026-08-30",
      deliveryStatus: "original",
      scopeNote: "Covers the exact downloaded audio bytes.",
      rightsChainStatus: "independently-verified",
      fileSha256: "c".repeat(64),
      author: "作者 🎧",
      downloadedAt: "2026-08-30",
    }],
    currentBestCandidate: { candidateId: candidate.id, displayName: candidate.displayName, hash: candidate.hash },
  });
  return project;
}

const BEGIN = "<!-- LOOP-BGM-LAB-PORTABLE-STATE-BEGIN";
const END = "<!-- LOOP-BGM-LAB-PORTABLE-STATE-END -->";

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function digestHex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

async function envelopeFor(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  const payload = base64url(bytes).match(/.{1,96}/g)?.join("\n") ?? "";
  return `${BEGIN}\nversion=1\nencoding=base64url\nbyteLength=${bytes.byteLength}\nsha256=${await digestHex(bytes)}\n-->\n\`\`\`loop-bgm-lab-state\n${payload}\n\`\`\`\n${END}\n`;
}

test("losslessly round-trips the complete project and keeps reserved markers readable-safe", async () => {
  const project = completeProject();
  const markdown = await exportProjectHandoffMarkdown(project);
  const restored = await importProjectDocument(markdown);
  assert.equal(restored.format, "markdown");
  assert.deepEqual(restored.project, validateProject(project));
  assert.equal((markdown.match(/LOOP-BGM-LAB-PORTABLE-STATE-BEGIN/g) || []).length, 1);
  assert.doesNotMatch(markdown.slice(0, markdown.indexOf(BEGIN)), /LOOP-BGM-LAB-PORTABLE-STATE-BEGIN/);
  assert.match(markdown, /marker text was redacted/i);

  const jsonRestored = await importProjectDocument(`\uFEFF${exportProjectJson(project)}`);
  assert.equal(jsonRestored.format, "json");
  assert.deepEqual(jsonRestored.project, validateProject(project));
});

test("preserves the embedded state when readable prose is edited and CRLF is used", async () => {
  const markdown = await exportProjectHandoffMarkdown(completeProject());
  const edited = `\ufeff# Human-edited handoff\r\n\r\nChanged prose\r\n${markdown.replace(/\n/g, "\r\n")}`;
  const restored = await importProjectDocument(edited);
  assert.deepEqual(restored.project, completeProject());
});

test("rejects missing, duplicate, unknown, malformed, and trailing envelope content", async () => {
  const markdown = await exportProjectHandoffMarkdown(completeProject());
  const envelopeStart = markdown.indexOf(BEGIN);
  const envelope = markdown.slice(envelopeStart);
  await assert.rejects(() => importProjectDocument(markdown.slice(0, envelopeStart)), /envelope|marker/i);
  await assert.rejects(() => importProjectDocument(`${markdown}${envelope}`), /exactly one|duplicate|marker/i);
  await assert.rejects(() => importProjectDocument(envelope.replace("version=1", "version=9")), /version/i);
  await assert.rejects(() => importProjectDocument(envelope.replace("encoding=base64url", "encoding=base64")), /encoding/i);
  await assert.rejects(() => importProjectDocument(envelope.replace("sha256=", "unknown=x\nsha256=")), /metadata|key|unknown/i);
  const payloadCorrupted = envelope.replace(/(\n```loop-bgm-lab-state\n)([^\n])/, "$1=$2");
  await assert.rejects(() => importProjectDocument(payloadCorrupted), /base64|canonical|padding/i);
  await assert.rejects(() => importProjectDocument(`${markdown}non-whitespace`), /trailing|envelope/i);
});

test("rejects one begin/end marker pair when its order is reversed", async () => {
  const markdown = await exportProjectHandoffMarkdown(completeProject());
  const envelope = markdown.slice(markdown.indexOf(BEGIN));
  const endStart = envelope.indexOf(END);
  const reversedEnvelope = `${END}${envelope.slice(BEGIN.length, endStart)}${BEGIN}${envelope.slice(endStart + END.length)}`;
  assert.equal((reversedEnvelope.match(/LOOP-BGM-LAB-PORTABLE-STATE-BEGIN/g) || []).length, 1);
  assert.equal((reversedEnvelope.match(/LOOP-BGM-LAB-PORTABLE-STATE-END/g) || []).length, 1);
  await assert.rejects(() => importProjectDocument(reversedEnvelope), /order|marker/i);
});

test("rejects terminal equals-sign padding in the base64url payload", async () => {
  const markdown = await exportProjectHandoffMarkdown(completeProject());
  const envelope = markdown.slice(markdown.indexOf(BEGIN));
  const terminallyPaddedPayload = envelope.replace(`\n\`\`\`\n${END}`, `=\n\`\`\`\n${END}`);
  assert.notEqual(terminallyPaddedPayload, envelope, "test fixture must append terminal base64 padding");
  await assert.rejects(() => importProjectDocument(terminallyPaddedPayload), /base64|canonical|padding/i);
});

test("rejects invalid UTF-8, mismatched length, mismatched digest, and oversized embedded state", async () => {
  const markdown = await exportProjectHandoffMarkdown(completeProject());
  const start = markdown.indexOf(BEGIN);
  const envelope = markdown.slice(start);
  await assert.rejects(() => importProjectDocument(envelope.replace(/byteLength=\d+/, "byteLength=999")), /length|byte/i);
  await assert.rejects(() => importProjectDocument(envelope.replace(/sha256=[0-9a-f]+/, `sha256=${"0".repeat(64)}`)), /SHA-256|digest/i);
  const invalid = await envelopeFor(new Uint8Array([0xff, 0xfe]));
  await assert.rejects(() => importProjectDocument(invalid), /UTF-8|JSON|project/i);
  const oversizedBytes = new Uint8Array(MAX_EMBEDDED_PROJECT_BYTES + 1);
  const oversized = await envelopeFor(oversizedBytes);
  await assert.rejects(() => importProjectDocument(oversized), /16 MiB|embedded|size/i);
  await assert.rejects(() => importProjectDocument("x".repeat(MAX_PROJECT_DOCUMENT_BYTES + 1)), /48 MiB|document|size/i);
});

test("retains canonical JSON validation as the security boundary after digest verification", async () => {
  const unsafe = { ...completeProject(), extensions: { token: "secret" } };
  const envelope = await envelopeFor(JSON.stringify(unsafe));
  await assert.rejects(() => importProjectDocument(envelope), /forbidden key/i);
});
