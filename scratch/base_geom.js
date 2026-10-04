function getProceduralBaseGeometry(bounds, typologyKey) {
  const spanX = bounds.maxX - bounds.minX || 10;
  const spanY = bounds.maxY - bounds.minY || 10;
  const spanZ = bounds.maxZ - bounds.minZ || 10;
  const cX = (bounds.minX + bounds.maxX) / 2;
  const cY = (bounds.minY + bounds.maxY) / 2;
  const cZ = (bounds.minZ + bounds.maxZ) / 2;
  
  let geom;
  if (typologyKey === 'FLUID_SHELL' || typologyKey === 'FOLDED_UNDULATING' || typologyKey === 'TOPOGRAPHIC_GROUND') {
     const radius = Math.max(spanX, Math.max(spanY, spanZ)) / 2;
     geom = new THREE.IcosahedronGeometry(radius, 24); 
  } else if (typologyKey === 'VERTICAL_VOID' || typologyKey === 'VOID_FIELD_GATHERING') {
     geom = new THREE.CylinderGeometry(Math.max(spanX, spanZ)/2, Math.max(spanX, spanZ)/2, spanY, 64, 64);
  } else {
     geom = new THREE.BoxGeometry(spanX, spanY, spanZ, 50, 50, 50);
  }
  
  geom.translate(cX, cY, cZ);
  return {
    positions: Array.from(geom.attributes.position.array),
    indices: geom.index ? Array.from(geom.index.array) : null
  };
}
window.getProceduralBaseGeometry = getProceduralBaseGeometry;
