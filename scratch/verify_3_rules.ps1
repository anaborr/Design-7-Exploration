$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9245
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1440,900', 'http://127.0.0.1:8080/' -PassThru
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
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    $res = Send-CDP @'
    (() => {
        const hasC = !!document.getElementById('slider-dna-c');
        const hasW = !!document.getElementById('slider-dna-w');
        const hasB = !!document.getElementById('slider-dna-b');
        const hasM = !!document.getElementById('slider-dna-m');
        const hasV = !!document.getElementById('slider-dna-v');
        const hasG = !!document.getElementById('slider-dna-g');

        const headerText = document.querySelector('.form-dna-box .dna-box-header')?.textContent;
        const codeText = document.getElementById('readout-form-dna')?.textContent;

        // Test generation
        window.selectDomainATypology('VERTICAL_VOID');
        window.generateTypologyInformedIteration();

        const sliderVals = {
            c: document.getElementById('slider-dna-c')?.value,
            w: document.getElementById('slider-dna-w')?.value,
            b: document.getElementById('slider-dna-b')?.value
        };

        const codeAfterGen = document.getElementById('readout-form-dna')?.textContent;

        // Test slider manipulation
        const sliderW = document.getElementById('slider-dna-w');
        sliderW.value = 80;
        sliderW.dispatchEvent(new Event('input', { bubbles: true }));

        const codeAfterSlider = document.getElementById('readout-form-dna')?.textContent;

        return JSON.stringify({
            rulesPresent: { Continuity: hasC, Whiplash: hasW, Branching: hasB },
            removedRulesAbsent: { Merging: !hasM, PosNeg: !hasV, Growth: !hasG },
            headerText: headerText,
            sliderValsAfterGen: sliderVals,
            codeAfterGen: codeAfterGen,
            codeAfterSlider: codeAfterSlider
        });
    })()
'@
    Write-Output $res

} finally {
    if ($ws -and $ws.State -eq 'Open') {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'Done', [System.Threading.CancellationToken]::None).Wait()
    }
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
