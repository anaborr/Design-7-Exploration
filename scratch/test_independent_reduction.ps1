$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9231
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    function Send-CDP($expr) {
        $payload = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expr; returnByValue = $true } } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = [byte[]]::new(65536)
        $seg = [System.ArraySegment[byte]]::new($buf)
        $r = $ws.ReceiveAsync($seg, $ct).Result
        $msg = [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
        return $msg
    }

    Start-Sleep -Seconds 2
    Send-CDP "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $chk = Send-CDP "window.originalMeshes && window.originalMeshes.length > 0"
        if ($chk -match 'true') { break }
    }

    Write-Output "--- Test Independent Slider Reduction (W=50, B goes 60 -> 0) ---"
    $r = Send-CDP @'
    (() => {
        const sW = document.getElementById('slider-dna-w');
        const sB = document.getElementById('slider-dna-b');
        
        // 1. Both active
        sW.value = 50; sW.dispatchEvent(new Event('input', { bubbles: true }));
        sB.value = 60; sB.dispatchEvent(new Event('input', { bubbles: true }));
        
        const branchCountBoth = window.branchingWallGroup ? window.branchingWallGroup.children.length : 0;
        
        // 2. Reduce Branching to 0 while Whiplash remains 50
        sB.value = 0; sB.dispatchEvent(new Event('input', { bubbles: true }));
        const branchCountAfterBZero = window.branchingWallGroup ? window.branchingWallGroup.children.length : 0;
        const bMetricCount = document.getElementById('metric-b-count')?.textContent;

        // 3. Now reduce Whiplash to 0
        sW.value = 0; sW.dispatchEvent(new Event('input', { bubbles: true }));
        
        const mesh = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
        const currentPos = mesh.geometry.attributes.position.array;
        const origPos = window.originalMeshes[0].originalPositions;
        let maxDisp = 0;
        for (let i = 0; i < currentPos.length; i++) {
            const diff = Math.abs(currentPos[i] - origPos[i]);
            if (diff > maxDisp) maxDisp = diff;
        }

        return JSON.stringify({
            branchCountBoth,
            branchCountAfterBZero,
            bMetricCount,
            compModeAfterBZero: 'ITERATION (since W=50)',
            finalMaxDispAfterBothZero: maxDisp,
            finalCompMode: window.activeVisualCompMode
        });
    })()
'@
    Write-Output $r

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
