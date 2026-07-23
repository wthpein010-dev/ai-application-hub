import {
  clamp01,
  getRevealProgress,
  getPathPlaybackProgress,
  sampleRecordedPath,
} from './motion-model.mjs';
import {
  createTourSequence,
  createPlaybackSession,
  requestAutoPlayback,
  requestManualPlayback,
  interruptPlayback,
  finishPlayback,
  markTourComplete,
  setPlaybackSpeed,
} from './playback-model.mjs';
import {
  VISUAL_SCHEMES,
  getSchemeVisualState,
} from './visual-model.mjs';
import {
  completeLoading,
  createLoadingState,
  markLoadingStage,
  settleLoadingResource,
} from './loading-model.mjs';

const ASSET_ROOT = './assets';
const TILE_WIDTH = 104;
const OUT_DURATION = 720;
const HOLD_DURATION = 420;
const RETURN_DURATION = 620;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CRITICAL_RESOURCES = [
  './assets/block_bg.png',
  './assets/Blocks/block_1.png',
  './assets/Blocks/block_10.png',
];

const SCHEME_DETAILS = [
  ['同步恢复', '最克制基线', '底板与图案共用同一平滑曲线，适合作为程序实现基准。'],
  ['横向分片', '从上到下打开', '五条横向亮态分片按 6% 进度错位依次展开。'],
  ['纵向分片', '从左到右打开', '五条纵向亮态分片依次展开，返程严格反向闭合。'],
  ['九格拼合', '中心到四周', '中心格先出现，再拼入四角和四边。'],
  ['中心遮罩', '由内向外', '亮态矩形从中心同步向砖块四边扩展。'],
  ['整体缩放', '弹出收稳', '下层砖块从 82% 弹至 106%，最后稳定在 100%。'],
  ['纵向形变', '压扁后展开', '保持水平中心不动，从纵向压扁状态展开并轻微过冲。'],
  ['透视翻面', '轻微 3D', '从 -72° 绕 Y 轴翻至正面，避免完整翻牌的夸张感。'],
  ['四边退暗', '中心先显现', '四片压暗覆盖分别向上、下、左、右边缘退出。'],
  ['遮罩 + 回弹', '游戏推荐', '中心遮罩先揭示，图案略早恢复，再用轻回弹收稳。'],
];

const SCHEMES = VISUAL_SCHEMES.map((scheme, index) => ({
  ...scheme,
  number: String(index + 1).padStart(2, '0'),
  title: scheme.name,
  description: scheme.summary,
  timing: `${index === 9 ? '550' : '620'}ms / ${index === 9 ? '500' : '560'}ms`,
  strength: SCHEME_DETAILS[index][1],
  implementation: SCHEME_DETAILS[index][2],
  channel: SCHEME_DETAILS[index][0],
  recommended: scheme.id === 'recommended',
}));

const AUTO_PATH = [
  { x: 0, y: 0 },
  { x: 7, y: -3 },
  { x: 22, y: -11 },
  { x: 43, y: -23 },
  { x: 69, y: -35 },
  { x: 96, y: -44 },
  { x: 124, y: -39 },
];

const cardsRoot = document.querySelector('#cards');
const selectionSummary = document.querySelector('#selection-summary');
const playSelectedButton = document.querySelector('#play-selected');
const pauseAllButton = document.querySelector('#pause-all');
const pathToggle = document.querySelector('#path-toggle');
const tourStatus = document.querySelector('#tour-status');
const loadingOverlay = document.querySelector('#lab-loading');
const loadingStatus = document.querySelector('#lab-loading-status');
const loadingBar = document.querySelector('#lab-loading-bar');
const loadingValue = document.querySelector('#lab-loading-value');
const speedButtons = [...document.querySelectorAll('[data-speed]')];
const cardStates = new Map();

let selectedScheme = 'recommended';
let playbackSession = createPlaybackSession(SCHEMES.map((scheme) => scheme.id));
let tourToken = 0;
let tourMessage = '首次巡播准备中 · 01 将在 0.8 秒后播放';
let loadingState = markLoadingStage(createLoadingState(CRITICAL_RESOURCES), 'module');

