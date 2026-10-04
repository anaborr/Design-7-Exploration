  // RULE 3: WHIPLASH (W)
  // Mathematical Implementation: Phyllotaxis and Logarithmic Spirals
  // Spirals form along the golden angle to maximize efficiency (shortest paths).
  else if (upperRule === 'WHIPLASH' || upperRule === 'W') {
    const W = Math.max(0, Math.min(1.0, strength));
    if (W < 0.001) return out;

    const goldenAngle = 2.39996; // 137.508 degrees in radians
    
    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
      
      // Theta increases sequentially based on distance along X (Phyllotactic sequence)
      let theta = uX * goldenAngle * 6.0 * W;
      
      // Logarithmic spiral radius: r = a * e^(b * theta)
      let a = spanY * 0.15 * W;
      let b = 0.25;
      let r = a * Math.exp(b * theta);
      
      // S-curve twisting along the spiral path
      let dx = r * Math.cos(theta) * Math.sin(Math.PI * uY);
      let dz = r * Math.sin(theta) * Math.sin(Math.PI * uY);
      
      // Additional whiplash wave on Y to prevent flat loops
      let dy = spanY * 0.1 * W * Math.sin(2.0 * theta);

      // Smooth falloff towards the edges of the bounding box
      let falloff = Math.sin(Math.PI * uX) * Math.sin(Math.PI * uY);
      
      out[i] += dx * falloff;
      out[i+1] += dy * falloff;
      out[i+2] += dz * falloff;
    }
  }

  // RULE 6: CONTINUITY (C)
  // Mathematical Implementation: Fluid Dynamics / Laminar Streamlines
  // Erases sharp peaks by pulling vertices into overlapping cosine pressure waves
  else if (upperRule === 'CONTINUITY' || upperRule === 'C' || upperRule === 'MERGE_CONTINUITY') {
    const C = Math.max(0, Math.min(1.0, strength));
    if (C < 0.001) return out;

    for (let i = 0; i < out.length; i += 3) {
      let x = out[i], y = out[i+1], z = out[i+2];
      
      let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
      let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));
      
      // Create aerodynamic streamlines (virtual fluid flow along X axis bending around Z)
      let streamLine1 = Math.sin(3.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * uZ);
      let streamLine2 = Math.cos(5.0 * Math.PI * uX) * Math.sin(1.5 * Math.PI * uZ);
      
      // Combine frequencies for organic turbulence reduction
      let flow = (streamLine1 + streamLine2) * 0.5;
      
      // Pull geometry towards the median aerodynamic plane
      let targetY = centerY + flow * spanY * 0.25;
      
      // Stronger continuity pulls high-stress vertices deeper into the stream
      out[i+1] += (targetY - y) * C * 0.85;
      
      // Smooth out horizontal ridges
      out[i] += (centerX - x) * C * flow * 0.15;
      out[i+2] += (centerZ - z) * C * flow * 0.15;
    }
  }
