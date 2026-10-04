$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9286
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

    # Set camera for good architectural view of terrace and branching zone
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(-6, 14, 18);
            window.threeControls.target.set(0, 7, 0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600

    # Test 1: Low Branching (25%)
    Write-Output "--- Testing Low Branching (25%) ---"
    Eval-JS "window.syncBranchingFromDnaSlider(25)" | Out-Null
    Start-Sleep -Milliseconds 800
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\live_branching_low_25.png"

    # Test 2: Medium Branching (55%)
    Write-Output "--- Testing Medium Branching (55%) ---"
    Eval-JS "window.syncBranchingFromDnaSlider(55)" | Out-Null
    Start-Sleep -Milliseconds 800
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\live_branching_med_55.png"

    # Test 3: High Branching (85%)
    Write-Output "--- Testing High Branching (85%) ---"
    Eval-JS "window.syncBranchingFromDnaSlider(85)" | Out-Null
    Start-Sleep -Milliseconds 800
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\live_branching_high_85.png"

} finally {
    $proc.Kill()
}
