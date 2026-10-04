if (!window.getProceduralBaseGeometry) {
  window.getProceduralBaseGeometry = function(bounds, typologyKey) {
    const spanX = bounds.maxX - bounds.minX || 10;
    const spanY = bounds.maxY - bounds.minY || 10;
    const spanZ = bounds.maxZ - bounds.minZ || 10;
    const cX = (bounds.minX + bounds.maxX) / 2;
    const cY = (bounds.minY + bounds.maxY) / 2;
    const cZ = (bounds.minZ + bounds.maxZ) / 2;
    
    // We will build a unified BufferGeometry by merging multiple parts
    let positions = [];
    let indices = [];
    let offset = 0;

    function addPlane(w, h, wSeg, hSeg, matrix) {
       let geom = new THREE.PlaneGeometry(w, h, wSeg, hSeg);
       geom.applyMatrix4(matrix);
       let pos = geom.attributes.position.array;
       let idx = geom.index ? geom.index.array : null;
       for(let i=0; i<pos.length; i++) positions.push(pos[i]);
       if(idx) {
         for(let i=0; i<idx.length; i++) indices.push(idx[i] + offset);
       } else {
         for(let i=0; i<pos.length/3; i++) indices.push(offset+i);
       }
       offset += pos.length / 3;
    }

    let mFloor = new THREE.Matrix4().makeRotationX(-Math.PI/2);
    mFloor.setPosition(0, -spanY/2, 0);
    
    let mCeil = new THREE.Matrix4().makeRotationX(Math.PI/2);
    mCeil.setPosition(0, spanY/2, 0);

    if (typologyKey === 'FLUID_SHELL' || typologyKey === 'FOLDED_UNDULATING' || typologyKey === 'TOPOGRAPHIC_GROUND') {
       // A massive arching shell spanning X and Z
       let geom = new THREE.PlaneGeometry(spanX, spanZ, 40, 40);
       geom.rotateX(-Math.PI/2);
       // Curve it into a vault
       let pos = geom.attributes.position.array;
       for(let i=0; i<pos.length; i+=3) {
          let uX = (pos[i] / spanX);
          pos[i+1] += Math.sin((uX + 0.5) * Math.PI) * spanY * 0.8 - spanY/2;
       }
       for(let i=0; i<pos.length; i++) positions.push(pos[i]);
       for(let i=0; i<geom.index.array.length; i++) indices.push(geom.index.array[i]);
    } 
    else if (typologyKey === 'VERTICAL_VOID' || typologyKey === 'VOID_FIELD_GATHERING') {
       // Floor and Ceiling with a central hole (we approximate by just using dense planes, the POSNEG rule will push them to form a void)
       addPlane(spanX, spanZ, 40, 40, mFloor);
       addPlane(spanX, spanZ, 40, 40, mCeil);
       // Add an internal tube connecting them
       let tube = new THREE.CylinderGeometry(spanX*0.15, spanX*0.15, spanY, 32, 16, true);
       let tPos = tube.attributes.position.array;
       let tIdx = tube.index.array;
       for(let i=0; i<tPos.length; i++) positions.push(tPos[i]);
       for(let i=0; i<tIdx.length; i++) indices.push(tIdx[i] + offset);
    } 
    else {
       // Open Gallery: Floor, Ceiling, and Back Wall
       addPlane(spanX, spanZ, 40, 40, mFloor);
       addPlane(spanX, spanZ, 40, 40, mCeil);
       let mWall = new THREE.Matrix4().setPosition(0, 0, -spanZ/2);
       addPlane(spanX, spanY, 40, 20, mWall);
    }
    
    // Translate all to center
    for(let i=0; i<positions.length; i+=3) {
       positions[i] += cX;
       positions[i+1] += cY;
       positions[i+2] += cZ;
    }

    return {
      positions: positions,
      indices: indices
    };
  }
}
