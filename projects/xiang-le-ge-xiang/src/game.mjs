import { createGameState, isDoorOpen, isWon, movePlayer, undoMove } from './engine.mjs';
import { artAssets } from './assets.mjs';
import { levels } from './levels.mjs';

const canvas = document.querySelector('#gameCanvas');
const stage = document.querySelector('#stage');
const context = canvas.getContext('2d');
const BASE_WIDTH = 750;
const BASE_HEIGHT = 1624;
const levelName = document.querySelector('#levelName');
const moveCount = document.querySelector('#moveCount');
const undoCount = document.querySelector('#undoCount');
const hintBubble = document.querySelector('#hintBubble');
const clearOverlay = document.querySelector('#clearOverlay');
const clearEyebrow = document.querySelector('#clearEyebrow');
const clearTitle = document.querySelector('#clearTitle');
const clearText = document.querySelector('#clearText');
const primaryButton = document.querySelector('#primaryButton');
const touchPulse = document.querySelector('#touchPulse');

let levelIndex = 0;
let state = createGameState(levels[levelIndex]);
let won = false;
let wonAt = 0;
let hintIndex = 0;
let hintTimer = 0;
let flyoverStart = 0;
let camera = {
  x: state.player.x,
  y: state.player.y,
  tile: 48
};
const sprites = new Map();

loadArtAssets();
resizeCanvas();
resetFlyover();
updateHud();
requestAnimationFrame(render);

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', onKeyDown);
document.querySelector('#undoButton').addEventListener('click', undo);
document.querySelector('#resetButton').addEventListener('click', restartLevel);
document.querySelector('#hintButton').addEventListener('click', showHint);
primaryButton.addEventListener('click', onPrimary);

let pointerStart = null;
stage.addEventListener('pointerdown', (event) => {
  if (!stage.classList.contains('is-running') || event.target.closest('button, a')) return;
  pointerStart = { x: event.clientX, y: event.clientY };
});
stage.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.hypot(dx, dy) < 24) {
    handleTap(event);
    return;
  }
  step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
stage.addEventListener('pointercancel', () => {
  pointerStart = null;
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  canvas.width = BASE_WIDTH;
  canvas.height = BASE_HEIGHT;
  context.setTransform(1, 0, 0, 1, 0, 0);

  return {
    width: BASE_WIDTH,
    height: BASE_HEIGHT
  };
}

function onKeyDown(event) {
  const direction = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
    W: 'up',
    S: 'down',
    A: 'left',
    D: 'right'
  }[event.key];

  if (direction) {
    event.preventDefault();
    step(direction);
  }
}

function handleTap(event) {
  const tile = screenPointToTile(event.clientX, event.clientY);
  if (!tile) return;

  const tapDirection = directionFromAdjacentTile(tile);
  if (tapDirection) {
    step(tapDirection);
  }
}

function screenPointToTile(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }

  const scaleX = BASE_WIDTH / rect.width;
  const scaleY = BASE_HEIGHT / rect.height;
  const origin = getLevelOrigin(BASE_WIDTH, BASE_HEIGHT);
  return {
    x: Math.floor(((clientX - rect.left) * scaleX - origin.x) / camera.tile),
    y: Math.floor(((clientY - rect.top) * scaleY - origin.y) / camera.tile)
  };
}

function directionFromAdjacentTile(tile) {
  const dx = tile.x - state.player.x;
  const dy = tile.y - state.player.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  return 'up';
}

function step(direction) {
  if (won) return;
  const next = movePlayer(state, direction);
  if (next === state) return;
  state = next;
  triggerTouchPulse(direction);
  hideHint();
  updateHud();

  if (isWon(state)) {
    won = true;
    wonAt = performance.now();
    window.setTimeout(showClear, 280);
  }
}

function undo() {
  if (won) return;
  const previous = undoMove(state);
  if (previous === state) return;
  state = previous;
  updateHud();
}

function restartLevel() {
  state = createGameState(levels[levelIndex]);
  won = false;
  wonAt = 0;
  hintIndex = 0;
  hideHint();
  clearOverlay.hidden = true;
  resetFlyover();
  updateHud();
}

function triggerTouchPulse(direction) {
  touchPulse.dataset.direction = direction;
  touchPulse.classList.remove('is-active');
  void touchPulse.offsetWidth;
  touchPulse.classList.add('is-active');
}

