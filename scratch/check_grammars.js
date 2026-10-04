const fs = require('fs');
const c = fs.readFileSync('generator.js', 'utf8');
const start = c.indexOf('const BASE_TYPOLOGIES = {');
const end = c.indexOf('window.BASE_TYPOLOGIES =');
const code = c.substring(start, end);
eval(code);
for (const k in BASE_TYPOLOGIES) {
  console.log(k, '=>', JSON.stringify(BASE_TYPOLOGIES[k].spatialGrammar));
}
