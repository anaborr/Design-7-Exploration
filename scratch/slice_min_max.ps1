$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9343
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($expr) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true } } | ConvertTo-Json -Compress
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

    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $r = Send-CDP @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return 'no mesh';
        const pos = mesh.geometry.attributes.position.array;
        const b = window.getModelBounds();
        const minX = b.min.x, maxX = b.max.x, spanX = maxX - minX;
        const minY = b.min.y, maxY = b.max.y, spanY = maxY - minY;

        let slices = {};
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let uX = Math.floor(((x - minX) / spanX) * 10) / 10;
            if (!slices[uX]) slices[uX] = { minY: 999, maxY: -999, count: 0 };
            if (y < slices[uX].minY) slices[uX].minY = y;
            if (y > slices[uX].maxY) slices[uX].maxY = y;
            slices[uX].count++;
        }
        return JSON.stringify(slices);
    })()
"@
    Write-Output $r
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
