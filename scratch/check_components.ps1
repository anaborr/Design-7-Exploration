$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9265
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", '--disable-gpu', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([uri]$pages[0].webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    $script:reqId = 1
    function Send-CDP($method, $params = @{}) {
        $id = $script:reqId++
        $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()

        $buf = [byte[]]::new(65536)
        while ($true) {
            $msg = ""
            do {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::None).Result
                $msg += [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
            } while (-not $r.EndOfMessage)

            $json = $msg | ConvertFrom-Json
            if ($json.id -eq $id) { return $json }
        }
    }
    Send-CDP 'Runtime.enable' | Out-Null
    Start-Sleep -Seconds 2
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')"; awaitPromise = $true } | Out-Null
    Start-Sleep -Seconds 6

    $eval = Send-CDP 'Runtime.evaluate' @{ expression = @"
    (() => {
        const meshes = window.originalMeshes || [];
        const m = meshes[0];
        if (!m) return 'no mesh';
        const geom = m.mesh.geometry;
        const pos = geom.attributes.position.array;
        const idx = geom.index.array;
        const vertCount = pos.length / 3;

        // Build adjacency
        const adj = Array.from({length: vertCount}, () => []);
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i], b = idx[i+1], c = idx[i+2];
            adj[a].push(b, c);
            adj[b].push(a, c);
            adj[c].push(a, b);
        }

        // BFS connected components
        const visited = new Uint8Array(vertCount);
        const components = [];
        for (let v = 0; v < vertCount; v++) {
            if (visited[v]) continue;
            let compVerts = 0;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
            const queue = [v];
            visited[v] = 1;
            while (queue.length > 0) {
                const curr = queue.pop();
                compVerts++;
                const x = pos[curr*3], y = pos[curr*3+1], z = pos[curr*3+2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                for (let neighbor of adj[curr]) {
                    if (!visited[neighbor]) {
                        visited[neighbor] = 1;
                        queue.push(neighbor);
                    }
                }
            }
            components.push({
                verts: compVerts,
                bounds: { minX, maxX, minY, maxY, minZ, maxZ }
            });
        }
        return {
            totalVerts: vertCount,
            totalFaces: idx.length / 3,
            componentCount: components.length,
            components: components
        };
    })()
"@; awaitPromise = $true; returnByValue = $true }

    Write-Output ($eval.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
