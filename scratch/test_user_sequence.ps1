$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9280
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    $msgId = 0
    function Send-CDP($method, $params) {
        $script:msgId++
        $payload = @{ id = $script:msgId; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
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

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $test = Eval-JS @"
    (() => {
        // Step 1: select VERTICAL_VOID
        window.selectDomainATypology('VERTICAL_VOID');
        const sw = document.getElementById('slider-dna-w');
        
        // Step 2: move to 50%
        sw.value = '50';
        sw.dispatchEvent(new Event('input', { bubbles: true }));
        const mesh = window.originalMeshes[0].mesh;
        const posStep2 = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));

        // Step 3: user clicks CONTINUOUS_HALL (Domain B not modified yet)
        window.selectDomainATypology('CONTINUOUS_HALL');
        const posStep3 = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));
        const diff23 = posStep2.reduce((acc, v, i) => acc + Math.abs(v - posStep3[i]), 0);

        // Step 4: user changes Domain B (moves slider to 60%)
        sw.value = '60';
        sw.dispatchEvent(new Event('input', { bubbles: true }));
        const posStep4_Hall = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));

        // Now compare: what would pos be if VERTICAL_VOID was at 60%?
        window.selectDomainATypology('VERTICAL_VOID');
        sw.value = '60';
        sw.dispatchEvent(new Event('input', { bubbles: true }));
        const posStep4_Void = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));

        const diffVoidVsHallAt60 = posStep4_Void.reduce((acc, v, i) => acc + Math.abs(v - posStep4_Hall[i]), 0);

        return {
            diff23_ShouldBeZero: diff23,
            diffVoidVsHallAt60_ShouldBeDifferent: diffVoidVsHallAt60,
            posStep4_Hall,
            posStep4_Void
        };
    })()
"@

    Write-Output ($test | ConvertTo-Json -Depth 5)

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
