$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9226
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
    Write-Output $r0
    Start-Sleep -Seconds 3

    Write-Output "--- 2. Inspect original meshes & bounds ---"
    $r1 = Send-CDP @'
    (() => {
        const bounds = window.getModelBounds ? window.getModelBounds() : null;
        const meshCount = window.originalMeshes ? window.originalMeshes.length : 0;
        let posCount = 0;
        if (meshCount > 0 && window.originalMeshes[0].originalPositions) {
            posCount = window.originalMeshes[0].originalPositions.length;
        }
        return JSON.stringify({ meshCount, posCount, bounds });
    })()
'@
    Write-Output $r1

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
