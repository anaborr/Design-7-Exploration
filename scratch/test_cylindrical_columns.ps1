$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9381
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
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        window.testCylindricalColumns = function(positions, B) {
            let out = new Float32Array(positions);

            // Columns located IN THE MIDDLE OF THE SPACES:
            // Center of space in Z is approx -4.5 (span is -8.5 to -0.5)
            // Center of interior gallery space in X is around -1.0
            // We place two slender columns in the middle of the spaces:
            const colAxes = [
                { x: -2.0, z: -4.5 },
                { x:  0.2, z: -4.5 }
            ];

            const rShaft = 0.50;    // Slender column shaft radius
            const rCapital = 1.35;  // Smooth flared capital/base fillet

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];

                // ─── 1. INTERIOR GALLERY SPACE: BETWEEN UPPER ROOF & MIDDLE FLOOR PLATE ───
                // Negative space: y in [7.0, 10.2], x in [-3.5, 2.0]
                if (x >= -3.8 && x <= 2.2) {
                    for (let c = 0; c < colAxes.length; c++) {
                        let axis = colAxes[c];
                        let dx = x - axis.x;
                        let dz = z - axis.z;
                        let dist = Math.sqrt(dx * dx + dz * dz);

                        if (dist < rCapital) {
                            let w;
                            if (dist <= rShaft) {
                                w = 1.0;
                            } else {
                                let t = (dist - rShaft) / (rCapital - rShaft);
                                w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                            }

                            // Midplane height of the interior space
                            const midY = 8.55;

                            // Ceiling surface (y in [9.5, 11.2]): branches DOWNWARD into the space
                            if (y >= 9.4 && y <= 11.2) {
                                let dY = -B * (y - midY) * w;
                                out[i+1] += dY;

                                // Cylindrical shaft radial contraction
                                if (dist > 0.01) {
                                    let radialContract = -B * 0.35 * w * Math.sin(w * Math.PI);
                                    out[i] += (dx / dist) * radialContract;
                                    out[i+2] += (dz / dist) * radialContract;
                                }
                            }
                            // Floor surface (y in [6.4, 7.6]): branches UPWARD into the space
                            else if (y >= 6.4 && y <= 7.8) {
                                let dY = B * (midY - y) * w;
                                out[i+1] += dY;

                                if (dist > 0.01) {
                                    let radialContract = -B * 0.35 * w * Math.sin(w * Math.PI);
                                    out[i] += (dx / dist) * radialContract;
                                    out[i+2] += (dz / dist) * radialContract;
                                }
                            }
                        }
                    }
                }

                // ─── 2. UNDERCROFT SPACE: BETWEEN CANTILEVER BELLY & GROUND PLINTH ───
                // Slender architectural columns in the middle of the space (x <= 1.8, y <= 6.5)
                if (x <= 1.8 && y <= 6.5) {
                    for (let c = 0; c < colAxes.length; c++) {
                        let axis = colAxes[c];
                        let dx = x - axis.x;
                        let dz = z - axis.z;
                        let dist = Math.sqrt(dx * dx + dz * dz);

                        if (dist < rCapital) {
                            let w;
                            if (dist <= rShaft) {
                                w = 1.0;
                            } else {
                                let t = (dist - rShaft) / (rCapital - rShaft);
                                w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                            }

                            let targetFloor = 0.08;
                            let reach = Math.min(1.0, B * 1.30);
                            let dY = -reach * (y - targetFloor) * w;
                            out[i+1] += dY;

                            // Slender shaft shaping: tighten column shaft so it's thin & cylindrical
                            let currY = y + dY;
                            if (dist > 0.01 && currY > targetFloor + 0.3) {
                                let shaftTighten = -B * 0.30 * w * (1.0 - (currY / 6.0));
                                out[i] += (dx / dist) * shaftTighten;
                                out[i+2] += (dz / dist) * shaftTighten;
                            }
                        }
                    }
                }

                // ─── 3. ATRIUM SPACE: IN THE MIDDLE OF THE ATRIUM VOID ───
                // Atrium space center: x = 12.0, z = -5.0
                if (x >= 8.5 && x <= 15.5) {
                    let dx = x - 12.0;
                    let dz = z - (-5.0);
                    let dist = Math.sqrt(dx * dx + dz * dz);
                    let rAtrium = 1.6;
                    if (dist < rAtrium) {
                        let w;
                        if (dist <= 0.6) {
                            w = 1.0;
                        } else {
                            let t = (dist - 0.6) / (rAtrium - 0.6);
                            w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                        }
                        // Ramp floor (y in [1.5, 3.2]): branches upward
                        if (y >= 1.2 && y <= 3.2) {
                            out[i+1] += B * 3.8 * w;
                        }
                        // Upper arch (y in [6.5, 10.0]): branches downward to meet
                        else if (y >= 6.5 && y <= 10.5) {
                            out[i+1] -= B * (y - 5.5) * w * 0.90;
                        }
                    }
                }
            }

            return out;
        };

        window.renderCylindrical = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testCylindricalColumns(basePos, B);
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

    Eval-JS "window.renderCylindrical(0.70)"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/cylindrical_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/cylindrical_iso.png"

    Write-Host "Rendered cylindrical columns"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
