$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9271
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

    # Extract ridge edges and continuous edge paths
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;
        const idx = mesh.geometry.index.array;

        // Build edge to triangle map
        const edgeMap = new Map();
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i], b = idx[i+1], c = idx[i+2];
            const triIdx = i / 3;
            // Triangle normal
            const ax = pos[a*3], ay = pos[a*3+1], az = pos[a*3+2];
            const bx = pos[b*3], by = pos[b*3+1], bz = pos[b*3+2];
            const cx = pos[c*3], cy = pos[c*3+1], cz = pos[c*3+2];
            const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
            const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
            const fnx = e1y * e2z - e1z * e2y;
            const fny = e1z * e2x - e1x * e2z;
            const fnz = e1x * e2y - e1y * e2x;
            const fnLen = Math.hypot(fnx, fny, fnz) || 1;

            [[a,b], [b,c], [c,a]].forEach(([u, v]) => {
                const k = u < v ? u + '_' + v : v + '_' + u;
                if (!edgeMap.has(k)) {
                    edgeMap.set(k, { u, v, tris: [], normals: [] });
                }
                const e = edgeMap.get(k);
                e.tris.push(triIdx);
                e.normals.push({ x: fnx/fnLen, y: fny/fnLen, z: fnz/fnLen });
            });
        }

        // Measure dihedral angle across each edge (dot product of adjacent triangle normals)
        const ridgeEdges = [];
        edgeMap.forEach((e, k) => {
            if (e.normals.length === 2) {
                const n1 = e.normals[0], n2 = e.normals[1];
                const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
                // If dot < 0.92, there is significant curvature / ridge!
                if (dot < 0.90) {
                    const u = e.u, v = e.v;
                    const mx = (pos[u*3] + pos[v*3]) / 2;
                    const my = (pos[u*3+1] + pos[v*3+1]) / 2;
                    const mz = (pos[u*3+2] + pos[v*3+2]) / 2;
                    const len = Math.hypot(pos[u*3] - pos[v*3], pos[u*3+1] - pos[v*3+1], pos[u*3+2] - pos[v*3+2]);
                    ridgeEdges.push({
                        k, u, v, dot: +dot.toFixed(3),
                        mx: +mx.toFixed(2), my: +my.toFixed(2), mz: +mz.toFixed(2),
                        len: +len.toFixed(3)
                    });
                }
            }
        });

        // Group ridge edges by spatial regions
        const groups = {
            cantilever_rim: ridgeEdges.filter(e => e.mx < -6.0),
            top_crest_rim: ridgeEdges.filter(e => e.my > 17.0),
            lower_ground_rim: ridgeEdges.filter(e => e.my < 3.0),
            waist_side_rim: ridgeEdges.filter(e => e.mx >= -2.0 && e.mx <= 8.0 && e.mz > -1.5)
        };

        return JSON.stringify({
            totalRidgeEdges: ridgeEdges.length,
            cantileverRimCount: groups.cantilever_rim.length,
            cantileverRimSample: groups.cantilever_rim.slice(0, 5),
            topCrestRimCount: groups.top_crest_rim.length,
            topCrestRimSample: groups.top_crest_rim.slice(0, 5),
            lowerGroundRimCount: groups.lower_ground_rim.length,
            lowerGroundRimSample: groups.lower_ground_rim.slice(0, 5),
            waistRimCount: groups.waist_side_rim.length,
            waistRimSample: groups.waist_side_rim.slice(0, 5)
        });
    })()
"@
    Write-Output "RIDGE EDGES: $res"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
