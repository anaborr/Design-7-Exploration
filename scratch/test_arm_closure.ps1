$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9285
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
            const mesh = window.originalMeshes[0];
            const pos = mesh.originalPositions;
            // Sample vertices at right extremity (x > 15)
            let topCrestY = [], botFootY = [];
            for (let i = 0; i < pos.length; i += 3) {
                let x = pos[i], y = pos[i+1], z = pos[i+2];
                if (x > 15.0) {
                    if (y > 10.0) topCrestY.push(y);
                    else botFootY.push(y);
                }
            }
            topCrestY.sort((a,b)=>a-b);
            botFootY.sort((a,b)=>a-b);
            return {
                topCrestCount: topCrestY.length,
                topCrestRange: [topCrestY[0], topCrestY[topCrestY.length-1]],
                botFootCount: botFootY.length,
                botFootRange: [botFootY[0], botFootY[botFootY.length-1]],
                rightMidY: (topCrestY[0] + botFootY[botFootY.length-1]) / 2
            };
        })()
"@;
        returnByValue = $true
    }
    Write-Output "RIGHT SIDE GEOMETRY:"
    Write-Output (($res | ConvertFrom-Json).result.result.value | ConvertTo-Json -Depth 5)
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
