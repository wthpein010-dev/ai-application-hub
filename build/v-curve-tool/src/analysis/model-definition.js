export const MODEL_DEFINITIONS = Object.freeze({
  reference: Object.freeze({
    id: 'reference', version: '1.5.0', title: '参考模型',
    progressDefinition: 'board-departed', progressLabel: '离场进度（含暂存）',
    sideLock: false, coverage: 'overlap-area-at-least-25-percent',
    deal: 'independent-random-pairs',
    description: '沿用参考图的配牌、贪心和采样；河道下界已修正首轮长度截断。',
  }),
  runtime: Object.freeze({
    id: 'runtime', version: '1.5.0', title: '工程模型',
    progressDefinition: 'removed', progressLabel: '消除进度',
    sideLock: false, coverage: 'positive-overlap-area',
    deal: 'runtime-random-pairs',
    description: '按本地工程已关闭侧锁、随机出盘规则评估；无道具机器人简化模型。',
  }),
});

export function configurationFingerprint(level) {
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
  };
  const payload = JSON.stringify(canonical({source: level.source, tiles: level.tiles, referenceTiles: level.referenceTiles, rules: level.rules, features: level.features}));
  let hash = 0x811c9dc5;
  for (const char of payload) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
