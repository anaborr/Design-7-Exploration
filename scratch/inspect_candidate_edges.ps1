$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
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

    # Let's inspect the triangles of the SubD mesh around the cantilever wing, the upper crest, and the side flank
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;
        const idx = mesh.geometry.index.array;

        // Find face clusters:
        // 1. Cantilever wing end (x < -9.5):
        // Vertices at x < -9.5
        let cVerts = [];
        for (let i = 0; i < pos.length; i += 3) {
            if (pos[i] < -9.5) {
                cVerts.push({
                    x: +pos[i].toFixed(2),
                    y: +pos[i+1].toFixed(2),
                    z: +pos[i+2].toFixed(2),
                    nx: +norm[i].toFixed(2),
                    ny: +norm[i+1].toFixed(2),
                    nz: +norm[i+2].toFixed(2)
                });
            }
        }

        // 2. Upper crest ridge (y > 20.0):
        let crestVerts = [];
        for (let i = 0; i < pos.length; i += 3) {
            if (pos[i+1] > 20.0) {
                crestVerts.push({
                    x: +pos[i].toFixed(2),
                    y: +pos[i+1].toFixed(2),
                    z: +pos[i+2].toFixed(2),
                    nx: +norm[i].toFixed(2),
                    ny: +norm[i+1].toFixed(2),
                    nz: +norm[i+2].toFixed(2)
                });
            }
        }

        // 3. Side flank edge (y between 7 and 14, z near max or min, e.g. outer edge)
        let flankVerts = [];
        for (let i = 0; i < pos.length; i += 3) {
            if (pos[i+1] >= 9 && pos[i+1] <= 13 && pos[i] >= -5 && pos[i] <= 0 && pos[i+2] > -0.5) {
                flankVerts.push({
                    x: +pos[i].toFixed(2),
                    y: +pos[i+1].toFixed(2),
                    z: +pos[i+2].toFixed(2),
                    nx: +norm[i].toFixed(2),
                    ny: +norm[i+1].toFixed(2),
                    nz: +norm[i+2].toFixed(2)
                });
            }
        }

        return JSON.stringify({
            cVertsCount: cVerts.length,
            cVertsSample: cVerts.slice(0, 8),
            crestCount: crestVerts.length,
            crestSample: crestVerts.slice(0, 8),
            flankCount: flankVerts.length,
            flankSample: flankVerts.slice(0, 8)
        });
    })()
"@
    Write-Output "CANDIDATE EDGES: $res"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
