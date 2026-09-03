const leadingPunctuation = new Set(Array.from(`，。！？；：、）》】」』”’…,.!?;:)]}"'`));
const trailingOpeningPunctuation = new Set(Array.from(`《【「『“‘([{"'`));

export function visualPositionCount(value) {
  return Array.from(String(value || "")).reduce((total, character) => {
    if (character === "\n" || character === "\r") return total;
    return total + (character.codePointAt(0) <= 0x7f ? 0.5 : 1);
  }, 0);
}

export function wrapByVisualPositions(value, limit = 12) {
  if (!Number.isFinite(limit) || limit <= 0) throw new TypeError("Wrap limit must be positive");
  const lines = [];
  let line = "";
  let width = 0;
  for (const character of Array.from(String(value || ""))) {
    if (character === "\r") continue;
    if (character === "\n") {
      lines.push(line);
      line = "";
      width = 0;
      continue;
    }
    const characterWidth = character.codePointAt(0) <= 0x7f ? 0.5 : 1;
    if (line && width + characterWidth > limit) {
      lines.push(line);
      line = "";
      width = 0;
    }
    line += character;
    width += characterWidth;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

function awkwardBreaks(lines) {
  const issues = [];
  lines.forEach((line, index) => {
    const characters = Array.from(line.trim());
    if (!characters.length) return;
    if (leadingPunctuation.has(characters[0])) issues.push({ type: "leading-punctuation", line: index + 1 });
    if (trailingOpeningPunctuation.has(characters.at(-1))) issues.push({ type: "trailing-opening-punctuation", line: index + 1 });
    if (lines.length > 1 && visualPositionCount(line.trim()) <= 1) issues.push({ type: "orphan-line", line: index + 1 });
  });
  return issues;
}

export function diagnoseCopy(character, renderedMetrics = {}) {
  const namePositions = visualPositionCount(character?.name);
  const unlockPositions = visualPositionCount(character?.unlockDesc);
  const plannedLines = wrapByVisualPositions(character?.galleryDesc, 12);
  const renderedLines = Array.isArray(renderedMetrics.renderedLines) && renderedMetrics.renderedLines.length
    ? renderedMetrics.renderedLines.map(String)
    : plannedLines;
  const breaks = awkwardBreaks(renderedLines);
  const horizontalOverflow = Boolean(renderedMetrics.horizontalOverflow);
  const verticalOverflow = Boolean(renderedMetrics.verticalOverflow);
  const renderedLineCount = renderedLines.length;
  const plannedLineCount = plannedLines.length;

  return {
    name: {
      positions: namePositions,
      min: 3,
      max: 5,
      ok: namePositions >= 3 && namePositions <= 5,
    },
    unlock: {
      positions: unlockPositions,
      max: 15,
      ok: unlockPositions <= 15,
    },
    gallery: {
      positions: visualPositionCount(character?.galleryDesc),
      plannedLines,
      plannedLineCount,
      renderedLines,
      renderedLineCount,
      horizontalOverflow,
      verticalOverflow,
      awkwardBreaks: breaks,
      ok: plannedLineCount <= 3
        && renderedLineCount <= 3
        && !horizontalOverflow
        && !verticalOverflow
        && breaks.length === 0,
    },
  };
}
