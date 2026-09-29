const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
if (content.includes('geometry.index')) {
  console.log("geometry.index exists");
} else {
  console.log("No geometry.index");
}
