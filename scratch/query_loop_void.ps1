$port = 9353
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
        // Find the void boundaries:
        // Inside the loop (X between 6 and 18):
        let loopTop = [];
        let loopBot = [];
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            if (x >= 6 && x <= 18) {
                if (y > 10) loopTop.push({ x, y, z });
                else if (y < 8) loopBot.push({ x, y, z });
            }
        }
        return {
            loopTopCount: loopTop.length,
            loopBotCount: loopBot.length,
            xRangeTop: [Math.min(...loopTop.map(p => p.x)), Math.max(...loopTop.map(p => p.x))],
            yRangeTop: [Math.min(...loopTop.map(p => p.y)), Math.max(...loopTop.map(p => p.y))],
            zRangeTop: [Math.min(...loopTop.map(p => p.z)), Math.max(...loopTop.map(p => p.z))],
            xRangeBot: [Math.min(...loopBot.map(p => p.x)), Math.max(...loopBot.map(p => p.x))],
            yRangeBot: [Math.min(...loopBot.map(p => p.y)), Math.max(...loopBot.map(p => p.y))],
            zRangeBot: [Math.min(...loopBot.map(p => p.z)), Math.max(...loopBot.map(p => p.z))]
        };
    })()
'@
    Write-Output $res
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
