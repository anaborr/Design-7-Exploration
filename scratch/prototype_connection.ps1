$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9239
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

    # Inject improved prototype generator directly in page
    $injectResult = Eval-JS @"
    (() => {
        // Let's test a branch source on the curved flank/shoulder of the seat
        // Vertex around x: 3.54, y: 6.0, z: 0.0, normal pointing out/up
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Find candidate on the curved flank
        let bestIdx = -1;
        let bestDist = Infinity;
        const targetX = 3.54, targetY = 6.0, targetZ = 0.0;
        for (let i = 0; i < pos.length; i += 3) {
            const d = Math.hypot(pos[i]-targetX, pos[i+1]-targetY, pos[i+2]-targetZ);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }

        const origin = { x: pos[bestIdx], y: pos[bestIdx+1], z: pos[bestIdx+2] };
        const normal = { x: norm[bestIdx], y: norm[bestIdx+1], z: norm[bestIdx+2] };
        const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
        normal.x /= nLen; normal.y /= nLen; normal.z /= nLen;

        // Tangent along the flank curve towards +Z / outwards
        // Surface tangent at flank: points along the curve
        const tangent = { x: 0.2, y: 0.1, z: 0.97 };
        const tLen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
        tangent.x /= tLen; tangent.y /= tLen; tangent.z /= tLen;

        return JSON.stringify({ origin, normal, tangent });
    })()
"@
    Write-Output "INJECT: $injectResult"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
