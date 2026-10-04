$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9276
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
        const testTypo = (typoKey, sliderId, val) => {
            window.selectDomainATypology(typoKey);
            const s = document.getElementById(sliderId);
            s.value = val.toString();
            s.dispatchEvent(new Event('input', { bubbles: true }));

            const mesh = window.originalMeshes && window.originalMeshes[0]?.mesh;
            const pos = mesh ? Array.from(mesh.geometry.attributes.position.array) : [];
            
            s.value = '0';
            s.dispatchEvent(new Event('input', { bubbles: true }));
            return pos;
        };

        // Test Continuity (slider-dna-c)
        const cVoid = testTypo('VERTICAL_VOID', 'slider-dna-c', 70);
        const cGallery = testTypo('LINEAR_GALLERY', 'slider-dna-c', 70);
        const cHall = testTypo('CONTINUOUS_HALL', 'slider-dna-c', 70);
        const cGround = testTypo('TOPOGRAPHIC_GROUND', 'slider-dna-c', 70);

        const diffC_VoidGallery = cVoid.reduce((acc, v, i) => acc + Math.abs(v - cGallery[i]), 0);
        const diffC_VoidHall = cVoid.reduce((acc, v, i) => acc + Math.abs(v - cHall[i]), 0);
        const diffC_VoidGround = cVoid.reduce((acc, v, i) => acc + Math.abs(v - cGround[i]), 0);

        // Test Branching (slider-dna-b)
        const bVoid = testTypo('VERTICAL_VOID', 'slider-dna-b', 70);
        const bGallery = testTypo('LINEAR_GALLERY', 'slider-dna-b', 70);
        const bHall = testTypo('CONTINUOUS_HALL', 'slider-dna-b', 70);
        const bGround = testTypo('TOPOGRAPHIC_GROUND', 'slider-dna-b', 70);

        const diffB_VoidGallery = bVoid.reduce((acc, v, i) => acc + Math.abs(v - bGallery[i]), 0);
        const diffB_VoidHall = bVoid.reduce((acc, v, i) => acc + Math.abs(v - bHall[i]), 0);
        const diffB_VoidGround = bVoid.reduce((acc, v, i) => acc + Math.abs(v - bGround[i]), 0);

        return {
            diffC_VoidGallery,
            diffC_VoidHall,
            diffC_VoidGround,
            diffB_VoidGallery,
            diffB_VoidHall,
            diffB_VoidGround
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
