$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9249
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

    # Trigger Branching at 95% (as seen in user's UI screenshot)
    Eval-JS "window.syncBranchingFromDnaSlider(95)" | Out-Null
    Start-Sleep -Seconds 1

    # Check validation and geometry status
    $status = Eval-JS @"
    (() => {
        const wallGroup = window.branchingWallGroup;
        const mesh = wallGroup && wallGroup.children[0];
        const val = window.branchingSystemState.lastValidation;
        return JSON.stringify({
            meshFound: !!mesh,
            polyCount: mesh ? mesh.geometry.attributes.position.count : 0,
            score: val ? val.score : 0,
            summary: val ? val.summary : 'none'
        });
    })()
"@
    Write-Output "STATUS: $status"

    # Capture 1: Main Perspective
    $s1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $s1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\organic_final_perspective.png", [Convert]::FromBase64String($j1.result.data))

    # Capture 2: Close-up on the fluid connection & whiplash crest
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(16, 12, 10);
        window.threeControls.target.set(8, 7, 2);
        window.threeControls.update();
        window.threeRenderer.render(window.threeScene, window.threeCamera);
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $s2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $s2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\organic_final_closeup.png", [Convert]::FromBase64String($j2.result.data))

    Write-Output "Live organic verification completed."
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
