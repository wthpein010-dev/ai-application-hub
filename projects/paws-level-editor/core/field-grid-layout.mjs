const MICRO_CELLS_PER_MACRO = 8;
const CENTER_OFFSET = 4;

function positiveDimension(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function buildFieldGridLayout(board = {}) {
  const width = positiveDimension(board.width, 7);
  const height = positiveDimension(board.height, 8);
  const maxX = width * MICRO_CELLS_PER_MACRO;
  const maxY = height * MICRO_CELLS_PER_MACRO;

  const verticalMajorLines = Array.from({ length: width + 1 }, (_, index) => {
    const x = index * MICRO_CELLS_PER_MACRO;
    return { x1: x, y1: 0, x2: x, y2: maxY };
  });
  const horizontalMajorLines = Array.from({ length: height + 1 }, (_, index) => {
    const y = index * MICRO_CELLS_PER_MACRO;
    return { x1: 0, y1: y, x2: maxX, y2: y };
  });
  const verticalCenterLines = Array.from({ length: width }, (_, index) => {
    const x = index * MICRO_CELLS_PER_MACRO + CENTER_OFFSET;
    return { x1: x, y1: 0, x2: x, y2: maxY };
  });
  const horizontalCenterLines = Array.from({ length: height }, (_, index) => {
    const y = index * MICRO_CELLS_PER_MACRO + CENTER_OFFSET;
    return { x1: 0, y1: y, x2: maxX, y2: y };
  });
  const xLabels = Array.from({ length: width + 1 }, (_, index) => ({
    axis: "x",
    value: index * MICRO_CELLS_PER_MACRO,
    x: index * MICRO_CELLS_PER_MACRO,
    y: maxY + 2,
  }));
  const yLabels = Array.from({ length: height + 1 }, (_, index) => ({
    axis: "y",
    value: index * MICRO_CELLS_PER_MACRO,
    x: -2,
    y: index * MICRO_CELLS_PER_MACRO,
  }));

  return {
    bounds: { minX: 0, minY: 0, maxX, maxY },
    majorLines: [...verticalMajorLines, ...horizontalMajorLines],
    centerLines: [...verticalCenterLines, ...horizontalCenterLines],
    labels: [...xLabels, ...yLabels],
    axisLabels: [
      { text: "X", x: maxX + 4, y: maxY + 4 },
      { text: "Y", x: -4, y: -4 },
    ],
  };
}
