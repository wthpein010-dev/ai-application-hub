export const OFFICIAL_PLATFORM_ORIGIN = "https://platform.suno.com";
export const OFFICIAL_API_EVIDENCE_KEYS = Object.freeze([
  "publicDocsReadable",
  "authenticationDocumented",
  "apiPricingDocumented",
  "consumerCreditsInteroperable",
  "generationContractDocumented",
  "corsAndRateLimitsDocumented",
]);

const EVIDENCE_BLOCKERS = Object.freeze({
  publicDocsReadable: "官方公开文档尚未确认可读。",
  authenticationDocumented: "官方鉴权方式尚未完成文档确认。",
  apiPricingDocumented: "官方 API 定价尚未完成文档确认。",
  consumerCreditsInteroperable: "消费者免费额度与 API 的互通性尚未确认。",
  generationContractDocumented: "官方生成契约尚未完成文档确认。",
  corsAndRateLimitsDocumented: "官方 CORS 与速率限制尚未完成文档确认。",
});

export const CURRENT_OFFICIAL_API_EVIDENCE = Object.freeze({
  checks: Object.freeze(Object.fromEntries(OFFICIAL_API_EVIDENCE_KEYS.map(key => [key, false]))),
  verifiedAt: "2026-09-01",
  sources: Object.freeze(["https://platform.suno.com/"]),
});

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) {
    throw new TypeError(`${label} must contain exactly: ${keys.join(", ")}`);
  }
}

function assertEvidence(evidence) {
  assertExactKeys(evidence, ["checks", "verifiedAt", "sources"], "Official API evidence");
  assertExactKeys(evidence.checks, OFFICIAL_API_EVIDENCE_KEYS, "Official API evidence checks");
  for (const key of OFFICIAL_API_EVIDENCE_KEYS) {
    if (typeof evidence.checks[key] !== "boolean") {
      throw new TypeError(`Official API evidence check ${key} must be boolean`);
    }
  }
  if (typeof evidence.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.verifiedAt)) {
    throw new TypeError("Official API evidence verifiedAt must be a YYYY-MM-DD string");
  }
  if (!Array.isArray(evidence.sources) || evidence.sources.length === 0) {
    throw new TypeError("Official API evidence sources must be a non-empty array");
  }
  for (const source of evidence.sources) {
    if (typeof source !== "string") throw new TypeError("Official API evidence sources must contain strings");
    let parsed;
    try {
      parsed = new URL(source);
    } catch {
      throw new TypeError("Official API evidence sources must contain official HTTPS URLs");
    }
    if (parsed.protocol !== "https:" || parsed.origin !== OFFICIAL_PLATFORM_ORIGIN
      || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new TypeError("Official API evidence sources must contain official HTTPS URLs");
    }
  }
}

export function evaluateOfficialApiReadiness(evidence) {
  assertEvidence(evidence);
  const blockers = OFFICIAL_API_EVIDENCE_KEYS
    .filter(key => !evidence.checks[key])
    .map(key => EVIDENCE_BLOCKERS[key]);
  return {
    ready: blockers.length === 0,
    confirmedCount: OFFICIAL_API_EVIDENCE_KEYS.length - blockers.length,
    totalCount: OFFICIAL_API_EVIDENCE_KEYS.length,
    blockers: [...blockers],
    verifiedAt: evidence.verifiedAt,
    sources: [...evidence.sources],
  };
}

function isZeroCostPricing(pricing) {
  return isPlainObject(pricing)
    && pricing.kind === "free"
    && typeof pricing.currency === "string"
    && pricing.currency.length > 0
    && typeof pricing.maximumAmount === "number"
    && Number.isFinite(pricing.maximumAmount)
    && pricing.maximumAmount === 0;
}

function hasDocumentedContract(contract) {
  return isPlainObject(contract)
    && contract.source === "official-documentation"
    && typeof contract.version === "string"
    && contract.version.trim().length > 0;
}

export function authorizeOfficialApiAttempt(input) {
  const value = isPlainObject(input) ? input : {};
  const blockers = [];
  let readiness;
  try {
    readiness = evaluateOfficialApiReadiness(value.evidence);
    blockers.push(...readiness.blockers);
  } catch {
    blockers.push("官方 API 证据结构无效。 ");
  }
  if (value.origin !== OFFICIAL_PLATFORM_ORIGIN) blockers.push("调用来源必须是官方平台。 ");
  if (!isZeroCostPricing(value.pricing)) blockers.push("必须具备已文档化的零成本定价证据。 ");
  if (!hasDocumentedContract(value.contract)) blockers.push("必须具备已文档化的官方生成契约。 ");

  const allowed = blockers.length === 0;
  return {
    allowed,
    origin: allowed ? OFFICIAL_PLATFORM_ORIGIN : null,
    contractVersion: allowed ? value.contract.version : null,
    maximumAmount: allowed ? 0 : null,
    currency: allowed ? value.pricing.currency : null,
    blockers: [...blockers],
  };
}
