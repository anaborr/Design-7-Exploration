$c = Get-Content 'generator.js' -Raw
$matches = [regex]::Matches($c, "id:\s*'(\w+)'.*?spatialGrammar:\s*\{([^}]+)\}", 'Singleline')
foreach ($m in $matches) {
    $id = $m.Groups[1].Value
    $grammar = ($m.Groups[2].Value -replace '\s+', ' ').Trim()
    Write-Output "$id => $grammar"
}
