# inspect_rhino_mesh_methods.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9229
$tempProfile = Join-Path $env:TEMP ("chrome_test_" + [guid]::NewGuid().ToString().Substring(0, 8))
$proc = Start-Process -FilePath $chromePath -ArgumentList "--headless=new", "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", "--disable-gpu", "http://127.0.0.1:8080/" -PassThru

Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.type -eq "page" -and $_.url -like "*8080*" } | Select-Object -First 1
    if (-not $page) { $page = $pages[0] }
    $wsUrl = $page.webSocketDebuggerUrl

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$wsUrl, $ct).Wait()

    $script:reqId = 1
    function Send-CDP($method, $params = @{}) {
        $id = $script:reqId++
        $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()

        $buf = [byte[]]::new(65536)
        while ($true) {
            $msg = ""
            do {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, $ct).Result
                $msg += [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
            } while (-not $r.EndOfMessage)

            $json = $msg | ConvertFrom-Json
            if ($json.id -eq $id) { return $json }
        }
    }

    Send-CDP "Runtime.enable" | Out-Null
    Start-Sleep -Seconds 2

    $inspect = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const meshStaticMethods = [];
            for (let k in rhino.Mesh) {
                meshStaticMethods.push(k);
            }
            const meshProtoMethods = [];
            for (let k in rhino.Mesh.prototype) {
                meshProtoMethods.push(k);
            }
            const subdProtoMethods = [];
            for (let k in rhino.SubD.prototype) {
                subdProtoMethods.push(k);
            }
            return {
                rhinoVersion: rhino.version ? (typeof rhino.version === 'function' ? rhino.version() : rhino.version) : 'unknown',
                meshStaticMethods: meshStaticMethods,
                meshProtoMethods: meshProtoMethods.slice(0, 30),
                subdProtoMethods: subdProtoMethods
            };
        })()
"@; returnByValue = $true }

    Write-Output "RHINO API METHODS:"
    Write-Output ($inspect.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
