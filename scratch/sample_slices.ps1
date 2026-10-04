$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9288
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

    # Sample a profile along X from +4.0 down to -6.0
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Sample along X in slices
        const slices = [];
        for (let x = 4.0; x >= -6.0; x -= 1.0) {
            let floorPts = [];
            let ceilPts = [];
            for (let i = 0; i < pos.length; i += 3) {
                const vx = pos[i], vy = pos[i+1], vz = pos[i+2];
                const nx = norm[i], ny = norm[i+1], nz = norm[i+2];
                if (Math.abs(vx - x) < 0.6) {
                    if (vy < 8.0 && ny > 0.4) {
                        floorPts.push({ x: +vx.toFixed(2), y: +vy.toFixed(2), z: +vz.toFixed(2), ny: +ny.toFixed(2) });
                    }
                    if (vy > 8.8 && ny < 0.2) {
                        ceilPts.push({ x: +vx.toFixed(2), y: +vy.toFixed(2), z: +vz.toFixed(2), ny: +ny.toFixed(2) });
                    }
                }
            }
            // Sort by Z to see extent in Z
            floorPts.sort((a,b) => a.z - b.z);
            ceilPts.sort((a,b) => a.z - b.z);
            slices.push({
                x: x,
                floorZRange: floorPts.length ? [floorPts[0].z, floorPts[floorPts.length-1].z] : null,
                floorAvgY: floorPts.length ? +(floorPts.reduce((s,p)=>s+p.y, 0)/floorPts.length).toFixed(2) : null,
                floorEdgeMaxZ: floorPts.length ? floorPts[floorPts.length-1] : null,
                ceilZRange: ceilPts.length ? [ceilPts[0].z, ceilPts[ceilPts.length-1].z] : null,
                ceilAvgY: ceilPts.length ? +(ceilPts.reduce((s,p)=>s+p.y, 0)/ceilPts.length).toFixed(2) : null,
                ceilEdgeMaxZ: ceilPts.length ? ceilPts[ceilPts.length-1] : null
            });
        }
        return JSON.stringify(slices);
    })()
"@
    Write-Output "SLICES:"
    $jsonRes = $res | ConvertFrom-Json
    Write-Output $jsonRes.result.result.value

} finally {
    $proc.Kill()
}
