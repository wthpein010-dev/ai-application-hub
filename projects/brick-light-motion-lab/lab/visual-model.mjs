export const VISUAL_SCHEMES = Object.freeze([
  { id: 'clean', name: '普通渐亮', summary: '底板与图案同步、均匀恢复到正常砖块。' },
  { id: 'horizontal-blinds', name: '横向百叶窗', summary: '五条横向亮片从上到下依次打开。' },
  { id: 'vertical-blinds', name: '纵向百叶窗', summary: '五条纵向亮片从左到右依次打开。' },
  { id: 'checkerboard', name: '棋盘格拼亮', summary: '九格按中心、四角、四边的顺序拼合。' },
  { id: 'center-expand', name: '中心向外展开', summary: '亮态从砖块中心同时向四边展开。' },
  { id: 'scale-pop', name: '缩放弹出', summary: '砖块由 82% 弹到 106%，再稳定到正常大小。' },
  { id: 'vertical-unfold', name: '纵向压扁展开', summary: '下层砖块从中轴压扁状态纵向展开。' },
  { id: 'flip-3d', name: '轻微 3D 翻面', summary: '砖块以克制的 Y 轴翻面恢复到正面。' },
  { id: 'edge-release', name: '四边解除压暗', summary: '四片压暗层分别退向砖块四边。' },
  { id: 'recommended', name: '遮罩揭示＋轻回弹', summary: '中心揭示配合轻回弹，图案略早恢复。' },
]);

export const VISUAL_SCHEME_IDS = Object.freeze(VISUAL_SCHEMES.map(({ id }) => id));

const COMMON_DARK = {
  baseGray: 0.58,
  baseBrightness: 0.68,
  baseSaturation: 0.4,
  baseContrast: 0.88,
  iconGray: 0.62,
  iconBrightness: 0.66,
  iconSaturation: 0.34,
  iconContrast: 0.86,
  iconOpacity: 0.62,
};

const COMMON_LIGHT = {
  baseGray: 0,
  baseBrightness: 1,
  baseSaturation: 1,
  baseContrast: 1,
  iconGray: 0,
  iconBrightness: 1,
  iconSaturation: 1,
  iconContrast: 1,
  iconOpacity: 1,
};

export const DARK_VISUAL_STATE = Object.freeze({
  ...COMMON_DARK,
  maskType: 'none',
  maskProgress: 0,
  maskReverseProgress: 1,
  tileScale: 1,
  tileScaleX: 1,
  tileScaleY: 1,
  tileRotateY: 0,
  tilePerspective: 720,
  segmentProgress: Object.freeze(Array(9).fill(0)),
  edgeProgress: Object.freeze(Array(4).fill(0)),
});

export const LIGHT_VISUAL_STATE = Object.freeze({
  ...COMMON_LIGHT,
  maskType: 'none',
  maskProgress: 1,
  maskReverseProgress: 0,
  tileScale: 1,
  tileScaleX: 1,
  tileScaleY: 1,
  tileRotateY: 0,
  tilePerspective: 720,
  segmentProgress: Object.freeze(Array(9).fill(1)),
  edgeProgress: Object.freeze(Array(4).fill(1)),
});

const SCHEME_SET = new Set(VISUAL_SCHEME_IDS);

export function getSchemeVisualState(id, reveal) {
  const progress = clamp01(reveal);
  if (progress === 0) return { ...DARK_VISUAL_STATE };
  if (progress === 1) return { ...LIGHT_VISUAL_STATE };

  const schemeId = SCHEME_SET.has(id) ? id : 'clean';
  const transition = getTransitionState(schemeId, progress);
  const body = transition.bodyProgress ?? smooth(progress);
  const icon = transition.iconProgress ?? body;

  return {
    baseGray: mix(COMMON_DARK.baseGray, COMMON_LIGHT.baseGray, body),
    baseBrightness: mix(COMMON_DARK.baseBrightness, COMMON_LIGHT.baseBrightness, body),
    baseSaturation: mix(COMMON_DARK.baseSaturation, COMMON_LIGHT.baseSaturation, body),
    baseContrast: mix(COMMON_DARK.baseContrast, COMMON_LIGHT.baseContrast, body),
    iconGray: mix(COMMON_DARK.iconGray, COMMON_LIGHT.iconGray, icon),
    iconBrightness: mix(COMMON_DARK.iconBrightness, COMMON_LIGHT.iconBrightness, icon),
    iconSaturation: mix(COMMON_DARK.iconSaturation, COMMON_LIGHT.iconSaturation, icon),
    iconContrast: mix(COMMON_DARK.iconContrast, COMMON_LIGHT.iconContrast, icon),
    iconOpacity: mix(COMMON_DARK.iconOpacity, COMMON_LIGHT.iconOpacity, icon),
    maskType: transition.maskType,
    maskProgress: round(transition.maskProgress),
    maskReverseProgress: round(1 - transition.maskProgress),
    tileScale: round((transition.tileScaleX + transition.tileScaleY) / 2),
    tileScaleX: round(transition.tileScaleX),
    tileScaleY: round(transition.tileScaleY),
    tileRotateY: round(transition.tileRotateY),
    tilePerspective: transition.tilePerspective,
    segmentProgress: transition.segmentProgress.map(round),
    edgeProgress: transition.edgeProgress.map(round),
  };
}

