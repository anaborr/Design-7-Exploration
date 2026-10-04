$c = Get-Content 'generator.js' -Raw
$matches = [regex]::Matches($c, "(\w+):\s*\{\s*id:\s*'(\w+)'.*?spatialGrammar:\s*\{([^}]+)\}", [System.Text.RegularExpressions.RegexOptions]::Singleline)
foreach ($m in $matches) {
    Write-Output ($m.Groups[2].Value + " => " + ($m.Groups[3].Value -replace '\s+', ' '))
}
