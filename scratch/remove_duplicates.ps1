# Remove duplicate stale content from generator.js
$lines = Get-Content 'generator.js'
$total = $lines.Count

# Find the boundaries of the old duplicate BASE_TYPOLOGIES body
# It starts with "  // --- LOBBY / ENTRANCE TYPOLOGIES" right after first window.BASE_TYPOLOGIES
# and ends at the second "window.BASE_TYPOLOGIES = BASE_TYPOLOGIES;"
# Lines 2137-2788 (1-indexed) are the old body

# Find the boundaries of the old TYPOLOGY_DOMAIN_B_RULES body
# It starts right after first window.TYPOLOGY_DOMAIN_B_RULES = TYPOLOGY_DOMAIN_B_RULES;
# and ends at the second window.TYPOLOGY_DOMAIN_B_RULES = ...

$firstBaseMark = -1
$secondBaseMark = -1
$firstRulesMark = -1
$secondRulesMark = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if ($line -eq 'window.BASE_TYPOLOGIES = BASE_TYPOLOGIES;') {
        if ($firstBaseMark -eq -1) { $firstBaseMark = $i }
        else { $secondBaseMark = $i }
    }
    if ($line -eq 'window.TYPOLOGY_DOMAIN_B_RULES = TYPOLOGY_DOMAIN_B_RULES;') {
        if ($firstRulesMark -eq -1) { $firstRulesMark = $i }
        else { $secondRulesMark = $i }
    }
}

Write-Output "First BASE_TYPOLOGIES mark: line $($firstBaseMark + 1)"
Write-Output "Second BASE_TYPOLOGIES mark: line $($secondBaseMark + 1)"
Write-Output "First RULES mark: line $($firstRulesMark + 1)"
Write-Output "Second RULES mark: line $($secondRulesMark + 1)"

# Build new lines by excluding:
# - Lines (firstBaseMark+1) through (secondBaseMark) = old BASE_TYPOLOGIES body + second window.BASE_TYPOLOGIES
# - Lines (firstRulesMark+1) through (secondRulesMark) = old TYPOLOGY_DOMAIN_B_RULES body + second window.TYPOLOGY_DOMAIN_B_RULES

$newLines = [System.Collections.Generic.List[string]]::new()

for ($i = 0; $i -lt $lines.Count; $i++) {
    $skip = $false
    
    # Skip old BASE_TYPOLOGIES body (from after first window.BASE_TYPOLOGIES up to and including second window.BASE_TYPOLOGIES)
    if ($i -gt $firstBaseMark -and $i -le $secondBaseMark) {
        $skip = $true
    }
    
    # Skip old TYPOLOGY_DOMAIN_B_RULES body (from after first window.TYPOLOGY... up to and including second window.TYPOLOGY...)
    if ($i -gt $firstRulesMark -and $i -le $secondRulesMark) {
        $skip = $true
    }
    
    if (-not $skip) {
        $newLines.Add($lines[$i])
    }
}

Write-Output "Original lines: $($lines.Count)"
Write-Output "New lines: $($newLines.Count)"
Write-Output "Removed: $($lines.Count - $newLines.Count) lines"

Set-Content 'generator.js' -Value $newLines
Write-Output "Done!"