function getTransitionState(id, progress) {
  const neutral = {
    bodyProgress: smooth(progress),
    iconProgress: smooth(progress),
    maskType: 'none',
    maskProgress: smooth(progress),
    tileScaleX: 1,
    tileScaleY: 1,
    tileRotateY: 0,
    tilePerspective: 720,
    segmentProgress: [],
    edgeProgress: [],
  };

  if (id === 'horizontal-blinds') {
    return {
      ...neutral,
      maskType: 'horizontal-blinds',
      segmentProgress: stagger(progress, 5, 0.06),
    };
  }

  if (id === 'vertical-blinds') {
    return {
      ...neutral,
      maskType: 'vertical-blinds',
      segmentProgress: stagger(progress, 5, 0.095),
    };
  }

  if (id === 'checkerboard') {
    const order = [1, 2, 2, 2, 0, 2, 1, 2, 1];
    return {
      ...neutral,
      maskType: 'checkerboard',
      segmentProgress: order.map((group) => phase(progress, group * 0.18, 0.48 + group * 0.18)),
    };
  }

  if (id === 'center-expand') {
    return {
      ...neutral,
      maskType: 'center-expand',
      maskProgress: phase(progress, 0.06, 0.94),
    };
  }

  if (id === 'scale-pop') {
    const scale = keyframes(progress, [
      [0, 0.82],
      [0.72, 1.06],
      [1, 1],
    ]);
    return {
      ...neutral,
      maskType: 'scale-pop',
      tileScaleX: scale,
      tileScaleY: scale,
    };
  }

  if (id === 'vertical-unfold') {
    return {
      ...neutral,
      maskType: 'vertical-unfold',
      tileScaleX: keyframes(progress, [[0, 0.92], [0.76, 1.02], [1, 1]]),
      tileScaleY: keyframes(progress, [[0, 0.08], [0.76, 1.05], [1, 1]]),
    };
  }

  if (id === 'flip-3d') {
    return {
      ...neutral,
      maskType: 'flip-3d',
      tileScaleX: keyframes(progress, [[0, 0.96], [0.78, 1.02], [1, 1]]),
      tileScaleY: keyframes(progress, [[0, 0.96], [0.78, 1.02], [1, 1]]),
      tileRotateY: keyframes(progress, [[0, -72], [0.82, 4], [1, 0]]),
      tilePerspective: 620,
    };
  }

  if (id === 'edge-release') {
    return {
      ...neutral,
      maskType: 'edge-release',
      edgeProgress: [
        phase(progress, 0, 0.7),
        phase(progress, 0.08, 0.78),
        phase(progress, 0.16, 0.86),
        phase(progress, 0.24, 0.94),
      ],
    };
  }

  if (id === 'recommended') {
    return {
      ...neutral,
      bodyProgress: phase(progress, 0.08, 0.88),
      iconProgress: phase(progress, 0, 0.68),
      maskType: 'recommended',
      maskProgress: phase(progress, 0, 0.75),
      tileScaleX: keyframes(progress, [[0, 0.94], [0.72, 1.035], [1, 1]]),
      tileScaleY: keyframes(progress, [[0, 0.94], [0.72, 1.035], [1, 1]]),
    };
  }

  return neutral;
}

function stagger(progress, count, offset) {
  const travel = 1 - offset * (count - 1);
  return Array.from({ length: count }, (_, index) => (
    phase(progress, index * offset, index * offset + travel)
  ));
}

function keyframes(progress, frames) {
  for (let index = 1; index < frames.length; index += 1) {
    const [endAt, endValue] = frames[index];
    const [startAt, startValue] = frames[index - 1];
    if (progress <= endAt) {
      const local = smooth((progress - startAt) / (endAt - startAt));
      return mix(startValue, endValue, local);
    }
  }
  return frames.at(-1)[1];
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function smooth(value) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function phase(value, start, end) {
  if (start === end) return value < start ? 0 : 1;
  return smooth((value - start) / (end - start));
}

function mix(from, to, progress) {
  return round(from + (to - from) * clamp01(progress));
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
