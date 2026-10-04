$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9265
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
    Write-Output "--- 1. Load Rhino Model ---"
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    Write-Output "--- 2. Verify all 15 Typologies in BASE_TYPOLOGIES ---"
    $typoTest = Eval-JS @"
    (() => {
        const typos = Object.keys(window.BASE_TYPOLOGIES || {});
        const missingFields = [];
        typos.forEach(k => {
            const t = window.BASE_TYPOLOGIES[k];
            if (!t.spatialGoal) missingFields.push(k + ': missing spatialGoal');
            if (!t.rulesSummary) missingFields.push(k + ': missing rulesSummary');
            if (!t.expectedResult) missingFields.push(k + ': missing expectedResult');
            if (!t.spatialGrammar) missingFields.push(k + ': missing spatialGrammar');
        });
        return JSON.stringify({ count: typos.length, typologies: typos, missing: missingFields });
    })()
"@
    Write-Output $typoTest

    Write-Output "`n--- 3. Test Typology Selection and Domain B Banner Updates ---"
    $bannerTest = Eval-JS @"
    (() => {
        const results = [];
        const testKeys = ['VERTICAL_VOID', 'COMPRESSED_SEQUENTIAL', 'TOPOGRAPHIC_GROUND', 'FLAT_DEEP_PLAN', 'STEPPED_AMPHITHEATER'];
        testKeys.forEach(k => {
            window.selectDomainATypology(k);
            results.push({
                key: k,
                title: document.getElementById('domain-b-influence-title')?.textContent,
                goal: document.getElementById('domain-b-influence-goal')?.textContent,
                status: document.getElementById('domain-b-influence-status')?.textContent,
                result: document.getElementById('domain-b-influence-result')?.textContent
            });
        });
        return JSON.stringify(results);
    })()
"@
    Write-Output $bannerTest

    Write-Output "`n--- 4. Test Geometric Differences Under Same Slider (Whiplash = 70%) ---"
    $geomDiffTest = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const testDna = [0, 0, 0.70, 0, 0, 0]; // Whiplash 70%
        
        function getDeformStats(typoKey) {
            const defPos = window.applyArtNouveauDNA(origPos, testDna, bounds, 75, true, typoKey);
            let maxDY = 0, floorDY = 0, upperDY = 0;
            let centerY = (bounds.min.y + bounds.max.y) / 2;
            let spanY = bounds.max.y - bounds.min.y;
            
            for (let i = 0; i < defPos.length; i += 3) {
                let dy = defPos[i+1] - origPos[i+1];
                let absDY = Math.abs(dy);
                if (absDY > maxDY) maxDY = absDY;
                if (origPos[i+1] <= centerY) {
                    floorDY = Math.max(floorDY, absDY);
                } else {
                    upperDY = Math.max(upperDY, absDY);
                }
            }
            return {
                typo: typoKey,
                maxDY: Number(maxDY.toFixed(3)),
                floorDY: Number(floorDY.toFixed(3)),
                upperDY: Number(upperDY.toFixed(3)),
                ratioFloorToUpper: Number((floorDY / Math.max(0.001, upperDY)).toFixed(2))
            };
        }

        return JSON.stringify([
            getDeformStats('VERTICAL_VOID'),
            getDeformStats('TOPOGRAPHIC_GROUND'),
            getDeformStats('FLAT_DEEP_PLAN')
        ]);
    })()
"@
    Write-Output $geomDiffTest

    Write-Output "`n--- 5. Test Growth Differences Under Same Slider (Growth = 80%) ---"
    $growthDiffTest = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const testDna = [0, 0, 0, 0, 0, 0.80]; // Growth 80%
        
        function getGrowthStats(typoKey) {
            const defPos = window.applyArtNouveauDNA(origPos, testDna, bounds, 75, true, typoKey);
            let maxDY = 0, maxDX = 0, maxDZ = 0;
            let minY = bounds.min.y, maxY = bounds.max.y;
            let centerY = (minY + maxY) / 2;
            let upwardGrowth = 0;
            
            for (let i = 0; i < defPos.length; i += 3) {
                let dx = Math.abs(defPos[i] - origPos[i]);
                let dy = defPos[i+1] - origPos[i+1];
                let dz = Math.abs(defPos[i+2] - origPos[i+2]);
                if (dx > maxDX) maxDX = dx;
                if (Math.abs(dy) > maxDY) maxDY = Math.abs(dy);
                if (dz > maxDZ) maxDZ = dz;
                if (dy > upwardGrowth) upwardGrowth = dy;
            }
            return {
                typo: typoKey,
                maxDX: Number(maxDX.toFixed(3)),
                maxDY: Number(maxDY.toFixed(3)),
                maxDZ: Number(maxDZ.toFixed(3)),
                upwardGrowth: Number(upwardGrowth.toFixed(3))
            };
        }

        return JSON.stringify([
            getGrowthStats('VERTICAL_VOID'),
            getGrowthStats('OPEN_HALL'),
            getGrowthStats('LINEAR_GALLERY')
        ]);
    })()
"@
    Write-Output $growthDiffTest

    Write-Output "`n--- 6. Test Typology Validation Engine ---"
    $valTest = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const defPosVoid = window.applyArtNouveauDNA(origPos, [0.7, 0.2, 0.8, 0.3, 0.9, 0.4], bounds, 75, true, 'VERTICAL_VOID');
        const vResult = window.validateTypologyGeometry(defPosVoid, origPos, bounds, 'VERTICAL_VOID');
        return JSON.stringify(vResult);
    })()
"@
    Write-Output $valTest

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
