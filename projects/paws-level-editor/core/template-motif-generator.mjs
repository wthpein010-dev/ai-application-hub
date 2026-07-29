import { XorShift } from "./xorshift.mjs";

const TILE_SIZE = 8;
const BOARD = Object.freeze({ width: 7, height: 8 });
const LAYOUT_KEYS = new Set(["balanced", "progressive", "open"]);

function overlaps(left, right) {
  return (
    left.x < right.x + TILE_SIZE
    && left.x + TILE_SIZE > right.x
    && left.y < right.y + TILE_SIZE
    && left.y + TILE_SIZE > right.y
  );
}

function canPlace(anchor, selected) {
  return selected.every((placed) => !overlaps(anchor, placed));
}

function boundedInteger(value, minimum, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}必须是数字。`);
  const integer = Math.round(number);
  if (integer < minimum) throw new Error(`${label}必须至少为 ${minimum}。`);
  return integer;
}

function profileSequence(profile) {
  const sequence = profile?.layerSequence ?? profile?.layerTemplates ?? [];
  if (sequence.length) {
    return [...sequence].sort((left, right) =>
      Number(left.layer) - Number(right.layer));
  }
  const layerCount = Math.max(1, Number(profile?.layerCount) || 1);
  return Array.from({ length: layerCount }, (_, index) => ({
    layer: index + 1,
    normalizedDepth: layerCount > 1 ? index / (layerCount - 1) : 0,
    tileCount: Number(profile?.layerTileCounts?.[index]) || 1,
    anchors: [],
  }));
}

function rankProfiles(learned, target, layout) {
  const profiles = learned?.referenceProfiles ?? [];
  return profiles
    .map((profile) => {
      const tileDistance = Math.abs(
        (Number(profile.tileCount) || 0) - target.tileCount,
      ) / Math.max(1, target.tileCount);
      const layerDistance = Math.abs(
        (Number(profile.layerCount) || 0) - target.layerCount,
      ) / Math.max(1, target.layerCount);
      const boundary = Number(profile.layoutMetrics?.boundaryRatio);
      const layoutTarget = {
        balanced: 0.62,
        progressive: 0.54,
        open: 0.72,
      }[layout];
      const layoutDistance = Number.isFinite(boundary)
        ? Math.abs(boundary - layoutTarget) * 0.35
        : 0;
      return {
        profile,
        score: tileDistance + layerDistance + layoutDistance,
      };
    })
    .sort((left, right) =>
      left.score - right.score
      || Number(left.profile.sampleIndex) - Number(right.profile.sampleIndex));
}

function buildSourceLayerMap(sequence, targetLayerCount) {
  if (targetLayerCount === 1) return [Number(sequence[0]?.layer) || 1];
  const sourceCount = sequence.length;
  const indices = [];
  for (let index = 0; index < targetLayerCount; index += 1) {
    let sourceIndex = Math.round(
      index * (sourceCount - 1) / (targetLayerCount - 1),
    );
    if (sourceCount >= targetLayerCount && index > 0) {
      const remainingTargets = targetLayerCount - index - 1;
      sourceIndex = Math.max(indices[index - 1] + 1, sourceIndex);
      sourceIndex = Math.min(sourceIndex, sourceCount - remainingTargets - 1);
    } else if (index > 0) {
      sourceIndex = Math.max(indices[index - 1], sourceIndex);
    }
    indices.push(sourceIndex);
  }
  return indices.map((index) => Number(sequence[index]?.layer) || index + 1);
}

function transformPoint(anchor, profile, transform) {
  const maxX = BOARD.width * TILE_SIZE - TILE_SIZE;
  const maxY = BOARD.height * TILE_SIZE - TILE_SIZE;
  const sourceMaxX = Math.max(
    1,
    (Number(profile?.board?.width) || BOARD.width) * TILE_SIZE - TILE_SIZE,
  );
  const sourceMaxY = Math.max(
    1,
    (Number(profile?.board?.height) || BOARD.height) * TILE_SIZE - TILE_SIZE,
  );
  const normalizedX = Number.isFinite(Number(anchor?.normalizedX))
    ? Number(anchor.normalizedX)
    : Number(anchor?.x) / sourceMaxX;
  const normalizedY = Number.isFinite(Number(anchor?.normalizedY))
    ? Number(anchor.normalizedY)
    : Number(anchor?.y) / sourceMaxY;
  let x = Math.round(Math.max(0, Math.min(1, normalizedX || 0)) * maxX);
  let y = Math.round(Math.max(0, Math.min(1, normalizedY || 0)) * maxY);
  if (transform.mirrorX) x = maxX - x;
  if (transform.mirrorY) y = maxY - y;
  return { x, y };
}

function scaleLayer(sourceLayer, sourceLayerCount, targetLayerCount) {
  if (targetLayerCount <= 1 || sourceLayerCount <= 1) return 1;
  return 1 + Math.round(
    (Math.max(1, Number(sourceLayer)) - 1)
      * (targetLayerCount - 1)
      / (sourceLayerCount - 1),
  );
}

function nearestLegalAnchor(base, occupied) {
  const maxX = BOARD.width * TILE_SIZE - TILE_SIZE;
  const maxY = BOARD.height * TILE_SIZE - TILE_SIZE;
  const maximumRadius = Math.max(maxX, maxY);
  for (let radius = 0; radius <= maximumRadius; radius += 1) {
    const candidates = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const anchor = { x: base.x + dx, y: base.y + dy };
        if (
          anchor.x < 0
          || anchor.y < 0
          || anchor.x > maxX
          || anchor.y > maxY
        ) {
          continue;
        }
        candidates.push({
          anchor,
          distance: Math.hypot(dx, dy),
        });
      }
    }
    candidates.sort((left, right) =>
      left.distance - right.distance
      || left.anchor.y - right.anchor.y
      || left.anchor.x - right.anchor.x);
    const legal = candidates.find(({ anchor }) => canPlace(anchor, occupied));
    if (legal) return legal.anchor;
  }
  return null;
}

function reconstructFillTracks(profile, targetLayerCount, transform) {
  const sourceTracks = profile?.fillTracks ?? profile?.blindStacks ?? [];
  const sourceLayerCount = Math.max(
    1,
    Number(profile?.layerCount) || profileSequence(profile).length,
  );
  const occupiedByLayer = Array.from(
    { length: targetLayerCount },
    () => [],
  );
  const fillTracks = [];
  for (const [trackIndex, sourceTrack] of sourceTracks.entries()) {
    let layerStart = scaleLayer(
      sourceTrack.layerStart,
      sourceLayerCount,
      targetLayerCount,
    );
    let layerEnd = scaleLayer(
      sourceTrack.layerEnd,
      sourceLayerCount,
      targetLayerCount,
    );
    if (layerEnd <= layerStart) {
      if (layerStart >= targetLayerCount) layerStart = targetLayerCount - 1;
      layerEnd = Math.min(targetLayerCount, layerStart + 1);
    }
    const start = transformPoint(
      sourceTrack.lowerAnchors?.[0] ?? {
        normalizedX: sourceTrack.start?.x,
        normalizedY: sourceTrack.start?.y,
      },
      profile,
      transform,
    );
    const sourceDepth = Math.max(2, Number(sourceTrack.depth) || 2);
    const top = transformPoint(
      sourceTrack.topAnchor ?? {
        normalizedX:
          Number(sourceTrack.start?.x)
          + Number(sourceTrack.delta?.x || 0) * (sourceDepth - 1),
        normalizedY:
          Number(sourceTrack.start?.y)
          + Number(sourceTrack.delta?.y || 0) * (sourceDepth - 1),
      },
      profile,
      transform,
    );
    const depth = layerEnd - layerStart + 1;
    const anchors = [];
    for (let layer = layerStart; layer <= layerEnd; layer += 1) {
      const progress = depth > 1 ? (layer - layerStart) / (depth - 1) : 0;
      const base = {
        x: Math.round(start.x + (top.x - start.x) * progress),
        y: Math.round(start.y + (top.y - start.y) * progress),
      };
      const anchor = nearestLegalAnchor(base, occupiedByLayer[layer - 1]);
      if (!anchor) {
        throw new Error(`第 ${layer} 层无法保留第 ${trackIndex + 1} 条平铺轨迹。`);
      }
      const blindTop = layer === layerEnd;
      const semantic = {
        ...anchor,
        layer,
        semantic: true,
        trackIndex,
        blind: !blindTop,
        blindTop,
      };
      occupiedByLayer[layer - 1].push(semantic);
      anchors.push(semantic);
    }
    fillTracks.push({
      sourceTrackIndex: trackIndex,
      sourceLayerStart: Number(sourceTrack.layerStart),
      sourceLayerEnd: Number(sourceTrack.layerEnd),
      sourceExplicitTop: Boolean(sourceTrack.explicitTop),
      layerStart,
      layerEnd,
      lowerDepth: Math.max(1, depth - 1),
      depth,
      explicitTop: true,
      anchors: anchors.map(({ x, y, layer }) => ({ x, y, layer })),
    });
  }
  return { fillTracks, occupiedByLayer };
}

function nearestSilhouetteDistance(anchor, silhouette) {
  if (!silhouette.length) return 0;
  return Math.min(...silhouette.map((source) =>
    Math.hypot(anchor.x - source.x, anchor.y - source.y)));
}

function bestLatticeCandidates(
  selected,
  silhouette,
  rng,
  { preferSilhouette = true } = {},
) {
  const maxX = BOARD.width * TILE_SIZE - TILE_SIZE;
  const maxY = BOARD.height * TILE_SIZE - TILE_SIZE;
  const candidates = [];
  for (let offsetX = 0; offsetX < TILE_SIZE; offsetX += 1) {
    for (let offsetY = 0; offsetY < TILE_SIZE; offsetY += 1) {
      const lattice = [];
      for (let x = offsetX; x <= maxX; x += TILE_SIZE) {
        for (let y = offsetY; y <= maxY; y += TILE_SIZE) {
          const anchor = { x, y };
          if (canPlace(anchor, selected)) lattice.push(anchor);
        }
      }
      candidates.push({
        lattice,
        distance: lattice.length
          ? lattice.reduce(
            (sum, anchor) => sum + nearestSilhouetteDistance(anchor, silhouette),
            0,
          ) / lattice.length
          : Number.POSITIVE_INFINITY,
        jitter: rng.nextUint32(),
      });
    }
  }
  const capacitySafe = candidates.filter(({ lattice }) => lattice.length >= 36);
  const ranked = capacitySafe.length ? capacitySafe : candidates;
  const best = ranked.sort((left, right) =>
    (
      preferSilhouette
        ? left.distance - right.distance
        : left.jitter - right.jitter
    )
    || right.lattice.length - left.lattice.length
    || left.distance - right.distance)[0];
  return best.lattice
    .map((anchor) => ({
      ...anchor,
      distance: nearestSilhouetteDistance(anchor, silhouette),
    }))
    .sort((left, right) =>
      left.distance - right.distance
      || left.y - right.y
      || left.x - right.x);
}

function buildLayerCandidates({
  profile,
  sequence,
  sourceLayerMap,
  occupiedByLayer,
  transform,
  rng,
  preserveSourceAnchors,
}) {
  return sourceLayerMap.map((sourceLayer, layerIndex) => {
    const template = sequence.find(({ layer }) =>
      Number(layer) === Number(sourceLayer)) ?? sequence[layerIndex % sequence.length];
    const selected = [...occupiedByLayer[layerIndex]];
    const ordinarySource = (template?.anchors ?? [])
      .filter((anchor) =>
        Number(anchor.presetColorType ?? 1) !== 3
        && Number(anchor.moldType ?? 1) !== 2)
      .map((anchor) => ({
        ...transformPoint(anchor, profile, transform),
        source: true,
      }));
    if (preserveSourceAnchors) {
      for (const anchor of ordinarySource) {
        if (canPlace(anchor, selected)) selected.push(anchor);
      }
    }
    const silhouette = ordinarySource.length
      ? ordinarySource
      : selected;
    const fallback = bestLatticeCandidates(selected, silhouette, rng, {
      preferSilhouette: preserveSourceAnchors,
    })
      .map((anchor) => ({ ...anchor, fallback: true }));
    return [...selected, ...fallback];
  });
}

function layoutWeights(sourceLayerMap, sequence, layout) {
  const raw = sourceLayerMap.map((sourceLayer) =>
    Math.max(
      1,
      Number(sequence.find(({ layer }) =>
        Number(layer) === Number(sourceLayer))?.tileCount) || 1,
    ));
  const mean = raw.reduce((sum, value) => sum + value, 0) / raw.length;
  return raw.map((weight, index) => {
    const progress = raw.length > 1 ? index / (raw.length - 1) : 0;
    if (layout === "progressive") return weight * (0.82 + progress * 0.36);
    if (layout === "open") return weight * 0.72 + mean * 0.28;
    return weight;
  });
}

function allocateLayerTileCounts({
  tileCount,
  weights,
  minimums,
  capacities,
}) {
  const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
  const capacityTotal = capacities.reduce((sum, value) => sum + value, 0);
  if (tileCount < minimumTotal) {
    throw new Error("砖块数量不足以保留全部有效层和平铺轨迹。");
  }
  if (tileCount > capacityTotal) {
    throw new Error(
      `目标砖块数量 ${tileCount} 超过模板母题的安全容量 ${capacityTotal}。`,
    );
  }
  const counts = [...minimums];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const ideals = weights.map((weight) =>
    weightTotal ? tileCount * weight / weightTotal : tileCount / weights.length);
  let remaining = tileCount - minimumTotal;
  while (remaining > 0) {
    const candidate = counts
      .map((count, index) => ({
        index,
        count,
        deficit: ideals[index] - count,
        weight: weights[index],
      }))
      .filter(({ index, count }) => count < capacities[index])
      .sort((left, right) =>
        right.deficit - left.deficit
        || right.weight / (right.count + 1) - left.weight / (left.count + 1)
        || left.index - right.index)[0];
    if (!candidate) {
      throw new Error("模板母题容量分配未能守恒。");
    }
    counts[candidate.index] += 1;
    remaining -= 1;
  }
  return counts;
}

export function buildTemplateMotifGeometry({
  learned,
  target,
  layout,
  seed,
  attempt = 0,
}) {
  const tileCount = boundedInteger(target?.tileCount, 2, "砖块数量");
  const layerCount = boundedInteger(target?.layerCount, 1, "有效层数");
  if (!LAYOUT_KEYS.has(layout)) throw new Error("布局选项无效。");
  const ranked = rankProfiles(learned, { tileCount, layerCount }, layout);
  if (!ranked.length) throw new Error("没有可用于生成模板母题的参考关卡。");
  const attemptIndex = Math.max(0, Math.trunc(Number(attempt) || 0));
  const sourceProfile = ranked[attemptIndex % ranked.length].profile;
  const sequence = profileSequence(sourceProfile);
  const sourceLayerMap = buildSourceLayerMap(sequence, layerCount);
  const rng = XorShift.fromSeed(
    (Number(seed) + Math.imul(attemptIndex, 0x9e3779b9)) | 0,
  );
  const transform = {
    mirrorX: Boolean(rng.nextUint32() & 1),
    mirrorY: Boolean(rng.nextUint32() & 1),
  };
  const { fillTracks, occupiedByLayer } = reconstructFillTracks(
    sourceProfile,
    layerCount,
    transform,
  );
  const preserveSourceAnchors =
    tileCount <= Math.max(1, Number(sourceProfile.tileCount) || 1) * 2
    && layerCount <= Math.max(1, Number(sourceProfile.layerCount) || 1) * 2;
  const layerCandidates = buildLayerCandidates({
    profile: sourceProfile,
    sequence,
    sourceLayerMap,
    occupiedByLayer,
    transform,
    rng,
    preserveSourceAnchors,
  });
  const minimums = occupiedByLayer.map((anchors) => Math.max(1, anchors.length));
  const layerCapacities = layerCandidates.map((anchors) => anchors.length);
  const weights = layoutWeights(sourceLayerMap, sequence, layout);
  const layerTileCounts = allocateLayerTileCounts({
    tileCount,
    weights,
    minimums,
    capacities: layerCapacities,
  });
  const tiles = [];
  let selectedSourceAnchors = 0;
  let selectedOrdinaryAnchors = 0;
  layerCandidates.forEach((candidates, layerIndex) => {
    const selected = candidates.slice(0, layerTileCounts[layerIndex]);
    selectedSourceAnchors += selected.filter(({ source }) => source).length;
    selectedOrdinaryAnchors += selected.filter(({ semantic }) => !semantic).length;
    selected.forEach((anchor, tileIndex) => {
      tiles.push({
        uid: `ai-${layerIndex + 1}-${tileIndex + 1}`,
        x: anchor.x,
        y: anchor.y,
        layer: layerIndex + 1,
        type: -1,
        moldType: anchor.blindTop ? 2 : 1,
        metaType: 0,
        metaData: 0,
        presetColorType: anchor.blind ? 3 : 1,
      });
    });
  });
  return {
    board: { ...BOARD },
    tiles,
    sourceProfile,
    sourceLayerMap,
    layerTileCounts,
    layerCapacities,
    preservedAnchorRatio: selectedOrdinaryAnchors
      ? selectedSourceAnchors / selectedOrdinaryAnchors
      : 0,
    fillTracks,
    globalTransform: transform,
  };
}
