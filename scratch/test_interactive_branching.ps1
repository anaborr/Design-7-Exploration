$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9229
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
    Start-Sleep -Seconds 3

    Write-Output "--- 1. Set Branching DNA slider to 60% ---"
    $r1 = Send-CDP @'
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 60;
            sliderB.dispatchEvent(new Event('input'));
        }
        const group = window.branchingWallGroup;
        return JSON.stringify({
            enabled: window.branchingSystemState.enabled,
            groupChildren: group ? group.children.length : 0,
            children: group ? group.children.map(c => ({ name: c.name, verts: c.geometry.attributes.position.count })) : []
        });
    })()
'@
    Write-Output $r1

    Write-Output "--- 2. Tweak Branch Count to 4 and Height to 14 ft via UI controls ---"
    $r2 = Send-CDP @'
    (() => {
        const sCount = document.getElementById('branch-ctrl-count');
        const sHeight = document.getElementById('branch-ctrl-height');
        if (sCount) sCount.value = 4;
        if (sHeight) sHeight.value = 14;
        window.onBranchControlChange();

        const group = window.branchingWallGroup;
        return JSON.stringify({
            branchCount: window.branchingSystemState.branchCount,
            wallHeightFt: window.branchingSystemState.wallHeightFt,
            groupChildren: group ? group.children.length : 0,
            children: group ? group.children.map(c => ({ name: c.name, verts: c.geometry.attributes.position.count })) : []
        });
    })()
'@
    Write-Output $r2

    Write-Output "--- 3. Reset / Restore Original Geometry ---"
    $r3 = Send-CDP @'
    (() => {
        window.restoreOriginalImportedGeometry();
        const group = window.branchingWallGroup;
        return JSON.stringify({
            enabled: window.branchingSystemState.enabled,
            groupChildren: group ? group.children.length : 0
        });
    })()
'@
    Write-Output $r3

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
