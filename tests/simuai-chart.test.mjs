import test from "node:test";
import assert from "node:assert/strict";

import { renderChart } from "../projects/simuai/ui/chart.mjs";

class FakeNode {
  constructor(name) {
    this.nodeName = name;
    this.children = [];
    this.attributes = new Map();
    this.textContent = "";
  }

  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }

  getAttribute(key) {
    return this.attributes.get(key) ?? null;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }
}

globalThis.document = {
  createElementNS(_namespace, name) {
    return new FakeNode(name);
  },
};

const chart = type => ({
  type,
  xLabel: "天",
  yLabel: "数量",
  series: [{
    id: "value",
    label: "数量",
    points: [
      { x: 0, value: 10 },
      { x: 1, value: 20 },
      { x: 2, value: 15 },
    ],
  }],
});

const descendants = node => [node, ...node.children.flatMap(descendants)];
const byClass = (svg, className) => descendants(svg).filter(node => (
  (node.getAttribute("class") ?? "").split(" ").includes(className)
));

test("bar mode renders one accessible bar per point", () => {
  const svg = new FakeNode("svg");
  renderChart(svg, chart("bar"));

  assert.equal(byClass(svg, "chart-bar").length, 3);
  assert.match(descendants(svg).find(node => node.nodeName === "title")?.textContent ?? "", /数量/);
});

test("step mode renders horizontal and vertical path segments", () => {
  const svg = new FakeNode("svg");
  renderChart(svg, chart("step"));

  const path = byClass(svg, "chart-line")[0];
  assert.match(path.getAttribute("d"), /H[\d.]+ V[\d.]+/);
});

test("line, area and funnel keep their distinct visual primitives", () => {
  const lineSvg = new FakeNode("svg");
  const areaSvg = new FakeNode("svg");
  const funnelSvg = new FakeNode("svg");
  renderChart(lineSvg, chart("line"));
  renderChart(areaSvg, chart("area"));
  renderChart(funnelSvg, {
    ...chart("funnel"),
    series: [{ ...chart("funnel").series[0], points: [
      { x: 0, value: 100, label: "访问" },
      { x: 1, value: 30, label: "行动" },
    ] }],
  });

  assert.equal(byClass(lineSvg, "chart-line").length, 1);
  assert.equal(byClass(areaSvg, "chart-area").length, 1);
  assert.equal(byClass(funnelSvg, "funnel-stage").length, 2);
});
