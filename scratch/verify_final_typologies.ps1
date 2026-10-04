$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9277
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
        if ($obj.result.result.value -ne $null) { return $obj.result.result.value }
        if ($obj.result.result.description) { return $obj.result.result.description }
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 5

    # Check model is loaded
    $check = Eval-JS "typeof window.applyArtNouveauDNA === 'function' && window.originalMeshes && window.originalMeshes.length > 0"
    Write-Output "Model ready: $check"
    if ($check -ne 'True' -and $check -ne $true) {
        Write-Output "ERROR: Model not loaded"
        return
    }

    # TEST 1: ALL 15 TYPOLOGIES with same DNA - verify all produce unique geometry
    $res = Eval-JS @"
    (function() {
        try {
            var dna = [0.7, 0.3, 0.6, 0.4, 0.8, 0.5];
            var allTypos = [
                'VERTICAL_VOID', 'COMPRESSED_SEQUENTIAL', 'CONTINUOUS_HALL', 'TOPOGRAPHIC_GROUND', 'LINEAR_GALLERY',
                'OPEN_HALL', 'CASCADED_TERRACED', 'FLAT_DEEP_PLAN', 'VOID_EDGE', 'FOLDED_UNDULATED',
                'STEPPED_AMPHITHEATER', 'VOID_FIELD_GATHERING', 'INSERTED_PLATE', 'CONTAINED_ROOM', 'LINEAR_EDGE_GALLERY'
            ];
            var origPos = window.getOriginalMeshPositions();
            var bounds = window.getModelBounds();
            var signatures = {};
            allTypos.forEach(function(k) {
                var pos = window.applyArtNouveauDNA(origPos, dna, bounds, 75, true, k);
                signatures[k] = pos[0].toFixed(4) + ',' + pos[1].toFixed(4) + ',' + pos[3].toFixed(4) + ',' + pos[6].toFixed(4);
            });
            var pairs = [];
            var allDistinct = true;
            var keys = Object.keys(signatures);
            for (var i = 0; i < keys.length; i++) {
                for (var j = i+1; j < keys.length; j++) {
                    var same = signatures[keys[i]] === signatures[keys[j]];
                    if (same) allDistinct = false;
                    if (same) pairs.push(keys[i] + ' == ' + keys[j]);
                }
            }
            return JSON.stringify({ allDistinct: allDistinct, duplicates: pairs, signatures: signatures });
        } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
"@
    Write-Output "=== TEST 1: All 15 Typologies Produce Distinct Geometry ==="
    try {
        $obj = $res | ConvertFrom-Json
        Write-Output "All Distinct: $($obj.allDistinct)"
        if ($obj.duplicates -and $obj.duplicates.Count -gt 0) {
            Write-Output "DUPLICATES FOUND:"
            $obj.duplicates | ForEach-Object { Write-Output "  - $_" }
        } else {
            Write-Output "No duplicates - all 15 typologies geometrically distinct!"
        }
    } catch {
        Write-Output "Raw result: $res"
    }

    # TEST 2: Domain A live update - slider retained, geometry changes when switching
    $res2 = Eval-JS @"
    (function() {
        try {
            window.selectDomainATypology('VERTICAL_VOID');
            var sW = document.getElementById('slider-dna-w');
            sW.value = '70';
            sW.dispatchEvent(new Event('input', { bubbles: true }));
            var m1 = window.originalMeshes[0].mesh;
            var p1 = Array.from(m1.geometry.attributes.position.array.slice(0,6));

            window.selectDomainATypology('TOPOGRAPHIC_GROUND');
            var m2 = window.originalMeshes[0].mesh;
            var p2 = Array.from(m2.geometry.attributes.position.array.slice(0,6));

            window.selectDomainATypology('STEPPED_AMPHITHEATER');
            var m3 = window.originalMeshes[0].mesh;
            var p3 = Array.from(m3.geometry.attributes.position.array.slice(0,6));

            return JSON.stringify({
                p1: p1, p2: p2, p3: p3,
                voidVsGround: JSON.stringify(p1) !== JSON.stringify(p2),
                groundVsAmphi: JSON.stringify(p2) !== JSON.stringify(p3),
                voidVsAmphi: JSON.stringify(p1) !== JSON.stringify(p3),
                sliderW: document.getElementById('slider-dna-w').value,
                typo: window.domainState.selectedTypology
            });
        } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
"@
    Write-Output ""
    Write-Output "=== TEST 2: Live Switching Domain A Updates Domain B Geometry ==="
    try {
        $obj2 = $res2 | ConvertFrom-Json
        Write-Output "Vertical Void vs Topographic Ground different: $($obj2.voidVsGround)"
        Write-Output "Topographic Ground vs Stepped Amphitheater different: $($obj2.groundVsAmphi)"
        Write-Output "Vertical Void vs Stepped Amphitheater different: $($obj2.voidVsAmphi)"
        Write-Output "Slider W value retained: $($obj2.sliderW)"
        Write-Output "Final selected typology: $($obj2.typo)"
    } catch {
        Write-Output "Raw result: $res2"
    }

    # TEST 3: Verify DOM update + slider persistence through category switch
    $res3 = Eval-JS @"
    (function() {
        try {
            window.selectDomainATypology('LINEAR_GALLERY');
            var sC = document.getElementById('slider-dna-c');
            sC.value = '80';
            sC.dispatchEvent(new Event('input', { bubbles: true }));
            var posGallery = Array.from(window.originalMeshes[0].mesh.geometry.attributes.position.array.slice(0,6));

            window.selectDomainATypology('CONTAINED_ROOM');
            var posRoom = Array.from(window.originalMeshes[0].mesh.geometry.attributes.position.array.slice(0,6));

            window.selectDomainATypology('FOLDED_UNDULATED');
            var posFolded = Array.from(window.originalMeshes[0].mesh.geometry.attributes.position.array.slice(0,6));

            return JSON.stringify({
                sliderCRetained: document.getElementById('slider-dna-c').value,
                galleryVsRoom: JSON.stringify(posGallery) !== JSON.stringify(posRoom),
                roomVsFolded: JSON.stringify(posRoom) !== JSON.stringify(posFolded),
                galleryVsFolded: JSON.stringify(posGallery) !== JSON.stringify(posFolded)
            });
        } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
"@
    Write-Output ""
    Write-Output "=== TEST 3: Cross-Category Switch (Lobby->Gathering->Workspace) ==="
    try {
        $obj3 = $res3 | ConvertFrom-Json
        Write-Output "Slider C retained at: $($obj3.sliderCRetained)"
        Write-Output "Gallery vs Contained Room different: $($obj3.galleryVsRoom)"
        Write-Output "Contained Room vs Folded Undulated different: $($obj3.roomVsFolded)"
        Write-Output "Gallery vs Folded Undulated different: $($obj3.galleryVsFolded)"
    } catch {
        Write-Output "Raw result: $res3"
    }

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
