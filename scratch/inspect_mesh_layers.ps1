$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9374
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
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
        $parsed = $r | ConvertFrom-Json
        return $parsed.result.result.value
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 4

    $analysis = Eval-JS @'
    (() => {
        const mesh = window.originalMeshes[0];
        const p = mesh.originalPositions;
        
        // Let's sample slices across X to see the Y layers
        const xSamples = [-6, -4, -2, 0, 2, 5, 8, 12, 16];
        const result = {};

        xSamples.forEach(xTarget => {
            let yVals = [];
            for (let i = 0; i < p.length; i += 3) {
                let x = p[i], y = p[i+1], z = p[i+2];
                if (Math.abs(x - xTarget) < 0.6) {
                    yVals.push(+y.toFixed(2));
                }
            }
            yVals.sort((a,b) => a - b);
            
            // Group into distinct layers (where gap > 1.2 units)
            let layers = [];
            if (yVals.length > 0) {
                let currGroup = [yVals[0]];
                for (let k = 1; k < yVals.length; k++) {
                    if (yVals[k] - yVals[k-1] > 1.2) {
                        layers.push({
                            min: currGroup[0],
                            max: currGroup[currGroup.length-1],
                            count: currGroup.length
                        });
                        currGroup = [yVals[k]];
                    } else {
                        currGroup.push(yVals[k]);
                    }
                }
                layers.push({
                    min: currGroup[0],
                    max: currGroup[currGroup.length-1],
                    count: currGroup.length
                });
            }
            result['x=' + xTarget] = layers;
        });

        return result;
    })()
'@

    Write-Host ($analysis | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
