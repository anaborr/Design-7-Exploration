$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9270
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([uri]$pages[0].webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()

    $script:reqId = 1
    function Send-CDP($method, $params = @{}) {
        $id = $script:reqId++
        $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()

        $buf = [byte[]]::new(65536)
        while ($true) {
            $msg = ""
            do {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::None).Result
                $msg += [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
            } while (-not $r.EndOfMessage)

            $json = $msg | ConvertFrom-Json
            if ($json.id -eq $id) { return $json }
        }
    }

    Send-CDP 'Runtime.enable' | Out-Null
    Start-Sleep -Seconds 2
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 5

    # 1. Shot of Mesh 0 (SubDMesh_1) only
    Send-CDP 'Runtime.evaluate' @{ expression = @"
        (() => {
            const meshes = window.originalMeshes || [];
            if (meshes[0]) meshes[0].mesh.visible = true;
            if (meshes[1]) meshes[1].mesh.visible = false;
        })()
"@ } | Out-Null
    Start-Sleep -Seconds 1
    $clip = @{ format = "png"; clip = @{ x = 0; y = 0; width = 1200; height = 800; scale = 1 } }
    $shot0 = Send-CDP "Page.captureScreenshot" $clip
    $d0 = $shot0.result.data
    [System.IO.File]::WriteAllBytes("c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\mesh0_only.png", [System.Convert]::FromBase64String($d0))
    Write-Output "Saved mesh0_only.png"

    # 2. Shot of Mesh 1 (the 494 elements) only
    Send-CDP 'Runtime.evaluate' @{ expression = @"
        (() => {
            const meshes = window.originalMeshes || [];
            if (meshes[0]) meshes[0].mesh.visible = false;
            if (meshes[1]) meshes[1].mesh.visible = true;
        })()
"@ } | Out-Null
    Start-Sleep -Seconds 1
    $shot1 = Send-CDP "Page.captureScreenshot" $clip
    $d1 = $shot1.result.data
    [System.IO.File]::WriteAllBytes("c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\mesh1_only.png", [System.Convert]::FromBase64String($d1))
    Write-Output "Saved mesh1_only.png"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
