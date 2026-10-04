$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9298
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
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Screenshot($filename) {
        $clip = @{
            format = "png"
            clip = @{ x = 0; y = 0; width = 1600; height = 1000; scale = 1 }
        }
        $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
        $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
        if ($screenshotData) {
            $bytes = [System.Convert]::FromBase64String($screenshotData)
            [System.IO.File]::WriteAllBytes($filename, $bytes)
            Write-Output "Screenshot saved to $filename"
        }
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 5

    # Switch to FRONT view and ITERATION mode
    Eval-JS @"
    (() => {
        const btnFront = document.querySelector('button[data-proj=\"FRONT\"]');
        if (btnFront) btnFront.click();
        if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');
        // zero out other sliders
        ['slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        if (window.render) window.render();
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    function Test-Continuity($cVal, $name) {
        Eval-JS @"
        (() => {
            const slider = document.getElementById('slider-dna-c');
            if (slider) {
                slider.value = $cVal;
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (window.render) window.render();
        })()
"@ | Out-Null
        Start-Sleep -Milliseconds 600
        Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\$name"
    }

    Test-Continuity 15 "test_c15_front.png"
    Test-Continuity 50 "test_c50_front.png"
    Test-Continuity 85 "test_c85_front.png"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
