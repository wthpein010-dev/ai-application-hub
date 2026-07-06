export const levels = [
  {
    id: 'level-1',
    name: '第一关',
    subtitle: '先推一下',
    width: 7,
    height: 5,
    player: { x: 2, y: 2 },
    walls: borderWalls(7, 5),
    crates: [{ x: 3, y: 2 }],
    goals: [{ x: 4, y: 2 }],
    buttons: [],
    doors: [],
    hints: ['往右推一下就好。']
  },
  {
    id: 'level-2',
    name: '第二关',
    subtitle: '就这一关',
    width: 34,
    height: 22,
    player: { x: 2, y: 10 },
    walls: [
      ...borderWalls(34, 22),
      ...verticalWall(8, 1, 20, [10]),
      ...verticalWall(16, 1, 20, [6]),
      ...verticalWall(24, 1, 20, [11])
    ],
    crates: [
      { x: 4, y: 10 },
      { x: 11, y: 13 },
      { x: 20, y: 6 },
      { x: 27, y: 9 },
      { x: 27, y: 13 }
    ],
    goals: [
      { x: 29, y: 8 },
      { x: 29, y: 14 }
    ],
    buttons: [
      { x: 6, y: 10, group: 'A' },
      { x: 14, y: 13, group: 'B' },
      { x: 22, y: 6, group: 'C' }
    ],
    doors: [
      { x: 8, y: 10, group: 'A' },
      { x: 16, y: 6, group: 'B' },
      { x: 24, y: 11, group: 'C' }
    ],
    flyover: {
      from: { x: 2, y: 10 },
      to: { x: 30, y: 11 },
      seconds: 4.2
    },
    hints: [
      '先别看远处，眼前的星钮能开第一道门。',
      '箱子压住星钮后，门才会保持打开。',
      '最后不是新规则，是顺序问题。先处理上面的箱子。'
    ]
  }
];

function borderWalls(width, height) {
  const walls = [];
  for (let x = 0; x < width; x += 1) {
    walls.push({ x, y: 0 }, { x, y: height - 1 });
  }
  for (let y = 1; y < height - 1; y += 1) {
    walls.push({ x: 0, y }, { x: width - 1, y });
  }
  return walls;
}

function verticalWall(x, yStart, yEnd, gaps = []) {
  const walls = [];
  const gapSet = new Set(gaps);
  for (let y = yStart; y <= yEnd; y += 1) {
    if (!gapSet.has(y)) {
      walls.push({ x, y });
    }
  }
  return walls;
}
