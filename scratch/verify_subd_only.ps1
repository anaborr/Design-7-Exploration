$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9245
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

    Start-Sleep -Seconds 2
    Write-Output "Loading compressed.3dm..."
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $test = Eval-JS @"
    (() => {
        const btnMesh = document.getElementById('btn-toggle-mesh');
        const btnCage = document.getElementById('btn-toggle-cage');
        const btnCurves = document.getElementById('btn-toggle-curves');

        const allToolbarGroups = Array.from(document.querySelectorAll('.vp-toolbar-group')).map(g => g.innerText);
        const hasLayersGroup = allToolbarGroups.some(t => t.includes('LAYERS'));

        return {
            hasLayersGroup: hasLayersGroup,
            hasMeshBtn: !!btnMesh,
            hasCageBtn: !!btnCage,
            hasCurvesBtn: !!btnCurves,
            toolbarGroups: allToolbarGroups,
            meshGroupChildren: window.meshGroup ? window.meshGroup.children.length : -1,
            curveGroupChildren: window.curveGroup ? window.curveGroup.children.length : -1,
            cageGroupChildren: window.cageGroup ? window.cageGroup.children.length : -1,
            meshGroupVisible: window.meshGroup ? window.meshGroup.visible : null,
            curveGroupVisible: window.curveGroup ? window.curveGroup.visible : null,
            cageGroupVisible: window.cageGroup ? window.cageGroup.visible : null,
            originalMeshesCount: window.originalMeshes ? window.originalMeshes.length : -1,
            meshDetails: (window.originalMeshes || []).map((m, i) => {
                const tm = m.mesh || m.threeMesh;
                const geom = tm.geometry;
                const pos = geom.attributes.position.array;
                const idx = geom.index.array;
                const vertCount = pos.length / 3;

                // Adjacency
                const adj = Array.from({length: vertCount}, () => []);
                for (let k = 0; k < idx.length; k += 3) {
                    const a = idx[k], b = idx[k+1], c = idx[k+2];
                    adj[a].push(b, c);
                    adj[b].push(a, c);
                    adj[c].push(a, b);
                }
                const visited = new Uint8Array(vertCount);
                let compCount = 0;
                const compSizes = [];
                for (let v = 0; v < vertCount; v++) {
                    if (visited[v]) continue;
                    compCount++;
                    let sz = 0;
                    const q = [v];
                    visited[v] = 1;
                    while (q.length > 0) {
                        const curr = q.pop();
                        sz++;
                        for (let n of adj[curr]) {
                            if (!visited[n]) {
                                visited[n] = 1;
                                q.push(n);
                            }
                        }
                    }
                    compSizes.push(sz);
                }

                return {
                    i: i,
                    name: tm ? tm.name : '',
                    vertCount: vertCount,
                    faceCount: idx.length / 3,
                    connectedComponentsCount: compCount,
                    componentSizes: compSizes.slice(0, 10)
                };
            })
        };
    })()
"@
    Write-Output "VERIFICATION RESULTS:"
    Write-Output ($test | ConvertTo-Json -Depth 5)

    # Capture screenshot of viewport top right toolbar
    $clip = @{
        format = "png"
        clip = @{
            x = 800
            y = 0
            width = 800
            height = 600
            scale = 1
        }
    }
    $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
    $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
    if ($screenshotData) {
        $bytes = [System.Convert]::FromBase64String($screenshotData)
        [System.IO.File]::WriteAllBytes("c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\toolbar_subd_only.png", $bytes)
        Write-Output "Screenshot saved to scratch\toolbar_subd_only.png"
    }

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
