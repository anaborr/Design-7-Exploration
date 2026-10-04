$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9339
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
        $parsed = $r | ConvertFrom-Json
        return $parsed.result.result.value
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 4

    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return 'no mesh';
        const pos = mesh.geometry.attributes.position.array;
        const b = window.getModelBounds ? window.getModelBounds() : null;
        const minX = b.min.x, maxX = b.max.x, spanX = maxX - minX;
        const minY = b.min.y, maxY = b.max.y, spanY = maxY - minY;
        const minZ = b.min.z, maxZ = b.max.z, spanZ = maxZ - minZ;

        // Count vertices by uX slices and uY slices
        let uXBuckets = [0,0,0,0,0,0,0,0,0,0];
        let uYBuckets = [0,0,0,0,0,0,0,0,0,0];
        let cantileverUndersideVerts = 0;

        for (let i = 0; i < pos.length; i += 3) {
            let uX = (pos[i] - minX) / spanX;
            let uY = (pos[i+1] - minY) / spanY;
            let bx = Math.min(9, Math.max(0, Math.floor(uX * 10)));
            let by = Math.min(9, Math.max(0, Math.floor(uY * 10)));
            uXBuckets[bx]++;
            uYBuckets[by]++;
            if (uX >= 0.05 && uX <= 0.55 && uY >= 0.15 && uY <= 0.65) {
                cantileverUndersideVerts++;
            }
        }
        return JSON.stringify({
            totalVerts: pos.length / 3,
            uXBuckets,
            uYBuckets,
            cantileverUndersideVerts
        });
    })()
"@
    Write-Output $res
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
