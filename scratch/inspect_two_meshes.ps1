$port = 9224
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($expr) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Start-Sleep -Seconds 2
    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    $res = Send-CDP @'
    (() => {
        return JSON.stringify(window.originalMeshes.map((m, idx) => {
            const pos = m.originalPositions;
            let minY = Infinity, maxY = -Infinity;
            let minX = Infinity, maxX = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < pos.length; i += 3) {
                if (pos[i] < minX) minX = pos[i];
                if (pos[i] > maxX) maxX = pos[i];
                if (pos[i+1] < minY) minY = pos[i+1];
                if (pos[i+1] > maxY) maxY = pos[i+1];
                if (pos[i+2] < minZ) minZ = pos[i+2];
                if (pos[i+2] > maxZ) maxZ = pos[i+2];
            }
            return {
                idx,
                vertCount: pos.length / 3,
                xRange: [minX, maxX],
                yRange: [minY, maxY],
                zRange: [minZ, maxZ]
            };
        }));
    })()
'@
    Write-Output $res
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