function showHint() {
  const hints = levels[levelIndex].hints;
  hintBubble.textContent = hints[Math.min(hintIndex, hints.length - 1)];
  hintBubble.hidden = false;
  hintIndex += 1;
  hintTimer = performance.now() + 3600;
}

function hideHint() {
  hintBubble.hidden = true;
  hintTimer = 0;
}

function showClear() {
  const firstLevel = levelIndex === 0;
  clearEyebrow.textContent = firstLevel ? '第一关' : '第二关';
  clearTitle.textContent = firstLevel ? '简单吧' : '你真过了第二关';
  clearText.textContent = firstLevel ? '下一关也差不多。' : '这次不是差一点，是到了。';
  primaryButton.textContent = firstLevel ? '第二关' : '再来一次';
  clearOverlay.hidden = false;
}

function onPrimary() {
  if (levelIndex === 0) {
    levelIndex = 1;
  }
  restartLevel();
}

function updateHud() {
  levelName.textContent = `${levels[levelIndex].name} · ${levels[levelIndex].subtitle}`;
  moveCount.textContent = String(state.moves);
  undoCount.textContent = String(state.history.length);
}

function resetFlyover() {
  flyoverStart = levels[levelIndex].flyover ? performance.now() : 0;
  camera.x = state.player.x;
  camera.y = state.player.y;
}

function render(now) {
  const bounds = resizeCanvas();
  if (!bounds) {
    requestAnimationFrame(render);
    return;
  }

  const width = bounds.width;
  const height = bounds.height;
  context.clearRect(0, 0, width, height);

  drawBackdrop(width, height, now);
  drawSceneDressing(width, height, now);
  updateCamera(width, height, now);
  drawLevel(width, height);
  drawCelebration(width, height, now);

  if (hintTimer && now > hintTimer) {
    hideHint();
  }

  requestAnimationFrame(render);
}

function updateCamera(width, height, now) {
  const level = levels[levelIndex];
  const normalTile = clamp(Math.min(width / 9.2, height / 12.4), 34, 62);

  if (level.flyover && flyoverStart) {
    const duration = level.flyover.seconds * 1000;
    const progress = clamp((now - flyoverStart) / duration, 0, 1);
    const eased = smooth(progress);
    const overviewTile = Math.min(width / (level.width + 3), height / (level.height + 3));
    camera.x = lerp(level.flyover.from.x, level.flyover.to.x, smooth(Math.min(progress / 0.76, 1)));
    camera.y = lerp(level.flyover.from.y, level.flyover.to.y, smooth(Math.min(progress / 0.76, 1)));
    camera.tile = lerp(overviewTile, normalTile, Math.max(0, (eased - 0.55) / 0.45));
    if (progress >= 1) {
      flyoverStart = 0;
    }
    return;
  }

  camera.x = lerp(camera.x, state.player.x, 0.18);
  camera.y = lerp(camera.y, state.player.y, 0.18);
  camera.tile = lerp(camera.tile, normalTile, 0.18);
}

