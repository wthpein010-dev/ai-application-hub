export function gameplayAssetUrl(fileName) {
  return new URL(`../assets/gameplay/${fileName}`, import.meta.url).href;
}

export const GAMEPLAY_ASSETS = Object.freeze({
  background: gameplayAssetUrl("bg-47bd7f.png"),
  grass: gameplayAssetUrl("grass.png"),
  blockBackground: gameplayAssetUrl("block_bg.png"),
  lockMask: gameplayAssetUrl("ui_tile_lock_mask.png"),
  setting: gameplayAssetUrl("Setting.png"),
  randomButton: gameplayAssetUrl("btn_random.png"),
  replayButton: gameplayAssetUrl("btn_replay.png"),
  playTray: gameplayAssetUrl("play_save2.png"),
});
