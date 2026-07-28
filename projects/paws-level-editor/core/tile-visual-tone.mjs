export const GAME_COVER_DIM_FACTOR = 0.58;
export const EDIT_COVER_DIM_FACTOR = 0.76;

function rounded(value) {
  return Number(value.toFixed(2));
}

export function resolveTileVisualTone(tile, { mode = "edit" } = {}) {
  const inTray =
    tile?.location === "tray"
    || Number.isInteger(tile?.stashedSlot);
  const blocked =
    !inTray
    && Boolean(tile?.covered || tile?.sideBlocked);
  if (!blocked) {
    return {
      blocked: false,
      factor: 1,
      overlayAlpha: 0,
      innerShadowAlpha: 0,
    };
  }
  const factor = mode === "play"
    ? GAME_COVER_DIM_FACTOR
    : EDIT_COVER_DIM_FACTOR;
  return {
    blocked: true,
    factor,
    overlayAlpha: rounded(1 - factor),
    innerShadowAlpha: mode === "play" ? 0.34 : 0.18,
  };
}

export function toneFactorToHex(factor) {
  const channel = Math.max(
    0,
    Math.min(255, Math.round(Number(factor) * 255)),
  );
  return (channel << 16) | (channel << 8) | channel;
}

export function multiplyHexColor(hex, factor) {
  const color = Number(hex) >>> 0;
  const multiplier = Math.max(0, Math.min(1, Number(factor)));
  const red = Math.round(((color >> 16) & 0xff) * multiplier);
  const green = Math.round(((color >> 8) & 0xff) * multiplier);
  const blue = Math.round((color & 0xff) * multiplier);
  return (red << 16) | (green << 8) | blue;
}
