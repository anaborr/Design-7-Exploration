$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9282
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

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 4

    $res = Send-CDP 'Runtime.evaluate' @{
        expression = @"
        (() => {
            const meshes = window.originalMeshes || [];
            return {
                meshCount: meshes.length,
                details: meshes.map((m, i) => {
                    const pos = m.originalPositions;
                    if (!pos) return { index: i, error: "no pos" };
                    let minY = 1e9, maxY = -1e9;
                    let minX = 1e9, maxX = -1e9;
                    let minZ = 1e9, maxZ = -1e9;
                    for (let j = 0; j < pos.length; j += 3) {
                        if (pos[j] < minX) minX = pos[j];
                        if (pos[j] > maxX) maxX = pos[j];
                        if (pos[j+1] < minY) minY = pos[j+1];
                        if (pos[j+1] > maxY) maxY = pos[j+1];
                        if (pos[j+2] < minZ) minZ = pos[j+2];
                        if (pos[j+2] > maxZ) maxZ = pos[j+2];
                    }
                    return {
                        index: i,
                        verts: pos.length / 3,
                        xRange: [Number(minX.toFixed(1)), Number(maxX.toFixed(1))],
                        yRange: [Number(minY.toFixed(1)), Number(maxY.toFixed(1))],
                        zRange: [Number(minZ.toFixed(1)), Number(maxZ.toFixed(1))]
                    };
                })
            };
        })()
"@;
        returnByValue = $true
    }
    Write-Output "MESH ANALYSIS:"
    Write-Output (($res | ConvertFrom-Json).result.result.value | ConvertTo-Json -Depth 5)
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
