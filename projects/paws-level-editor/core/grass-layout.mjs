const SPINE_STAGE_WIDTH = 640;
const SPINE_STAGE_HEIGHT = 1200;
const SPINE_STAGE_HALF_WIDTH = SPINE_STAGE_WIDTH / 2;
const SPINE_STAGE_HALF_HEIGHT = SPINE_STAGE_HEIGHT / 2;
const GRASS_ANIMATION_SECONDS = 1.0667;

export const GRASS_ATLAS_REGIONS = Object.freeze({
  Grass1: Object.freeze({ x: 2, y: 3, width: 53, height: 29, rotated: false }),
  Grass2: Object.freeze({ x: 57, y: 2, width: 30, height: 35, rotated: true }),
});

const SPINE_PATCHES = [
  ["Grass1_1", "Grass1", -79, 579, 0],
  ["Grass1_2", "Grass1", -210, 423, 0],
  ["Grass1_3", "Grass1", 205, 498, 0],
  ["Grass1_4", "Grass1", 206, 285, 0],
  ["Grass1_5", "Grass1", -247, 134, 0],
  ["Grass1_6", "Grass1", -107, 46, 0],
  ["Grass2_1", "Grass2", 66.14, 317, 0],
  ["Grass2_2", "Grass2", -315.86, 217, 0],
  ["Grass2_3", "Grass2", -273.86, -281, 0],
  ["Grass2_4", "Grass2", -119.86, -560, 0],
  ["Grass2_5", "Grass2", 196.14, -560, 0],
  ["Grass2_6", "Grass2", 315.14, -295, 0.02],
];

export const GRASS_PATCHES = Object.freeze(SPINE_PATCHES.map(
  ([id, variant, spineX, spineY, rotationDegrees]) => Object.freeze({
    id,
    variant,
    spineX,
    spineY,
    normalizedX: (spineX + SPINE_STAGE_HALF_WIDTH) / SPINE_STAGE_WIDTH,
    normalizedY: (SPINE_STAGE_HALF_HEIGHT - spineY) / SPINE_STAGE_HEIGHT,
    rotationRadians: rotationDegrees * Math.PI / 180,
  }),
));

const PULSE_KEYS = Object.freeze([
  Object.freeze([0, 1]),
  Object.freeze([0.4333, 1]),
  Object.freeze([0.4667, 1.3]),
  Object.freeze([0.5, 0.9]),
  Object.freeze([0.5333, 1]),
  Object.freeze([0.9667, 1]),
  Object.freeze([1, 1.3]),
  Object.freeze([1.0333, 0.9]),
  Object.freeze([GRASS_ANIMATION_SECONDS, 1]),
]);

export function grassPulseScale(seconds, { reducedMotion = false } = {}) {
  if (reducedMotion || !Number.isFinite(seconds)) return 1;
  const phase = ((seconds % GRASS_ANIMATION_SECONDS) + GRASS_ANIMATION_SECONDS)
    % GRASS_ANIMATION_SECONDS;
  for (let index = 1; index < PULSE_KEYS.length; index += 1) {
    const [nextTime, nextValue] = PULSE_KEYS[index];
    if (phase > nextTime) continue;
    const [previousTime, previousValue] = PULSE_KEYS[index - 1];
    const span = nextTime - previousTime;
    if (span <= Number.EPSILON) return nextValue;
    const progress = (phase - previousTime) / span;
    return previousValue + (nextValue - previousValue) * progress;
  }
  return 1;
}

export function drawGrassAtlasPatch(
  context,
  image,
  variant,
  {
    centerX,
    baseY,
    pixelScale = 1,
    scaleY = 1,
    alpha = 1,
  },
) {
  const region = GRASS_ATLAS_REGIONS[variant];
  if (!region) throw new TypeError(`Unknown grass atlas region: ${variant}`);
  const width = region.width * pixelScale;
  const height = region.height * pixelScale * scaleY;
  const x = centerX - width / 2;
  const y = baseY - height;
  context.save();
  context.globalAlpha = alpha;
  if (!region.rotated) {
    context.drawImage(
      image,
      region.x,
      region.y,
      region.width,
      region.height,
      x,
      y,
      width,
      height,
    );
  } else {
    context.translate(x, baseY);
    context.rotate(-Math.PI / 2);
    context.drawImage(
      image,
      region.x,
      region.y,
      region.height,
      region.width,
      0,
      0,
      height,
      width,
    );
  }
  context.restore();
  return { x, y, width, height };
}
