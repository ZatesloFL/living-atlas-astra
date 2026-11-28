const studioBounds=Object.freeze({minX:-13.5,maxX:34.2,minZ:-14.5,maxZ:12});
const outdoorBounds=Object.freeze({minX:-13,maxX:13,minZ:-20,maxZ:12});

export function sceneBounds(scene, interior) {
  if (!interior) return scene==='studio'?studioBounds:outdoorBounds;
  const halfWidth=interior.width / 2 - .4,halfDepth=interior.depth / 2 - .4;
  return {minX:-halfWidth,maxX:halfWidth,minZ:-halfDepth,maxZ:halfDepth};
}

export function withinSceneBounds(scene, interior, x, z) {
  const {minX,maxX,minZ,maxZ}=sceneBounds(scene,interior);
  return x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ;
}