document.body.classList.toggle('show-path', pathToggle.checked);
updateLoadingUi('核心模块已读取，正在生成方案卡片…');
renderCards();
loadingState = markLoadingStage(loadingState, 'cards');
updateLoadingUi('十个方案已生成，正在解码砖块资源…');
selectScheme(selectedScheme);
bindGlobalControls();
updatePlaybackUi();
initializeLab();

async function initializeLab() {
  const slowNotice = window.setTimeout(() => {
    if (!loadingState.complete) updateLoadingUi('资源较大，仍在加载，请稍候…');
  }, 3000);

  await waitForCriticalImages();
  window.clearTimeout(slowNotice);
  loadingState = completeLoading(loadingState);
  updateLoadingUi(loadingState.failedResources.size > 0 ? '核心资源已结算，个别资源使用浏览器回退。' : '核心资源已就绪。');
  loadingOverlay?.classList.add('is-complete');
  document.body.dataset.ready = 'true';

  if (REDUCED_MOTION) {
    playbackSession = interruptPlayback(playbackSession);
    tourMessage = '系统已启用减少动态效果 · 可手动选择方案';
    updatePlaybackUi();
  } else {
    startAutoTour();
  }
}

async function waitForCriticalImages() {
  const imagesBySource = new Map();
  document.querySelectorAll('.tile img').forEach((image) => {
    const source = image.getAttribute('src');
    if (source && !imagesBySource.has(source)) imagesBySource.set(source, image);
  });

  await Promise.all(CRITICAL_RESOURCES.map(async (url) => {
    const ok = await waitForImage(imagesBySource.get(url));
    loadingState = settleLoadingResource(loadingState, url, ok);
    updateLoadingUi(`正在解码砖块资源 ${loadingState.settledResources.size}/${loadingState.resources.size}…`);
  }));
}

function waitForImage(image, timeoutMs = 8000) {
  if (!image) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = async (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.removeEventListener('load', onLoad);
      image.removeEventListener('error', onError);
      if (ok && typeof image.decode === 'function') {
        try { await image.decode(); } catch { /* load success remains authoritative */ }
      }
      resolve(ok && image.naturalWidth > 0);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeout = window.setTimeout(() => finish(image.complete && image.naturalWidth > 0), timeoutMs);
    image.addEventListener('load', onLoad, { once: true });
    image.addEventListener('error', onError, { once: true });
    if (image.complete) queueMicrotask(() => finish(image.naturalWidth > 0));
  });
}

function updateLoadingUi(message) {
  const progress = loadingState.progress;
  if (loadingStatus) loadingStatus.textContent = message;
  if (loadingBar) loadingBar.style.width = `${progress}%`;
  if (loadingValue) loadingValue.textContent = `${progress}%`;
  loadingOverlay?.setAttribute('aria-valuenow', String(progress));
  loadingOverlay?.setAttribute('aria-valuetext', message);
}

function renderCards() {
  const fragment = document.createDocumentFragment();

  SCHEMES.forEach((scheme) => {
    const article = document.createElement('article');
    article.className = 'motion-card';
    article.dataset.variant = scheme.id;
    article.innerHTML = cardTemplate(scheme);
    fragment.append(article);

    const state = createCardState(article, scheme);
    cardStates.set(scheme.id, state);
    bindCardInteraction(state);
    updateCard(state, { x: 0, y: 0 }, 'idle');
    drawPath(state, AUTO_PATH);
  });

  cardsRoot.append(fragment);
  requestAnimationFrame(() => {
    cardStates.forEach((state) => drawPath(state, AUTO_PATH));
  });
}

