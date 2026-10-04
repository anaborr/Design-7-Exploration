$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9271
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
    Write-Output "--- Verify Domain B Sliders in DOM ---"
    $domCheck = Eval-JS @"
    (() => {
        return {
            hasC: !!document.getElementById('slider-dna-c'),
            hasW: !!document.getElementById('slider-dna-w'),
            hasB: !!document.getElementById('slider-dna-b'),
            hasM: !!document.getElementById('slider-dna-m'),
            hasV: !!document.getElementById('slider-dna-v'),
            hasG: !!document.getElementById('slider-dna-g'),
            vectorReadout: document.getElementById('readout-form-dna')?.textContent
        };
    })()
"@
    Write-Output "DOM Check: $domCheck"

    Write-Output "--- Test C, W, B Slider Inputs and Responsive Deformation ---"
    $tweakCheck = Eval-JS @"
    (() => {
        window.loadRhinoFromUrl('compressed.3dm');
        window.selectDomainATypology('VERTICAL_VOID');
        const sW = document.getElementById('slider-dna-w');
        sW.value = '65';
        sW.dispatchEvent(new Event('input', { bubbles: true }));
        return {
            dna: window.domainState.dna,
            readout: document.getElementById('readout-form-dna')?.textContent,
            stats: window.lastEngineStats
        };
    })()
"@
    Write-Output "Tweak Check: $tweakCheck"

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
