$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9269
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
    Write-Output "--- Loading Rhino Model ---"
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    Write-Output "--- Testing Branching across Typologies ---"
    $bTest = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const testDna = [0, 0.70, 0, 0, 0, 0]; // Branching 70%
        
        function testB(k) {
            const defPos = window.applyArtNouveauDNA(origPos, testDna, bounds, 75, true, k);
            let maxDX = 0, maxDY = 0, maxDZ = 0;
            for (let i=0; i<defPos.length; i+=3) {
                maxDX = Math.max(maxDX, Math.abs(defPos[i] - origPos[i]));
                maxDY = Math.max(maxDY, Math.abs(defPos[i+1] - origPos[i+1]));
                maxDZ = Math.max(maxDZ, Math.abs(defPos[i+2] - origPos[i+2]));
            }
            return { typo: k, maxDX: Number(maxDX.toFixed(2)), maxDY: Number(maxDY.toFixed(2)), maxDZ: Number(maxDZ.toFixed(2)) };
        }
        return JSON.stringify([
            testB('CONTINUOUS_HALL'),
            testB('VERTICAL_VOID'),
            testB('LINEAR_GALLERY'),
            testB('CASCADED_TERRACED')
        ]);
    })()
"@
    Write-Output "Branching: $bTest"

    Write-Output "--- Testing Whiplash across Typologies ---"
    $wTest = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const testDna = [0, 0, 0.70, 0, 0, 0]; // Whiplash 70%
        
        function testW(k) {
            const defPos = window.applyArtNouveauDNA(origPos, testDna, bounds, 75, true, k);
            let maxDX = 0, maxDY = 0, maxDZ = 0;
            for (let i=0; i<defPos.length; i+=3) {
                maxDX = Math.max(maxDX, Math.abs(defPos[i] - origPos[i]));
                maxDY = Math.max(maxDY, Math.abs(defPos[i+1] - origPos[i+1]));
                maxDZ = Math.max(maxDZ, Math.abs(defPos[i+2] - origPos[i+2]));
            }
            return { typo: k, maxDX: Number(maxDX.toFixed(2)), maxDY: Number(maxDY.toFixed(2)), maxDZ: Number(maxDZ.toFixed(2)) };
        }
        return JSON.stringify([
            testW('VERTICAL_VOID'),
            testW('CONTINUOUS_HALL'),
            testW('FLAT_DEEP_PLAN'),
            testW('TOPOGRAPHIC_GROUND')
        ]);
    })()
"@
    Write-Output "Whiplash: $wTest"

    Write-Output "--- Testing UI Slider Integration (Setting slider-dna-g to 70 in UI) ---"
    $uiTest = Eval-JS @"
    (() => {
        const sG = document.getElementById('slider-dna-g');
        if (!sG) return 'slider-dna-g not found';
        sG.value = '70';
        sG.dispatchEvent(new Event('input', { bubbles: true }));
        return JSON.stringify({
            dna: window.domainState.dna,
            valG: document.getElementById('val-dna-g')?.textContent,
            vectorReadout: document.getElementById('readout-form-dna')?.textContent
        });
    })()
"@
    Write-Output "UI Slider: $uiTest"

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
