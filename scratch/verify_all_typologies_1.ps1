$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9274
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
        $buf = [byte[]]::new(131072)
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

    # TEST 1: LOBBY TYPOLOGIES - verify all 5 produce distinct geometry with same slider values
    $res1 = Eval-JS @"
    (() => {
        const dna = [0.7, 0.3, 0.6, 0.4, 0.8, 0.5];
        const lobbyTypos = ['VERTICAL_VOID', 'COMPRESSED_SEQUENTIAL', 'CONTINUOUS_HALL', 'TOPOGRAPHIC_GROUND', 'LINEAR_GALLERY'];
        const results = {};
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        lobbyTypos.forEach(k => {
            const pos = window.applyArtNouveauDNA(origPos, dna, bounds, 75, true, k);
            results[k] = Array.from(pos.slice(0, 9));
        });
        // Check all are different from each other
        const keys = Object.keys(results);
        let allDistinct = true;
        const pairs = [];
        for (let i = 0; i < keys.length; i++) {
            for (let j = i+1; j < keys.length; j++) {
                const same = JSON.stringify(results[keys[i]]) === JSON.stringify(results[keys[j]]);
                if (same) allDistinct = false;
                pairs.push({ a: keys[i], b: keys[j], same: same });
            }
        }
        return { allDistinct, pairs, samplePos: results };
    })()
"@
    Write-Output "=== TEST 1: LOBBY TYPOLOGIES (5 types) ==="
    $obj1 = $res1 | ConvertFrom-Json
    Write-Output "All Distinct: $($obj1.allDistinct)"
    $obj1.pairs | ForEach-Object { Write-Output "  $($_.a) vs $($_.b) = same=$($_.same)" }

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
