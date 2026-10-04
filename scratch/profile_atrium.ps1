$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
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
        const pts = [];
        for (let i = 0; i < pos.length; i += 3) {
            pts.push({ x: pos[i], y: pos[i+1], z: pos[i+2] });
        }
        
        const details = {};
        for (let x = 7; x <= 16; x += 1.0) {
            let colPts = pts.filter(p => Math.abs(p.x - x) < 0.4 && Math.abs(p.z - (-4.8)) < 2.5);
            let ys = colPts.map(p => Math.round(p.y * 10) / 10).sort((a,b) => a - b);
            let uniqueYs = Array.from(new Set(ys));
            details['x_' + x] = uniqueYs;
        }
        return details;
    })()
'@
    $res | ConvertTo-Json -Depth 5
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
