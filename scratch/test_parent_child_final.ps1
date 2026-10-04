$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9285
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
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Set Slider Branching DNA to 80%
    $r1 = Eval-JS @"
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 80;
            sliderB.dispatchEvent(new Event('input'));
        }
        const group = window.branchingWallGroup;
        const val = window.branchingSystemState.lastValidation;
        const src = window.branchingSystemState.branchSource;
        const statusBadge = document.getElementById('branching-val-status');

        return JSON.stringify({
            enabled: window.branchingSystemState.enabled,
            sourceRegion: src ? src.sourceRegion : null,
            statusText: statusBadge ? statusBadge.textContent : '',
            score: val ? val.score : 0,
            checks: val ? val.checks.map(c => ({ name: c.name, pass: c.pass, val: c.value })) : []
        });
    })()
"@
    Write-Output "VERIFICATION: $r1"

    $artifactDir = "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84"

    # Capture Perspective Proof
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $shot1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("$artifactDir\parent_child_persp.png", [Convert]::FromBase64String($j1.result.data))

    # Capture Close-Up on the Parent-Child Connection with Debug Marker
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(16, 12, 16);
            window.threeControls.target.set(3.5, 6.0, -0.6);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $shot2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("$artifactDir\parent_child_connection_closeup.png", [Convert]::FromBase64String($j2.result.data))

    Write-Output "Captured visual proof screenshots successfully!"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
