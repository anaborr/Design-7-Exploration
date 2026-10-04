$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9325
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

    Send-CDP 'Runtime.evaluate' @{ expression = 'window.loadRhinoFromUrl("compressed.3dm")' } | Out-Null
    Start-Sleep -Seconds 4

    $r = Send-CDP 'Runtime.evaluate' @{
        expression = @"
        (() => {
            const b = window.getModelBounds();
            const p = window.getOriginalMeshPositions();
            let yVals = [];
            for (let i = 1; i < p.length; i += 3) yVals.push(p[i]);
            yVals.sort((a,b)=>a-b);
            const p10 = yVals[Math.floor(yVals.length * 0.1)];
            const p50 = yVals[Math.floor(yVals.length * 0.5)];
            const p90 = yVals[Math.floor(yVals.length * 0.9)];
            return {
                bounds: b,
                vertCount: p.length / 3,
                yStats: { min: yVals[0], p10, p50, p90, max: yVals[yVals.length-1] }
            };
        })()
"@
        returnByValue = $true
    }
    Write-Output $r
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
