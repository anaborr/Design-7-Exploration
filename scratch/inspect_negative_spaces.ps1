$port = 9350
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
        const mesh = window.originalMeshes[0];
        const pos = mesh.originalPositions;
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }

        // Divide into a 3D grid to see where vertices exist vs where negative space exists
        const nx = 10, ny = 10, nz = 10;
        const grid = new Array(nx * ny * nz).fill(0);
        for (let i = 0; i < pos.length; i += 3) {
            let gx = Math.min(nx - 1, Math.max(0, Math.floor((pos[i] - minX) / (maxX - minX) * nx)));
            let gy = Math.min(ny - 1, Math.max(0, Math.floor((pos[i+1] - minY) / (maxY - minY) * ny)));
            let gz = Math.min(nz - 1, Math.max(0, Math.floor((pos[i+2] - minZ) / (maxZ - minZ) * nz)));
            grid[gx + gy * nx + gz * nx * ny]++;
        }

        // Find cells with 0 vertices that have geometry above or adjacent (interior negative spaces)
        let voidSlices = [];
        for (let gy = 0; gy < ny; gy++) {
            let filledCount = 0;
            let total = nx * nz;
            for (let gx = 0; gx < nx; gx++) {
                for (let gz = 0; gz < nz; gz++) {
                    if (grid[gx + gy * nx + gz * nx * ny] > 0) filledCount++;
                }
            }
            voidSlices.push({
                yLevel: (minY + (gy + 0.5) * (maxY - minY) / ny).toFixed(2),
                filledCells: filledCount,
                emptyCells: total - filledCount
            });
        }

        return {
            bounds: { minX, maxX, minY, maxY, minZ, maxZ },
            span: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
            voidSlices
        };
    })()
'@
    Write-Output $res
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
