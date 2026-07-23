export const VISUAL_SCHEMES = Object.freeze([
  {
    id: 'clean',
    name: '纯净渐亮',
    summary: '底板与图案同步、匀净地恢复到正常材质。',
  },
  {
    id: 'gray-first',
    name: '灰度先退',
    summary: '先解除灰暗感，再缓慢补足亮度与颜色。',
  },
  {
    id: 'brightness-first',
    name: '亮度先回',
    summary: '先让砖块重新可见，颜色和清晰度随后跟上。',
  },
  {
    id: 'color-late',
    name: '色彩后到',
    summary: '亮度先稳定，后半程再把色彩带回。',
  },
  {
    id: 'icon-first',
    name: '图案先醒',
    summary: '牌面图案先清晰，底板随后恢复。',
  },
  {
    id: 'base-first',
    name: '底板先醒',
    summary: '底板先回到正常材质，图案稍后清晰。',
  },
  {
    id: 'two-stage',
    name: '两段解暗',
    summary: '先解除主要压暗，短暂停顿后完成恢复。',
  },
  {
    id: 'warm',
    name: '慢启快亮',
    summary: '前段保持压暗，后半程加速恢复，结束点干净明确。',
  },
  {
    id: 'soft-settle',
    name: '快启慢收',
    summary: '先快速解除主要压暗，再用较长尾段慢慢归稳。',
  },
  {
    id: 'recommended',
    name: '游戏推荐',
    summary: '图案略早清晰，配合不超过 0.6% 的微回弹。',
  },
]);

export const VISUAL_SCHEME_IDS = Object.freeze(VISUAL_SCHEMES.map(({ id }) => id));

export const DARK_VISUAL_STATE = Object.freeze({
  baseGray: 0.58,
  baseBrightness: 0.68,
  baseSaturation: 0.4,
  baseContrast: 0.88,
  iconGray: 0.62,
  iconBrightness: 0.66,
  iconSaturation: 0.34,
  iconContrast: 0.86,
  iconOpacity: 0.62,
  tileScale: 1,
});

export const LIGHT_VISUAL_STATE = Object.freeze({
  baseGray: 0,
  baseBrightness: 1,
  baseSaturation: 1,
  baseContrast: 1,
  iconGray: 0,
  iconBrightness: 1,
  iconSaturation: 1,
  iconContrast: 1,
  iconOpacity: 1,
  tileScale: 1,
});

const SCHEME_SET = new Set(VISUAL_SCHEME_IDS);

export function getSchemeVisualState(id, reveal) {
  const progress = clamp01(reveal);
  if (progress === 0) {
    return { ...DARK_VISUAL_STATE };
  }
  if (progress === 1) {
    return { ...LIGHT_VISUAL_STATE };
  }

  const schemeId = SCHEME_SET.has(id) ? id : 'clean';
  const channels = getChannelProgress(schemeId, progress);
  return {
    baseGray: mix(DARK_VISUAL_STATE.baseGray, LIGHT_VISUAL_STATE.baseGray, channels.baseGray),
    baseBrightness: mix(DARK_VISUAL_STATE.baseBrightness, LIGHT_VISUAL_STATE.baseBrightness, channels.baseBrightness),
    baseSaturation: mix(DARK_VISUAL_STATE.baseSaturation, LIGHT_VISUAL_STATE.baseSaturation, channels.baseSaturation),
    baseContrast: mix(DARK_VISUAL_STATE.baseContrast, LIGHT_VISUAL_STATE.baseContrast, channels.baseContrast),
    iconGray: mix(DARK_VISUAL_STATE.iconGray, LIGHT_VISUAL_STATE.iconGray, channels.iconGray),
    iconBrightness: mix(DARK_VISUAL_STATE.iconBrightness, LIGHT_VISUAL_STATE.iconBrightness, channels.iconBrightness),
    iconSaturation: mix(DARK_VISUAL_STATE.iconSaturation, LIGHT_VISUAL_STATE.iconSaturation, channels.iconSaturation),
    iconContrast: mix(DARK_VISUAL_STATE.iconContrast, LIGHT_VISUAL_STATE.iconContrast, channels.iconContrast),
    iconOpacity: mix(DARK_VISUAL_STATE.iconOpacity, LIGHT_VISUAL_STATE.iconOpacity, channels.iconOpacity),
    tileScale: round(1 + channels.scale),
  };
}

