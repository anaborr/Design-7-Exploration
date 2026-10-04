$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9285
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

    $r = Eval-JS @"
    (() => {
        const meshes = window.originalMeshes || [];
        const m = meshes[0] ? (meshes[0].mesh || meshes[0].threeMesh) : null;
        if (!m || !m.geometry) return { error: 'no mesh' };
        
        const pos = m.geometry.attributes.position.array;
        const norm = m.geometry.attributes.normal ? m.geometry.attributes.normal.array : null;
        const count = pos.length / 3;
        
        // Find vertices near terrace edge (x ~ 3.5, y ~ 6.1, z ~ -0.6)
        const nearby = [];
        for (let i = 0; i < count; i++) {
            const x = pos[i*3], y = pos[i*3+1], z = pos[i*3+2];
            const d = Math.hypot(x - 3.54, y - 6.14, z - (-0.60));
            if (d < 5.0) {
                nearby.push({
                    idx: i,
                    x: +x.toFixed(3),
                    y: +y.toFixed(3),
                    z: +z.toFixed(3),
                    nx: norm ? +norm[i*3].toFixed(3) : 0,
                    ny: norm ? +norm[i*3+1].toFixed(3) : 0,
                    nz: norm ? +norm[i*3+2].toFixed(3) : 0,
                    d: +d.toFixed(3)
                });
            }
        }
        nearby.sort((a,b) => a.d - b.d);
        
        return {
            totalVerts: count,
            material: {
                color: '#' + m.material.color.getHexString(),
                roughness: m.material.roughness,
                metalness: m.material.metalness,
                side: m.material.side,
                wireframe: m.material.wireframe
            },
            nearby: nearby.slice(0, 15)
        };
    })()
"@

    $res = ($r | ConvertFrom-Json).result.result.value
    $res | ConvertTo-Json -Depth 5
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
