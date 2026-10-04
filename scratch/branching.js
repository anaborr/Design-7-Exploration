  // RULE 2: BRANCHING (B)
  // Mathematical Implementation: Murray's Law, Minimal Path, and Volumetric Deformation
  // Branches bifurcate and pull floor/ceiling together to form organic, thick columns.
  else if (upperRule === 'BRANCHING' || upperRule === 'B') {
    const B = Math.max(0, Math.min(1.0, strength));
    if (B < 0.001) return out;

    // Create minimal-path bifurcating trees
    const numTrunks = Math.max(1, Math.floor(B * 4));
    const trees = [];
    
    for (let t = 0; t < numTrunks; t++) {
      let tRatio = (t + 1) / (numTrunks + 1);
      let bx = minX + spanX * tRatio;
      let bz = centerZ + Math.sin(t * Math.PI) * spanZ * 0.15;
      
      // Murray's law radii
      let rTrunk = spanX * 0.06 * B + 0.5;
      let rBranch = rTrunk / Math.pow(2, 1/3); // bifurcates into 2
      
      let dx = spanX * 0.1 * B;
      let dz = spanZ * 0.12 * B;
      
      trees.push({
        bx: bx, bz: bz,
        rTrunk: rTrunk, rBranch: rBranch,
        dx: dx, dz: dz
      });
    }
    
    // Deform mesh to stretch floor/ceiling into columns with thickness
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      
      // Normalized height (0 at floor, 1 at ceiling)
      let v = Math.min(1, Math.max(0, (y - minY) / spanY));
      
      // Bifurcation split factor (0 at bottom, 1 at top)
      // Trees start splitting at v = 0.4
      let split = smoothstep(0.3, 0.7, v);
      
      let minDist = Infinity;
      let closestCX = x, closestCZ = z;
      let currentR = 0;
      
      for (let t = 0; t < trees.length; t++) {
        let tree = trees[t];
        
        // Branch 1
        let cx1 = tree.bx - tree.dx * split;
        let cz1 = tree.bz + tree.dz * split;
        let dist1 = Math.hypot(x - cx1, z - cz1);
        
        // Branch 2
        let cx2 = tree.bx + tree.dx * split;
        let cz2 = tree.bz - tree.dz * split;
        let dist2 = Math.hypot(x - cx2, z - cz2);
        
        let localMin = Math.min(dist1, dist2);
        if (localMin < minDist) {
          minDist = localMin;
          closestCX = dist1 < dist2 ? cx1 : cx2;
          closestCZ = dist1 < dist2 ? cz1 : cz2;
          currentR = tree.rTrunk * (1 - split) + tree.rBranch * split;
        }
      }
      
      // Influence zone: 2.5x the column radius
      let influence = currentR * 3.5;
      if (minDist < influence) {
        // Smooth organic bell curve for the webbed connection
        let w = 0.5 + 0.5 * Math.cos(Math.PI * minDist / influence);
        
        // 1. Pull Y strongly towards the vertical center to stretch floor/ceiling into a continuous stalactite/stalagmite
        let pullY = (centerY - y) * w * Math.min(1.0, B * 1.5);
        out[i+1] += pullY;
        
        // 2. Add structural THICKNESS: Push/pull X and Z to form the outer wall of the column
        // If we are closer than currentR, we push out. If we are between currentR and influence, we pull in slightly to form a web
        if (minDist > 0.001) {
          let targetX = closestCX + ((x - closestCX) / minDist) * currentR;
          let targetZ = closestCZ + ((z - closestCZ) / minDist) * currentR;
          
          // Smoothly blend the X/Z position towards the column surface
          let blend = Math.pow(w, 1.5) * B; // sharper falloff for the walls
          out[i] += (targetX - x) * blend * 0.8;
          out[i+2] += (targetZ - z) * blend * 0.8;
        }
      }
    }
  }

  function smoothstep(min, max, value) {
    var x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
  }
