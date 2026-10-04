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
            Write-Host "Saved: $filename"
        }
    }

    # Enable Log & Console
    Send-CDP 'Console.enable' @{} | Out-Null
    Send-CDP 'Runtime.enable' @{} | Out-Null

    # Wait for app to initialize & 3dm to load
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        $check = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0].originalPositions)"
        if ($check -eq $true) { 
            Write-Host "Mesh loaded after attempt $attempt"
            break 
        }
    }

    # Check for console errors
    $errors = Eval-JS "window.__lastErrors || []"
    Write-Host "Initial errors: $errors"

    # Select Typology 2: "COMPRESSED -> EXPANDED"
    Eval-JS @'
    (() => {
        const pills = document.querySelectorAll('.domain-a-pill');
        if (pills && pills[1]) {
            pills[1].click();
            console.log('Clicked typology 2:', pills[1].textContent.trim().replace(/\s+/g, ' '));
        }
    })()
'@

    Start-Sleep -Milliseconds 600

    # Set Slider B to 100% (value = 1.0)
    $sliderRes = Eval-JS @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (!sliderB) return 'Slider B not found';
        sliderB.value = 1.0;
        sliderB.dispatchEvent(new Event('input', { bubbles: true }));
        sliderB.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Also call update if needed
        if (typeof window.applyDomainBRule === 'function') {
            console.log('applyDomainBRule is active');
        }
        return 'Slider B set to ' + sliderB.value;
    })()
'@
    Write-Host "Slider result: $sliderRes"
    Start-Sleep -Seconds 1

    # Camera helper
    Eval-JS @'
    (() => {
        window.setView = function(type) {
            if (!window.threeCamera || !window.threeControls) return;
            if (type === 'ISO') {
                window.threeCamera.position.set(30, 20, 36);
                window.threeControls.target.set(4, 7, -5);
            } else if (type === 'FRONT') {
                window.threeCamera.position.set(4, 8, 38);
                window.threeControls.target.set(4, 7, -5);
            } else if (type === 'PERSP') {
                window.threeCamera.position.set(22, 14, 28);
                window.threeControls.target.set(4, 6, -5);
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };
    })()
'@

    # Verify mesh deformation stats
    $stats = Eval-JS @'
    (() => {
        const mesh = window.originalMeshes[0];
        const orig = mesh.originalPositions;
        const current = mesh.threeMesh.geometry.attributes.position.array;
        let countDiff = 0;
        let maxDeltaY = 0;
        let zones = { gallery: 0, ramp: 0, atrium: 0 };
        for (let i = 0; i < orig.length; i += 3) {
            let x = orig[i];
            let dy = Math.abs(current[i+1] - orig[i+1]);
            if (dy > 0.05) {
                countDiff++;
                if (dy > maxDeltaY) maxDeltaY = dy;
                if (x < 2.0) zones.gallery++;
                else if (x < 8.0) zones.ramp++;
                else zones.atrium++;
            }
        }
        return { countDiff, maxDeltaY, zones, totalVerts: orig.length / 3 };
    })()
'@
    Write-Host "Mesh displacement stats:"
    $stats | ConvertTo-Json -Depth 4

    # Capture FRONT view
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot (Join-Path $PSScriptRoot "live_app_full_100_front.png")

    # Capture ISO view
    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot (Join-Path $PSScriptRoot "live_app_full_100_iso.png")

    # Capture PERSP view
    Eval-JS "window.setView('PERSP')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot (Join-Path $PSScriptRoot "live_app_full_100_persp.png")

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
