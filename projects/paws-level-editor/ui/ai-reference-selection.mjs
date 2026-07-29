export function selectSecondRoundReferences(references) {
  const source = Array.isArray(references) ? references : [];
  const roundTwo = source.filter((document) =>
    Number(document?.gameplay?.gameLevelOrder) === 2
    || /_r2_/i.test(document?.fileName ?? ""));
  return roundTwo.length ? roundTwo : source;
}
