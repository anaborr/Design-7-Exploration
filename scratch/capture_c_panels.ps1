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
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Panel-Screenshot($filename) {
        # Scroll the left sidebar so slider-dna-c is fully visible
        Eval-JS "const el = document.getElementById('slider-dna-c'); if (el) el.scrollIntoView({block: 'center'});" | Out-Null
        Start-Sleep -Milliseconds 400

        $clip = @{
            format = "png"
            clip = @{
                x = 0
                y = 350
                width = 380
                height = 550
                scale = 1
            }
        }
        $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
        $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
        if ($screenshotData) {
            $bytes = [System.Convert]::FromBase64String($screenshotData)
            [System.IO.File]::WriteAllBytes($filename, $bytes)
            Write-Output "Panel screenshot saved to $filename"
        }
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # 1. Low C (15%)
    Eval-JS @"
    (() => {
        const slider = document.getElementById('slider-dna-c');
        if (slider) { slider.value = 15; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Panel-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\panel_c_low.png"

    # 2. Med C (50%)
    Eval-JS @"
    (() => {
        const slider = document.getElementById('slider-dna-c');
        if (slider) { slider.value = 50; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Panel-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\panel_c_med.png"

    # 3. High C (85%)
    Eval-JS @"
    (() => {
        const slider = document.getElementById('slider-dna-c');
        if (slider) { slider.value = 85; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Panel-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\panel_c_high.png"

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