function cardTemplate(scheme) {
  const recommended = scheme.recommended
    ? '<span class="recommended-tag">★ 推荐</span>'
    : '';

  return `
    <div class="card-head">
      <div class="card-index">SCHEME ${scheme.number}</div>
      <h2>${scheme.title}${recommended}</h2>
      <p>${scheme.description}</p>
    </div>
    <div class="stage">
      <canvas class="path-canvas" aria-hidden="true"></canvas>
      <div class="stack">
        <div class="tile lower-tile" aria-label="下层砖块">
          <img class="tile__base" src="${ASSET_ROOT}/block_bg.png" alt="" draggable="false" />
          <img class="tile__icon" src="${ASSET_ROOT}/Blocks/block_10.png" alt="" draggable="false" />
          <div class="lower-tile__bright" aria-hidden="true">${lowerTileImages()}</div>
          <div class="transition-segments" aria-hidden="true">
            ${Array.from({ length: 9 }, (_, index) => `<span class="transition-segment transition-segment--${index}">${lowerTileImages()}</span>`).join('')}
          </div>
          <div class="edge-covers" aria-hidden="true">
            <i class="edge-cover edge-cover--top"></i>
            <i class="edge-cover edge-cover--bottom"></i>
            <i class="edge-cover edge-cover--left"></i>
            <i class="edge-cover edge-cover--right"></i>
          </div>
        </div>
        <button class="tile upper-tile tile-button" type="button" aria-label="拖动上层砖块，查看下层点亮效果">
          <img class="tile__base" src="${ASSET_ROOT}/block_bg.png" alt="" draggable="false" />
          <img class="tile__icon" src="${ASSET_ROOT}/Blocks/block_1.png" alt="" draggable="false" />
        </button>
      </div>
      <div class="exposure-meter" aria-hidden="true"><span></span></div>
      <div class="state-chip"><i></i><span>压暗 · 被遮挡</span></div>
    </div>
    <div class="card-footer">
      <div class="spec-row">
        <div class="spec"><span>点亮 / 压暗</span><strong>${scheme.timing}</strong></div>
        <div class="spec"><span>恢复方式</span><strong>${scheme.channel}</strong></div>
      </div>
      <div class="card-actions">
        <button class="text-button" type="button" data-action="replay">↻ 单独重播</button>
        <button class="choice-button" type="button" data-action="choose">选择此方案</button>
      </div>
    </div>
  `;
}

function lowerTileImages() {
  return `
    <img class="tile__base" src="${ASSET_ROOT}/block_bg.png" alt="" draggable="false" />
    <img class="tile__icon" src="${ASSET_ROOT}/Blocks/block_10.png" alt="" draggable="false" />
  `;
}

function createCardState(card, scheme) {
  return {
    card,
    scheme,
    stage: card.querySelector('.stage'),
    upperTile: card.querySelector('.upper-tile'),
    stateLabel: card.querySelector('.state-chip span'),
    canvas: card.querySelector('.path-canvas'),
    pointerId: null,
    pointerOrigin: { x: 0, y: 0 },
    dragStartPosition: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    path: [{ x: 0, y: 0 }],
    phase: 'idle',
    runId: 0,
  };
}

function bindCardInteraction(state) {
  const { card, upperTile } = state;

  upperTile.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    beginManualControl(state);
    stopCard(state, false);
    state.pointerId = event.pointerId;
    state.pointerOrigin = { x: event.clientX, y: event.clientY };
    state.dragStartPosition = { ...state.position };
    state.path = [{ ...state.position }];
    state.phase = 'dragging';
    upperTile.setPointerCapture(event.pointerId);
  });

  upperTile.addEventListener('pointermove', (event) => {
    if (state.pointerId !== event.pointerId) return;

    const x = clamp(state.dragStartPosition.x + event.clientX - state.pointerOrigin.x, -92, 138);
    const y = clamp(state.dragStartPosition.y + event.clientY - state.pointerOrigin.y, -92, 94);
    const point = { x, y };
    const lastPoint = state.path[state.path.length - 1];

    if (distanceBetween(lastPoint, point) >= 3) {
      state.path.push(point);
    } else {
      state.path[state.path.length - 1] = point;
    }

    updateCard(state, point, 'dragging');
    drawPath(state, state.path);
  });

  const endPointer = (event) => {
    if (state.pointerId !== event.pointerId) return;
    state.pointerId = null;

    if (upperTile.hasPointerCapture(event.pointerId)) {
      upperTile.releasePointerCapture(event.pointerId);
    }

    const finalPoint = { ...state.position };
    if (distanceBetween(state.path[state.path.length - 1], finalPoint) > 0.5) {
      state.path.push(finalPoint);
    }
    if (distanceBetween(state.path[0], state.path[state.path.length - 1]) < 1) {
      state.path.push({ ...finalPoint });
    }

    returnAlongPath(state, state.path).then((returned) => {
      if (!returned || playbackSession.activeId !== state.scheme.id) return;
      playbackSession = finishPlayback(playbackSession, state.scheme.id);
      tourMessage = '手动拖拽已完成 · 自动巡播已停止，刷新页面可重新开始';
      updatePlaybackUi();
    });
  };

  upperTile.addEventListener('pointerup', endPointer);
  upperTile.addEventListener('pointercancel', endPointer);

  card.querySelector('[data-action="replay"]').addEventListener('click', () => {
    playExclusive(state);
  });

  card.querySelector('[data-action="choose"]').addEventListener('click', () => {
    selectScheme(state.scheme.id);
  });
}

