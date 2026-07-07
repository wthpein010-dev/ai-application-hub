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
    subtitle: '一关到底',
    width: 38,
    height: 24,
    player: { x: 2, y: 12 },
    walls: [
      ...borderWalls(38, 24),
      ...verticalWall(9, 1, 22, [12]),
      ...verticalWall(18, 1, 22, [7]),
      ...verticalWall(27, 1, 22, [9, 16]),
      ...horizontalWall(28, 36, 14)
    ],
    crates: [
      { x: 4, y: 12 },
      { x: 13, y: 7 },
      { x: 22, y: 9 },
      { x: 22, y: 16 },
      { x: 31, y: 7 },
      { x: 31, y: 12 },
      { x: 31, y: 18 }
    ],
    goals: [
      { x: 34, y: 7 },
      { x: 34, y: 12 },
      { x: 34, y: 18 }
    ],
    buttons: [
      { x: 6, y: 12, group: 'A' },
      { x: 15, y: 7, group: 'B' },
      { x: 24, y: 9, group: 'C' },
      { x: 24, y: 16, group: 'D' }
    ],
    doors: [
      { x: 9, y: 12, group: 'A' },
      { x: 18, y: 7, group: 'B' },
      { x: 27, y: 9, group: 'C' },
      { x: 27, y: 16, group: 'D' }
    ],
    flyover: {
      from: { x: 2, y: 12 },
      to: { x: 34, y: 12 },
      seconds: 4.2
    },
    hints: [
      '先把最近的箱子压到星钮上，门会一直开着。',
      '每段门后都有绕路空间，不要把自己堵在箱子后面。',
      '终点区被分成上下两层，先处理上层两个目标。',
      '最后回到中段，打开下层门，再送最后一个箱子。'
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

function horizontalWall(xStart, xEnd, y, gaps = []) {
  const walls = [];
  const gapSet = new Set(gaps);
  for (let x = xStart; x <= xEnd; x += 1) {
    if (!gapSet.has(x)) {
      walls.push({ x, y });
    }
  }
  return walls;
}
