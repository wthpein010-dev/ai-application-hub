export const AUTO_INTERVAL_MS = 10_000;
export const INITIAL_DELAY_MS = 800;
export const PLAYBACK_SPEEDS = Object.freeze([0.25, 0.4, 0.55, 0.7, 0.85, 1]);
export const DEFAULT_PLAYBACK_SPEED = 0.55;

export function createTourSequence(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.map((id, index) => ({
    id,
    index,
    startsAtMs: INITIAL_DELAY_MS + index * AUTO_INTERVAL_MS,
  }));
}

export function createPlaybackSession(ids) {
  return {
    tourStatus: 'running',
    activeId: null,
    speed: DEFAULT_PLAYBACK_SPEED,
    order: Array.isArray(ids) ? [...ids] : [],
  };
}

export function requestAutoPlayback(session, id) {
  if (session?.tourStatus !== 'running') {
    return session;
  }

  return {
    ...session,
    activeId: id,
  };
}

export function requestManualPlayback(session, id) {
  return {
    ...session,
    tourStatus: 'interrupted',
    activeId: id,
  };
}

export function interruptPlayback(session) {
  return {
    ...session,
    tourStatus: 'interrupted',
    activeId: null,
  };
}

export function finishPlayback(session, id) {
  if (session?.activeId !== id) {
    return session;
  }

  return {
    ...session,
    activeId: null,
  };
}

export function markTourComplete(session) {
  return {
    ...session,
    tourStatus: 'complete',
    activeId: null,
  };
}

export function setPlaybackSpeed(session, speed) {
  if (!PLAYBACK_SPEEDS.includes(speed)) {
    return session;
  }

  return {
    ...session,
    speed,
  };
}

export function getScaledDuration(baseMs, speed) {
  const safeBase = Number.isFinite(baseMs) && baseMs >= 0 ? baseMs : 0;
  const safeSpeed = PLAYBACK_SPEEDS.includes(speed) ? speed : DEFAULT_PLAYBACK_SPEED;
  return Math.round(safeBase / safeSpeed);
}
