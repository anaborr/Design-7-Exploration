$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9385
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

        // Variation 1: Slender columns strictly in the middle of the interior spaces (gallery & atrium), no hanging belly teeth
        window.testVar1 = function(positions, B) {
            let out = new Float32Array(positions);

            // Columns located IN THE MIDDLE OF THE SPACES:
            // Center of space in Z is approx -4.5
            // In the interior gallery space: two slender columns at x = -2.0 and x = 0.4
            const midCols = [
                { x: -2.0, z: -4.5 },
                { x:  0.4, z: -4.5 }
            ];

            const rShaft = 0.42;    // Thinner, slender column shaft
            const rCapital = 1.15;  // Smooth flared capital/base

            // Atrium column in the middle of the atrium void
            const atriumCol = { x: 12.0, z: -5.0 };
            const rAtriumShaft = 0.45;
            const rAtriumCap = 1.35;

            const reach = Math.min(1.0, B * 1.45);

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];

                // ─── 1. INTERIOR GALLERY SPACE: BETWEEN UPPER ROOF & MIDDLE FLOOR PLATE ───
                // Negative space: y in [7.0, 10.2], x in [-3.8, 2.2]
                if (x >= -3.8 && x <= 2.2) {
                    for (let c = 0; c < midCols.length; c++) {
                        let axis = midCols[c];
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

                            const midY = 8.55;

                            // Ceiling surface (y in [9.4, 11.2]): branches DOWNWARD into the middle of the space
                            if (y >= 9.4 && y <= 11.2) {
                                let dY = -reach * (y - midY) * w;
                                out[i+1] += dY;
                            }
                            // Floor surface (y in [6.4, 7.8]): branches UPWARD into the middle of the space
                            else if (y >= 6.4 && y <= 7.8) {
                                let dY = reach * (midY - y) * w;
                                out[i+1] += dY;
                            }
                        }
                    }
                }

                // ─── 2. ATRIUM SPACE: IN THE MIDDLE OF THE ATRIUM VOID ───
                if (x >= 8.5 && x <= 15.5) {
                    let dx = x - atriumCol.x;
                    let dz = z - atriumCol.z;
                    let dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < rAtriumCap) {
                        let w;
                        if (dist <= rAtriumShaft) {
                            w = 1.0;
                        } else {
                            let t = (dist - rAtriumShaft) / (rAtriumCap - rAtriumShaft);
                            w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                        }
                        const midAtriumY = 5.2;
                        // Ramp floor (y in [1.2, 3.2]): branches UPWARD into the middle of the atrium
                        if (y >= 1.2 && y <= 3.2) {
                            let dY = reach * (midAtriumY - y) * w;
                            out[i+1] += dY;
                        }
                        // Arch roof (y in [6.5, 10.5]): branches DOWNWARD into the middle of the atrium
                        else if (y >= 6.5 && y <= 10.5) {
                            let dY = -reach * (y - midAtriumY) * w;
                            out[i+1] += dY;
                        }
                    }
                }
            }

            return out;
        };

        // Variation 2: Gallery columns + Atrium column + SLENDER central column in undercroft
        window.testVar2 = function(positions, B) {
            let out = window.testVar1(positions, B);

            // In addition, one thin column in the middle of the undercroft space:
            const underCol = { x: -1.0, z: -4.5 };
            const rShaft = 0.40;
            const rCap = 1.10;
            const reach = Math.min(1.0, B * 1.35);

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                if (x <= 1.5 && y <= 6.5) {
                    let dx = x - underCol.x;
                    let dz = z - underCol.z;
                    let dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist < rCap) {
                        let w;
                        if (dist <= rShaft) {
                            w = 1.0;
                        } else {
                            let t = (dist - rShaft) / (rCap - rShaft);
                            w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                        }
                        let targetFloor = 0.08;
                        let dY = -reach * (y - targetFloor) * w;
                        out[i+1] += dY;
                    }
                }
            }

            return out;
        };

        window.renderVar = function(varNum, B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = varNum === 1 ? window.testVar1(basePos, B) : window.testVar2(basePos, B);
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

    # Render Var 1 (columns in the middle of spaces)
    Eval-JS "window.renderVar(1, 0.70)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/var1_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/var1_iso.png"

    # Render Var 2
    Eval-JS "window.renderVar(2, 0.70)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/var2_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "scratch/var2_iso.png"

    Write-Host "Rendered both variations"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
