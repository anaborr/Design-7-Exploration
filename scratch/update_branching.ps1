$content = Get-Content 'generator.js' -Raw

$pattern = "(principlesBadge:\s*'[^']*)',\s*dominantPrinciple:\s*'[^']*',\s*secondaryPrinciples:\s*\[([^\]]*)\]"
$evaluator = {
    param($m)
    $badgePart = $m.Groups[1].Value
    $principlesInner = $m.Groups[2].Value

    if ($principlesInner -match 'BRANCHING') {
        return $m.Value
    }

    $newBadge = $badgePart
    if ($newBadge -notmatch 'BRANCHING') {
        $newBadge += ' + BRANCHING (B)'
    }

    $newInner = $principlesInner.Trim()
    if ($newInner.Length -gt 0) {
        $newInner += ", 'BRANCHING'"
    } else {
        $newInner = "'BRANCHING'"
    }

    $res = $m.Value.Replace($badgePart, $newBadge)
    
    # We only want to replace the exact inner string. To be safe:
    $res = $res.Replace("[$principlesInner]", "[$newInner]")
    return $res
}

$content = [regex]::Replace($content, $pattern, $evaluator)

Set-Content 'generator.js' -Value $content
Write-Output 'Updated generator.js'
