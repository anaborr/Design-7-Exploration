  if (!window.getProceduralBaseGeometry) {
    window.getProceduralBaseGeometry = function(bounds, typologyKey) {
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
  }

  if (compMode !== 'SEED' && !isSeedDna) {
    // 1. Hide the original Rhino meshes
    originalMeshes.forEach(item => {
      const tm = item.mesh || item.threeMesh;
      if (tm) tm.visible = false;
    });

    // 2. Setup GeneratedMesh if it doesn't exist
    if (!window.generatedMesh) {
       const mat = new THREE.MeshPhysicalMaterial({
         color: 0xe0e0e0,
         metalness: 0.1,
         roughness: 0.6,
         side: THREE.DoubleSide,
         flatShading: false
       });
       window.generatedMesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
       meshGroup.add(window.generatedMesh);
    }

    // 3. Get the procedurally generated base geometry informed by the seed's bounding box and Domain A
    if (window._lastBaseTypology !== activeTypologyKey || !window._baseGeomData) {
       window._baseGeomData = window.getProceduralBaseGeometry(modelBounds, activeTypologyKey);
       window._lastBaseTypology = activeTypologyKey;
    }
    
    // 4. Apply Art Nouveau Transformations (Domain B)
    let defPos = executeRecipeDeformation(window._baseGeomData.positions, recipeOrDna, modelBounds, true, activeTypologyKey);
    
    // 5. Update the geometry
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

    // Overlay visual style
    if (compMode === 'OVERLAY') {
       window.generatedMesh.material.wireframe = true;
       window.generatedMesh.material.needsUpdate = true;
       // Faintly show original seed
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
           if (tm && tm._origMat) {
               tm.material = tm._origMat;
           }
       });
    }
  } else {
    // Show original SEED geometry, hide GeneratedMesh
    if (window.generatedMesh) window.generatedMesh.visible = false;
