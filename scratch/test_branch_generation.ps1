$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9227
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
    Write-Output "--- 1. Load compressed.3dm ---"
    $r0 = Send-CDP "window.loadRhinoFromUrl ? window.loadRhinoFromUrl('compressed.3dm') : 'no loadRhinoFromUrl'"
    Start-Sleep -Seconds 3

    Write-Output "--- 2. Call updateBranchingGeometry ---"
    $r1 = Send-CDP @'
    (() => {
        try {
            window.updateBranchingGeometry();
            const group = window.branchingWallGroup;
            const childInfo = group ? group.children.map(c => ({
                name: c.name,
                vertices: c.geometry ? c.geometry.attributes.position.count : 0,
                faces: c.geometry && c.geometry.index ? c.geometry.index.count / 3 : 0,
                visible: c.visible
            })) : [];
            return JSON.stringify({
                hasGroup: !!group,
                childrenCount: group ? group.children.length : 0,
                children: childInfo
            });
        } catch(e) {
            return JSON.stringify({ error: e.message, stack: e.stack });
        }
    })()
'@
    Write-Output $r1

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
