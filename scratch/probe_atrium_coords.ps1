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

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 400
        $c = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes[0]?.originalPositions)"
        if ($c -eq $true) { break }
    }

    $res = Eval-JS @'
    (() => {
        const mesh = window.originalMeshes[0];
        const pos = mesh.originalPositions;
        const pts = [];
        for (let i = 0; i < pos.length; i += 3) {
            pts.push({ x: pos[i], y: pos[i+1], z: pos[i+2] });
        }
        
        const bnds = window.getModelBounds ? window.getModelBounds() : null;
        const centerZ = bnds ? (bnds.min.z + bnds.max.z) / 2 : -4.8;

        const info = {};
        const testXs = [8.6, 10.0, 11.4, 12.8, 14.2];
        for (let tx of testXs) {
            let nearby = pts.filter(p => Math.abs(p.x - tx) < 0.6);
            let zSpan = { minZ: 999, maxZ: -999 };
            let ySpan = { minY: 999, maxY: -999 };
            nearby.forEach(p => {
                if (p.z < zSpan.minZ) zSpan.minZ = p.z;
                if (p.z > zSpan.maxZ) zSpan.maxZ = p.z;
                if (p.y < ySpan.minY) ySpan.minY = p.y;
                if (p.y > ySpan.maxY) ySpan.maxY = p.y;
            });

            // Sample points in Z near centerZ
            let midZPts = nearby.filter(p => Math.abs(p.z - centerZ) < 1.5);
            let ysMid = midZPts.map(p => Math.round(p.y * 10) / 10).sort((a,b) => a - b);
            let uniqueYs = Array.from(new Set(ysMid));

            info['x_' + tx] = {
                count: nearby.length,
                midZCount: midZPts.length,
                zSpan: [Math.round(zSpan.minZ*10)/10, Math.round(zSpan.maxZ*10)/10],
                ySpan: [Math.round(ySpan.minY*10)/10, Math.round(ySpan.maxY*10)/10],
                centerZ: Math.round(centerZ*10)/10,
                uniqueYsInMidZ: uniqueYs
            };
        }
        return info;
    })()
'@
    $res | ConvertTo-Json -Depth 5
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
