$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9233
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
        $respStr = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
        return $respStr
    }

    function Eval-JS($code) {
        $r = Send-CDP "Runtime.evaluate" @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Trigger Branching at 100%
    Eval-JS "window.syncBranchingFromDnaSlider(100)" | Out-Null
    Start-Sleep -Seconds 1

    $info = Eval-JS @"
    (() => {
        const wallGroup = window.branchingWallGroup;
        const meshCount = wallGroup ? wallGroup.children.length : 0;
        let wallInfo = null;
        if (meshCount > 0) {
            const m = wallGroup.children[0];
            const p = m.geometry.attributes.position;
            m.geometry.computeBoundingBox();
            wallInfo = {
                vertexCount: p.count,
                box: { min: m.geometry.boundingBox.min, max: m.geometry.boundingBox.max },
                cs0: window.branchingSystemState.lastGeneratedWalls?.primaryWall?.crossSections[0],
                csLast: window.branchingSystemState.lastGeneratedWalls?.primaryWall?.crossSections.slice(-1)[0]
            };
        }
        return JSON.stringify({ meshCount, wallInfo });
    })()
"@
    Write-Output "WALL INFO: $info"

    # Capture view 1 (default camera)
    $shot = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $json = $shot | ConvertFrom-Json
    if ($json.result.data) {
        $outPath = "C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\wall_view1.png"
        [System.IO.File]::WriteAllBytes($outPath, [Convert]::FromBase64String($json.result.data))
        Write-Output "Saved: $outPath"
    }

    # Rotate camera to side/close-up view of the connection
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(10, 14, 8);
            window.threeControls.target.set(4.5, 10, -0.5);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $json2 = $shot2 | ConvertFrom-Json
    if ($json2.result.data) {
        $outPath2 = "C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\wall_view2_closeup.png"
        [System.IO.File]::WriteAllBytes($outPath2, [Convert]::FromBase64String($json2.result.data))
        Write-Output "Saved: $outPath2"
    }

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
