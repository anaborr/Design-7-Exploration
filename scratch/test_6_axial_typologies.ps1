$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9252
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
        $parsed = $r | ConvertFrom-Json
        if ($parsed.result.exceptionDetails) {
            Write-Output ("JS EXCEPTION: " + ($parsed.result.exceptionDetails | ConvertTo-Json -Depth 5))
        }
        return $parsed.result.result.value
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $typos = Eval-JS @"
    (() => {
        const typologies = [
            'VERTICAL_VOID',
            'COMPRESSED_EXPANDED',
            'OPEN_HALL',
            'STEPPED_TERRACES',
            'LINEAR_GALLERY',
            'FOLDED_FACETS'
        ];

        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const dna = [0.60, 0, 0, 0, 0, 0]; // Medium-High Continuity (60%)
        const results = {};

        for (const typo of typologies) {
            if (window.domainState) window.domainState.selectedTypology = typo;
            const defPos = window.applyArtNouveauDNA(origPos, dna, bounds, 75, true, typo);
            let maxDx = 0, maxDy = 0, maxDz = 0;
            for (let i = 0; i < origPos.length; i += 3) {
                let dx = Math.abs(defPos[i] - origPos[i]);
                let dy = Math.abs(defPos[i+1] - origPos[i+1]);
                let dz = Math.abs(defPos[i+2] - origPos[i+2]);
                if (dx > maxDx) maxDx = dx;
                if (dy > maxDy) maxDy = dy;
                if (dz > maxDz) maxDz = dz;
            }
            results[typo] = {
                max_dx_feet: Number(maxDx.toFixed(3)),
                max_dy_feet: Number(maxDy.toFixed(3)),
                max_dz_feet: Number(maxDz.toFixed(3)),
                x_plane_active: maxDx > 0.01,
                y_plane_active: maxDy > 0.01,
                z_plane_active: maxDz > 0.01,
                all_3_planes_active: (maxDx > 0.01 && maxDy > 0.01 && maxDz > 0.01)
            };
        }
        return JSON.stringify(results);
    })()
"@
    Write-Output "AXIAL CONTINUITY RESULTS ACROSS ALL 6 DOMAIN A TYPOLOGIES:"
    Write-Output $typos

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
