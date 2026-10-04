$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9255
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
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    Write-Output "=== 1. Test Slider Branching DNA at 80% ==="
    $r1 = Eval-JS @"
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 80;
            sliderB.dispatchEvent(new Event('input'));
        }
        const group = window.branchingWallGroup;
        const val = window.branchingSystemState.lastValidation;
        const statusBadge = document.getElementById('branching-val-status');
        return JSON.stringify({
            enabled: window.branchingSystemState.enabled,
            groupChildrenCount: group ? group.children.length : 0,
            children: group ? group.children.map(c => ({ name: c.name, type: c.type })) : [],
            statusText: statusBadge ? statusBadge.textContent : '',
            score: val ? val.score : 0,
            checksCount: val ? val.checks.length : 0
        });
    })()
"@
    Write-Output $r1

    Write-Output "=== 2. Switch Spatial Purpose to Workspace and Anchor to TERRACE ==="
    $r2 = Eval-JS @"
    (() => {
        const selPurpose = document.getElementById('branch-ctrl-purpose');
        const selAnchor = document.getElementById('branch-ctrl-anchor');
        if (selPurpose) selPurpose.value = 'Workspace';
        if (selAnchor) selAnchor.value = 'TERRACE';
        window.onBranchControlChange();

        const group = window.branchingWallGroup;
        const val = window.branchingSystemState.lastValidation;
        return JSON.stringify({
            anchor: window.branchingSystemState.anchorRegion,
            purpose: window.branchingSystemState.spatialPurpose,
            groupChildrenCount: group ? group.children.length : 0,
            children: group ? group.children.map(c => ({ name: c.name })) : [],
            score: val ? val.score : 0,
            checks: val ? val.checks.map(c => ({ name: c.name, value: c.value, pass: c.pass })) : []
        });
    })()
"@
    Write-Output $r2

    Write-Output "=== 3. Switch back to SHOULDER Meeting Zone and Capture Perspective Screenshot ==="
    Eval-JS @"
    (() => {
        const selPurpose = document.getElementById('branch-ctrl-purpose');
        const selAnchor = document.getElementById('branch-ctrl-anchor');
        if (selPurpose) selPurpose.value = 'Meeting';
        if (selAnchor) selAnchor.value = 'SHOULDER';
        window.onBranchControlChange();
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    $shotPath = "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\live_branching_verified.png"
    $shot = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j = $shot | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes($shotPath, [Convert]::FromBase64String($j.result.data))
    Write-Output "Screenshot saved to $shotPath"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
