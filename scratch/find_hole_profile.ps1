$port = 9358
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($expr) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true; awaitPromise = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4
    $res = Send-CDP @'
    (() => {
        const pos = window.originalMeshes[0].originalPositions;
        // Let's shoot rays or find the 2D hole in the X-Y plane at Z = -4.8 (centerZ)
        // Find all vertices with abs(z - (-4.8)) < 1.5
        let centerSlice = [];
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            if (Math.abs(z - (-4.8)) < 1.5) {
                centerSlice.push({ x: +x.toFixed(1), y: +y.toFixed(1) });
            }
        }
        // Find x and y of the opening
        // For each x from -10 to 20, find min Y and max Y
        let xProfile = {};
        for (let pt of centerSlice) {
            let ix = Math.round(pt.x);
            if (!xProfile[ix]) xProfile[ix] = [];
            xProfile[ix].push(pt.y);
        }
        let summary = {};
        for (let ix in xProfile) {
            let ys = xProfile[ix].sort((a,b)=>a-b);
            summary[ix] = {
                count: ys.length,
                minY: ys[0],
                maxY: ys[ys.length-1],
                // If there is an interior void, there will be a gap in ys
                gaps: []
            };
            for (let j = 0; j < ys.length - 1; j++) {
                if (ys[j+1] - ys[j] > 3.0) {
                    summary[ix].gaps.push([ys[j], ys[j+1]]);
                }
            }
        }
        return summary;
    })()
'@
    Write-Output $res
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
