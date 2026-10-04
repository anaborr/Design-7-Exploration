$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9270
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
        $obj = $r | ConvertFrom-Json
        if ($obj.result.result.value) { return $obj.result.result.value }
        if ($obj.result.result.description) { return $obj.result.result.description }
        return $r
    }

    function Capture-Viewport($filename) {
        $base64 = Eval-JS @"
        (() => {
            if (!window.threeRenderer || !window.threeScene || !window.threeCamera) return null;
            window.threeRenderer.render(window.threeScene, window.threeCamera);
            const dataUrl = window.threeRenderer.domElement.toDataURL('image/png');
            return dataUrl.replace(/^data:image\/png;base64,/, '');
        })()
"@
        if ($base64 -and $base64.Length -gt 100) {
            $bytes = [Convert]::FromBase64String($base64)
            [IO.File]::WriteAllBytes($filename, $bytes)
            Write-Output "Saved: $filename ($($bytes.Length) bytes)"
        } else {
            Write-Warning "Failed to capture canvas."
        }
    }

    Start-Sleep -Seconds 2
    Write-Output "--- 1. Load Rhino Seed ---"
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Fit camera for good 3/4 perspective
    Eval-JS "if (window.fitCamera) window.fitCamera();" | Out-Null
    Start-Sleep -Seconds 1

    Write-Output "--- 2. Capture Vertical Void Lobby with Growth = 70% ---"
    Eval-JS @"
    (() => {
        window.selectDomainATypology('VERTICAL_VOID');
        const sG = document.getElementById('slider-dna-g');
        if (sG) {
            sG.value = '70';
            sG.dispatchEvent(new Event('input', { bubbles: true }));
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 2
    $artDir = "C:\Users\anabo\.gemini\antigravity-ide\brain\ae7a57af-4b21-4e51-b738-e4b9a296854e"
    Capture-Viewport "$artDir\growth_70_vertical_void.png"

    Write-Output "--- 3. Capture Continuous Hall Lobby with Growth = 70% ---"
    Eval-JS @"
    (() => {
        window.selectDomainATypology('CONTINUOUS_HALL');
        window.updateDnaUIAndViewport();
    })()
"@ | Out-Null
    Start-Sleep -Seconds 2
    Capture-Viewport "$artDir\growth_70_continuous_hall.png"

    Write-Output "--- 4. Capture Linear Gallery Lobby with Growth = 70% ---"
    Eval-JS @"
    (() => {
        window.selectDomainATypology('LINEAR_GALLERY');
        window.updateDnaUIAndViewport();
    })()
"@ | Out-Null
    Start-Sleep -Seconds 2
    Capture-Viewport "$artDir\growth_70_linear_gallery.png"

    Write-Output "--- Capture Completed Successfully ---"

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force
    }
    if (Test-Path $tempProfile) {
        Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
}
