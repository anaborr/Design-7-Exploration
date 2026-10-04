$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9281
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

    # 1. Click VERTICAL_VOID button and set Whiplash to 70%
    $r1 = Eval-JS @"
    (() => {
        const btn = document.querySelector('[data-key=\"VERTICAL_VOID\"]');
        btn.click();
        const sw = document.getElementById('slider-dna-w');
        sw.value = '70';
        sw.dispatchEvent(new Event('input', { bubbles: true }));

        const mesh = window.originalMeshes[1].mesh;
        return {
            title: document.getElementById('domain-a-selected-title')?.textContent,
            selectedTypo: window.domainState?.selectedTypology,
            wVal: sw.value,
            posSample: Array.from(mesh.geometry.attributes.position.array.slice(0, 9))
        };
    })()
"@
    Write-Output "Step 1 (Vertical Void 70%):"
    Write-Output ($r1 | ConvertTo-Json -Depth 5)

    # 2. Click CONTINUOUS_HALL button (Domain B not modified yet)
    $r2 = Eval-JS @"
    (() => {
        const btn = document.querySelector('[data-key=\"CONTINUOUS_HALL\"]');
        btn.click();
        const mesh = window.originalMeshes[1].mesh;
        return {
            title: document.getElementById('domain-a-selected-title')?.textContent,
            selectedTypo: window.domainState?.selectedTypology,
            posSample: Array.from(mesh.geometry.attributes.position.array.slice(0, 9))
        };
    })()
"@
    Write-Output "Step 2 (Clicked Continuous Hall, unchanged geometry):"
    Write-Output ($r2 | ConvertTo-Json -Depth 5)

    # 3. Change Domain B (move slider to 71%)
    $r3 = Eval-JS @"
    (() => {
        const sw = document.getElementById('slider-dna-w');
        sw.value = '71';
        sw.dispatchEvent(new Event('input', { bubbles: true }));

        const mesh = window.originalMeshes[1].mesh;
        return {
            title: document.getElementById('domain-a-selected-title')?.textContent,
            selectedTypo: window.domainState?.selectedTypology,
            wVal: sw.value,
            posSample: Array.from(mesh.geometry.attributes.position.array.slice(0, 9))
        };
    })()
"@
    Write-Output "Step 3 (Nudged slider to 71% in Continuous Hall):"
    Write-Output ($r3 | ConvertTo-Json -Depth 5)

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
