$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9376
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
        $parsed = $r | ConvertFrom-Json
        return $parsed.result.result.value
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 4

    $spaceStats = Eval-JS @'
    (() => {
        const p = window.originalMeshes[0].originalPositions;
        
        // Let's sample points between x in [-4, 4] and z in [-9, 0]
        let floorVerts = [];
        let ceilingVerts = [];
        
        for (let i = 0; i < p.length; i += 3) {
            let x = p[i], y = p[i+1], z = p[i+2];
            if (x >= -4 && x <= 4 && z >= -9 && z <= 0) {
                // Check if in lower plate top surface (y around 6.5 to 7.8)
                if (y >= 6.2 && y <= 7.8) {
                    floorVerts.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
                }
                // Check if in upper plate bottom surface (y around 9.5 to 11.0)
                if (y >= 9.5 && y <= 11.2) {
                    ceilingVerts.push({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
                }
            }
        }
        
        return {
            floorCount: floorVerts.length,
            ceilingCount: ceilingVerts.length,
            floorSamples: floorVerts.slice(0, 10),
            ceilingSamples: ceilingVerts.slice(0, 10)
        };
    })()
'@

    Write-Host ($spaceStats | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
