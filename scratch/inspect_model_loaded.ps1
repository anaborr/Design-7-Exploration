$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($method, $params) {
        $payload = @{ id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        
        $ms = New-Object System.IO.MemoryStream
        $buf = [byte[]]::new(65536)
        while ($true) {
            $seg = [System.ArraySegment[byte]]::new($buf)
            $r = $ws.ReceiveAsync($seg, $ct).Result
            $ms.Write($buf, 0, $r.Count)
            if ($r.EndOfMessage) { break }
        }
        return [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
    }

    function Eval-JS($code) {
        $r = Send-CDP "Runtime.evaluate" @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        $j = $r | ConvertFrom-Json
        return $j.result.result.value
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $res = Eval-JS @"
    (() => {
        const b = window.getModelBounds ? window.getModelBounds() : null;
        const meshes = window.originalMeshes || [];
        if (meshes.length === 0 || !meshes[0].originalPositions) return { error: 'No mesh' };
        const pos = meshes[0].originalPositions;
        
        // Analyze elevation (Y) profile across X zones
        // Zones:
        // Zone 1: X in [-5, 2]
        // Zone 2: X in [2, 8]
        // Zone 3: X in [8, 15]
        function getZoneStats(minX, maxX) {
            let minY = 999, maxY = -999, count = 0;
            let ys = [];
            for (let i = 0; i < pos.length; i += 3) {
                if (pos[i] >= minX && pos[i] < maxX) {
                    ys.push(pos[i+1]);
                    if (pos[i+1] < minY) minY = pos[i+1];
                    if (pos[i+1] > maxY) maxY = pos[i+1];
                    count++;
                }
            }
            ys.sort((a,b) => a - b);
            return {
                count,
                minY,
                maxY,
                medianY: ys[Math.floor(ys.length / 2)],
                p10: ys[Math.floor(ys.length * 0.1)],
                p90: ys[Math.floor(ys.length * 0.9)]
            };
        }

        return {
            bounds: b,
            totalVerts: pos.length / 3,
            gallery: getZoneStats(-5, 2),
            ramp: getZoneStats(2, 8),
            atrium: getZoneStats(8, 16)
        };
    })()
"@
    Write-Output ($res | ConvertTo-Json)
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
