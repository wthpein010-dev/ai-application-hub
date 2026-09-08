import { describe, expect, it } from "vitest";
import {
  collectVisibleWarnings,
  comparisonText,
  createDiagnosticCard,
  formatBand,
  formatSampleCount,
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
  it.each([
    [{ samples: 300, sampleProgress: 66 / 258 }, "300 @25.6%"],
    [{ samples: 20, sampleProgress: 70 / 276 }, "20 @25.4%"],
    [{ samples: 23, sampleProgress: 0.5 }, "23 @50.0%"],
    [null, "—"],
  ])("shows the actual reached progress next to the reference or runtime sample count", (sample, expected) => {
    expect(formatSampleCount(sample)).toBe(expected);
  });
  it("does not append a difference unit when both values are equal", () => {
    expect(comparisonText(0, 0, " 个百分点")).toBe("基本一致");
  });

  it("attributes a difference to the selected right-side level", () => {
    expect(comparisonText(10, 12, " V", "right_0020")).toBe("right_0020 高 2 V");
  });

  it("shows Monte Carlo values in ascending percentile order for the reference table", () => {
    expect(formatBand({ p10: 6, p50: 7, p90: 8 })).toBe("6 / 7 / 8");
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
      warnings: ["右侧 level_0020：原始警告"],
      left: { level: { id: "900121" }, simulation: { valid: true } },
      right: {
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
      "右侧 level_0020：原始警告",
      "右侧 level_0020：MC 无效（随机组为奇数）",
      "右侧 level_0020：玩法仿真不完整",
    ]));
  });
});
