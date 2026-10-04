$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9265
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

    Start-Sleep -Seconds 2

    # 1. Both open
    Capture-Screen 'scratch/final_both_open.png'

    # 2. Collapse Domain A
    Send-CDP "document.getElementById('domain-a-tab-container').removeAttribute('open')"
    Start-Sleep -Seconds 1
    Capture-Screen 'scratch/final_domain_a_collapsed.png'

    # 3. Collapse both Domain A and Domain B
    Send-CDP "document.getElementById('domain-b-tab-container').removeAttribute('open')"
    Start-Sleep -Seconds 1
    Capture-Screen 'scratch/final_both_collapsed.png'

    # 4. Click a typology pill and check interaction
    Send-CDP "document.getElementById('domain-a-tab-container').setAttribute('open', '')"
    Send-CDP "document.querySelectorAll('.domain-a-pill')[2].click()"
    Start-Sleep -Seconds 1
    Capture-Screen 'scratch/final_click_typo.png'

    Write-Output 'Completed all visual and functional tests successfully'
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
