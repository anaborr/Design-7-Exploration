$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9276
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

    # TEST 3: GATHERING TYPOLOGIES + full cross-category check (all 15)
    $res3 = Eval-JS @"
    (() => {
        const dna = [0.7, 0.3, 0.6, 0.4, 0.8, 0.5];
        const gatherTypos = ['STEPPED_AMPHITHEATER', 'VOID_FIELD_GATHERING', 'INSERTED_PLATE', 'CONTAINED_ROOM', 'LINEAR_EDGE_GALLERY'];
        const results = {};
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        gatherTypos.forEach(k => {
            const pos = window.applyArtNouveauDNA(origPos, dna, bounds, 75, true, k);
            results[k] = Array.from(pos.slice(0, 9));
        });
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

        // Also verify Domain A -> Domain B auto-update pipeline works:
        // Select STEPPED_AMPHITHEATER, set slider to 65%, then switch to VOID_FIELD_GATHERING
        window.selectDomainATypology('STEPPED_AMPHITHEATER');
        document.getElementById('slider-dna-w').value = '65';
        document.getElementById('slider-dna-w').dispatchEvent(new Event('input', { bubbles: true }));
        const meshAfterAmphi = window.originalMeshes[0]?.mesh;
        const posAmphi = meshAfterAmphi ? Array.from(meshAfterAmphi.geometry.attributes.position.array.slice(0,6)) : null;

        window.selectDomainATypology('VOID_FIELD_GATHERING');
        const meshAfterVoid = window.originalMeshes[0]?.mesh;
        const posVoid = meshAfterVoid ? Array.from(meshAfterVoid.geometry.attributes.position.array.slice(0,6)) : null;

        return {
            gatheringDistinct: allDistinct,
            pairs: pairs,
            liveUpdateWorks: JSON.stringify(posAmphi) !== JSON.stringify(posVoid),
            posAmphi: posAmphi,
            posVoid: posVoid
        };
    })()
"@
    Write-Output "=== TEST 3: GATHERING TYPOLOGIES + LIVE UPDATE ==="
    $obj3 = $res3 | ConvertFrom-Json
    Write-Output "Gathering All Distinct: $($obj3.gatheringDistinct)"
    $obj3.pairs | ForEach-Object { Write-Output "  $($_.a) vs $($_.b) = same=$($_.same)" }
    Write-Output "Live Domain A->B Update Works: $($obj3.liveUpdateWorks)"

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