function getChannelProgress(id, progress) {
  const eased = smooth(progress);
  const all = (value, scale = 0) => ({
    baseGray: value,
    baseBrightness: value,
    baseSaturation: value,
    baseContrast: value,
    iconGray: value,
    iconBrightness: value,
    iconSaturation: value,
    iconContrast: value,
    iconOpacity: value,
    scale,
  });

  if (id === 'gray-first') {
    const gray = phase(progress, 0, 0.4);
    const body = phase(progress, 0.38, 1);
    return {
      ...all(body),
      baseGray: gray,
      iconGray: gray,
      iconOpacity: phase(progress, 0.32, 0.78),
    };
  }

  if (id === 'brightness-first') {
    const brightness = phase(progress, 0, 0.4);
    const color = phase(progress, 0.38, 1);
    return {
      ...all(color),
      baseBrightness: brightness,
      iconBrightness: brightness,
      iconOpacity: phase(progress, 0.08, 0.58),
    };
  }

  if (id === 'color-late') {
    const visibility = phase(progress, 0, 0.42);
    const color = phase(progress, 0.55, 0.95);
    return {
      ...all(visibility),
      baseGray: visibility,
      baseSaturation: color,
      iconGray: visibility,
      iconSaturation: color,
      iconOpacity: visibility,
    };
  }

  if (id === 'icon-first') {
    const icon = phase(progress, 0, 0.42);
    const base = phase(progress, 0.38, 0.94);
    return {
      ...all(base),
      iconGray: icon,
      iconBrightness: icon,
      iconSaturation: icon,
      iconContrast: icon,
      iconOpacity: icon,
    };
  }

  if (id === 'base-first') {
    const base = phase(progress, 0, 0.42);
    const icon = phase(progress, 0.38, 0.94);
    return {
      ...all(icon),
      baseGray: base,
      baseBrightness: base,
      baseSaturation: base,
      baseContrast: base,
    };
  }

  if (id === 'two-stage') {
    const first = phase(progress, 0, 0.32);
    const second = phase(progress, 0.68, 1);
    const staged = (split) => split * first + (1 - split) * second;
    return {
      baseGray: staged(0.55),
      baseBrightness: staged(0.78),
      baseSaturation: staged(0.38),
      baseContrast: staged(0.68),
      iconGray: staged(0.55),
      iconBrightness: staged(0.8),
      iconSaturation: staged(0.38),
      iconContrast: staged(0.68),
      iconOpacity: staged(0.88),
      scale: 0,
    };
  }

  if (id === 'warm') {
    const delayed = phase(progress, 0.42, 0.88);
    return all(delayed);
  }

  if (id === 'soft-settle') {
    const quick = progress < 0.3
      ? 0.62 * smooth(progress / 0.3)
      : 0.62 + 0.38 * smooth((progress - 0.3) / 0.7);
    return {
      ...all(quick, pulse(progress, 0.34, 1, 0.01)),
      baseBrightness: phase(progress, 0, 0.34),
      iconBrightness: phase(progress, 0, 0.3),
      iconOpacity: phase(progress, 0, 0.34),
    };
  }

  if (id === 'recommended') {
    const body = phase(progress, 0.1, 0.8);
    const icon = phase(progress, 0, 0.32);
    return {
      ...all(body, pulse(progress, 0.45, 1, 0.006)),
      iconGray: icon,
      iconBrightness: icon,
      iconSaturation: icon,
      iconContrast: icon,
      iconOpacity: icon,
    };
  }

  return all(eased);
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function smooth(value) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function phase(value, start, end) {
  if (start === end) {
    return value < start ? 0 : 1;
  }
  return smooth((value - start) / (end - start));
}

function pulse(value, start, end, amplitude) {
  const progress = clamp01((value - start) / (end - start));
  return round(Math.sin(progress * Math.PI) * amplitude);
}

function mix(from, to, progress) {
  return round(from + (to - from) * clamp01(progress));
}

function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
