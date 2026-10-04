$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9278
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

    function Capture-Viewport($name) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = "png" }
        $obj = $r | ConvertFrom-Json
        $bytes = [Convert]::FromBase64String($obj.result.data)
        $outPath = "C:\Users\anabo\.gemini\antigravity-ide\brain\ae7a57af-4b21-4e51-b738-e4b9a296854e\$name.png"
        [IO.File]::WriteAllBytes($outPath, $bytes)
        Write-Output "Saved screenshot: $outPath"
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # 1. Test VERTICAL_VOID Whiplash 70%
    Eval-JS @"
    window.selectDomainATypology('VERTICAL_VOID');
    const sw = document.getElementById('slider-dna-w');
    sw.value = '70';
    sw.dispatchEvent(new Event('input', { bubbles: true }));
"@ | Out-Null
    Start-Sleep -Seconds 1
    Capture-Viewport("whip70_vertical_void")

    # 2. Test CONTINUOUS_HALL Whiplash 70%
    Eval-JS @"
    window.selectDomainATypology('CONTINUOUS_HALL');
    const sw = document.getElementById('slider-dna-w');
    sw.value = '70';
    sw.dispatchEvent(new Event('input', { bubbles: true }));
"@ | Out-Null
    Start-Sleep -Seconds 1
    Capture-Viewport("whip70_continuous_hall")

    # 3. Test LINEAR_GALLERY Whiplash 70%
    Eval-JS @"
    window.selectDomainATypology('LINEAR_GALLERY');
    const sw = document.getElementById('slider-dna-w');
    sw.value = '70';
    sw.dispatchEvent(new Event('input', { bubbles: true }));
"@ | Out-Null
    Start-Sleep -Seconds 1
    Capture-Viewport("whip70_linear_gallery")

    # 4. Test TOPOGRAPHIC_GROUND Whiplash 70%
    Eval-JS @"
    window.selectDomainATypology('TOPOGRAPHIC_GROUND');
    const sw = document.getElementById('slider-dna-w');
    sw.value = '70';
    sw.dispatchEvent(new Event('input', { bubbles: true }));
"@ | Out-Null
    Start-Sleep -Seconds 1
    Capture-Viewport("whip70_topographic_ground")

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
