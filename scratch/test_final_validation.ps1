$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9290
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

    function Capture-Screenshot($path) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = "png" }
        $json = $r | ConvertFrom-Json
        $bytes = [System.Convert]::FromBase64String($json.result.data)
        [System.IO.File]::WriteAllBytes($path, $bytes)
        Write-Output "Screenshot saved to $path"
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Ensure clean display without cage overlay
    Eval-JS @"
    (() => {
        if (window.wireframeCage) window.wireframeCage.visible = false;
        if (window.cageLinesGroup) window.cageLinesGroup.visible = false;
        if (window.originalMeshes && window.originalMeshes[0]) {
            const m = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
            if (m) m.visible = true;
        }
    })()
"@ | Out-Null

    # Test 1: Clean Baseline (0%)
    Write-Output "--- Test 1: Baseline 0% ---"
    Eval-JS "window.syncBranchingFromDnaSlider(0)" | Out-Null
    Start-Sleep -Milliseconds 600
    $cleanCount = Eval-JS "window.branchingWallGroup ? window.branchingWallGroup.children.length : 0"
    Write-Output "Branching children at 0%: $cleanCount"

    # Test 2: Low Branching (25%) - subtle organic extensions
    Write-Output "--- Test 2: Low Branching (25%) ---"
    Eval-JS "window.syncBranchingFromDnaSlider(25)" | Out-Null
    Start-Sleep -Milliseconds 800
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(-6, 12, 16);
        window.threeControls.target.set(-0.5, 7.5, 0);
        window.threeControls.update();
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\final_branching_low_25.png"

    # Test 3: Medium Branching (55%) - primary flowing wall with carved portal arch
    Write-Output "--- Test 3: Medium Branching (55%) ---"
    Eval-JS "window.syncBranchingFromDnaSlider(55)" | Out-Null
    Start-Sleep -Milliseconds 800
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\final_branching_med_55.png"

    # Test 4: High Branching (90%) - perspective view
    Write-Output "--- Test 4: High Branching (90%) - Perspective ---"
    Eval-JS "window.syncBranchingFromDnaSlider(90)" | Out-Null
    Start-Sleep -Milliseconds 800
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\final_branching_high_90_persp.png"

    # Test 5: High Branching (90%) - View looking through the catenary portal into the alcove
    Write-Output "--- Test 5: High Branching (90%) - Portal Walkthrough ---"
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(4.5, 8.8, 6.5);
        window.threeControls.target.set(-1.0, 8.2, -0.5);
        window.threeControls.update();
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\final_branching_high_90_portal.png"

    # Test 6: High Branching (90%) - View inside the intimate alcove pocket room
    Write-Output "--- Test 6: High Branching (90%) - Alcove Pocket Room ---"
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(-5.5, 9.5, -4.5);
        window.threeControls.target.set(-0.8, 8.0, -1.2);
        window.threeControls.update();
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\final_branching_high_90_alcove.png"

    # Validation audit
    $audit = Eval-JS "JSON.stringify(window.branchingSystemState.lastValidation)"
    Write-Output "Audit Result: $audit"

} finally {
    $proc.Kill()
}
