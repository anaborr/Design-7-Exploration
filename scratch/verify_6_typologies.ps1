$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9280
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

    Write-Output "=========================================================="
    Write-Output "VERIFYING 6 SIMPLIFIED DOMAIN A TYPOLOGIES IN DOMAIN B"
    Write-Output "=========================================================="

    # 1. Check DOM pills
    $pills = Eval-JS @"
    (() => {
        const pills = Array.from(document.querySelectorAll('.domain-a-pill')).map(p => ({
            key: p.dataset.key,
            title: p.querySelector('.p-title')?.textContent?.trim(),
            sub: p.querySelector('.p-sub')?.textContent?.trim()
        }));
        return JSON.stringify(pills);
    })();
"@
    Write-Output "`n--- 1. DOMAIN A BUTTONS IN UI ---"
    Write-Output $pills

    # 2. Test each of the 6 typologies: selection, UI text, slider editability, and geometric behavior
    $results = Eval-JS @"
    (() => {
        const targetKeys = [
            'VERTICAL_VOID',
            'COMPRESSED_EXPANDED',
            'OPEN_HALL',
            'TERRACED_STEPPED',
            'LINEAR_DIRECTIONAL',
            'FOLDED_UNDULATING'
        ];

        const testDna = [0.70, 0.40, 0.65, 0.30, 0.50, 0.60];
        const bounds = window.getModelBounds ? window.getModelBounds() : null;
        const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;

        const report = [];

        targetKeys.forEach((key, idx) => {
            // Select in Domain A
            window.selectDomainATypology(key);

            // Read UI Elements
            const titleA = document.getElementById('domain-a-selected-title')?.textContent?.trim();
            const descA = document.getElementById('domain-a-desc-text')?.textContent?.trim();
            const ruleA = document.getElementById('domain-a-spatial-rule')?.textContent?.trim();

            const titleB = document.getElementById('domain-b-influence-title')?.textContent?.trim();
            const goalB = document.getElementById('domain-b-influence-goal')?.textContent?.trim();
            const rationaleB = document.getElementById('domain-b-influence-rationale')?.textContent?.trim();

            // Check Domain B Sliders disabled status
            const sC = document.getElementById('slider-dna-c');
            const sW = document.getElementById('slider-dna-w');
            const sB = document.getElementById('slider-dna-b');

            const titleC = document.getElementById('title-dna-c')?.textContent?.trim();
            const titleW = document.getElementById('title-dna-w')?.textContent?.trim();
            const titleB_dna = document.getElementById('title-dna-b')?.textContent?.trim();

            // Check deformation under this typology
            let dispStats = null;
            if (origPos && bounds) {
                const defPos = window.applyArtNouveauDNA(origPos, testDna, bounds, 75, true, key);
                let maxD = 0, sumD = 0, movedCount = 0;
                for (let i = 0; i < defPos.length; i += 3) {
                    let d = Math.hypot(defPos[i] - origPos[i], defPos[i+1] - origPos[i+1], defPos[i+2] - origPos[i+2]);
                    if (d > 0.001) movedCount++;
                    if (d > maxD) maxD = d;
                    sumD += d;
                }
                dispStats = {
                    totalVerts: Math.floor(defPos.length / 3),
                    movedCount: movedCount,
                    maxDisplacement: Number(maxD.toFixed(3)),
                    meanDisplacement: Number((sumD / (movedCount || 1)).toFixed(3)),
                    sampleSample: Array.from(defPos.slice(0, 6)).map(v => Number(v.toFixed(3)))
                };
            }

            // Also test zero DNA preservation
            let zeroDnaPreserved = true;
            if (origPos && bounds) {
                const zeroPos = window.applyArtNouveauDNA(origPos, [0,0,0,0,0,0], bounds, 75, true, key);
                for (let i = 0; i < 30; i++) {
                    if (Math.abs(zeroPos[i] - origPos[i]) > 0.0001) {
                        zeroDnaPreserved = false;
                        break;
                    }
                }
            }

            report.push({
                index: idx + 1,
                key: key,
                titleA: titleA,
                descA: descA,
                ruleA: ruleA,
                titleB: titleB,
                goalB: goalB,
                rationaleB: rationaleB,
                ruleTitles: { C: titleC, W: titleW, B: titleB_dna },
                slidersActive: {
                    cEnabled: sC && !sC.disabled,
                    wEnabled: sW && !sW.disabled,
                    bEnabled: sB && !sB.disabled
                },
                zeroPreserved: zeroDnaPreserved,
                geometryDeformation: dispStats
            });
        });

        return JSON.stringify(report);
    })();
"@
    Write-Output "`n--- 2. DETAILED REPORT FOR ALL 6 TYPOLOGIES ---"
    Write-Output $results

    # 3. Check live switching between typologies with sliders active
    $liveSwitchTest = Eval-JS @"
    (() => {
        // Set slider W to 60%, B to 30%, C to 50%
        const sW = document.getElementById('slider-dna-w');
        const sB = document.getElementById('slider-dna-b');
        const sC = document.getElementById('slider-dna-c');

        sW.value = '60'; sW.dispatchEvent(new Event('input', { bubbles: true }));
        sB.value = '30'; sB.dispatchEvent(new Event('input', { bubbles: true }));
        sC.value = '50'; sC.dispatchEvent(new Event('input', { bubbles: true }));

        // Switch to OPEN_HALL
        window.selectDomainATypology('OPEN_HALL');
        const meshOpen = window.originalMeshes[0]?.mesh;
        const posOpen = meshOpen ? Array.from(meshOpen.geometry.attributes.position.array.slice(0, 9)).map(v => Number(v.toFixed(3))) : null;

        // Switch to LINEAR_DIRECTIONAL
        window.selectDomainATypology('LINEAR_DIRECTIONAL');
        const meshLinear = window.originalMeshes[0]?.mesh;
        const posLinear = meshLinear ? Array.from(meshLinear.geometry.attributes.position.array.slice(0, 9)).map(v => Number(v.toFixed(3))) : null;

        // Switch to FOLDED_UNDULATING
        window.selectDomainATypology('FOLDED_UNDULATING');
        const meshFolded = window.originalMeshes[0]?.mesh;
        const posFolded = meshFolded ? Array.from(meshFolded.geometry.attributes.position.array.slice(0, 9)).map(v => Number(v.toFixed(3))) : null;

        return JSON.stringify({
            openVsLinearDifferent: JSON.stringify(posOpen) !== JSON.stringify(posLinear),
            linearVsFoldedDifferent: JSON.stringify(posLinear) !== JSON.stringify(posFolded),
            posOpenSample: posOpen,
            posLinearSample: posLinear,
            posFoldedSample: posFolded
        });
    })();
"@
    Write-Output "`n--- 3. LIVE SWITCHING BETWEEN TYPOLOGIES WITH ACTIVE SLIDERS ---"
    Write-Output $liveSwitchTest

} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
