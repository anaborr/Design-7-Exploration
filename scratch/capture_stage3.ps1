$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9232
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1400,900', 'http://127.0.0.1:8080/' -PassThru
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
        return Send-CDP "Runtime.evaluate" @{ expression = $code; returnByValue = $true; awaitPromise = $true }
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Fit camera and set angle
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(5, 10, 42);
            window.threeControls.target.set(5, 10, -5);
            window.threeControls.update();
            if (window.threeRenderer && window.threeScene) {
                window.threeRenderer.render(window.threeScene, window.threeCamera);
            }
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    # Set B to 60%
    Eval-JS @"
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 60;
            sliderB.dispatchEvent(new Event('input'));
        }
        if (window.threeRenderer && window.threeScene && window.threeCamera) {
            window.threeRenderer.render(window.threeScene, window.threeCamera);
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 2

    # Take screenshot of canvas
    $canvasData = Eval-JS "document.querySelector('#webgl-container canvas').toDataURL('image/png')"
    $json = $canvasData | ConvertFrom-Json
    $dataUrl = $json.result.result.value
    if ($dataUrl -match '^data:image/png;base64,(.+)$') {
        $bytes = [Convert]::FromBase64String($matches[1])
        $outPath = 'C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\branching_stage3_preview.png'
        [System.IO.File]::WriteAllBytes($outPath, $bytes)
        Write-Output "Screenshot saved to: $outPath (bytes: $($bytes.Length))"
    } else {
        Write-Output "Failed to extract base64 data"
    }

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