function drawBackdrop(width, height, now) {
  if (drawSprite('backdrop', 0, 0, width, height)) {
    drawSprite('spark', width * 0.08, height * 0.12, 42, 42, Math.sin(now * 0.001) * 0.22, 0.2);
    drawSprite('spark', width * 0.82, height * 0.2, 30, 30, -0.4, 0.14);
    return;
  }

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#171513');
  gradient.addColorStop(0.52, '#20302f');
  gradient.addColorStop(1, '#0e1011');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawSceneDressing(width, height, now) {
  const sway = Math.sin(now * 0.0008) * 10;
  drawSprite('rail-top', 0, 6, width, Math.min(56, height * 0.08), 0, 0.72);
  drawSprite('corner-glow', -44 + sway * 0.2, 78, 118, 118, now * 0.00012, 0.32);
  drawSprite('corner-glow', width - 74 - sway * 0.2, height * 0.16, 96, 96, -now * 0.0001, 0.24);
  drawSprite('mist', 0, height * 0.56 + sway, width, Math.min(160, height * 0.24), 0, 0.42);
}

function drawCelebration(width, height, now) {
  if (!won || !wonAt) return;

  const elapsed = now - wonAt;
  const fade = clamp(1 - elapsed / 2400, 0, 1);
  if (!fade) return;

  const drift = (elapsed / 1000) * height * 0.08;
  const pieces = [
    [0.18, 0.24, 46, -0.32],
    [0.78, 0.28, 38, 0.42],
    [0.34, 0.16, 32, 0.18],
    [0.64, 0.46, 44, -0.12],
    [0.48, 0.34, 36, 0.28]
  ];

  for (const [x, y, size, rotation] of pieces) {
    drawSprite('confetti', width * x, height * y + drift, size, size, rotation + now * 0.001, fade * 0.74);
  }
}

function drawLevel(width, height) {
  const level = levels[levelIndex];
  const tile = camera.tile;
  const origin = getLevelOrigin(width, height);
  const wallSet = makeSet(level.walls);
  const goalSet = makeSet(level.goals);
  const buttonSet = makeSet(level.buttons);
  const crateSet = makeSet(state.crates);

  context.save();
  context.translate(origin.x, origin.y);

  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const point = { x, y };
      const pointKey = key(point);
      if (wallSet.has(pointKey)) {
        drawWall(x, y, tile);
      } else {
        drawFloor(x, y, tile, (x + y) % 2);
      }
      if (buttonSet.has(pointKey)) {
        drawButton(x, y, tile, crateSet.has(pointKey));
      }
      if (goalSet.has(pointKey)) {
        drawGoal(x, y, tile, crateSet.has(pointKey));
      }
    }
  }

  for (const door of level.doors) {
    drawDoor(door.x, door.y, tile, isDoorOpen(state, door));
  }

  for (const crate of state.crates) {
    drawCrate(crate.x, crate.y, tile);
  }

  drawPlayer(state.player.x, state.player.y, tile);
  context.restore();
}

function getLevelOrigin(width, height) {
  return {
    x: width / 2 - (camera.x + 0.5) * camera.tile,
    y: height / 2 - (camera.y + 0.5) * camera.tile
  };
}

function drawFloor(x, y, tile, variant) {
  if (drawSprite(variant ? 'floor-b' : 'floor-a', x * tile + 1, y * tile + 1, tile - 2, tile - 2)) {
    return;
  }

  context.fillStyle = variant ? 'rgba(215, 206, 180, 0.09)' : 'rgba(215, 206, 180, 0.12)';
  roundedRect(x * tile + 1, y * tile + 1, tile - 2, tile - 2, Math.max(3, tile * 0.08));
  context.fill();
  context.strokeStyle = 'rgba(245, 240, 232, 0.06)';
  context.lineWidth = 1;
  context.stroke();
}

function drawWall(x, y, tile) {
  if (drawSprite('wall', x * tile + 1, y * tile + 1, tile - 2, tile - 2)) {
    return;
  }

  const px = x * tile;
  const py = y * tile;
  const gradient = context.createLinearGradient(px, py, px + tile, py + tile);
  gradient.addColorStop(0, '#443a31');
  gradient.addColorStop(1, '#2a2d28');
  context.fillStyle = gradient;
  roundedRect(px + 1, py + 1, tile - 2, tile - 2, Math.max(3, tile * 0.08));
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.26)';
  context.stroke();
}

