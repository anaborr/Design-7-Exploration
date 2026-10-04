$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9273
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/' -PassThru
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
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Extract exact edge vertices and normal/tangent vectors for:
    # 1. Cantilever rim: x ~ -9.6, y ~ 11.7
    # 2. Side flank: x ~ 7.3, y ~ 8.1, z ~ 0.23
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Find exact vertex on Cantilever rim (say at z = -4.5, mid-span of the cantilever)
        let bestCIdx = -1, bestCDist = Infinity;
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let d = Math.hypot(x - (-9.8), y - 11.4, z - (-4.5));
            if (d < bestCDist) { bestCDist = d; bestCIdx = i; }
        }

        // Find exact vertex on Side flank (at x = 7.3, y = 8.1, z = 0.23)
        let bestFIdx = -1, bestFDist = Infinity;
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let d = Math.hypot(x - 7.3, y - 8.1, z - 0.23);
            if (d < bestFDist) { bestFDist = d; bestFIdx = i; }
        }

        return JSON.stringify({
            cantileverSource: {
                idx: bestCIdx,
                pos: { x: +pos[bestCIdx].toFixed(3), y: +pos[bestCIdx+1].toFixed(3), z: +pos[bestCIdx+2].toFixed(3) },
                normal: { x: +norm[bestCIdx].toFixed(3), y: +norm[bestCIdx+1].toFixed(3), z: +norm[bestCIdx+2].toFixed(3) }
            },
            flankSource: {
                idx: bestFIdx,
                pos: { x: +pos[bestFIdx].toFixed(3), y: +pos[bestFIdx+1].toFixed(3), z: +pos[bestFIdx+2].toFixed(3) },
                normal: { x: +norm[bestFIdx].toFixed(3), y: +norm[bestFIdx+1], z: +norm[bestFIdx+2].toFixed(3) }
            }
        });
    })()
"@
    Write-Output "SOURCES: $res"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
