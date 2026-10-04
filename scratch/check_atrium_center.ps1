$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($m, $p) {
        $payload = @{ id = 1; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 10
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
        $r = Send-CDP 'Runtime.evaluate' @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return ($r | ConvertFrom-Json).result.result.value
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 3

    $res = Eval-JS @'
    (() => {
        const mesh = window.originalMeshes[0];
        const pos = mesh.originalPositions;
        const bnds = window.getModelBounds ? window.getModelBounds() : null;
        
        let report = [];
        for (let testX = 8.5; testX <= 15.0; testX += 1.0) {
            let pts = [];
            for (let i = 0; i < pos.length; i += 3) {
                if (Math.abs(pos[i] - testX) < 0.4) {
                    pts.push({ x: pos[i], y: pos[i+1], z: pos[i+2] });
                }
            }
            let minZ = Math.min(...pts.map(p => p.z));
            let maxZ = Math.max(...pts.map(p => p.z));
            let centerZ = (minZ + maxZ) / 2;
            
            // Check points within 1 unit of centerZ
            let centralPts = pts.filter(p => Math.abs(p.z - centerZ) < 1.2);
            let ys = centralPts.map(p => Math.round(p.y * 10) / 10).sort((a,b) => a - b);
            let uniqueYs = Array.from(new Set(ys));
            
            report.push({
                x: testX,
                ptCount: pts.length,
                minZ: Math.round(minZ * 10) / 10,
                maxZ: Math.round(maxZ * 10) / 10,
                centerZ: Math.round(centerZ * 10) / 10,
                uniqueYsNearCenter: uniqueYs
            });
        }
        return report;
    })()
'@
    $res | ConvertTo-Json -Depth 5
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
