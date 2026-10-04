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
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Capture-Screen($filename) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
        $j = $r | ConvertFrom-Json
        [System.IO.File]::WriteAllBytes($filename, [Convert]::FromBase64String($j.result.data))
        Write-Output "Saved screenshot: $filename"
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Setup camera for front-elevation architectural view
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(5.0, 7.5, 32.0);
            window.threeControls.target.set(5.0, 7.5, -4.8);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600

    # 1. Check Baseline 0%
    $baselineMetrics = Eval-JS @"
    (() => {
        const sB = document.getElementById('slider-dna-b');
        sB.value = 0;
        sB.dispatchEvent(new Event('input'));
        return {
            sliderVal: document.getElementById('val-dna-b')?.textContent,
            members: document.getElementById('metric-b-count')?.textContent,
            divisions: document.getElementById('metric-b-divisions')?.textContent,
            h: document.getElementById('metric-b-h')?.textContent,
            v: document.getElementById('metric-b-v')?.textContent,
            d: document.getElementById('metric-b-d')?.textContent,
            mode: document.getElementById('metric-b-orientations')?.textContent
        };
    })()
"@
    Write-Output "--- Baseline at B = 0% ---"
    Write-Output ($baselineMetrics | ConvertTo-Json)

    # 2. Test B = 75% in ALL orientations
    $allMetrics = Eval-JS @"
    (() => {
        const sB = document.getElementById('slider-dna-b');
        sB.value = 75;
        sB.dispatchEvent(new Event('input'));
        
        const sel = document.getElementById('branch-ctrl-orientation');
        if (sel) {
            sel.value = 'ALL';
            sel.dispatchEvent(new Event('change'));
        }
        return {
            sliderVal: document.getElementById('val-dna-b')?.textContent,
            members: document.getElementById('metric-b-count')?.textContent,
            divisions: document.getElementById('metric-b-divisions')?.textContent,
            h: document.getElementById('metric-b-h')?.textContent,
            v: document.getElementById('metric-b-v')?.textContent,
            d: document.getElementById('metric-b-d')?.textContent,
            mode: document.getElementById('metric-b-orientations')?.textContent,
            counts: window.branchingMemberCounts
        };
    })()
"@
    Write-Output "--- B = 75% Mode ALL ---"
    Write-Output ($allMetrics | ConvertTo-Json)
    Start-Sleep -Milliseconds 600
    Capture-Screen "scratch/branching_all_front.png"

    # Set ISO view
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(-8.0, 18.0, 18.0);
            window.threeControls.target.set(5.0, 6.0, -4.8);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screen "scratch/branching_all_iso.png"

    # 3. Test Mode HORIZONTAL
    $hMetrics = Eval-JS @"
    (() => {
        const sel = document.getElementById('branch-ctrl-orientation');
        if (sel) {
            sel.value = 'HORIZONTAL';
            sel.dispatchEvent(new Event('change'));
        }
        return {
            sliderVal: document.getElementById('val-dna-b')?.textContent,
            members: document.getElementById('metric-b-count')?.textContent,
            divisions: document.getElementById('metric-b-divisions')?.textContent,
            h: document.getElementById('metric-b-h')?.textContent,
            v: document.getElementById('metric-b-v')?.textContent,
            d: document.getElementById('metric-b-d')?.textContent,
            mode: document.getElementById('metric-b-orientations')?.textContent,
            counts: window.branchingMemberCounts
        };
    })()
"@
    Write-Output "--- B = 75% Mode HORIZONTAL ---"
    Write-Output ($hMetrics | ConvertTo-Json)
    Start-Sleep -Milliseconds 600
    Capture-Screen "scratch/branching_h_iso.png"

    # 4. Test Mode VERTICAL
    $vMetrics = Eval-JS @"
    (() => {
        const sel = document.getElementById('branch-ctrl-orientation');
        if (sel) {
            sel.value = 'VERTICAL';
            sel.dispatchEvent(new Event('change'));
        }
        return {
            sliderVal: document.getElementById('val-dna-b')?.textContent,
            members: document.getElementById('metric-b-count')?.textContent,
            divisions: document.getElementById('metric-b-divisions')?.textContent,
            h: document.getElementById('metric-b-h')?.textContent,
            v: document.getElementById('metric-b-v')?.textContent,
            d: document.getElementById('metric-b-d')?.textContent,
            mode: document.getElementById('metric-b-orientations')?.textContent,
            counts: window.branchingMemberCounts
        };
    })()
"@
    Write-Output "--- B = 75% Mode VERTICAL ---"
    Write-Output ($vMetrics | ConvertTo-Json)
    Start-Sleep -Milliseconds 600
    Capture-Screen "scratch/branching_v_iso.png"

    # 5. Test Mode DIAGONAL
    $dMetrics = Eval-JS @"
    (() => {
        const sel = document.getElementById('branch-ctrl-orientation');
        if (sel) {
            sel.value = 'DIAGONAL';
            sel.dispatchEvent(new Event('change'));
        }
        return {
            sliderVal: document.getElementById('val-dna-b')?.textContent,
            members: document.getElementById('metric-b-count')?.textContent,
            divisions: document.getElementById('metric-b-divisions')?.textContent,
            h: document.getElementById('metric-b-h')?.textContent,
            v: document.getElementById('metric-b-v')?.textContent,
            d: document.getElementById('metric-b-d')?.textContent,
            mode: document.getElementById('metric-b-orientations')?.textContent,
            counts: window.branchingMemberCounts
        };
    })()
"@
    Write-Output "--- B = 75% Mode DIAGONAL ---"
    Write-Output ($dMetrics | ConvertTo-Json)
    Start-Sleep -Milliseconds 600
    Capture-Screen "scratch/branching_d_iso.png"

    # 6. Reset to B = 0% and ALL mode to verify restoration
    $restoreMetrics = Eval-JS @"
    (() => {
        const sel = document.getElementById('branch-ctrl-orientation');
        if (sel) {
            sel.value = 'ALL';
            sel.dispatchEvent(new Event('change'));
        }
        const sB = document.getElementById('slider-dna-b');
        sB.value = 0;
        sB.dispatchEvent(new Event('input'));
        return {
            sliderVal: document.getElementById('val-dna-b')?.textContent,
            members: document.getElementById('metric-b-count')?.textContent,
            divisions: document.getElementById('metric-b-divisions')?.textContent,
            h: document.getElementById('metric-b-h')?.textContent,
            v: document.getElementById('metric-b-v')?.textContent,
            d: document.getElementById('metric-b-d')?.textContent,
            mode: document.getElementById('metric-b-orientations')?.textContent,
            counts: window.branchingMemberCounts
        };
    })()
"@
    Write-Output "--- Restored at B = 0% ---"
    Write-Output ($restoreMetrics | ConvertTo-Json)
    Start-Sleep -Milliseconds 600
    Capture-Screen "scratch/branching_restored_0pct.png"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'Done', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
