import { describe, expect, it } from "vitest";
import {
  collectVisibleWarnings,
  comparisonText,
  createDiagnosticCard,
  formatBand,
} from "../../src/ui/report-view.js";

function fakeDocument() {
  const created = [];
  return {
    created,
    createElement(tagName) {
      const node = {
        tagName,
        children: [],
        dataset: {},
        textContent: "",
        append(...children) {
          this.children.push(...children);
        },
      };
      created.push(node);
      return node;
    },
  };
}

describe("comparison metric wording", () => {
  it("does not append a difference unit when both values are equal", () => {
    expect(comparisonText(0, 0, " 个百分点")).toBe("基本一致");
  });

  it("shows Monte Carlo values in the same P90-P50-P10 order as the chart", () => {
    expect(formatBand({ p10: 6, p50: 7, p90: 8 })).toBe("8 / 7 / 6");
  });

  it("constructs imported diagnostic text without parsing it as markup", () => {
    const documentRef = fakeDocument();
    const malicious = '<img src=x onerror="globalThis.pwned=true">';

    const card = createDiagnosticCard({
      side: malicious,
      title: "诊断",
      message: malicious,
      action: malicious,
      severity: "warning",
    }, documentRef);

    expect(card.children[0].textContent).toContain(malicious);
    expect(documentRef.created.map((node) => node.tagName)).toEqual([
      "article",
      "h3",
      "p",
      "small",
    ]);
  });

  it("surfaces invalid and incomplete MC states with report warnings", () => {
    const warnings = collectVisibleWarnings({
      warnings: ["level_0020：原始警告"],
      sheep: { level: { id: "900121" }, simulation: { valid: true } },
      paws: {
        level: { id: "level_0020" },
        simulation: {
          valid: false,
          reason: "随机组为奇数",
          incomplete: true,
          incompleteReason: "玩法仿真不完整",
        },
      },
    });

    expect(warnings).toEqual(expect.arrayContaining([
      "level_0020：原始警告",
      "level_0020：MC 无效（随机组为奇数）",
      "level_0020：玩法仿真不完整",
    ]));
  });
});
