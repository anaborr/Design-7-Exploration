$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
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
        $parsed = $r | ConvertFrom-Json
        return $parsed.result.result.value
    }

    function Save-Screenshot($filename) {
        $clip = @{ format = 'png'; clip = @{ x = 0; y = 0; width = 1600; height = 1000; scale = 1 } }
        $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
        $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
        if ($screenshotData) {
            $bytes = [System.Convert]::FromBase64String($screenshotData)
            [System.IO.File]::WriteAllBytes($filename, $bytes)
        }
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        $check = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0].originalPositions)"
        if ($check -eq $true) { break }
    }

    Eval-JS @'
    (() => {
        window.setView = function(type) {
            if (!window.threeCamera || !window.threeControls) return;
            if (type === 'ISO') {
                window.threeCamera.position.set(30, 20, 36);
                window.threeControls.target.set(4, 7, -5);
            } else if (type === 'FRONT') {
                window.threeCamera.position.set(4, 8, 38);
                window.threeControls.target.set(4, 7, -5);
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        // Slender cylindrical columns strictly in the middle of each space
        window.computeSlenderColumnsRefined = function(positions, B) {
            const out = new Float32Array(positions);
            if (B <= 0.001) return out;

            // Space 1: Gallery space center (two slender columns at x = -2.4 and x = -0.6, z = -4.8)
            // Space 2: Atrium space center (one slender column at x = 6.2, z = -4.8)
            const columns = [
                {
                    name: 'gallery_left',
                    x: -2.4,
                    z: -4.8,
                    xMin: -4.0,
                    xMax: -1.4,
                    ceilMinY: 9.0,
                    ceilMaxY: 11.5,
                    targetFloor: 6.2,   // Penetrates solidly into floor plate
                    floorMinY: 5.5,
                    floorMaxY: 7.6,
                    rShaft: 0.32,       // Slender cylindrical shaft
                    rCap: 0.70          // Organic flared capital/base
                },
                {
                    name: 'gallery_right',
                    x: -0.6,
                    z: -4.8,
                    xMin: -1.4,
                    xMax: 1.2,
                    ceilMinY: 9.0,
                    ceilMaxY: 11.5,
                    targetFloor: 6.2,   // Penetrates solidly into floor plate
                    floorMinY: 5.5,
                    floorMaxY: 7.6,
                    rShaft: 0.32,
                    rCap: 0.70
                },
                {
                    name: 'atrium',
                    x: 6.2,
                    z: -4.8,
                    xMin: 3.5,
                    xMax: 9.0,
                    ceilMinY: 4.8,
                    ceilMaxY: 8.5,
                    targetFloor: 1.15,  // Penetrates solidly into plinth floor
                    floorMinY: 0.5,
                    floorMaxY: 2.2,
                    rShaft: 0.32,
                    rCap: 0.75
                }
            ];

            const reach = Math.min(1.0, B * 1.50);

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];

                for (let c = 0; c < columns.length; c++) {
                    let col = columns[c];
                    if (x < col.xMin || x > col.xMax) continue;

                    let dx = x - col.x;
                    let dz = z - col.z;
                    let dist = Math.sqrt(dx * dx + dz * dz);

                    if (dist < col.rCap) {
                        let w;
                        if (dist <= col.rShaft) {
                            w = 1.0; // Uniform cylindrical core shaft
                        } else {
                            let t = (dist - col.rShaft) / (col.rCap - col.rShaft);
                            w = 0.5 * (1.0 + Math.cos(t * Math.PI)); // Flared capital fillet
                        }

                        // Ceiling downward branch extending across the space to the floor
                        if (y >= col.ceilMinY && y <= col.ceilMaxY) {
                            let drop = y - col.targetFloor;
                            let dY = -reach * drop * w;
                            out[i+1] += dY;
                        }
                        // Floor plate upward flaring to form organic column base
                        else if (y >= col.floorMinY && y <= col.floorMaxY) {
                            let baseLift = reach * 0.30 * w;
                            out[i+1] += baseLift;
                        }
                    }
                }
            }

            return out;
        };

        window.renderBranchTest = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.computeSlenderColumnsRefined(basePos, B);
            const posAttr = mesh.mesh.geometry.attributes.position;
            posAttr.array.set(deformed);
            posAttr.needsUpdate = true;
            mesh.mesh.geometry.computeVertexNormals();
            if (window.threeRenderer && window.threeScene && window.threeCamera) {
                window.threeRenderer.render(window.threeScene, window.threeCamera);
            }
        };
    })()
'@

    # Render with B = 0.70
    Eval-JS "window.renderBranchTest(0.70)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/slender_refined_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/slender_refined_iso.png"

    Write-Output "Saved slender_refined_front.png and slender_refined_iso.png"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
