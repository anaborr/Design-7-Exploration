# Powershell script to verify whiplash mathematical profile
$steps = 20
Write-Output "--- UPPER PLATE PROFILE ---"
for ($i = 0; $i -le $steps; $i++) {
    $t = $i / $steps
    # Upper plate: tip flares up, dips down in middle, inflects and levels out
    $w1 = [Math]::Sin([Math]::PI * $t)
    $sCurve = -1.2 * $w1 * (1.0 - 0.7 * [Math]::Cos([Math]::PI * $t))
    $tipFlare = 0.4 * [Math]::Pow(1.0 - $t, 2.5)
    $yUpper = $sCurve + $tipFlare
    $bar = "=" * [Math]::Max(1, [Math]::Round(($yUpper + 1.5) * 15))
    Write-Output ("t={0:F2}: y={1,6:F3} | {2}" -f $t, $yUpper, $bar)
}

Write-Output "`n--- LOWER PLATE PROFILE ---"
for ($i = 0; $i -le $steps; $i++) {
    $t = $i / $steps
    # Lower plate: dips down near start, arches up in middle, dips down, sweeps into loop
    $wave1 = -0.7 * [Math]::Sin(2.0 * [Math]::PI * $t)
    $wave2 = 0.5 * [Math]::Sin([Math]::PI * $t) * [Math]::Cos(1.8 * [Math]::PI * $t)
    $tipDip = -0.5 * [Math]::Pow(1.0 - $t, 3.0)
    $yLower = $wave1 + $wave2 + $tipDip
    $bar = "=" * [Math]::Max(1, [Math]::Round(($yLower + 1.5) * 15))
    Write-Output ("t={0:F2}: y={1,6:F3} | {2}" -f $t, $yLower, $bar)
}
