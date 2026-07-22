import { serializeLevelDocument } from "../core/level-adapter.mjs";
import { upgradeLegacyAiGeometry } from "../core/legacy-ai-geometry-upgrade.mjs";

export async function upgradeLocalAiLevelOnOpen({
  api,
  fileName,
  response,
  document,
} = {}) {
  if (response?.local !== true || !document?.designerNote?.aiGeneration) {
    return {
      status: "unchanged",
      document,
      movedTileUids: [],
      persisted: false,
    };
  }

  const upgrade = upgradeLegacyAiGeometry(document);
  if (upgrade.status !== "upgraded") {
    return { ...upgrade, persisted: false };
  }

  try {
    const saved = await api.saveLevel({
      fileName,
      value: serializeLevelDocument(upgrade.document),
      expectedVersion: response.version,
      saveAs: false,
      source: response.source,
    });
    upgrade.document.version = saved.version ?? response.version;
    return {
      ...upgrade,
      persisted: true,
      saved,
    };
  } catch (error) {
    return {
      ...upgrade,
      persisted: false,
      reason: error?.message || "浏览器存档写回失败。",
    };
  }
}
