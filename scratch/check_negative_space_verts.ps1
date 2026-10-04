$port = 9351
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
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true; awaitPromise = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4
    $res = Send-CDP @'
    (() => {
        const pos = window.originalMeshes[0].originalPositions;
        // Group vertices into spatial zones:
        let cantUndercroft = 0;   // x <= 2, y <= 8.8
        let cantSlit = 0;         // x <= 2, y >= 8.5, y <= 11.5
        let atriumVoidFacing = 0; // x >= 0, x <= 8, y >= 2, y <= 18
        let towerUpper = 0;       // x >= 8, y >= 12
        let transverseGap = 0;    // z between -6.5 and -3.5

        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            if (x <= 2 && y <= 8.8) cantUndercroft++;
            if (x <= 2 && y >= 8.5 && y <= 11.5) cantSlit++;
            if (x >= 0 && x <= 8 && y >= 2 && y <= 18) atriumVoidFacing++;
            if (x >= 8 && y >= 12) towerUpper++;
            if (z >= -6.5 && z <= -3.5) transverseGap++;
        }
        return {
            totalVertices: pos.length / 3,
            cantUndercroft,
            cantSlit,
            atriumVoidFacing,
            towerUpper,
            transverseGap
        };
    })()
'@
    Write-Output $res
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
