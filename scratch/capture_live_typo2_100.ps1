$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/index.html?v=20260930_v27' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    $script:reqId = 100
    function Send-CDP($m, $p) {
        $script:reqId++
        $myId = $script:reqId
        $payload = @{ id = $myId; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        
        while ($true) {
            $ms = New-Object System.IO.MemoryStream
            $buf = [byte[]]::new(65536)
            while ($true) {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, $ct).Result
                $ms.Write($buf, 0, $r.Count)
                if ($r.EndOfMessage) { break }
            }
            $str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
            $json = $str | ConvertFrom-Json
            if ($json.id -eq $myId) {
                return $str
            }
        }
    }

    function Eval-JS($code) {
        $r = Send-CDP 'Runtime.evaluate' @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Screenshot($filepath) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
        $data = ($r | ConvertFrom-Json).result.data
        if ($data) {
            $bytes = [System.Convert]::FromBase64String($data)
            [System.IO.File]::WriteAllBytes($filepath, $bytes)
            Write-Host "Wrote screenshot to: $filepath (size: $($bytes.Length))"
        } else {
            Write-Host "Failed to capture screenshot: $r"
        }
    }

    Send-CDP 'Console.enable' @{} | Out-Null
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null

    # Wait for model
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 400
        $c = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0]?.originalPositions)"
        if ($c -eq $true) { 
            Write-Host "Model loaded after attempt $i"
            break 
        }
    }

    # Click Typology 2
    $clickRes = Eval-JS @'
    (() => {
        const pills = document.querySelectorAll('.domain-a-pill');
        if (pills && pills[1]) {
            pills[1].click();
            return 'Clicked: ' + pills[1].innerText.trim().replace(/\s+/g, ' ');
        }
        return 'Pill 1 not found';
    })()
'@
    Write-Host "Typology click: $clickRes"
    Start-Sleep -Milliseconds 500

    # Click Apply Typology
    $applyRes = Eval-JS @'
    (() => {
        const btn = document.querySelector('.domain-a-pill.active') || document.querySelectorAll('.domain-a-pill')[1];
        // Check for typology activation buttons
        const allBtns = Array.from(document.querySelectorAll('button'));
        const actBtn = allBtns.find(b => b.textContent.includes('APPLY') || b.textContent.includes('ACTIVATE'));
        if (actBtn) {
            actBtn.click();
            return 'Clicked button: ' + actBtn.textContent.trim();
        }
        return 'No activate button found';
    })()
'@
    Write-Host "Apply result: $applyRes"
    Start-Sleep -Milliseconds 500

    # Set Slider B to 100%
    $setB = Eval-JS @'
    (() => {
        const sliderC = document.getElementById('slider-dna-c');
        if (sliderC) {
            sliderC.value = 0;
            sliderC.dispatchEvent(new Event('input', { bubbles: true }));
            sliderC.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const sliderW = document.getElementById('slider-dna-w');
        if (sliderW) {
            sliderW.value = 0;
            sliderW.dispatchEvent(new Event('input', { bubbles: true }));
            sliderW.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 100;
            sliderB.dispatchEvent(new Event('input', { bubbles: true }));
            sliderB.dispatchEvent(new Event('change', { bubbles: true }));
            return 'Sliders set: C=0, W=0, B=' + sliderB.value;
        }
        return 'Slider B not found';
    })()
'@
    Write-Host "Slider B: $setB"
    Start-Sleep -Seconds 1

    # Check mesh deformation stats
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
        return { countDiff, maxDeltaY: Math.round(maxDeltaY*100)/100, zones, totalVerts: orig.length / 3 };
    })()
'@
    Write-Host "Live Mesh Stats:"
    $stats | ConvertTo-Json -Depth 4

    # Front view
    Eval-JS @'
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(4, 8, 38);
            window.threeControls.target.set(4, 7, -5);
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        }
    })()
'@
    Start-Sleep -Milliseconds 400
    Save-Screenshot (Join-Path $PSScriptRoot "live_typo2_100_front.png")

    # ISO view
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
    Start-Sleep -Milliseconds 400
    Save-Screenshot (Join-Path $PSScriptRoot "live_typo2_100_iso.png")

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
