$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9266
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
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 4

    $eval = Send-CDP 'Runtime.evaluate' @{ expression = @"
    (async () => {
        const resp = await fetch('compressed.3dm');
        const buf = await resp.arrayBuffer();
        const doc = rhino.File3dm.fromByteArray(new Uint8Array(buf));
        const layers = [];
        for (let l = 0; l < doc.layers().count; l++) {
            layers.push(doc.layers().get(l).name);
        }
        const objs = doc.objects();
        const res = [];
        for (let i = 0; i < objs.count; i++) {
            const o = objs.get(i);
            const g = o.geometry();
            if (!g) continue;
            if (g.objectType === rhino.ObjectType.SubD || g.objectType === rhino.ObjectType.Mesh) {
                const attrs = o.attributes();
                res.push({
                    idx: i,
                    type: g.objectType === rhino.ObjectType.SubD ? 'SubD' : 'Mesh',
                    name: attrs.name || '',
                    layerIndex: attrs.layerIndex,
                    layerName: layers[attrs.layerIndex] || ''
                });
            }
        }
        return { layers, objects: res };
    })()
"@; awaitPromise = $true; returnByValue = $true }

    Write-Output ($eval.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