function bindGlobalControls() {
  playSelectedButton.addEventListener('click', () => {
    const selected = cardStates.get(selectedScheme);
    if (selected) playExclusive(selected);
  });
  pauseAllButton.addEventListener('click', () => {
    cancelAutoTour('自动巡播已停止 · 刷新页面可重新从头播放');
    stopAllCards();
  });
  pathToggle.addEventListener('change', () => {
    document.body.classList.toggle('show-path', pathToggle.checked);
  });
  speedButtons.forEach((button) => {
    button.addEventListener('click', () => {
      playbackSession = setPlaybackSpeed(playbackSession, Number(button.dataset.speed));
      updatePlaybackUi();
    });
  });
}

async function startAutoTour() {
  const token = ++tourToken;
  const startedAt = performance.now();
  const sequence = createTourSequence(playbackSession.order);

  for (const slot of sequence) {
    const waitMs = Math.max(0, slot.startsAtMs - (performance.now() - startedAt));
    const waiting = await waitForTourSlot(waitMs, token);
    if (!waiting || token !== tourToken || playbackSession.tourStatus !== 'running') return;

    const state = cardStates.get(slot.id);
    if (!state) continue;

    stopAllCards();
    playbackSession = requestAutoPlayback(playbackSession, slot.id);
    tourMessage = `自动巡播 ${slot.index + 1}/${sequence.length} · 正在播放 ${state.scheme.number} ${state.scheme.title}`;
    updatePlaybackUi();
    await playCard(state);

    if (token !== tourToken || playbackSession.tourStatus !== 'running') return;
    playbackSession = finishPlayback(playbackSession, slot.id);
    const next = sequence[slot.index + 1];
    tourMessage = next
      ? `自动巡播等待中 · 下一个 ${String(next.index + 1).padStart(2, '0')} 将按 10 秒间隔播放`
      : '自动巡播即将完成';
    updatePlaybackUi();
  }

  if (token === tourToken && playbackSession.tourStatus === 'running') {
    playbackSession = markTourComplete(playbackSession);
    tourMessage = '自动巡播已完成 · 刷新页面可重新从头播放';
    updatePlaybackUi();
  }
}

async function playExclusive(state) {
  beginManualControl(state);
  stopCard(state, true);
  tourMessage = `手动优先播放 · ${state.scheme.number} ${state.scheme.title}`;
  updatePlaybackUi();
  const completed = await playCard(state);
  if (!completed || playbackSession.activeId !== state.scheme.id) return;
  playbackSession = finishPlayback(playbackSession, state.scheme.id);
  tourMessage = `手动播放已完成 · 自动巡播已停止，刷新页面可重新开始`;
  updatePlaybackUi();
}

function beginManualControl(targetState) {
  tourToken += 1;
  stopAllCards(targetState);
  playbackSession = requestManualPlayback(playbackSession, targetState.scheme.id);
  tourMessage = `手动操作优先 · ${targetState.scheme.number} ${targetState.scheme.title}`;
  updatePlaybackUi();
}

function cancelAutoTour(message) {
  tourToken += 1;
  playbackSession = interruptPlayback(playbackSession);
  tourMessage = message;
  updatePlaybackUi();
}

