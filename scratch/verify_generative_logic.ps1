$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9235
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($expr) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = [byte[]]::new(131072)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Start-Sleep -Seconds 2
    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null

    # Wait for rhino mesh to load
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    Write-Output "=========================================================="
    Write-Output "TEST 1: SELECT TYPOLOGY DOES NOT CHANGE EXISTING GEOMETRY"
    Write-Output "=========================================================="
    $r1 = Send-CDP @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "Mesh not loaded" });
        
        // Snapshot initial vertex positions and slider values
        window._initialVerts = Array.from(mesh.geometry.attributes.position.array.slice(0, 100));
        const slidersBefore = ['slider-dna-w', 'slider-dna-c', 'slider-dna-b', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g']
            .map(id => document.getElementById(id)?.value);
        
        // Select a different typology in Domain A
        window.selectDomainATypology('CONTINUOUS_HALL');
        
        const slidersAfter = ['slider-dna-w', 'slider-dna-c', 'slider-dna-b', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g']
            .map(id => document.getElementById(id)?.value);
        
        const vertsAfter = Array.from(mesh.geometry.attributes.position.array.slice(0, 100));
        let maxDiff = 0;
        for (let i = 0; i < window._initialVerts.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(window._initialVerts[i] - vertsAfter[i]));
        }

        const titleText = document.getElementById('domain-a-selected-title')?.textContent;
        const pendingTypo = window.domainState?.pendingTypologyParams?.typologyId;

        return JSON.stringify({
            selectedTypology: window.domainState.selectedTypology,
            pendingTypo: pendingTypo,
            titleText: titleText,
            slidersBefore: slidersBefore,
            slidersAfter: slidersAfter,
            maxMeshDiff: maxDiff,
            slidersUnchanged: JSON.stringify(slidersBefore) === JSON.stringify(slidersAfter),
            meshUnchanged: maxDiff === 0
        });
    })()
'@
    Write-Output $r1

    Write-Output "`n=========================================================="
    Write-Output "TEST 2: GENERATE ITERATION CREATES GEOMETRY FROM TYPOLOGY"
    Write-Output "=========================================================="
    $r2 = Send-CDP @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        
        // Click GENERATE ITERATION
        window.generateTypologyInformedIteration();

        const slidersAfterGen = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g']
            .map(id => parseInt(document.getElementById(id)?.value) || 0);

        const vertsAfterGen = Array.from(mesh.geometry.attributes.position.array.slice(0, 100));
        let maxDiff = 0;
        for (let i = 0; i < window._initialVerts.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(window._initialVerts[i] - vertsAfterGen[i]));
        }

        window._vertsAfterGen = vertsAfterGen;

        return JSON.stringify({
            dna: window.domainState.dna,
            slidersAfterGen: slidersAfterGen,
            maxMeshDisplacement: maxDiff,
            geometryCreated: maxDiff > 0.001,
            stats: window.lastEngineStats ? {
                affectedPct: window.lastEngineStats.affectedPct,
                maxDisplacement: window.lastEngineStats.maxDisplacement
            } : null
        });
    })()
'@
    Write-Output $r2

    Write-Output "`n=========================================================="
    Write-Output "TEST 3: SLIDERS INDEPENDENTLY MANIPULATE GEOMETRY"
    Write-Output "=========================================================="
    $r3 = Send-CDP @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        
        // Manually move slider W to 95%
        const sliderW = document.getElementById('slider-dna-w');
        sliderW.value = 95;
        sliderW.dispatchEvent(new Event('input', { bubbles: true }));
        sliderW.dispatchEvent(new Event('change', { bubbles: true }));

        const vertsAfterSlider = Array.from(mesh.geometry.attributes.position.array.slice(0, 100));
        let maxDiff = 0;
        for (let i = 0; i < window._vertsAfterGen.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(window._vertsAfterGen[i] - vertsAfterSlider[i]));
        }

        window._vertsAfterSlider = vertsAfterSlider;

        return JSON.stringify({
            sliderWVal: sliderW.value,
            selectedTypologyStillSame: window.domainState.selectedTypology === 'CONTINUOUS_HALL',
            geometryUpdatedBySlider: maxDiff > 0.001,
            dnaW: window.domainState.dna[2]
        });
    })()
'@
    Write-Output $r3

    Write-Output "`n=========================================================="
    Write-Output "TEST 4: CHANGING TYPOLOGY DOES NOT OVERWRITE SLIDERS/GEOMETRY"
    Write-Output "=========================================================="
    $r4 = Send-CDP @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        
        // Select STEPPED_AMPHITHEATER
        window.selectDomainATypology('STEPPED_AMPHITHEATER');

        const sliderW = document.getElementById('slider-dna-w');
        const vertsAfterTypoChange = Array.from(mesh.geometry.attributes.position.array.slice(0, 100));
        
        let maxDiff = 0;
        for (let i = 0; i < window._vertsAfterSlider.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(window._vertsAfterSlider[i] - vertsAfterTypoChange[i]));
        }

        return JSON.stringify({
            selectedTypologyNow: window.domainState.selectedTypology,
            sliderWStill95: sliderW.value === "95",
            geometryUnchanged: maxDiff === 0,
            pendingParamsTypo: window.domainState.pendingTypologyParams?.typologyId
        });
    })()
'@
    Write-Output $r4

    Write-Output "`n=========================================================="
    Write-Output "TEST 5: GENERATE ITERATION FROM NEW TYPOLOGY CREATES NEW GEOM"
    Write-Output "=========================================================="
    $r5 = Send-CDP @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        
        // Generate iteration for STEPPED_AMPHITHEATER
        window.generateTypologyInformedIteration();

        const vertsAfterAmpGen = Array.from(mesh.geometry.attributes.position.array.slice(0, 100));
        let maxDiff = 0;
        for (let i = 0; i < window._vertsAfterSlider.length; i++) {
            maxDiff = Math.max(maxDiff, Math.abs(window._vertsAfterSlider[i] - vertsAfterAmpGen[i]));
        }

        const slidersAmp = ['slider-dna-c', 'slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g']
            .map(id => parseInt(document.getElementById(id)?.value) || 0);

        return JSON.stringify({
            dna: window.domainState.dna,
            slidersAmp: slidersAmp,
            geometryChangedToNewTypo: maxDiff > 0.001
        });
    })()
'@
    Write-Output $r5

} finally {
    if ($ws -and $ws.State -eq 'Open') {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'Done', [System.Threading.CancellationToken]::None).Wait()
    }
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
