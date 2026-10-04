$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/index.html?v=20261001_v1' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    $script:reqId = 100
    function Send-CDP($m, $p) {
        $script:reqId++
        $myId = $script:reqId
        $payload = @{ id = $myId; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        
        while ($true) {
            $ms = New-Object System.IO.MemoryStream
            $buf = [byte[]]::new(65536)
            while ($true) {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, $ct).Result
                $ms.Write($buf, 0, $r.Count)
                if ($r.EndOfMessage) { break }
            }
            $str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
            $json = $str | ConvertFrom-Json
            if ($json.id -eq $myId) {
                return $str
            }
        }
    }

    function Eval-JS($code) {
        $r = Send-CDP 'Runtime.evaluate' @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Screenshot($filepath) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
        $data = ($r | ConvertFrom-Json).result.data
        if ($data) {
            $bytes = [System.Convert]::FromBase64String($data)
            [System.IO.File]::WriteAllBytes($filepath, $bytes)
            Write-Host "Wrote screenshot to: $filepath"
        }
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 2

    # Check presence of removed boxes
    $check = Eval-JS @'
    (() => {
        return {
            hasIdentityBox: Boolean(document.querySelector('.identity-box')),
            hasSeedProfileCard: Boolean(document.getElementById('seed-profile-card')),
            sidebarLeftHtml: document.getElementById('sidebar-left')?.scrollHeight
        };
    })()
'@
    Write-Host "Element check:"
    $check | ConvertTo-Json

    Save-Screenshot (Join-Path $PSScriptRoot "sidebar_cleaned.png")

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
