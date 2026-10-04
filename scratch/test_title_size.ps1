$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1440,900', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($expr) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        return [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
    }

    function Capture-Screen($filename) {
        $payload = @{ id = 2; method = 'Page.captureScreenshot'; params = @{ format = 'png' } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $ms = New-Object System.IO.MemoryStream
        $buf = [byte[]]::new(65536)
        do {
            $seg = [System.ArraySegment[byte]]::new($buf)
            $r = $ws.ReceiveAsync($seg, $ct).Result
            $ms.Write($buf, 0, $r.Count)
        } while (-not $r.EndOfMessage)
        $str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
        $json = $str | ConvertFrom-Json
        $bytesOut = [Convert]::FromBase64String($json.result.data)
        [System.IO.File]::WriteAllBytes($filename, $bytesOut)
    }

    # Test 1: NOUVOGEN at 8.5pt (~11.3px)
    Send-CDP "var el = document.querySelector('.brand-main-title'); el.textContent = 'NOUVOGEN'; el.style.setProperty('font-size', '8.5pt', 'important'); el.style.setProperty('font-weight', '600'); el.style.setProperty('letter-spacing', '1.2px'); el.style.setProperty('color', '#ffffff');"
    Start-Sleep -Seconds 1
    Capture-Screen 'scratch/title_8_5pt.png'

    # Test 2: NOUVOGEN at 10pt (~13.3px)
    Send-CDP "var el = document.querySelector('.brand-main-title'); el.style.setProperty('font-size', '10pt', 'important'); el.style.setProperty('letter-spacing', '1.5px');"
    Start-Sleep -Seconds 1
    Capture-Screen 'scratch/title_10pt.png'

    # Test 3: NOUVOGEN at 11pt (~14.7px)
    Send-CDP "var el = document.querySelector('.brand-main-title'); el.style.setProperty('font-size', '11pt', 'important');"
    Start-Sleep -Seconds 1
    Capture-Screen 'scratch/title_11pt.png'

    Write-Output 'Completed title size tests'
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
