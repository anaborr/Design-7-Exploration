$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9251
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
        return ($r | ConvertFrom-Json).result.result.value
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $diag = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const defPos = window.applyArtNouveauDNA(origPos, [0.15, 0, 0, 0, 0, 0], bounds, 75, true, 'VERTICAL_VOID');
        
        let dxs = [], dys = [], dzs = [];
        for (let i = 0; i < 30; i += 3) {
            dxs.push(defPos[i] - origPos[i]);
            dys.push(defPos[i+1] - origPos[i+1]);
            dzs.push(defPos[i+2] - origPos[i+2]);
        }

        let maxDx = 0, maxDy = 0, maxDz = 0;
        for (let i = 0; i < origPos.length; i += 3) {
            let dx = Math.abs(defPos[i] - origPos[i]);
            let dy = Math.abs(defPos[i+1] - origPos[i+1]);
            let dz = Math.abs(defPos[i+2] - origPos[i+2]);
            if (dx > maxDx) maxDx = dx;
            if (dy > maxDy) maxDy = dy;
            if (dz > maxDz) maxDz = dz;
        }

        return {
            bounds: bounds,
            firstSamples: { dxs: dxs.slice(0, 5), dys: dys.slice(0, 5), dzs: dzs.slice(0, 5) },
            maxes: { maxDx: maxDx, maxDy: maxDy, maxDz: maxDz },
            codeMatch: window.applyRule.toString().includes('radCut')
        };
    })()
"@
    Write-Output ($diag | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
