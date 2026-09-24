/**
 * ============================================================================
 * ART NOUVEAU GEOMETRIC SYSTEM - MUTATION ENGINE (STAGE A: TRANSFORM)
 * Applies parametric geometric transformations (Floor -> Wall, Wall -> Ceiling,
 * Floor -> Ramp, Floor -> Seating) directly to imported Rhino 3D geometry vertices.
 * ============================================================================
 */

function mutateRhinoGeometry(sourceObjects, options) {
  if (!sourceObjects || sourceObjects.length === 0) return null;

  console.log('[ART NOUVEAU ENGINE] Executing Stage A TRANSFORM mutation with options:', options);

  const rule = options.rule || 'TRANSFORM';
  const transformType = options.transformType || 'FloorWall';
  const influenceRegion = options.influenceRegion || 'UPPER';
  const bendAngleDeg = options.bendAngle !== undefined ? options.bendAngle : 35;
  const curvatureLevel = options.curvature || 'MEDIUM';
  const mutationStrength = options.mutationStrength !== undefined ? options.mutationStrength : 30;

  const bendRad = (bendAngleDeg * Math.PI) / 180;
  const strengthFactor = mutationStrength / 100;
  const curvatureExponent = curvatureLevel === 'HIGH' ? 0.6 : (curvatureLevel === 'LOW' ? 2.0 : 1.0);

  // 1. Calculate global 3D domain bounds across all source objects
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  sourceObjects.forEach((obj) => {
    if (obj.bounds && obj.bounds.min && obj.bounds.max) {
      minX = Math.min(minX, obj.bounds.min.x);
      minY = Math.min(minY, obj.bounds.min.y);
      minZ = Math.min(minZ, obj.bounds.min.z);
      maxX = Math.max(maxX, obj.bounds.max.x);
      maxY = Math.max(maxY, obj.bounds.max.y);
      maxZ = Math.max(maxZ, obj.bounds.max.z);
    }
  });

  if (minX === Infinity) {
    minX = -50; minY = -50; minZ = -50;
    maxX = 50; maxY = 50; maxZ = 50;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const spanZ = maxZ - minZ || 1;
  const midZ = (minZ + maxZ) / 2;
  const midX = (minX + maxX) / 2;

  // 2. Clone parent objects and apply vertex spatial transformation
  const mutatedObjects = sourceObjects.map((obj, objIdx) => {
    const clonedObj = {
      index: obj.index,
      id: `${obj.id}_G1`,
      name: `${obj.name}_MUTATED`,
      layerIndex: obj.layerIndex,
      type: obj.type,
      rhinoType: obj.rhinoType,
      ctorName: obj.ctorName,
      geom: obj.geom,
      bounds: obj.bounds ? JSON.parse(JSON.stringify(obj.bounds)) : null
    };

    // Transform SubD / Mesh vertices or 3D curve domain
    if (obj.geom) {
      try {
        const vList = typeof obj.geom.vertices === 'function' ? obj.geom.vertices() : obj.geom.vertices;
        if (vList) {
          const vCount = typeof vList.count === 'function' ? vList.count() : (vList.count || 0);

          for (let i = 0; i < vCount; i++) {
            const v = vList.get(i);
            const loc = typeof v.location === 'function' ? v.location() : v.location;
            if (!loc) continue;

            let x = loc[0];
            let y = loc[1];
            let z = loc[2];

            // Determine influence factor w in [0, 1]
            let w = 0.0;
            switch (influenceRegion) {
              case 'UPPER':
                w = Math.max(0, (z - (minZ + spanZ * 0.4)) / (spanZ * 0.6));
                break;
              case 'LOWER':
                w = Math.max(0, ((minZ + spanZ * 0.6) - z) / (spanZ * 0.6));
                break;
              case 'MIDDLE':
                w = 1.0 - Math.min(1.0, Math.abs(z - midZ) / (spanZ * 0.4));
                break;
              case 'START':
                w = Math.max(0, ((minX + spanX * 0.5) - x) / (spanX * 0.5));
                break;
              case 'CENTER':
                w = 1.0 - Math.min(1.0, Math.abs(x - midX) / (spanX * 0.4));
                break;
              case 'END':
                w = Math.max(0, (x - (minX + spanX * 0.5)) / (spanX * 0.5));
                break;
              case 'WHOLE':
              default:
                w = 1.0;
                break;
            }

            w = Math.pow(Math.min(1.0, Math.max(0.0, w)), curvatureExponent);

            if (w > 0.001) {
              const localAngle = bendRad * strengthFactor * w;
              const hOffset = (z - minZ);

              // Apply smooth transformation curve
              let dx = 0, dy = 0, dz = 0;
              if (transformType === 'FloorWall' || transformType === 'WallCeiling') {
                dx = -Math.sin(localAngle) * hOffset * 0.4;
                dz = (Math.cos(localAngle) - 1.0) * hOffset * 0.4 + (spanZ * 0.15 * strengthFactor * w);
                dy = Math.sin(Math.PI * w) * (spanY * 0.2 * strengthFactor);
              } else if (transformType === 'FloorRamp') {
                dz = w * spanZ * 0.3 * strengthFactor;
                dx = w * spanX * 0.1 * strengthFactor;
              } else if (transformType === 'FloorSeating') {
                dy = -Math.sin(localAngle) * hOffset * 0.3;
                dz = (Math.cos(localAngle) - 1.0) * hOffset * 0.2;
              }

              // Update vertex position
              const newX = x + dx;
              const newY = y + dy;
              const newZ = z + dz;

              if (typeof v.setPoint === 'function') {
                v.setPoint(newX, newY, newZ);
              } else if (v.location) {
                loc[0] = newX;
                loc[1] = newY;
                loc[2] = newZ;
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[MUTATION WARNING] Vertex displacement warning for object ${obj.id}:`, err);
      }
    }

    return clonedObj;
  });

  return {
    parentID: 'G0',
    generation: 1,
    recipe: {
      rule: rule,
      transformType: transformType,
      influenceRegion: influenceRegion,
      bendAngle: bendAngleDeg,
      curvature: curvatureLevel,
      mutationStrength: mutationStrength,
      dnaPreservation: 'HIGH (75-90%)'
    },
    mutatedObjects: mutatedObjects
  };
}
