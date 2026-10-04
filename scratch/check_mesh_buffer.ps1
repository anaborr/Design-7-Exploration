$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
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
        $j = $r | ConvertFrom-Json
        return $j.result.result.value
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Let's inspect mesh triangles and topology
    $meshInfo = Eval-JS @"
    (() => {
        const meshes = window.originalMeshes || [];
        if (meshes.length === 0) return { error: 'No originalMeshes', count: 0 };
        return {
            count: meshes.length,
            items: meshes.map((m, i) => {
                const pos = m.originalPositions;
                let minX = 999, maxX = -999, minY = 999, maxY = -999, minZ = 999, maxZ = -999;
                for (let j = 0; j < pos.length; j += 3) {
                    if (pos[j] < minX) minX = pos[j];
                    if (pos[j] > maxX) maxX = pos[j];
                    if (pos[j+1] < minY) minY = pos[j+1];
                    if (pos[j+1] > maxY) maxY = pos[j+1];
                    if (pos[j+2] < minZ) minZ = pos[j+2];
                    if (pos[j+2] > maxZ) maxZ = pos[j+2];
                }
                return {
                    index: i,
                    name: m.mesh?.name,
                    vertCount: pos.length / 3,
                    visible: m.mesh?.visible,
                    bounds: { minX, maxX, minY, maxY, minZ, maxZ }
                };
            })
        };
    })()
"@
    Write-Output ($meshInfo | ConvertTo-Json)
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
