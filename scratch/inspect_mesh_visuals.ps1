$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9267
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", '--disable-gpu', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([uri]$pages[0].webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    
    function Send-CDP($method, $params) {
        $payload = @{ id = 1; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).Wait()
        
        $ms = New-Object System.IO.MemoryStream
        $buf = [byte[]]::new(65536)
        while ($true) {
            $seg = [System.ArraySegment[byte]]::new($buf)
            $r = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::None).Result
            $ms.Write($buf, 0, $r.Count)
            if ($r.EndOfMessage) { break }
        }
        return [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
    }

    function Eval-JS($code) {
        $r = Send-CDP "Runtime.evaluate" @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return ($r | ConvertFrom-Json).result.result.value
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $info = Eval-JS @"
    (() => {
        const doc = window.rhinoDoc; // if stored
        const meshes = window.originalMeshes || [];
        return {
            mesh0: meshes[0] ? {
                name: meshes[0].mesh.name,
                verts: meshes[0].mesh.geometry.attributes.position.count,
                faces: meshes[0].mesh.geometry.index.count / 3
            } : null,
            mesh1: meshes[1] ? {
                name: meshes[1].mesh.name,
                verts: meshes[1].mesh.geometry.attributes.position.count,
                faces: meshes[1].mesh.geometry.index.count / 3
            } : null
        };
    })()
"@
    Write-Output "INFO: ($info | ConvertTo-Json)"

    # Hide mesh0, show only mesh1
    Eval-JS @"
    (() => {
        if (window.originalMeshes[0]) window.originalMeshes[0].mesh.visible = false;
        if (window.originalMeshes[1]) window.originalMeshes[1].mesh.visible = true;
    })()
"@ | Out-Null

    $clip = @{ format = "png"; clip = @{ x = 0; y = 0; width = 1200; height = 800; scale = 1 } }
    $shot = Send-CDP "Page.captureScreenshot" $clip
    $data = ($shot | ConvertFrom-Json).result.data
    if ($data) {
        [System.IO.File]::WriteAllBytes("c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\mesh1_only.png", [System.Convert]::FromBase64String($data))
        Write-Output "Saved mesh1_only.png"
    }

    # Hide mesh1, show only mesh0
    Eval-JS @"
    (() => {
        if (window.originalMeshes[0]) window.originalMeshes[0].mesh.visible = true;
        if (window.originalMeshes[1]) window.originalMeshes[1].mesh.visible = false;
    })()
"@ | Out-Null

    $shot0 = Send-CDP "Page.captureScreenshot" $clip
    $data0 = ($shot0 | ConvertFrom-Json).result.data
    if ($data0) {
        [System.IO.File]::WriteAllBytes("c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\mesh0_only.png", [System.Convert]::FromBase64String($data0))
        Write-Output "Saved mesh0_only.png"
    }

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
