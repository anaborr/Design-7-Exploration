const fs = require('fs');
const appJs = fs.readFileSync('app.js', 'utf8');

// We just need to extract the `applyArtNouveauDNA` function
let match = appJs.match(/function applyArtNouveauDNA\([\s\S]*?\n\}/);
if (match) {
  let fnBody = match[0];
  // mocking
  global.window = {};
  eval(fnBody);

  let positions = new Float32Array(300);
  for(let i=0; i<300; i++) positions[i] = Math.random() * 10 - 5;
  
  let dna = [0, 1.0, 0, 0, 0, 1.0]; // Branching 1.0, Growth 1.0
  let bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5, minZ: -5, maxZ: 5 };
  
  let result = applyArtNouveauDNA(positions, dna, bounds, 10);
  console.log("Original length: " + positions.length);
  console.log("Result length: " + result.length);
} else {
  console.log("Could not find function");
}
