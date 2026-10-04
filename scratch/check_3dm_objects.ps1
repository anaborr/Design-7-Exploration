$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9262
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", '--disable-gpu', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([uri]$pages[0].webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    function Send-CDP($method, $params = @{}) {
        $payload = @{ id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()
        $buf = [byte[]]::new(65536)
        $ms = New-Object System.IO.MemoryStream
        while ($true) {
            $seg = [System.ArraySegment[byte]]::new($buf)
            $r = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::None).Result
            $ms.Write($buf, 0, $r.Count)
            if ($r.EndOfMessage) { break }
        }
        return [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
    }
    Send-CDP 'Runtime.enable' | Out-Null
    Start-Sleep -Seconds 3
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 4
    $eval = Send-CDP 'Runtime.evaluate' @{ expression = @"
        (() => {
            const meshes = window.originalMeshes || [];
            return meshes.map((m, i) => {
                const mesh = m.mesh || m.threeMesh;
                return {
                    i: i,
                    name: mesh.name,
                    vertCount: mesh.geometry.attributes.position.count,
                    visible: mesh.visible,
                    bounds: mesh.geometry.boundingBox
                };
            });
        })()
"@; awaitPromise = $true; returnByValue = $true }
    Write-Output "MESHES IN SCENE:"
    Write-Output (($eval | ConvertFrom-Json).result.result.value | ConvertTo-Json -Depth 5)
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
