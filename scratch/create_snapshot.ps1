$dest = 'snapshots\nouvogen-v1'
if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
}

$files = @(
    'index.html',
    'style.css',
    'app.js',
    'generator.js',
    'branchingEngine.js',
    'rhinoEngine.js',
    'artNouveauEngine.js',
    'continuityEngine.js',
    'evolutionEngine.js',
    'evaluator.js',
    'reasoningEngine.js',
    'descriptors.js',
    'typologies.js',
    'compressed.3dm',
    'd3-delaunay.min.js'
)

foreach ($f in $files) {
    if (Test-Path $f) {
        Copy-Item -Path $f -Destination $dest -Force
        Write-Output "Copied $f"
    } else {
        Write-Warning "File not found: $f"
    }
}

Get-ChildItem $dest | Select-Object Name, Length
