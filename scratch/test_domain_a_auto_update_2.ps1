$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9272
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
        $obj = $r | ConvertFrom-Json
        if ($obj.result.result.value) { return $obj.result.result.value }
        if ($obj.result.result.description) { return $obj.result.result.description }
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $res = Eval-JS @"
    (() => {
        // Step 1: Select VERTICAL_VOID
        window.selectDomainATypology('VERTICAL_VOID');
        
        // Step 2: Set WHIPLASH to 75 and CONTINUITY to 50
        const sW = document.getElementById('slider-dna-w');
        sW.value = '75';
        sW.dispatchEvent(new Event('input', { bubbles: true }));
        
        const sC = document.getElementById('slider-dna-c');
        sC.value = '50';
        sC.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Record pos1
        const mesh1 = window.originalMeshes[0]?.mesh;
        const pos1 = mesh1 ? Array.from(mesh1.geometry.attributes.position.array.slice(0, 6)) : null;

        // Step 3: Select TOPOGRAPHIC_GROUND
        window.selectDomainATypology('TOPOGRAPHIC_GROUND');
        
        // Record pos2
        const mesh2 = window.originalMeshes[0]?.mesh;
        const pos2 = mesh2 ? Array.from(mesh2.geometry.attributes.position.array.slice(0, 6)) : null;

        return {
            pos1: pos1,
            pos2: pos2,
            isGeometryDifferent: JSON.stringify(pos1) !== JSON.stringify(pos2),
            sliderWValue: document.getElementById('slider-dna-w').value,
            selectedTypo: window.domainState.selectedTypology
        };
    })()
"@
    Write-Output "VERIFICATION RESULT 2:"
    Write-Output $res

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
