$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9273
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
        $obj = $r | ConvertFrom-Json
        if ($obj.result.result.value) { return $obj.result.result.value }
        if ($obj.result.result.description) { return $obj.result.result.description }
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $res = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const testDnas = [
            { name: 'Whiplash 50%', dna: [0, 0, 0.5, 0, 0, 0] },
            { name: 'Continuity 50%', dna: [0.5, 0, 0, 0, 0, 0] },
            { name: 'Branching 50%', dna: [0, 0.5, 0, 0, 0, 0] }
        ];

        const typologies = ['VERTICAL_VOID', 'LINEAR_GALLERY', 'COMPRESSED_SEQUENTIAL', 'TOPOGRAPHIC_GROUND', 'CONTINUOUS_HALL'];
        const results = {};

        typologies.forEach(tKey => {
            results[tKey] = {};
            testDnas.forEach(td => {
                const defPos = window.applyArtNouveauDNA(origPos, td.dna, bounds, 75, true, tKey);
                let diffCount = 0;
                let maxDiff = 0;
                let sumDiff = 0;
                for (let i = 0; i < origPos.length; i++) {
                    const d = Math.abs(defPos[i] - origPos[i]);
                    if (d > 0.001) diffCount++;
                    if (d > maxDiff) maxDiff = d;
                    sumDiff += d;
                }
                results[tKey][td.name] = {
                    diffCount: diffCount,
                    maxDiff: maxDiff.toFixed(3),
                    avgDiff: (sumDiff / (origPos.length / 3)).toFixed(3),
                    slice: Array.from(defPos.slice(0, 6)).map(v => v.toFixed(3))
                };
            });
        });

        // Also check if selecting typology alone produces 0 change
        const zeroPosVertical = window.applyArtNouveauDNA(origPos, [0,0,0,0,0,0], bounds, 75, true, 'VERTICAL_VOID');
        const zeroPosGallery = window.applyArtNouveauDNA(origPos, [0,0,0,0,0,0], bounds, 75, true, 'LINEAR_GALLERY');
        let zeroDiff = 0;
        for (let i = 0; i < origPos.length; i++) {
            if (zeroPosVertical[i] !== origPos[i] || zeroPosGallery[i] !== origPos[i]) zeroDiff++;
        }

        return {
            zeroDiff: zeroDiff,
            results: results
        };
    })()
"@
    Write-Output ($res | ConvertTo-Json -Depth 6)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force
    }
    if (Test-Path $tempProfile) {
        Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
}
