const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// The Branching Block starts at: "// 2. ORGANIC ART NOUVEAU BRANCHING (B)"
// It ends before: "// 3. WHIPLASH CURVATURE"
// We will replace it entirely.

let branchRegex = /(?s)\/\/ 2\. ORGANIC ART NOUVEAU BRANCHING \(B\).*?(?=\/\/ 3\. WHIPLASH CURVATURE)/;

let newBranch = `// 2. ORGANIC ART NOUVEAU BRANCHING (B) - DISTORT & EXTRUDE
    if (activeB > 0.05) {
      const bSettings = (window.domainState && window.domainState.branchSettings) || {};
      const customForks = bSettings.count ? parseInt(bSettings.count) : null;
      const numForks = customForks || (activeB >= 0.55 ? 3 : 2);
      const customNodeU = (bSettings.pos !== undefined) ? (bSettings.pos / 100) : null;
      const nodeStartU = customNodeU !== null ? Math.min(0.85, Math.max(0.05, customNodeU)) : 0.40;
      const lenMult = (bSettings.length !== undefined) ? (bSettings.length / 100) : 1.0;
      const widthMult = (bSettings.width !== undefined) ? (bSettings.width / 100) : 1.0;
      const hAngleRad = (bSettings.hAngle !== undefined) ? (bSettings.hAngle * Math.PI / 180) : 0;
      const vAngleRad = (bSettings.vAngle !== undefined) ? (bSettings.vAngle * Math.PI / 180) : 0;

      const maxBranchReach = 0.5 * domSpan * lenMult;
      const forkAngle = (60 * (Math.PI / 180)) * widthMult;

      // DISTORT ORIGINAL GEOMETRY
      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], y = temp[i+1], z = temp[i+2];
        let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

        if (u > nodeStartU) {
          let tBranch = (u - nodeStartU) / Math.max(0.001, (1 - nodeStartU));
          let smoothLaunch = 0.5 * (1 - Math.cos(Math.PI * tBranch));
          let growthEnvelope = Math.pow(smoothLaunch, 1.35) * (1.0 + 0.30 * Math.sin(Math.PI * tBranch));

          let dx = x - centerX; let dz = z - centerZ;
          let spatialAngle = Math.atan2(dz, dx);
          let normalizedAngle = (spatialAngle + Math.PI) / (2 * Math.PI);
          let forkSector = Math.floor(normalizedAngle * numForks) % numForks;

          let spreadAngle = (forkSector - (numForks - 1) / 2.0) * forkAngle;
          let dispMagnitude = growthEnvelope * maxBranchReach * activeB * 0.5;

          let sinuousWave = 0.25 * Math.sin(2 * Math.PI * tBranch);
          let branchDx = dispMagnitude * Math.cos(spatialAngle + spreadAngle * 0.6 + sinuousWave + hAngleRad);
          let branchDz = dispMagnitude * Math.sin(spatialAngle + spreadAngle * 0.6 + sinuousWave + hAngleRad);
          let branchDy = dispMagnitude * (0.35 + 0.35 * Math.sin(vAngleRad)) * tBranch;

          temp[i] += branchDx; temp[i+2] += branchDz;
          if (domAxis === 'Y') temp[i+1] += branchDy;
          else if (domAxis === 'X') temp[i] += branchDy;
          else temp[i+2] += branchDy;
        }
      }

      // EXTRUDE NEW GEOMETRY FOR MESHES
      if (isMesh) {
        const numSegments = 6;
        for (let f = 0; f < numForks; f++) {
          let spreadAngle = (f - (numForks - 1) / 2.0) * forkAngle;
          let trianglesFound = 0;
          for (let i = 0; i < temp.length; i += 9) {
            if (i + 8 >= temp.length) break;

            let cx = (temp[i] + temp[i+3] + temp[i+6]) / 3;
            let cy = (temp[i+1] + temp[i+4] + temp[i+7]) / 3;
            let cz = (temp[i+2] + temp[i+5] + temp[i+8]) / 3;
            let domVal = (domAxis === 'X') ? cx : ((domAxis === 'Z') ? cz : cy);
            let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

            // Wide tolerances to guarantee we find triangles
            if (u > nodeStartU - 0.2 && u < nodeStartU + 0.2) {
              let dx = cx - centerX; let dz = cz - centerZ;
              let spatialAngle = Math.atan2(dz, dx);
              let angleDiff = Math.abs(spatialAngle - ((f * Math.PI * 2 / numForks) - Math.PI));
              if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
              
              if (angleDiff < 1.0 && trianglesFound < 3) { 
                trianglesFound++;
                let prevVerts = [{x: temp[i], y: temp[i+1], z: temp[i+2]}, {x: temp[i+3], y: temp[i+4], z: temp[i+5]}, {x: temp[i+6], y: temp[i+7], z: temp[i+8]}];
                for (let seg = 1; seg <= numSegments; seg++) {
                  let tBranch = seg / numSegments;
                  let dispMagnitude = tBranch * maxBranchReach * activeB * 1.5;
                  let branchDx = dispMagnitude * Math.cos(spatialAngle + spreadAngle + hAngleRad);
                  let branchDz = dispMagnitude * Math.sin(spatialAngle + spreadAngle + hAngleRad);
                  let branchDy = dispMagnitude * (0.2 + Math.sin(vAngleRad)) * tBranch;
                  let scale = 1.0 - (0.6 * tBranch); 
                  
                  let nextVerts = [];
                  for(let v = 0; v < 3; v++) {
                    let bx = temp[i + v*3], by = temp[i + v*3 + 1], bz = temp[i + v*3 + 2];
                    let nx = cx + (bx - cx) * scale + branchDx;
                    let ny = cy + (by - cy) * scale + (domAxis === 'Y' ? branchDy : 0);
                    let nz = cz + (bz - cz) * scale + branchDz;
                    if (domAxis === 'X') nx += branchDy;
                    if (domAxis === 'Z') nz += branchDy;
                    nextVerts.push({x: nx, y: ny, z: nz});
                  }
                  newVertices.push(
                    prevVerts[0].x, prevVerts[0].y, prevVerts[0].z, nextVerts[0].x, nextVerts[0].y, nextVerts[0].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z,
                    prevVerts[0].x, prevVerts[0].y, prevVerts[0].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z, prevVerts[1].x, prevVerts[1].y, prevVerts[1].z,
                    prevVerts[1].x, prevVerts[1].y, prevVerts[1].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z,
                    prevVerts[1].x, prevVerts[1].y, prevVerts[1].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z, prevVerts[2].x, prevVerts[2].y, prevVerts[2].z,
                    prevVerts[2].x, prevVerts[2].y, prevVerts[2].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z, nextVerts[0].x, nextVerts[0].y, nextVerts[0].z,
                    prevVerts[2].x, prevVerts[2].y, prevVerts[2].z, nextVerts[0].x, nextVerts[0].y, nextVerts[0].z, prevVerts[0].x, prevVerts[0].y, prevVerts[0].z
                  );
                  if (seg === numSegments) {
                    newVertices.push(nextVerts[0].x, nextVerts[0].y, nextVerts[0].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z);
                  }
                  prevVerts = nextVerts;
                }
              }
            }
          }
        }
      }
    }
    `;

