# test_subdivide.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9231
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

    $eval = Send-CDP "Runtime.evaluate" @{ expression = @"
        (async () => {
            const resp = await fetch('compressed.3dm');
            const buf = await resp.arrayBuffer();
            const doc = rhino.File3dm.fromByteArray(new Uint8Array(buf));
            const objs = doc.objects();
            const results = [];
            for (let i = 0; i < objs.count; i++) {
                const geom = objs.get(i).geometry();
                if (!geom || geom.objectType !== rhino.ObjectType.SubD) continue;

                const res = {};
                for (let level = 0; level <= 3; level++) {
                    try {
                        const copy = geom.duplicate();
                        if (level > 0) {
                            copy.subdivide(level);
                        }
                        const m = rhino.Mesh.createFromSubDControlNet(copy, false);
                        res['subdivide_' + level] = {
                            v: m ? m.vertices().count : 0,
                            f: m ? m.faces().count : 0
                        };
                    } catch(e) {
                        res['subdivide_' + level] = { err: e.message };
                    }
                }
                results.push(res);
            }
            return results;
        })()
"@; awaitPromise = $true; returnByValue = $true }

    Write-Output "SUBDIVISION LEVEL RESULTS:"
    Write-Output ($eval.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
