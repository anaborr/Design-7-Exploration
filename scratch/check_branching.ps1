$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9225
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
    Write-Output "--- EVAL 1: Check window objects ---"
    $r1 = Send-CDP @'
    (() => {
        return JSON.stringify({
            hasScene: !!window.threeScene,
            hasBranchingGroup: !!window.branchingWallGroup,
            groupChildren: window.branchingWallGroup ? window.branchingWallGroup.children.length : 0,
            originalMeshesCount: window.originalMeshes ? window.originalMeshes.length : 0,
            bounds: window.getModelBounds ? window.getModelBounds() : null,
            state: window.branchingSystemState
        });
    })()
'@
    Write-Output $r1

    Write-Output "--- EVAL 2: Call updateBranchingGeometry manually ---"
    $r2 = Send-CDP @'
    (() => {
        try {
            if (window.updateBranchingGeometry) {
                window.updateBranchingGeometry();
                return JSON.stringify({
                    success: true,
                    groupChildren: window.branchingWallGroup ? window.branchingWallGroup.children.length : 0,
                    lastWalls: !!window.branchingSystemState.lastGeneratedWalls,
                    primaryWall: window.branchingSystemState.lastGeneratedWalls ? window.branchingSystemState.lastGeneratedWalls.primaryWall.centerPoints.length : 0
                });
            } else {
                return JSON.stringify({ error: "updateBranchingGeometry not found" });
            }
        } catch(err) {
            return JSON.stringify({ error: err.message, stack: err.stack });
        }
    })()
'@
    Write-Output $r2

    Write-Output "--- EVAL 3: Console logs & errors ---"
    $r3 = Send-CDP @'
    (() => {
        return JSON.stringify({
            errors: window._lastErrors || [],
            meshGroupChildren: window.meshGroup ? window.meshGroup.children.length : 0
        });
    })()
'@
    Write-Output $r3

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
