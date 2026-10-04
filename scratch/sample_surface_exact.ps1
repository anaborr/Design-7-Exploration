$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9287
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

    # Sample seed mesh surface at specific (X, Z) locations to find floor Y and ceiling Y
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Sample points along spine:
        const testXZ = [
            { x: 3.5, z: 0.0, label: 'Root Flank' },
            { x: 2.5, z: 1.2, label: 'Terrace Edge 1' },
            { x: 0.5, z: 2.2, label: 'Terrace Edge 2' },
            { x: -1.5, z: 2.5, label: 'Terrace Edge 3' },
            { x: -3.5, z: 1.8, label: 'Outer Terrace' },
            { x: -5.5, z: 0.5, label: 'Cantilever Tip' },
            { x: 1.0, z: -1.0, label: 'Inner Pocket 1' },
            { x: -1.0, z: -2.0, label: 'Inner Pocket 2' },
            { x: -2.5, z: -2.5, label: 'Inner Pocket 3' }
        ];

        const results = [];
        testXZ.forEach(t => {
            // Find floor vertex (closest in XZ, ny > 0.3)
            let bestFloorDist = Infinity;
            let floorPt = null;
            // Find ceiling vertex (closest in XZ, y > 9, ny < 0.2)
            let bestCeilDist = Infinity;
            let ceilPt = null;

            for (let i = 0; i < pos.length; i += 3) {
                const vx = pos[i], vy = pos[i+1], vz = pos[i+2];
                const nx = norm[i], ny = norm[i+1], nz = norm[i+2];
                const dXZ = Math.hypot(vx - t.x, vz - t.z);

                if (dXZ < 1.5) {
                    if (vy < 8.0 && ny > 0.4 && dXZ < bestFloorDist) {
                        bestFloorDist = dXZ;
                        floorPt = { x: +vx.toFixed(2), y: +vy.toFixed(2), z: +vz.toFixed(2), ny: +ny.toFixed(2) };
                    }
                    if (vy > 9.0 && ny < 0.2 && dXZ < bestCeilDist) {
                        bestCeilDist = dXZ;
                        ceilPt = { x: +vx.toFixed(2), y: +vy.toFixed(2), z: +vz.toFixed(2), ny: +ny.toFixed(2) };
                    }
                }
            }
            results.push({ label: t.label, target: t, floor: floorPt, ceil: ceilPt });
        });
        return JSON.stringify(results);
    })()
"@
    Write-Output "SURFACE SAMPLES:"
    $jsonRes = $res | ConvertFrom-Json
    Write-Output $jsonRes.result.result.value

} finally {
    $proc.Kill()
}
