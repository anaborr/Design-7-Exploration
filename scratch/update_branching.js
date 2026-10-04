const fs = require('fs');

let content = fs.readFileSync('generator.js', 'utf8');

// Regex to find blocks defining typologies and their secondaryPrinciples
const regex = /(principlesBadge:\s*'[^']*)',\s*dominantPrinciple:\s*'[^']*',\s*secondaryPrinciples:\s*\[([^\]]*)\]/g;

content = content.replace(regex, (match, badgePart, principlesInner) => {
    // If it already has BRANCHING, skip
    if (principlesInner.includes('BRANCHING')) {
        return match;
    }
    
    // Add BRANCHING to principlesBadge if not there
    let newBadge = badgePart;
    if (!newBadge.includes('BRANCHING')) {
        newBadge += ' + BRANCHING (B)';
    }

    // Add 'BRANCHING' to secondaryPrinciples
    let newInner = principlesInner.trim();
    if (newInner.length > 0) {
        newInner += ", 'BRANCHING'";
    } else {
        newInner = "'BRANCHING'";
    }

    // reconstruct the match
    // we need to be careful because we matched the whole block.
    // Actually, a simpler replace using the captured string:
    return match.replace(badgePart, newBadge).replace(principlesInner, newInner);
});

fs.writeFileSync('generator.js', content, 'utf8');
console.log('Updated generator.js');
