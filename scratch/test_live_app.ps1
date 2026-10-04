$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 4

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

    # Load Rhino model
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')"

    # Wait for Rhino model to finish loading in app
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 500
        $check = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0].originalPositions)"
        if ($check -eq $true) { break }
    }

    # Test 50% slider value
    Eval-JS @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 50;
            sliderB.dispatchEvent(new Event('input', { bubbles: true }));
            sliderB.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btnFront = Array.from(document.querySelectorAll('button, div')).find(el => el.textContent.trim() === 'FRONT');
        if (btnFront) btnFront.click();
    })()
'@
    Start-Sleep -Seconds 1
    Save-Screenshot "scratch/live_app_50_front.png"

    # Set slider-dna-b to 100% (value = 100) and trigger live update through UI
    Eval-JS @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 100;
            sliderB.dispatchEvent(new Event('input', { bubbles: true }));
            sliderB.dispatchEvent(new Event('change', { bubbles: true }));
        }
    })()
'@
    Start-Sleep -Seconds 1

    # Switch to FRONT view
    Eval-JS @'
    (() => {
        const btnFront = Array.from(document.querySelectorAll('button, div')).find(el => el.textContent.trim() === 'FRONT');
        if (btnFront) btnFront.click();
    })()
'@
    Start-Sleep -Milliseconds 600
    Save-Screenshot "scratch/live_app_100_front.png"

    # Switch to 3D ISO view
    Eval-JS @'
    (() => {
        const btnIso = Array.from(document.querySelectorAll('button, div')).find(el => el.textContent.trim() === '3D ISO');
        if (btnIso) btnIso.click();
    })()
'@
    Start-Sleep -Milliseconds 600
    Save-Screenshot "scratch/live_app_100_iso.png"

    Write-Output "Captured live app screenshots at B=50% and B=100%"


} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
