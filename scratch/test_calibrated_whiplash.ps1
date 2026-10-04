$steps = 20
$spanY = 20.6
$activeW = 0.70

Write-Output "=== WHIPLASH PROFILE AT W = 70% ==="
Write-Output "--- UPPER PLATE (y > centerY) ---"
for ($i = 0; $i -le $steps; $i++) {
    $t = $i / $steps
    $baseUpper = - [Math]::Sin([Math]::PI * $t) * (1.0 - 0.5 * [Math]::Cos([Math]::PI * $t)) + 0.25 * [Math]::Pow(1.0 - $t, 2.0)
    $harmUpper = if ($activeW -gt 0.3) { ($activeW - 0.3) * 0.4 * [Math]::Sin(2.5 * [Math]::PI * $t) } else { 0 }
    $dY_upper = $activeW * $spanY * 0.35 * ($baseUpper + $harmUpper)
    $bar = "=" * [Math]::Max(1, [Math]::Round(($dY_upper + 6.0) * 4))
    Write-Output ("t={0:F2}: dY={1,6:F2} ft | {2}" -f $t, $dY_upper, $bar)
}

Write-Output "`n--- LOWER PLATE (y < centerY) ---"
for ($i = 0; $i -le $steps; $i++) {
    $t = $i / $steps
    $baseLower = -0.65 * [Math]::Sin(2.0 * [Math]::PI * $t) + 0.45 * [Math]::Sin([Math]::PI * $t) * [Math]::Cos(1.8 * [Math]::PI * $t) - 0.3 * [Math]::Pow(1.0 - $t, 2.5)
    $harmLower = if ($activeW -gt 0.4) { ($activeW - 0.4) * 0.45 * [Math]::Sin(3.5 * [Math]::PI * $t) } else { 0 }
    $dY_lower = $activeW * $spanY * 0.35 * ($baseLower + $harmLower)
    $bar = "=" * [Math]::Max(1, [Math]::Round(($dY_lower + 6.0) * 4))
    Write-Output ("t={0:F2}: dY={1,6:F2} ft | {2}" -f $t, $dY_lower, $bar)
}
