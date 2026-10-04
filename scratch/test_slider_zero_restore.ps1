$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9230
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
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Start-Sleep -Seconds 2
    Write-Output "--- Loading compressed.3dm ---"
    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    
    # Poll until mesh is loaded
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    Write-Output "=== 1. Initial State Check ==="
    $r1 = Send-CDP @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "Mesh not loaded yet" });
        window._savedInitialPos = Array.from(mesh.geometry.attributes.position.array);
        return JSON.stringify({
            meshCount: window.originalMeshes.length,
            vertCount: window._savedInitialPos.length / 3,
            branchChildren: window.branchingWallGroup ? window.branchingWallGroup.children.length : 0,
            compMode: window.activeVisualCompMode
        });
    })()
'@
    Write-Output $r1

    Write-Output "`n=== 2. Move Branching Slider to 60% ==="
    $r2 = Send-CDP @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        sliderB.value = 60;
        sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        sliderB.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({
            sliderValue: sliderB.value,
            branchChildren: window.branchingWallGroup ? window.branchingWallGroup.children.length : 0,
            compMode: window.activeVisualCompMode,
            bMetricCount: document.getElementById('metric-b-count')?.textContent,
            bMetricDiv: document.getElementById('metric-b-divisions')?.textContent
        });
    })()
'@
    Write-Output $r2

    Write-Output "`n=== 3. Move Branching Slider Back Down to 0% ==="
    $r3 = Send-CDP @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        sliderB.value = 0;
        sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        sliderB.dispatchEvent(new Event('change', { bubbles: true }));
        
        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const currentPos = mesh.geometry.attributes.position.array;
        let maxDisp = 0;
        for (let i = 0; i < currentPos.length; i++) {
            const diff = Math.abs(currentPos[i] - window._savedInitialPos[i]);
            if (diff > maxDisp) maxDisp = diff;
        }

        return JSON.stringify({
            sliderValue: sliderB.value,
            branchChildren: window.branchingWallGroup ? window.branchingWallGroup.children.length : 0,
            maxDisplacementFromOriginal: maxDisp,
            compMode: window.activeVisualCompMode,
            bMetricCount: document.getElementById('metric-b-count')?.textContent,
            bMetricDiv: document.getElementById('metric-b-divisions')?.textContent,
            btnSeedActive: document.getElementById('btn-comp-seed')?.classList.contains('active'),
            btnIterActive: document.getElementById('btn-comp-iter')?.classList.contains('active')
        });
    })()
'@
    Write-Output $r3

    Write-Output "`n=== 4. Move Whiplash Slider to 70% ==="
    $r4 = Send-CDP @'
    (() => {
        const sliderW = document.getElementById('slider-dna-w');
        sliderW.value = 70;
        sliderW.dispatchEvent(new Event('input', { bubbles: true }));
        sliderW.dispatchEvent(new Event('change', { bubbles: true }));
        
        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const currentPos = mesh.geometry.attributes.position.array;
        let maxDisp = 0;
        for (let i = 0; i < currentPos.length; i++) {
            const diff = Math.abs(currentPos[i] - window._savedInitialPos[i]);
            if (diff > maxDisp) maxDisp = diff;
        }

        return JSON.stringify({
            sliderValue: sliderW.value,
            maxDisplacement: maxDisp,
            compMode: window.activeVisualCompMode,
            wMetricChanges: document.getElementById('metric-w-changes')?.textContent,
            wMetricCurv: document.getElementById('metric-w-curvature')?.textContent
        });
    })()
'@
    Write-Output $r4

    Write-Output "`n=== 5. Move Whiplash Slider Back Down to 0% ==="
    $r5 = Send-CDP @'
    (() => {
        const sliderW = document.getElementById('slider-dna-w');
        sliderW.value = 0;
        sliderW.dispatchEvent(new Event('input', { bubbles: true }));
        sliderW.dispatchEvent(new Event('change', { bubbles: true }));
        
        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const currentPos = mesh.geometry.attributes.position.array;
        let maxDisp = 0;
        for (let i = 0; i < currentPos.length; i++) {
            const diff = Math.abs(currentPos[i] - window._savedInitialPos[i]);
            if (diff > maxDisp) maxDisp = diff;
        }

        return JSON.stringify({
            sliderValue: sliderW.value,
            maxDisplacementFromOriginal: maxDisp,
            compMode: window.activeVisualCompMode,
            wMetricChanges: document.getElementById('metric-w-changes')?.textContent,
            wMetricCurv: document.getElementById('metric-w-curvature')?.textContent,
            btnSeedActive: document.getElementById('btn-comp-seed')?.classList.contains('active'),
            btnIterActive: document.getElementById('btn-comp-iter')?.classList.contains('active')
        });
    })()
'@
    Write-Output $r5

    Write-Output "`n=== 6. Move All 3 Sliders Up, then All 3 Back to 0% ==="
    $r6 = Send-CDP @'
    (() => {
        const sW = document.getElementById('slider-dna-w');
        const sC = document.getElementById('slider-dna-c');
        const sB = document.getElementById('slider-dna-b');
        
        sW.value = 50; sW.dispatchEvent(new Event('input', { bubbles: true }));
        sC.value = 60; sC.dispatchEvent(new Event('input', { bubbles: true }));
        sB.value = 70; sB.dispatchEvent(new Event('input', { bubbles: true }));

        const activeBranches = window.branchingWallGroup ? window.branchingWallGroup.children.length : 0;

        // Now move all 3 down to 0
        sW.value = 0; sW.dispatchEvent(new Event('input', { bubbles: true }));
        sC.value = 0; sC.dispatchEvent(new Event('input', { bubbles: true }));
        sB.value = 0; sB.dispatchEvent(new Event('input', { bubbles: true }));

        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const currentPos = mesh.geometry.attributes.position.array;
        let maxDisp = 0;
        for (let i = 0; i < currentPos.length; i++) {
            const diff = Math.abs(currentPos[i] - window._savedInitialPos[i]);
            if (diff > maxDisp) maxDisp = diff;
        }

        return JSON.stringify({
            hadBranchesWhenUp: activeBranches,
            branchesAfterZero: window.branchingWallGroup ? window.branchingWallGroup.children.length : 0,
            maxDisplacementFromOriginal: maxDisp,
            compMode: window.activeVisualCompMode,
            btnSeedActive: document.getElementById('btn-comp-seed')?.classList.contains('active'),
            btnIterActive: document.getElementById('btn-comp-iter')?.classList.contains('active'),
            vpTag: document.getElementById('vp-gen-tag')?.textContent
        });
    })()
'@
    Write-Output $r6

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
