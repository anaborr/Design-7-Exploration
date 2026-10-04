  // RULE 1: GROWTH (G)
  if (upperRule === 'GROWTH' || upperRule === 'G') {
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      // Only grow top perimeter
      if (y > centerY + spanY * 0.25) {
        let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
        if (dist > domSpan * 0.3) {
           out[i+1] += strength * spanY * 0.15; // Extrude upward
        }
      }
    }
  }
  // RULE 2: BRANCHING (B)
  else if (upperRule === 'BRANCHING' || upperRule === 'B') {
    // Localized column creation: pull ceiling vertices down at specific grid points
    let cols = [
      {x: centerX + spanX*0.25, z: centerZ + spanZ*0.25},
      {x: centerX - spanX*0.25, z: centerZ + spanZ*0.25},
      {x: centerX + spanX*0.25, z: centerZ - spanZ*0.25},
      {x: centerX - spanX*0.25, z: centerZ - spanZ*0.25}
    ];
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      if (y > centerY) { // ceiling area
        for (let c of cols) {
          let dist = Math.sqrt((x - c.x)*(x - c.x) + (z - c.z)*(z - c.z));
          if (dist < domSpan * 0.15) {
            let pull = Math.pow(1.0 - (dist / (domSpan * 0.15)), 2) * strength;
            out[i+1] -= pull * (y - minY); // pull down to floor
          }
        }
      }
    }
  }
  // RULE 3: WHIPLASH (W)
  else if (upperRule === 'WHIPLASH' || upperRule === 'W') {
    // Only apply whiplash to the perimeter boundaries, preserving the core interior
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
      let uY = (y - minY) / spanY;
      
      // If it's near the outer boundary (edge of the seed)
      if (dist > domSpan * 0.4) {
        let edgeWeight = Math.min(1.0, (dist - domSpan * 0.4) / (domSpan * 0.1));
        let theta = Math.atan2(z - centerZ, x - centerX);
        let twist = Math.sin(uY * Math.PI * 2.0 + theta) * strength * spanY * 0.1;
        out[i+1] += twist * edgeWeight; // Wave the edges up and down
        
        // Slight S-curve bulging
        let bulge = Math.sin(uY * Math.PI) * strength * domSpan * 0.05;
        out[i] += Math.cos(theta) * bulge * edgeWeight;
        out[i+2] += Math.sin(theta) * bulge * edgeWeight;
      }
    }
  }
  // RULE 4: MERGING (M)
  else if (upperRule === 'MERGING' || upperRule === 'M') {
    // Localized merging: smooths/flattens the roof or floor
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      if (y > maxY - spanY*0.1) {
         out[i+1] -= (y - (maxY - spanY*0.05)) * strength;
      }
    }
  }
  // RULE 5: POSNEG (V)
  else if (upperRule === 'POSNEG' || upperRule === 'V' || upperRule === 'POSITIVE_NEGATIVE') {
    // Creates actual architectural voids depending on Typology
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let dx = x - centerX, dz = z - centerZ;
      let dist = Math.sqrt(dx*dx + dz*dz);
      
      if (activeTypology === 'VERTICAL_VOID' || activeTypology === 'VOID_FIELD_GATHERING') {
         // Create a central atrium by pushing points outward
         let voidRad = domSpan * 0.2 * strength;
         if (dist < voidRad && dist > 0.001) {
            let push = (voidRad - dist);
            out[i] += (dx/dist) * push;
            out[i+2] += (dz/dist) * push;
         }
      } else if (activeTypology === 'LINEAR_GALLERY' || activeTypology === 'AXIAL_ENFILADE') {
         // Create a linear trench along X axis
         let voidW = spanZ * 0.2 * strength;
         if (Math.abs(dz) < voidW) {
            let push = (voidW - Math.abs(dz)) * Math.sign(dz || 1);
            out[i+2] += push;
         }
      }
    }
  }
  // RULE 6: CONTINUITY (C)
  else if (upperRule === 'CONTINUITY' || upperRule === 'C' || upperRule === 'MERGE_CONTINUITY') {
    // Fluidly blend sharp transitions
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      // Push slightly towards the median Y based on distance from center (aerodynamic shell)
      let dist = Math.sqrt((x - centerX)*(x - centerX) + (z - centerZ)*(z - centerZ));
      let shellCurve = Math.cos((dist / domSpan) * Math.PI * 0.5);
      let targetY = maxY - (1.0 - shellCurve) * spanY * 0.3;
      if (y > centerY) {
         out[i+1] += (targetY - y) * strength * 0.4;
      }
    }
  }
