$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9234
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
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $analysis = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Group vertices by spatial regions
        // e.g. seat, backrest, arm, base
        let regions = {
            seat: [], // horizontal surface y ~ 1-5, ny > 0.6
            backrest_top: [], // upper curve y > 8, ny > 0.3
            flank_side: [], // side flank
            lower_base: [] // y ~ 0-2
        };

        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let nx = norm ? norm[i] : 0, ny = norm ? norm[i+1] : 1, nz = norm ? norm[i+2] : 0;
            if (ny > 0.7 && y >= 1.0 && y <= 6.0) {
                regions.seat.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), nx: +nx.toFixed(2), ny: +ny.toFixed(2), nz: +nz.toFixed(2) });
            }
            if (y > 9.0 && ny > 0.5) {
                regions.backrest_top.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), nx: +nx.toFixed(2), ny: +ny.toFixed(2), nz: +nz.toFixed(2) });
            }
        }

        return JSON.stringify({
            seatCount: regions.seat.length,
            seatSample: regions.seat.slice(0, 5),
            backrestCount: regions.backrest_top.length,
            backrestSample: regions.backrest_top.slice(0, 5)
        });
    })()
"@
    Write-Output "ANALYSIS: $analysis"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
