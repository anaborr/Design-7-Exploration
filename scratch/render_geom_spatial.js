  if (!window.getProceduralBaseGeometry) {
    window.getProceduralBaseGeometry = function(bounds, typologyKey) {
      const spanX = bounds.maxX - bounds.minX || 10;
      const spanY = bounds.maxY - bounds.minY || 10;
      const spanZ = bounds.maxZ - bounds.minZ || 10;
      const cX = (bounds.minX + bounds.maxX) / 2;
      const cY = (bounds.minY + bounds.maxY) / 2;
      const cZ = (bounds.minZ + bounds.maxZ) / 2;
      
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
         let geom = new THREE.PlaneGeometry(spanX, spanZ, 60, 60);
         geom.rotateX(-Math.PI/2);
         let pos = geom.attributes.position.array;
         for(let i=0; i<pos.length; i+=3) {
            let uX = (pos[i] / spanX);
            pos[i+1] += Math.sin((uX + 0.5) * Math.PI) * spanY * 0.8 - spanY/2;
         }
         for(let i=0; i<pos.length; i++) positions.push(pos[i]);
         for(let i=0; i<geom.index.array.length; i++) indices.push(geom.index.array[i]);
      } 
      else if (typologyKey === 'VERTICAL_VOID' || typologyKey === 'VOID_FIELD_GATHERING') {
         addPlane(spanX, spanZ, 40, 40, mFloor);
         addPlane(spanX, spanZ, 40, 40, mCeil);
         let tube = new THREE.CylinderGeometry(spanX*0.15, spanX*0.15, spanY, 32, 16, true);
         let tPos = tube.attributes.position.array;
         let tIdx = tube.index.array;
         for(let i=0; i<tPos.length; i++) positions.push(tPos[i]);
         for(let i=0; i<tIdx.length; i++) indices.push(tIdx[i] + offset);
      } 
      else {
         addPlane(spanX, spanZ, 40, 40, mFloor);
         addPlane(spanX, spanZ, 40, 40, mCeil);
         let mWall = new THREE.Matrix4().setPosition(0, 0, -spanZ/2);
         addPlane(spanX, spanY, 40, 20, mWall);
      }
      
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

  if (compMode !== 'SEED' && !isSeedDna) {
    originalMeshes.forEach(item => {
      const tm = item.mesh || item.threeMesh;
      if (tm) tm.visible = false;
    });

    if (!window.generatedMesh) {
       const mat = new THREE.MeshPhysicalMaterial({
         color: 0xe0e0e0, metalness: 0.1, roughness: 0.6,
         side: THREE.DoubleSide, flatShading: false
       });
       window.generatedMesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
       meshGroup.add(window.generatedMesh);
    }

    if (window._lastBaseTypology !== activeTypologyKey || !window._baseGeomData) {
       window._baseGeomData = window.getProceduralBaseGeometry(modelBounds, activeTypologyKey);
       window._lastBaseTypology = activeTypologyKey;
    }
    
    let defPos = executeRecipeDeformation(window._baseGeomData.positions, recipeOrDna, modelBounds, true, activeTypologyKey);
    
    const newGeom = new THREE.BufferGeometry();
    newGeom.setAttribute('position', new THREE.Float32BufferAttribute(defPos, 3));
    if (window._baseGeomData.indices) {
       newGeom.setIndex(new THREE.Uint32BufferAttribute(window._baseGeomData.indices, 1));
    }
    newGeom.computeVertexNormals();
    newGeom.computeBoundingBox();
    newGeom.computeBoundingSphere();
    
    window.generatedMesh.geometry.dispose();
    window.generatedMesh.geometry = newGeom;
    window.generatedMesh.visible = true;

    if (compMode === 'OVERLAY') {
       window.generatedMesh.material.wireframe = true;
       window.generatedMesh.material.needsUpdate = true;
       originalMeshes.forEach(item => {
           const tm = item.mesh || item.threeMesh;
           if (tm) {
               tm.visible = true;
               if (!tm._origMat) tm._origMat = tm.material;
               tm.material = new THREE.MeshBasicMaterial({color: 0x555555, wireframe: true, transparent: true, opacity: 0.1});
           }
       });
    } else {
       window.generatedMesh.material.wireframe = false;
       window.generatedMesh.material.needsUpdate = true;
       originalMeshes.forEach(item => {
           const tm = item.mesh || item.threeMesh;
           if (tm && tm._origMat) tm.material = tm._origMat;
       });
    }
  } else {
    if (window.generatedMesh) window.generatedMesh.visible = false;
    
    originalMeshes.forEach(item => {
      const targetMesh = item.mesh || item.threeMesh;
      if (!targetMesh || !targetMesh.geometry || !item.originalPositions) return;
      const origPos = item.originalPositions;
      const curAttr = targetMesh.geometry.attributes.position;
      const curIndex = targetMesh.geometry.index;
      const needsNewGeom = !curAttr || curAttr.array.length !== origPos.length || (item.originalIndices && (!curIndex || curIndex.count !== item.originalIndices.length));
      if (needsNewGeom) {
        const newGeom = new THREE.BufferGeometry();
        newGeom.setAttribute('position', new THREE.Float32BufferAttribute(origPos, 3));
        if (item.originalIndices) newGeom.setIndex(new THREE.BufferAttribute(item.originalIndices, 1));
        newGeom.computeVertexNormals();
        targetMesh.geometry.dispose();
        targetMesh.geometry = newGeom;
      } else {
        for (let i = 0; i < origPos.length; i++) curAttr.array[i] = origPos[i];
        curAttr.needsUpdate = true;
        if (item.originalIndices && curIndex) {
          for (let i = 0; i < item.originalIndices.length; i++) curIndex.array[i] = item.originalIndices[i];
          curIndex.needsUpdate = true;
        }
        targetMesh.geometry.computeVertexNormals();
      }
      if (targetMesh.material) {
        targetMesh.material.wireframe = false;
        if (targetMesh._origMat) targetMesh.material = targetMesh._origMat;
        targetMesh.material.needsUpdate = true;
      }
      targetMesh.visible = true;
    });
  }
