$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9237
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

    # Ensure Branching is OFF so we see the original model clearly
    Eval-JS "window.syncBranchingFromDnaSlider(0)" | Out-Null
    Start-Sleep -Seconds 1

    # Angle 1: Perspective (Default)
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $shot1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\model_default.png", [Convert]::FromBase64String($j1.result.data))

    # Angle 2: Side view (looking at the curve of the chair/canopy)
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(5, 12, 35);
            window.threeControls.target.set(5, 8, -5);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $shot2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\model_side.png", [Convert]::FromBase64String($j2.result.data))

    # Angle 3: 3/4 Back view
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(30, 20, -25);
            window.threeControls.target.set(5, 8, -5);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot3 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j3 = $shot3 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\model_back.png", [Convert]::FromBase64String($j3.result.data))

    Write-Output "Captured 3 views of original model."
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
