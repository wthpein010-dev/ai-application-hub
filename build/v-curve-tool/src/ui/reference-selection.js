export function selectReferenceSample(selection, sample) {
  const result = {...selection};
  for (const side of ['left', 'right']) {
    const chosen = sample[side];
    const levels = [...selection[side].levels];
    const index = levels.findIndex(level => level === chosen
      || (chosen.referenceSampleKey && level.referenceSampleKey === chosen.referenceSampleKey));
    if (index >= 0) levels[index] = chosen;
    else levels.push(chosen);
    result[side] = {levels, selectedLevel: chosen};
  }
  return result;
}
