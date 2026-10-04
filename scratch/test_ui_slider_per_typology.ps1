$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9275
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

    # Test slider move via actual DOM event dispatch
    $res = Eval-JS @"
    (() => {
        const testTypo = (typoKey, sliderId, val) => {
            // 1. Select typology
            window.selectDomainATypology(typoKey);

            // 2. Set slider value and dispatch input event
            const s = document.getElementById(sliderId);
            s.value = val.toString();
            s.dispatchEvent(new Event('input', { bubbles: true }));

            // 3. Read current mesh positions from Three.js scene
            const mesh = window.originalMeshes && window.originalMeshes[0]?.mesh;
            const pos = mesh ? Array.from(mesh.geometry.attributes.position.array.slice(0, 30)) : [];
            
            // Also reset slider back to 0
            s.value = '0';
            s.dispatchEvent(new Event('input', { bubbles: true }));

            return pos;
        };

        const wVoid = testTypo('VERTICAL_VOID', 'slider-dna-w', 70);
        const wGallery = testTypo('LINEAR_GALLERY', 'slider-dna-w', 70);
        const wHall = testTypo('CONTINUOUS_HALL', 'slider-dna-w', 70);
        const wGround = testTypo('TOPOGRAPHIC_GROUND', 'slider-dna-w', 70);

        const diffVoidGallery = wVoid.reduce((acc, v, i) => acc + Math.abs(v - wGallery[i]), 0);
        const diffVoidHall = wVoid.reduce((acc, v, i) => acc + Math.abs(v - wHall[i]), 0);
        const diffVoidGround = wVoid.reduce((acc, v, i) => acc + Math.abs(v - wGround[i]), 0);

        return {
            diffVoidGallery,
            diffVoidHall,
            diffVoidGround,
            wVoidSlice: wVoid.slice(0, 6),
            wGallerySlice: wGallery.slice(0, 6)
        };
    })()
"@

    Write-Output ($res | ConvertTo-Json -Depth 5)

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
