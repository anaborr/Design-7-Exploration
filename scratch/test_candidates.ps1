$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9235
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
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

    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const geom = mesh.geometry;
        const pos = geom.attributes.position.array;
        const norm = geom.attributes.normal.array;

        // Bounding box of mesh
        geom.computeBoundingBox();
        const bbox = { min: geom.boundingBox.min, max: geom.boundingBox.max };

        // Let's sample a few distinct candidate regions:
        // Region A: Main horizontal seat / deck (y between 1 and 4, normal pointing mostly +Y)
        // Region B: The curved transition/waist (x around 0 to 5, y around 2 to 5)
        // Region C: The flank / edge of the seat
        let candidates = [];
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let nx = norm[i], ny = norm[i+1], nz = norm[i+2];
            
            // Check if vertex is on an upward or slightly inclined surface of the main body
            if (ny > 0.6 && y >= 1.5 && y <= 5.5 && x >= -2.0 && x <= 6.0) {
                candidates.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), nx: +nx.toFixed(2), ny: +ny.toFixed(2), nz: +nz.toFixed(2) });
            }
        }

        return JSON.stringify({
            bbox,
            candidateCount: candidates.length,
            candidates: candidates.filter((_, idx) => idx % 20 === 0).slice(0, 10)
        });
    })()
"@
    Write-Output "RES: $res"
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
