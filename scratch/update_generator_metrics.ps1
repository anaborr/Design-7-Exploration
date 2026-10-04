$c = Get-Content 'generator.js' -Raw -Encoding UTF8

$markerStart = "  const mGrowth = document.getElementById('m-growth-cnt');"
$markerEnd = "  updateDesignerChangesUI();"

$idx1 = $c.IndexOf($markerStart)
$idx2 = $c.IndexOf($markerEnd, $idx1)

if ($idx1 -lt 0 -or $idx2 -lt 0) {
    Write-Error "Markers not found in generator.js"
    exit 1
}

$replacement = @"
  const mGrowth = document.getElementById('m-growth-cnt'); if (mGrowth) mGrowth.textContent = Math.floor(1 + 4 * g);

  // Sub-slider live metrics under C, W, B
  const typoKey = domainState.selectedTypology || 'VERTICAL_VOID';
  const typoDef = BASE_TYPOLOGIES[typoKey] || BASE_TYPOLOGIES.VERTICAL_VOID;

  const mWChanges = document.getElementById('metric-w-changes');
  if (mWChanges) mWChanges.textContent = w === 0 ? '0' : (w > 0.6 ? '3 (Inflected)' : (w > 0.25 ? '2 (Curved)' : '1 (Gentle)'));

  const mWCurvature = document.getElementById('metric-w-curvature');
  if (mWCurvature) mWCurvature.textContent = Math.round(w * 85) + '°';

  const mCDisc = document.getElementById('metric-c-disconnected');
  if (mCDisc) mCDisc.textContent = c === 0 ? 'Original' : Math.max(0, Math.round(100 - c * 85)) + '%';

  const mCConn = document.getElementById('metric-c-connected');
  if (mCConn) mCConn.textContent = c === 0 ? '0%' : Math.min(100, Math.round(30 + c * 70)) + '%';

  const mBCnt = document.getElementById('metric-b-count');
  if (mBCnt) mBCnt.textContent = b < 0.05 ? '0' : (b < 0.3 ? '2' : (b < 0.65 ? '3' : '4'));

  const mBDiv = document.getElementById('metric-b-divisions');
  if (mBDiv) mBDiv.textContent = b < 0.05 ? '0' : (b < 0.3 ? '1' : (b < 0.65 ? '4' : '8'));

  const bStatus = document.getElementById('domain-b-influence-status');
  if (bStatus) {
    const isEngaged = (c > 0 || w > 0 || b > 0);
    bStatus.textContent = isEngaged ? `ACTIVE — ${typoDef.name.toUpperCase()} RULES` : 'READY — MODIFY SLIDERS TO ACTIVATE';
  }

  // Rule Validation Panel Checkmarks
  const valCont = document.getElementById('val-rule-cont'); if (valCont) valCont.textContent = c > 0.7 ? '✓ CONTINUOUS FLOW' : (c > 0.3 ? '✓ CONNECTED' : '✓ INDEPENDENT');
  const valBranch = document.getElementById('val-rule-branch'); if (valBranch) valBranch.textContent = b >= 0.6 ? '✓ HIERARCHICAL BRANCHING' : (b >= 0.2 ? '✓ BIFURCATING' : '✓ SINGULAR');
  const valWhip = document.getElementById('val-rule-whip'); if (valWhip) valWhip.textContent = w > 0.6 ? '✓ WHIPLASH INFLECTED' : (w > 0.3 ? '✓ FLOWING CURVATURE' : '✓ LINEAR');
  const valMerge = document.getElementById('val-rule-merge'); if (valMerge) valMerge.textContent = (b >= 0.20) ? (m > 0.6 ? '✓ MERGED / UNIFIED' : '✓ CONVERGING') : '✕ PRECONDITION NOT SATISFIED';
  const valPosNeg = document.getElementById('val-rule-posneg'); if (valPosNeg) valPosNeg.textContent = v > 0.6 ? '✓ INTERLOCK SOLID/VOID' : (v > 0.3 ? '✓ POROUS VOID' : '✓ SOLID ENCLOSED');
  const valGrowth = document.getElementById('val-rule-growth'); if (valGrowth) valGrowth.textContent = g > 0.6 ? '✓ PROLIFERATING GROWTH' : (g > 0.3 ? '✓ EXTENDING GROWTH' : '✓ CONTAINED SEED');

"@

$newCode = $c.Substring(0, $idx1) + $replacement + $c.Substring($idx2)
Set-Content 'generator.js' -Value $newCode -Encoding UTF8
Write-Output "Successfully updated live metrics in generator.js!"
