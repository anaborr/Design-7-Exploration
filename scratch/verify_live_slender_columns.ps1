$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
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
        $parsed = $r | ConvertFrom-Json
        return $parsed.result.result.value
    }

    function Save-Screenshot($filename) {
        $clip = @{ format = 'png'; clip = @{ x = 0; y = 0; width = 1600; height = 1000; scale = 1 } }
        $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
        $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
        if ($screenshotData) {
            $bytes = [System.Convert]::FromBase64String($screenshotData)
            [System.IO.File]::WriteAllBytes($filename, $bytes)
        }
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        $check = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0].originalPositions)"
        if ($check -eq $true) { break }
    }

    # Simulate moving the Branching slider to 70% in the live application
    Eval-JS @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 70;
            sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (window.setView) window.setView('FRONT');
        else if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(4, 8, 38);
            window.threeControls.target.set(4, 7, -5);
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        }
    })()
'@
    Start-Sleep -Milliseconds 600
    Save-Screenshot "scratch/live_slender_b70_front.png"

    # Switch to ISO view
    Eval-JS @'
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(30, 20, 36);
            window.threeControls.target.set(4, 7, -5);
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        }
    })()
'@
    Start-Sleep -Milliseconds 600
    Save-Screenshot "scratch/live_slender_b70_iso.png"

    # Test B = 35% (Stage 1 with single central column in gallery + atrium)
    Eval-JS @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 35;
            sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(4, 8, 38);
            window.threeControls.target.set(4, 7, -5);
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        }
    })()
'@
    Start-Sleep -Milliseconds 600
    Save-Screenshot "scratch/live_slender_b35_front.png"

    Write-Output "Live screenshots saved for B=70% (Front & ISO) and B=35% (Front)"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
