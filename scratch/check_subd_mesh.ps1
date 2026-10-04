$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9263
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", '--disable-gpu', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([uri]$pages[0].webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    $script:reqId = 1
    function Send-CDP($method, $params = @{}) {
        $id = $script:reqId++
        $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
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
            if ($json.id -eq $id) { return $msg }
        }
    }
    Send-CDP 'Runtime.enable' | Out-Null
    Start-Sleep -Seconds 3
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 5
    $eval = Send-CDP 'Runtime.evaluate' @{ expression = @"
        (() => {
            const meshes = window.originalMeshes || [];
            return meshes.map((m, idx) => {
                const tm = m.mesh || m.threeMesh;
                return {
                    idx: idx,
                    name: tm ? tm.name : '',
                    vertCount: tm && tm.geometry && tm.geometry.attributes.position ? tm.geometry.attributes.position.count : 0,
                    faceCount: tm && tm.geometry && tm.geometry.index ? tm.geometry.index.count / 3 : 0,
                    bounds: tm && tm.geometry ? tm.geometry.boundingBox : null
                };
            });
        })()
"@; awaitPromise = $true; returnByValue = $true }
    Write-Output "SCENE MESHES:"
    Write-Output (($eval | ConvertFrom-Json).result.result.value | ConvertTo-Json -Depth 5)
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
