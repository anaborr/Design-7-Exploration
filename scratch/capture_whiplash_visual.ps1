$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9235
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1280,800', 'http://127.0.0.1:8080/' -PassThru
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

    function Capture-Screen($filename) {
        $payload = @{ id = 2; method = 'Page.captureScreenshot'; params = @{ format = 'png' } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        
        $ms = New-Object System.IO.MemoryStream
        $buf = [byte[]]::new(65536)
        do {
            $seg = [System.ArraySegment[byte]]::new($buf)
            $r = $ws.ReceiveAsync($seg, $ct).Result
            $ms.Write($buf, 0, $r.Count)
        } while (-not $r.EndOfMessage)
        
        $str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
        $json = $str | ConvertFrom-Json
        $base64 = $json.result.data
        $bytes = [Convert]::FromBase64String($base64)
        [System.IO.File]::WriteAllBytes($filename, $bytes)
        Write-Output "Saved screenshot: $filename"
    }

    Start-Sleep -Seconds 2
    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    # Set Front / Elevation View for clear comparison with 2D diagram
    Send-CDP @'
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(5, 10, 45);
            window.threeControls.target.set(5, 10, -5);
            window.threeControls.update();
        }
    })()
'@
    Start-Sleep -Seconds 1

    # 1. Seed Baseline (W=0, C=0, B=0)
    Capture-Screen "scratch/whiplash_0_seed.png"

    # 2. Whiplash 70% alone
    Send-CDP @'
    (() => {
        const sW = document.getElementById('slider-dna-w');
        sW.value = 70;
        sW.dispatchEvent(new Event('input', { bubbles: true }));
    })()
'@
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/whiplash_70_elevation.png"

    # 3. Continuity 60% + Whiplash 75% (matching Step 2 -> Step 3)
    Send-CDP @'
    (() => {
        const sC = document.getElementById('slider-dna-c');
        const sW = document.getElementById('slider-dna-w');
        sC.value = 60;
        sC.dispatchEvent(new Event('input', { bubbles: true }));
        sW.value = 75;
        sW.dispatchEvent(new Event('input', { bubbles: true }));
    })()
'@
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/continuity_whiplash_combined.png"

    # 4. Isometric perspective view
    Send-CDP @'
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(30, 25, 30);
            window.threeControls.target.set(5, 10, -5);
            window.threeControls.update();
        }
    })()
'@
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/continuity_whiplash_iso.png"

    # 5. Move Whiplash back down to 0%
    Send-CDP @'
    (() => {
        const sW = document.getElementById('slider-dna-w');
        const sC = document.getElementById('slider-dna-c');
        sW.value = 0; sW.dispatchEvent(new Event('input', { bubbles: true }));
        sC.value = 0; sC.dispatchEvent(new Event('input', { bubbles: true }));
    })()
'@
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/restored_zero.png"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
