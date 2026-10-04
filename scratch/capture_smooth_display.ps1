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

    # Trigger Branching DNA slider to 75%
    Eval-JS @"
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 75;
            sliderB.dispatchEvent(new Event('input'));
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    # 1. Capture Smooth Display View (pure solid mesh, no wireframe overlays)
    Eval-JS @"
    (() => {
        const bCage = document.getElementById('btn-toggle-cage');
        const bCurves = document.getElementById('btn-toggle-curves');
        if (bCage && bCage.classList.contains('active')) bCage.click();
        if (bCurves && bCurves.classList.contains('active')) bCurves.click();
        
        // Hide debug marker for clean architectural presentation
        if (window.branchingWallGroup) {
            const dbg = window.branchingWallGroup.getObjectByName('DebugSourceVisualizer');
            if (dbg) dbg.visible = false;
        }
        
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(28, 18, 32);
            window.threeControls.target.set(3.5, 6.0, 0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes1 = [Convert]::FromBase64String(($shot1 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\consistent_smooth_display.png", $bytes1)
    Write-Output "Saved consistent_smooth_display.png"

    # 2. Capture Smooth Closeup View of connection
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(11, 8.5, 6.5);
            window.threeControls.target.set(3.8, 6.2, -0.6);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes2 = [Convert]::FromBase64String(($shot2 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\consistent_smooth_closeup.png", $bytes2)
    Write-Output "Saved consistent_smooth_closeup.png"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
