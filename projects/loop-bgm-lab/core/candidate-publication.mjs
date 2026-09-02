import { validateProject } from "./project-state.mjs";

function fail(message) {
  throw new TypeError(message);
}

export function deriveCandidatePublicationState(project, candidateId) {
  const safe = validateProject(project);
  if (typeof candidateId !== "string" || candidateId.length === 0) {
    fail("candidateId must be a non-empty string");
  }
  const candidate = safe.candidates.find(item => item.id === candidateId);
  if (!candidate) fail(`Unknown candidate: ${candidateId}`);

  const sourceKind = candidate.candidateSource.kind;
  const licenseId = sourceKind === "external" || sourceKind === "local-original"
    ? candidate.candidateSource.licenseId
    : null;
  const license = licenseId === null
    ? null
    : safe.licenses.find(item => item.id === licenseId) ?? null;
  const blockers = [];
  if (sourceKind === "legacy-unknown") blockers.push("source-unconfirmed");
  if (license === null) blockers.push("missing-license-evidence");
  else blockers.push(...license.publicationBlockers);

  const accepted = safe.experiments.some(experiment => (
    experiment.candidateId === candidateId && experiment.disposition === "accepted"
  ));
  const reviewReasons = accepted ? [] : ["experiment-not-accepted"];
  const status = blockers.length > 0 ? "blocked" : accepted ? "ready" : "review";
  const isResearchFavorite = safe.currentBestCandidate?.candidateId === candidate.id
    && safe.currentBestCandidate.hash.toLowerCase() === candidate.hash.toLowerCase();

  return {
    status,
    candidateId: candidate.id,
    sourceKind,
    licenseId,
    blockers,
    reviewReasons,
    isResearchFavorite,
  };
}