function stopAllCards(exceptState = null) {
  cardStates.forEach((state) => {
    if (state !== exceptState) stopCard(state, true);
  });
}

async function playCard(state) {
  stopCard(state, true);
  const runId = state.runId;
  const motionScale = REDUCED_MOTION ? 0.12 : 1;

  drawPath(state, AUTO_PATH);
  const movedOut = await animateAlongPath(state, AUTO_PATH, OUT_DURATION * motionScale, 'dragging', runId);
  if (!movedOut) return false;

  const held = await scaledDelay(HOLD_DURATION * motionScale, state, runId);
  if (!held) return false;

  const returned = await animateAlongPath(
    state,
    [...AUTO_PATH].reverse(),
    RETURN_DURATION * motionScale,
    'returning',
    runId,
  );

  if (runId === state.runId) {
    updateCard(state, { x: 0, y: 0 }, 'idle');
  }

  return returned && runId === state.runId;
}

async function returnAlongPath(state, recordedPath) {
  const returnPath = [...recordedPath].reverse();
  const runId = state.runId;
  drawPath(state, recordedPath);
  const returned = await animateAlongPath(state, returnPath, RETURN_DURATION, 'returning', runId);

  if (returned && runId === state.runId) {
    updateCard(state, { x: 0, y: 0 }, 'idle');
  }

  return returned && runId === state.runId;
}

function animateAlongPath(state, points, duration, phase, runId) {
  let lastFrameAt = performance.now();
  let scaledElapsed = 0;

  return new Promise((resolve) => {
    const frame = (now) => {
      if (runId !== state.runId) {
        resolve(false);
        return;
      }

      scaledElapsed += Math.max(0, now - lastFrameAt) * playbackSession.speed;
      lastFrameAt = now;
      const raw = clamp01(scaledElapsed / Math.max(1, duration));
      const pathProgress = getPathPlaybackProgress(raw, phase);
      const point = sampleRecordedPath(points, pathProgress);
      updateCard(state, point, phase);

      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve(true);
      }
    };

    requestAnimationFrame(frame);
  });
}

