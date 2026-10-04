$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9260
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

    $r = Eval-JS @"
    (() => {
        const meshes = window.originalMeshes || [];
        const res = meshes.map((m, idx) => {
            const tm = m.mesh || m.threeMesh;
            const geom = tm ? tm.geometry : null;
            return {
                idx,
                name: tm ? tm.name : 'unknown',
                hasGeom: !!geom,
                vertCount: geom && geom.attributes.position ? geom.attributes.position.count : 0,
                hasIndex: geom && !!geom.index,
                indexCount: geom && geom.index ? geom.index.count : 0,
                bounds: geom ? {
                    minX: geom.boundingBox ? geom.boundingBox.min.x : null,
                    maxX: geom.boundingBox ? geom.boundingBox.max.x : null,
                    minY: geom.boundingBox ? geom.boundingBox.min.y : null,
                    maxY: geom.boundingBox ? geom.boundingBox.max.y : null,
                    minZ: geom.boundingBox ? geom.boundingBox.min.z : null,
                    maxZ: geom.boundingBox ? geom.boundingBox.max.z : null
                } : null
            };
        });
        return JSON.stringify(res);
    })()
"@
    Write-Output "MESHES INFO: $r"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
