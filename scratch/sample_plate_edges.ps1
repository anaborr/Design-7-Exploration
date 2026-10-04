$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9279
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

    # Sample the horizontal plate on the left (x < 0)
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Find vertices on the horizontal upper surface of the plate (x between -8 and -2, ny > 0.8)
        let topPlateVerts = [];
        // And vertices on the edge where it turns (e.g. z near 0 or x near -10)
        let endEdgeVerts = [];
        let frontEdgeVerts = [];

        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let nx = norm[i], ny = norm[i+1], nz = norm[i+2];

            if (x < -1 && x > -9 && ny > 0.85) {
                topPlateVerts.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), ny: +ny.toFixed(2) });
            }
            if (x <= -9.5) {
                endEdgeVerts.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), nx: +nx.toFixed(2), ny: +ny.toFixed(2), nz: +nz.toFixed(2) });
            }
            if (x < -1 && x > -9 && z > -0.5 && Math.abs(ny) < 0.7) {
                frontEdgeVerts.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), nx: +nx.toFixed(2), ny: +ny.toFixed(2), nz: +nz.toFixed(2) });
            }
        }

        return JSON.stringify({
            topPlateCount: topPlateVerts.length,
            topPlateSample: topPlateVerts.slice(0, 5),
            endEdgeCount: endEdgeVerts.length,
            endEdgeSample: endEdgeVerts.slice(0, 5),
            frontEdgeCount: frontEdgeVerts.length,
            frontEdgeSample: frontEdgeVerts.slice(0, 5)
        });
    })()
"@
    Write-Output "PLATE SAMPLES: $res"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