function updateCard(state, point, phase) {
  const reveal = getRevealProgress(Math.hypot(point.x, point.y), TILE_WIDTH);
  const rotation = clamp(point.x / 42, -2.4, 3.2);

  state.position = point;
  state.phase = phase;
  state.card.style.setProperty('--reveal', reveal.toFixed(4));
  state.stage.style.setProperty('--reveal', reveal.toFixed(4));
  setRevealVariables(state.stage, state.scheme.id, reveal);
  state.upperTile.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) rotate(${rotation}deg)`;
  state.card.classList.toggle('is-bright', reveal > 0.84);

  state.stateLabel.textContent = getStateLabel(reveal, phase);
}

function setRevealVariables(stage, schemeId, reveal) {
  const visual = getSchemeVisualState(schemeId, reveal);
  const set = (name, value) => stage.style.setProperty(name, value);

  set('--reveal-pct', `${(reveal * 100).toFixed(2)}%`);
  set('--base-gray', visual.baseGray.toFixed(4));
  set('--base-brightness', visual.baseBrightness.toFixed(4));
  set('--base-saturation', visual.baseSaturation.toFixed(4));
  set('--base-contrast', visual.baseContrast.toFixed(4));
  set('--icon-gray', visual.iconGray.toFixed(4));
  set('--icon-brightness', visual.iconBrightness.toFixed(4));
  set('--icon-saturation', visual.iconSaturation.toFixed(4));
  set('--icon-contrast', visual.iconContrast.toFixed(4));
  set('--icon-opacity', visual.iconOpacity.toFixed(4));
  set('--tile-scale', visual.tileScale.toFixed(4));
  set('--mask-progress', visual.maskProgress.toFixed(4));
  set('--mask-reverse-progress', visual.maskReverseProgress.toFixed(4));
  set('--mask-inset', `${((1 - visual.maskProgress) * 50).toFixed(2)}%`);
  set('--tile-scale-x', visual.tileScaleX.toFixed(4));
  set('--tile-scale-y', visual.tileScaleY.toFixed(4));
  set('--tile-rotate-y', `${visual.tileRotateY.toFixed(4)}deg`);
  set('--tile-perspective', `${visual.tilePerspective}px`);
  for (let index = 0; index < 9; index += 1) {
    set(`--segment-${index}`, (visual.segmentProgress[index] ?? visual.maskProgress).toFixed(4));
  }
  for (let index = 0; index < 4; index += 1) {
    const edge = visual.edgeProgress[index] ?? visual.maskProgress;
    set(`--edge-${index}`, edge.toFixed(4));
    set(`--edge-${index}-offset`, `${(edge * 100).toFixed(2)}%`);
  }
}

function getStateLabel(reveal, phase) {
  if (phase === 'returning' && reveal > 0.03) {
    return '恢复压暗中';
  }
  if (reveal < 0.03) {
    return '压暗 · 被遮挡';
  }
  if (reveal < 0.88) {
    return '露出 · 点亮中';
  }
  return '已点亮 · 可操作';
}

function stopCard(state, reset) {
  state.runId += 1;
  if (reset) {
    updateCard(state, { x: 0, y: 0 }, 'idle');
    drawPath(state, AUTO_PATH);
  }
}

function scaledDelay(duration, state, runId) {
  return new Promise((resolve) => {
    let lastFrameAt = performance.now();
    let scaledElapsed = 0;

    const frame = (now) => {
      if (runId !== state.runId) {
        resolve(false);
        return;
      }

      scaledElapsed += Math.max(0, now - lastFrameAt) * playbackSession.speed;
      lastFrameAt = now;
      if (scaledElapsed >= duration) {
        resolve(true);
      } else {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  });
}

function waitForTourSlot(duration, token) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(token === tourToken), duration);
  });
}

function updatePlaybackUi() {
  if (tourStatus) {
    tourStatus.textContent = tourMessage;
    tourStatus.dataset.status = playbackSession.tourStatus;
  }

  speedButtons.forEach((button) => {
    const active = Number(button.dataset.speed) === playbackSession.speed;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  cardStates.forEach((state) => {
    state.card.classList.toggle('is-playing', playbackSession.activeId === state.scheme.id);
  });
}

function selectScheme(id) {
  selectedScheme = id;
  const scheme = SCHEMES.find((item) => item.id === id) ?? SCHEMES[0];

  cardStates.forEach((state) => {
    state.card.classList.toggle('is-selected', state.scheme.id === selectedScheme);
    const button = state.card.querySelector('[data-action="choose"]');
    button.textContent = state.scheme.id === selectedScheme ? '✓ 已选择' : '选择此方案';
    button.setAttribute('aria-pressed', String(state.scheme.id === selectedScheme));
  });

  selectionSummary.innerHTML = `
    <div class="selection-bar__mark">${scheme.number}</div>
    <div>
      <strong>当前选择：${scheme.title}</strong>
      <span>${scheme.implementation}</span>
    </div>
    <div class="selection-bar__meta">LIGHT ${scheme.timing.split(' / ')[0]}<br>DIM ${scheme.timing.split(' / ')[1] ?? '120ms'}</div>
  `;

  const selectedName = playSelectedButton?.querySelector('.selected-name');
  if (selectedName) selectedName.textContent = scheme.number;
}

function drawPath(state, points) {
  const { canvas, stage } = state;
  const rect = stage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  if (!points || points.length < 2) return;

  const stackRect = state.card.querySelector('.stack').getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const originX = stackRect.left - stageRect.left + TILE_WIDTH / 2;
  const originY = stackRect.top - stageRect.top + 55;

  context.beginPath();
  points.forEach((point, index) => {
    const x = originX + point.x;
    const y = originY + point.y;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.setLineDash([4, 6]);
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(215, 255, 148, 0.48)';
  context.stroke();

  const end = points[points.length - 1];
  context.beginPath();
  context.arc(originX + end.x, originY + end.y, 4, 0, Math.PI * 2);
  context.fillStyle = 'rgba(215, 255, 148, 0.8)';
  context.fill();
}

function distanceBetween(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

window.addEventListener('resize', () => {
  cardStates.forEach((state) => drawPath(state, state.path.length > 1 ? state.path : AUTO_PATH));
});
