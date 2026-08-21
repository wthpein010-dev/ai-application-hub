export function createTileMaterialSet(THREE, { texture, sideMaterial }) {
  const top = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
  });
  const side = sideMaterial.clone();
  return {
    top,
    side,
    materials: [side, side, top, side, side, side],
  };
}
