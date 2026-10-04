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
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Capture-Screen($filename) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
        $j = $r | ConvertFrom-Json
        [System.IO.File]::WriteAllBytes($filename, [Convert]::FromBase64String($j.result.data))
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 3

    # Set Slider B to 70% and open controls
    Eval-JS @"
    (() => {
        const sB = document.getElementById('slider-dna-b');
        sB.value = 70;
        sB.dispatchEvent(new Event('input'));

        // Scroll slider-dna-b into view
        const sBEl = document.getElementById('slider-dna-b');
        if (sBEl) sBEl.scrollIntoView({ behavior: 'instant', block: 'center' });
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600

    # Capture clip of left sidebar
    $clipParams = @{
        clip = @{
            x = 0
            y = 0
            width = 460
            height = 1000
            scale = 1
        }
        format = 'png'
    }
    $r = Send-CDP "Page.captureScreenshot" $clipParams
    $j = $r | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("scratch/domain_b_ui_sidebar.png", [Convert]::FromBase64String($j.result.data))
    Write-Output "Saved sidebar screenshot"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'Done', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