function drawButton(x, y, tile, active) {
  const sprite = active ? 'switch-on' : 'switch-off';
  if (drawSprite(sprite, x * tile + tile * 0.18, y * tile + tile * 0.18, tile * 0.64, tile * 0.64)) {
    return;
  }

  const cx = x * tile + tile / 2;
  const cy = y * tile + tile / 2;
  context.fillStyle = active ? 'rgba(84, 208, 187, 0.88)' : 'rgba(84, 208, 187, 0.28)';
  context.strokeStyle = active ? '#dcfff6' : 'rgba(220, 255, 246, 0.38)';
  context.lineWidth = Math.max(2, tile * 0.05);
  context.beginPath();
  context.arc(cx, cy, tile * 0.22, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawGoal(x, y, tile, covered) {
  const alpha = covered ? 1 : 0.74;
  if (drawSprite('goal', x * tile + tile * 0.2, y * tile + tile * 0.2, tile * 0.6, tile * 0.6, 0, alpha)) {
    return;
  }

  const cx = x * tile + tile / 2;
  const cy = y * tile + tile / 2;
  context.save();
  context.translate(cx, cy);
  context.rotate(Math.PI / 4);
  context.fillStyle = covered ? 'rgba(241, 185, 77, 0.9)' : 'rgba(241, 185, 77, 0.28)';
  context.strokeStyle = covered ? '#ffe7a6' : 'rgba(255, 231, 166, 0.46)';
  context.lineWidth = Math.max(2, tile * 0.045);
  roundedRect(-tile * 0.18, -tile * 0.18, tile * 0.36, tile * 0.36, Math.max(2, tile * 0.04));
  context.fill();
  context.stroke();
  context.restore();
}

function drawDoor(x, y, tile, open) {
  const sprite = open ? 'door-open' : 'door-closed';
  if (drawSprite(sprite, x * tile + tile * 0.04, y * tile + tile * 0.04, tile * 0.92, tile * 0.92)) {
    return;
  }

  const px = x * tile + tile * 0.08;
  const py = y * tile + tile * 0.08;
  context.fillStyle = open ? 'rgba(84, 208, 187, 0.16)' : 'rgba(231, 111, 81, 0.78)';
  context.strokeStyle = open ? 'rgba(84, 208, 187, 0.46)' : 'rgba(255, 214, 180, 0.58)';
  context.lineWidth = Math.max(2, tile * 0.04);
  roundedRect(px, py, tile * 0.84, tile * 0.84, Math.max(3, tile * 0.08));
  context.fill();
  context.stroke();

  if (!open) {
    context.strokeStyle = 'rgba(48, 20, 14, 0.52)';
    for (let i = 0; i < 3; i += 1) {
      const lx = x * tile + tile * (0.28 + i * 0.22);
      context.beginPath();
      context.moveTo(lx, y * tile + tile * 0.18);
      context.lineTo(lx, y * tile + tile * 0.82);
      context.stroke();
    }
  }
}

function drawCrate(x, y, tile) {
  drawSprite('crate-shadow', x * tile + tile * 0.08, y * tile + tile * 0.22, tile * 0.84, tile * 0.84, 0, 0.72);
  if (drawSprite('crate', x * tile + tile * 0.08, y * tile + tile * 0.04, tile * 0.84, tile * 0.84)) {
    return;
  }

  const px = x * tile + tile * 0.1;
  const py = y * tile + tile * 0.1;
  const gradient = context.createLinearGradient(px, py, px + tile, py + tile);
  gradient.addColorStop(0, '#d99b3f');
  gradient.addColorStop(1, '#8c5930');
  context.fillStyle = gradient;
  context.strokeStyle = 'rgba(255, 238, 197, 0.64)';
  context.lineWidth = Math.max(2, tile * 0.04);
  roundedRect(px, py, tile * 0.8, tile * 0.8, Math.max(4, tile * 0.1));
  context.fill();
  context.stroke();

  context.strokeStyle = 'rgba(55, 30, 15, 0.36)';
  context.beginPath();
  context.moveTo(px + tile * 0.18, py + tile * 0.18);
  context.lineTo(px + tile * 0.62, py + tile * 0.62);
  context.moveTo(px + tile * 0.62, py + tile * 0.18);
  context.lineTo(px + tile * 0.18, py + tile * 0.62);
  context.stroke();
}

function drawPlayer(x, y, tile) {
  if (drawSprite('player', x * tile + tile * 0.08, y * tile + tile * 0.02, tile * 0.84, tile * 0.84)) {
    return;
  }

  const cx = x * tile + tile / 2;
  const cy = y * tile + tile / 2;
  context.fillStyle = '#f5f0e8';
  context.strokeStyle = '#54d0bb';
  context.lineWidth = Math.max(2, tile * 0.05);
  context.beginPath();
  context.arc(cx, cy, tile * 0.28, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = '#1a2424';
  context.beginPath();
  context.arc(cx + tile * 0.08, cy - tile * 0.06, tile * 0.045, 0, Math.PI * 2);
  context.fill();
}

function makeSet(points) {
  return new Set(points.map(key));
}

function key(point) {
  return `${point.x},${point.y}`;
}

function roundedRect(x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function loadArtAssets() {
  for (const asset of artAssets) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      sprites.set(asset.id, image);
    };
    image.src = asset.src;
  }
}

function drawSprite(id, x, y, width, height, rotation = 0, alpha = 1) {
  const sprite = sprites.get(id);
  if (!sprite) return false;

  context.save();
  context.globalAlpha *= alpha;
  if (rotation) {
    context.translate(x + width / 2, y + height / 2);
    context.rotate(rotation);
    context.drawImage(sprite, -width / 2, -height / 2, width, height);
  } else {
    context.drawImage(sprite, x, y, width, height);
  }
  context.restore();
  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}
