$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9378
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
    Start-Sleep -Seconds 4

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
            } else if (type === 'LEFT') {
                window.threeCamera.position.set(-30, 8, -5);
                window.threeControls.target.set(4, 7, -5);
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        window.testThinnerColumns = function(positions, B) {
            let out = new Float32Array(positions);

            // Columns located IN THE MIDDLE OF THE SPACES:
            // Center of space in Z is approx -4.5 (span is -8 to -1)
            // 1. In the middle gallery space (between upper and lower plate):
            // Two slender columns at x = -2.2 and x = 0.5, z = -4.5
            const midCols = [
                { x: -2.2, z: -4.5 },
                { x: 0.5, z: -4.5 }
            ];

            // 2. In the undercroft space under the cantilever:
            // Slender columns directly continuing to the ground in the middle of the space
            // 3. In the atrium void space:
            // Column in the middle of the atrium: x = 12.0, z = -5.0
            const atriumCol = { x: 12.0, z: -5.0 };

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];

                // ─── A. MIDDLE INTERIOR GALLERY SPACE (BETWEEN UPPER ROOF & MIDDLE FLOOR) ───
                // Negative space: y in [7.0, 10.2], x in [-3.5, 2.0]
                if (x >= -4.0 && x <= 2.2) {
                    for (let c = 0; c < midCols.length; c++) {
                        let node = midCols[c];
                        let dx = x - node.x;
                        let dz = z - node.z;
                        let dist = Math.sqrt(dx * dx + dz * dz);
                        let rCol = 1.35; // THIN column radius!
                        if (dist < rCol) {
                            let w = 0.5 * (1.0 + Math.cos((dist / rCol) * Math.PI));
                            // Ceiling plate (y >= 9.6): branches DOWNWARD toward midplane (y ~ 8.6)
                            if (y >= 9.5 && y <= 11.2) {
                                let dY = -B * (y - 8.55) * w * 0.95;
                                out[i+1] += dY;
                            }
                            // Floor plate (y <= 7.6): branches UPWARD toward midplane (y ~ 8.6)
                            else if (y >= 6.4 && y <= 7.6) {
                                let dY = B * (8.55 - y) * w * 0.95;
                                out[i+1] += dY;
                            }
                        }
                    }
                }

                // ─── B. UNDERCROFT SPACE (THIN, COLUMN-LIKE IN THE MIDDLE OF THE SPACE) ───
                // Bottom belly (y <= 6.5, x <= 1.8):
                // Instead of wide cone tusks, create THIN slender columns in the middle (z = -4.5)
                if (x <= 1.8 && y <= 6.5) {
                    for (let c = 0; c < midCols.length; c++) {
                        let node = midCols[c];
                        let dx = x - node.x;
                        let dz = z - node.z;
                        let dist = Math.sqrt(dx * dx + dz * dz);
                        let rCol = 1.35; // THIN column radius!
                        if (dist < rCol) {
                            let w = 0.5 * (1.0 + Math.cos((dist / rCol) * Math.PI));
                            let targetFloor = 0.08;
                            let drop = (y - targetFloor);
                            let reach = Math.min(1.0, B * 1.35);
                            let dY = -reach * drop * w;
                            out[i+1] += dY;
                        }
                    }
                }

                // ─── C. ATRIUM SPACE (IN THE MIDDLE OF THE ATRIUM VOID) ───
                // Negative space: x in [8, 16], z in [-8, -2], y in [2, 10]
                if (x >= 8.0 && x <= 16.0) {
                    let dx = x - atriumCol.x;
                    let dz = z - atriumCol.z;
                    let dist = Math.sqrt(dx * dx + dz * dz);
                    let rAtrium = 1.8;
                    if (dist < rAtrium) {
                        let w = 0.5 * (1.0 + Math.cos((dist / rAtrium) * Math.PI));
                        // Floor (y in [1.5, 3.0]): branches UPWARD
                        if (y >= 1.2 && y <= 3.2) {
                            let dY = B * 3.5 * w;
                            out[i+1] += dY;
                        }
                        // Roof / Arch (y in [6.5, 9.5]): branches DOWNWARD
                        else if (y >= 6.5 && y <= 9.8) {
                            let dY = -B * (y - 5.5) * w * 0.85;
                            out[i+1] += dY;
                        }
                    }
                }
            }

            return out;
        };

        window.renderThinner = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testThinnerColumns(basePos, B);
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

    Eval-JS "window.renderThinner(0.70)"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/thinner_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/thinner_iso.png"

    Write-Host "Rendered and saved thinner_front.png and thinner_iso.png"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
