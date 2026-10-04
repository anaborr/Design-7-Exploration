$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9285
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

    $jsCode = @'
    (() => {
        const results = {};

        // 1. Initial baseline check
        const mesh = window.originalMeshes[1]?.mesh || window.originalMeshes[0]?.mesh;
        const baselinePos = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));

        // 2. Select LINEAR_GALLERY without moving Domain B -> geometry MUST NOT change
        document.querySelector('[data-key="LINEAR_GALLERY"]').click();
        const posAfterGalleryClick = Array.from(mesh.geometry.attributes.position.array.slice(0, 15));
        const diffGalleryUnmodified = baselinePos.reduce((acc, v, i) => acc + Math.abs(v - posAfterGalleryClick[i]), 0);

        results.ruleA_SelectionAloneDoesNotChangeGeometry = {
            diffFromBaseline: diffGalleryUnmodified,
            pass: diffGalleryUnmodified === 0
        };

        // Helper to test typology deformation
        const testTypoWithSlider = (typoKey, sliderId, val) => {
            document.querySelector(`[data-key="${typoKey}"]`).click();
            const s = document.getElementById(sliderId);
            s.value = val.toString();
            s.dispatchEvent(new Event('input', { bubbles: true }));

            const pos = Array.from(mesh.geometry.attributes.position.array);
            const title = document.getElementById('title-dna-w')?.textContent;
            const qual = document.getElementById('def-dna-w-qual')?.textContent;

            // Reset slider back
            s.value = '0';
            s.dispatchEvent(new Event('input', { bubbles: true }));

            return { pos, title, qual };
        };

        const tVoid = testTypoWithSlider('VERTICAL_VOID', 'slider-dna-w', 70);
        const tGallery = testTypoWithSlider('LINEAR_GALLERY', 'slider-dna-w', 70);
        const tHall = testTypoWithSlider('CONTINUOUS_HALL', 'slider-dna-w', 70);
        const tGround = testTypoWithSlider('TOPOGRAPHIC_GROUND', 'slider-dna-w', 70);

        const diffVoidGallery = tVoid.pos.reduce((acc, v, i) => acc + Math.abs(v - tGallery.pos[i]), 0);
        const diffVoidHall = tVoid.pos.reduce((acc, v, i) => acc + Math.abs(v - tHall.pos[i]), 0);
        const diffVoidGround = tVoid.pos.reduce((acc, v, i) => acc + Math.abs(v - tGround.pos[i]), 0);
        const diffGalleryHall = tGallery.pos.reduce((acc, v, i) => acc + Math.abs(v - tHall.pos[i]), 0);

        results.domainB_WhiplashDistinctOutcomes = {
            diffVoidGallery: Math.round(diffVoidGallery),
            diffVoidHall: Math.round(diffVoidHall),
            diffVoidGround: Math.round(diffVoidGround),
            diffGalleryHall: Math.round(diffGalleryHall),
            pass: diffVoidGallery > 5000 && diffVoidHall > 5000 && diffVoidGround > 5000
        };

        results.activeRuleTitles = {
            verticalVoidWTitle: tVoid.title,
            linearGalleryWTitle: tGallery.title,
            continuousHallWTitle: tHall.title,
            topographicGroundWTitle: tGround.title
        };

        return results;
    })()
'@

    $res = Eval-JS $jsCode
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
