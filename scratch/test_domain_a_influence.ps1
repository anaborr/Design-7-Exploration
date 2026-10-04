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
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Start-Sleep -Seconds 2
    Write-Output "--- 1. Check Console Errors and Initialization ---"
    $init = Send-CDP @'
    (() => {
        return JSON.stringify({
            typologiesCount: Object.keys(window.BASE_TYPOLOGIES || {}).length,
            selectedTypo: window.domainState?.selectedTypology,
            influenceBannerTitle: document.getElementById('domain-b-influence-title')?.textContent,
            influenceRule: document.getElementById('domain-b-influence-rule')?.textContent,
            sliderWLimit: document.getElementById('limit-dna-w')?.textContent,
            sliderCLimit: document.getElementById('limit-dna-c')?.textContent,
            sliderBLimit: document.getElementById('limit-dna-b')?.textContent
        });
    })()
'@
    Write-Output $init

    Write-Output "`n--- 2. Load Rhino Model ---"
    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    Write-Output "`n--- 3. Select 'CONTINUOUS_HALL' in Domain A ---"
    $rHall = Send-CDP @'
    (() => {
        window.selectDomainATypology('CONTINUOUS_HALL');
        const sB = document.getElementById('slider-dna-b');
        const sC = document.getElementById('slider-dna-c');
        const sW = document.getElementById('slider-dna-w');
        const bannerTitle = document.getElementById('domain-b-influence-title')?.textContent;
        const bannerRationale = document.getElementById('domain-b-influence-rationale')?.textContent;
        const bLimit = document.getElementById('limit-dna-b')?.textContent;
        const cLimit = document.getElementById('limit-dna-c')?.textContent;
        return JSON.stringify({
            selected: window.domainState?.selectedTypology,
            bannerTitle: bannerTitle,
            bannerRationale: bannerRationale,
            sliderB_min: sB?.min,
            sliderB_max: sB?.max,
            sliderB_val: sB?.value,
            bLimitText: bLimit,
            sliderC_min: sC?.min,
            sliderC_max: sC?.max,
            sliderC_val: sC?.value,
            cLimitText: cLimit
        });
    })()
'@
    Write-Output $rHall

    Write-Output "`n--- 4. Attempt to drag Branching slider past limit (e.g. to 90%) in CONTINUOUS_HALL ---"
    $rClamp = Send-CDP @'
    (() => {
        const sB = document.getElementById('slider-dna-b');
        sB.value = 90;
        sB.dispatchEvent(new Event('input', { bubbles: true }));
        sB.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({
            sliderB_val_after_input: sB.value,
            domainState_dna_B: window.domainState.dna[1],
            isClampedToMax: parseInt(sB.value) <= 25
        });
    })()
'@
    Write-Output $rClamp

    Write-Output "`n--- 5. Select 'COMPRESSED_SEQUENTIAL' in Domain A and inspect geometry ---"
    $rSeq = Send-CDP @'
    (() => {
        window.selectDomainATypology('COMPRESSED_SEQUENTIAL');
        const sW = document.getElementById('slider-dna-w');
        sW.value = 80;
        sW.dispatchEvent(new Event('input', { bubbles: true }));
        sW.dispatchEvent(new Event('change', { bubbles: true }));
        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const pos = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));
        return JSON.stringify({
            selected: window.domainState?.selectedTypology,
            bannerTitle: document.getElementById('domain-b-influence-title')?.textContent,
            samplePositions: pos,
            sliderW_val: sW.value
        });
    })()
'@
    Write-Output $rSeq

    Write-Output "`n--- 6. Select 'VERTICAL_VOID' in Domain A and inspect geometry ---"
    $rVoid = Send-CDP @'
    (() => {
        window.selectDomainATypology('VERTICAL_VOID');
        const sV = document.getElementById('slider-dna-v');
        if (sV) {
            sV.value = 85;
            sV.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const pos = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));
        return JSON.stringify({
            selected: window.domainState?.selectedTypology,
            bannerTitle: document.getElementById('domain-b-influence-title')?.textContent,
            vLimit: document.getElementById('limit-dna-v')?.textContent,
            samplePositions: pos
        });
    })()
'@
    Write-Output $rVoid

    Write-Output "`n--- 7. Select 'STEPPED_AMPHITHEATER' in Domain A ---"
    $rAmphi = Send-CDP @'
    (() => {
        window.selectDomainATypology('STEPPED_AMPHITHEATER');
        return JSON.stringify({
            selected: window.domainState?.selectedTypology,
            bannerTitle: document.getElementById('domain-b-influence-title')?.textContent,
            category: document.getElementById('domain-b-influence-cat')?.textContent,
            rationale: document.getElementById('domain-b-influence-rationale')?.textContent,
            gLimit: document.getElementById('limit-dna-g')?.textContent
        });
    })()
'@
    Write-Output $rAmphi

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
