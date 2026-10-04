// Scratch script to test whiplash curve formula against sample image
function testWhiplashCurves() {
    const steps = 20;
    console.log("=== UPPER CURVE ===");
    for (let i = 0; i <= steps; i++) {
        let t = i / steps;
        // Upper curve: starts flat, dips downward around t=0.3-0.5, inflects and levels off
        let sCurve = -Math.sin(Math.PI * t) * (1.0 - 0.6 * Math.cos(Math.PI * t));
        let flick = 0.35 * Math.sin(2.2 * Math.PI * t * t);
        let yDisp = sCurve + flick;
        console.log(`t=${t.toFixed(2)}: yDisp=${yDisp.toFixed(3)}`);
    }

    console.log("\n=== LOWER CURVE ===");
    for (let i = 0; i <= steps; i++) {
        let t = i / steps;
        // Lower curve: dips down at start (t=0.1-0.2), arches up (t=0.4-0.5), dips down (t=0.7-0.8)
        let wave1 = -0.8 * Math.sin(1.8 * Math.PI * t);
        let wave2 = 0.5 * Math.sin(3.2 * Math.PI * t);
        let yDisp = wave1 + wave2;
        console.log(`t=${t.toFixed(2)}: yDisp=${yDisp.toFixed(3)}`);
    }
}

testWhiplashCurves();
