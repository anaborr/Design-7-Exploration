$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9262
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

    # Analyze mesh edges and open boundaries
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const geom = mesh.geometry;
        const pos = geom.attributes.position.array;
        const idx = geom.index ? geom.index.array : null;

        // Build edge map: edge key -> count of triangles sharing it
        const edgeMap = new Map();
        if (idx) {
            for (let i = 0; i < idx.length; i += 3) {
                const a = idx[i], b = idx[i+1], c = idx[i+2];
                const edges = [[a,b], [b,c], [c,a]];
                edges.forEach(([u, v]) => {
                    const k = u < v ? u + '_' + v : v + '_' + u;
                    if (!edgeMap.has(k)) {
                        edgeMap.set(k, { u, v, count: 0, tris: [] });
                    }
                    const e = edgeMap.get(k);
                    e.count++;
                    e.tris.push(i / 3);
                });
            }
        }

        const openEdges = [];
        edgeMap.forEach(e => {
            if (e.count === 1) {
                openEdges.push(e);
            }
        });

        // Also check guide curves if loaded
        const curvesCount = window.fidelityData && window.fidelityData.curveList ? window.fidelityData.curveList.length : 0;

        return JSON.stringify({
            totalTriangles: idx ? idx.length / 3 : pos.length / 9,
            totalUniqueEdges: edgeMap.size,
            openBoundaryEdgesCount: openEdges.length,
            curvesCount: curvesCount,
            subdCount: window.fidelityData ? window.fidelityData.subdList.length : 0
        });
    })()
"@
    Write-Output "EDGE ANALYSIS: $res"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
