$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 4
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Eval-JS($expression) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expression; returnByValue = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $ms = New-Object System.IO.MemoryStream
        $buf = [byte[]]::new(65536)
        do {
            $seg = [System.ArraySegment[byte]]::new($buf)
            $r = $ws.ReceiveAsync($seg, $ct).Result
            $ms.Write($buf, 0, $r.Count)
        } while (-not $r.EndOfMessage)
        $str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
        return ($str | ConvertFrom-Json).result.result.value
    }

    # Wait for rhinoSubDMesh to load
    for ($i = 0; $i -lt 15; $i++) {
        $loaded = Eval-JS "!!(window.originalMeshes && window.originalMeshes.length > 0 && window.rhinoSubDMesh)"
        if ($loaded) { break }
        Start-Sleep -Seconds 1
    }

    $info = Eval-JS @"
        (() => {
            const b = window.getModelBounds ? window.getModelBounds() : null;
            const meshes = window.originalMeshes || [];
            let totalVerts = 0;
            let sampleStats = {};
            if (meshes.length > 0 && meshes[0].originalPositions) {
                const pos = meshes[0].originalPositions;
                totalVerts = pos.length / 3;
                let minX = 999, maxX = -999, minY = 999, maxY = -999, minZ = 999, maxZ = -999;
                for (let i = 0; i < pos.length; i += 3) {
                    if (pos[i] < minX) minX = pos[i];
                    if (pos[i] > maxX) maxX = pos[i];
                    if (pos[i+1] < minY) minY = pos[i+1];
                    if (pos[i+1] > maxY) maxY = pos[i+1];
                    if (pos[i+2] < minZ) minZ = pos[i+2];
                    if (pos[i+2] > maxZ) maxZ = pos[i+2];
                }
                sampleStats = { minX, maxX, minY, maxY, minZ, maxZ };
            }
            return {
                bounds: b,
                totalVerts: totalVerts,
                stats: sampleStats
            };
        })()
"@
    Write-Output ($info | ConvertTo-Json)
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