content = content.replace(branchRegex, newBranch);

// The Growth Block starts at: "// 6. GROWTH"
// It ends at: "console.log" (because of my previous edit) or "return combined" or "return temp"

let growthRegex = /(?s)\/\/ 6\. GROWTH.*?(?=    if \(newVertices\.length > 0\))/;

let newGrowth = `// 6. ORGANIC BOTANICAL GROWTH & LOGARITHMIC SPIRAL PROLIFERATION (G)
    if (activeG > 0.05) {
      // DISTORT ORIGINAL GEOMETRY
      for (let i = 0; i < temp.length; i += 3) {
        let x = temp[i], y = temp[i+1], z = temp[i+2];
        let domVal = (domAxis === 'X') ? x : ((domAxis === 'Z') ? z : y);
        let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));

        let dx = x - centerX; let dz = z - centerZ;
        let r = Math.sqrt(dx * dx + dz * dz);
        let theta = Math.atan2(dz, dx);

        let spiralTwist = activeG * 1.25 * Math.PI * Math.pow(u, 1.35);
        let radialExpansion = 1.0 + activeG * 0.55 * Math.pow(u, 1.2) * (1.0 + 0.35 * Math.cos(3 * theta + 2.5 * Math.PI * u));
        let verticalStretch = activeG * 0.48 * domSpan * Math.pow(u, 1.6) * (1.0 + 0.22 * Math.sin(4 * theta));

        let newTheta = theta + spiralTwist;
        let newR = r * radialExpansion;

        temp[i] = centerX + newR * Math.cos(newTheta);
        temp[i+2] = centerZ + newR * Math.sin(newTheta);

        if (domAxis === 'Y') temp[i+1] += verticalStretch;
        else if (domAxis === 'X') temp[i] += verticalStretch;
        else temp[i+2] += verticalStretch;
      }

      // EXTRUDE NEW GEOMETRY FOR MESHES
      if (isMesh) {
        const numOrigins = 3;
        const numSegments = Math.floor(3 + activeG * 8); 
        const growthReach = Math.max(0.1, activeG) * 0.8 * domSpan;

        for (let g = 0; g < numOrigins; g++) {
          let targetU = 0.2 + (g / numOrigins) * 0.6; 
          let trianglesFound = 0;
          
          for (let i = 0; i < temp.length; i += 9) {
            if (i + 8 >= temp.length) break;
            let cx = (temp[i] + temp[i+3] + temp[i+6]) / 3;
            let cy = (temp[i+1] + temp[i+4] + temp[i+7]) / 3;
            let cz = (temp[i+2] + temp[i+5] + temp[i+8]) / 3;
            let domVal = (domAxis === 'X') ? cx : ((domAxis === 'Z') ? cz : cy);
            let u = Math.min(1, Math.max(0, (domVal - domMin) / domSpan));
            
            if (u > targetU - 0.2 && u < targetU + 0.2) {
              let dx = cx - centerX; let dz = cz - centerZ;
              let spatialAngle = Math.atan2(dz, dx);
              let angleDiff = Math.abs(spatialAngle - (g * Math.PI * 2 / numOrigins));
              if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
              
              if (angleDiff < 1.0 && trianglesFound < 3) { 
                trianglesFound++;
                let prevVerts = [{x: temp[i], y: temp[i+1], z: temp[i+2]}, {x: temp[i+3], y: temp[i+4], z: temp[i+5]}, {x: temp[i+6], y: temp[i+7], z: temp[i+8]}];
                for (let seg = 1; seg <= numSegments; seg++) {
                  let t = seg / numSegments;
                  let dispMagnitude = t * growthReach * 1.5;
                  let spiralDx = dispMagnitude * Math.cos(spatialAngle + t * Math.PI);
                  let spiralDz = dispMagnitude * Math.sin(spatialAngle + t * Math.PI);
                  let spiralDy = dispMagnitude * 0.5 * t;
                  let scale = 1.0 - (0.4 * t); 
                  
                  let nextVerts = [];
                  for(let v = 0; v < 3; v++) {
                    let bx = temp[i + v*3], by = temp[i + v*3 + 1], bz = temp[i + v*3 + 2];
                    let nx = cx + (bx - cx) * scale + spiralDx;
                    let ny = cy + (by - cy) * scale + (domAxis === 'Y' ? spiralDy : 0);
                    let nz = cz + (bz - cz) * scale + spiralDz;
                    if (domAxis === 'X') nx += spiralDy;
                    if (domAxis === 'Z') nz += spiralDy;
                    nextVerts.push({x: nx, y: ny, z: nz});
                  }
                  newVertices.push(
                    prevVerts[0].x, prevVerts[0].y, prevVerts[0].z, nextVerts[0].x, nextVerts[0].y, nextVerts[0].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z,
                    prevVerts[0].x, prevVerts[0].y, prevVerts[0].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z, prevVerts[1].x, prevVerts[1].y, prevVerts[1].z,
                    prevVerts[1].x, prevVerts[1].y, prevVerts[1].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z,
                    prevVerts[1].x, prevVerts[1].y, prevVerts[1].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z, prevVerts[2].x, prevVerts[2].y, prevVerts[2].z,
                    prevVerts[2].x, prevVerts[2].y, prevVerts[2].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z, nextVerts[0].x, nextVerts[0].y, nextVerts[0].z,
                    prevVerts[2].x, prevVerts[2].y, prevVerts[2].z, nextVerts[0].x, nextVerts[0].y, nextVerts[0].z, prevVerts[0].x, prevVerts[0].y, prevVerts[0].z
                  );
                  if (seg === numSegments) {
                    newVertices.push(nextVerts[0].x, nextVerts[0].y, nextVerts[0].z, nextVerts[1].x, nextVerts[1].y, nextVerts[1].z, nextVerts[2].x, nextVerts[2].y, nextVerts[2].z);
                  }
                  prevVerts = nextVerts;
                }
              }
            }
          }
        }
      }
    }
`;

content = content.replace(growthRegex, newGrowth);

fs.writeFileSync('app.js', content);
console.log('Done!');
