# test_controlnet.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9230
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

                let m1 = null, err1 = null;
                try { m1 = rhino.Mesh.createFromSubDControlNet(geom); } catch(e) { err1 = e.message; }

                let m2 = null, err2 = null;
                try { m2 = rhino.Mesh.createFromSubDControlNet(geom, false); } catch(e) { err2 = e.message; }

                let m3 = null, err3 = null;
                try { m3 = rhino.Mesh.createFromSubDControlNet(geom, true); } catch(e) { err3 = e.message; }

                results.push({
                    call1_arg: { hasMesh: !!m1, err: err1, v: m1 ? m1.vertices().count : 0, f: m1 ? m1.faces().count : 0 },
                    call2_args: { hasMesh: !!m2, err: err2, v: m2 ? m2.vertices().count : 0, f: m2 ? m2.faces().count : 0 },
                    call3_args: { hasMesh: !!m3, err: err3, v: m3 ? m3.vertices().count : 0, f: m3 ? m3.faces().count : 0 }
                });
            }
            return results;
        })()
"@; awaitPromise = $true; returnByValue = $true }

    Write-Output "CONTROLNET RESULTS:"
    Write-Output ($eval.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
