$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9362
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
            } else if (type === 'UNDERCROFT') {
                window.threeCamera.position.set(-20, 6, 8);
                window.threeControls.target.set(-2, 5, -5);
            } else if (type === 'VOID_CLOSEUP') {
                window.threeCamera.position.set(13, 10, 22);
                window.threeControls.target.set(12, 8, -5);
            }
            window.threeControls.update();
        };

        window.testFullColonnadeBranching = function(meshPos, B) {
            if (B <= 0.001) return new Float32Array(meshPos);
            const out = new Float32Array(meshPos);

            const minX = -10.02, maxX = 20.20;
            const minY = -0.20, maxY = 20.41;
            const minZ = -10.16, maxZ = 0.54;
            const spanX = maxX - minX;
            const spanY = maxY - minY;
            const spanZ = maxZ - minZ;
            const centerX = (minX + maxX) / 2;
            const centerZ = (minZ + maxZ) / 2;

            const smoothstep = (e0, e1, v) => {
                const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
                return t * t * (3 - 2 * t);
            };

            // Unified Architectural Grid across all negative spaces:
            // 4 Bays along X:
            // Bay 1: X = -4.9 (Cantilever tip)
            // Bay 2: X = +0.5 (Cantilever root)
            // Bay 3: X = +4.5 (Belly / threshold)
            // Bay 4: X = +12.8 (Central Loop Atrium Void)
            const bayXs = [-4.9, 0.5, 4.5, 12.8];
            const rowZFront = centerZ + 0.22 * spanZ; // ~ -2.6
            const rowZRear  = centerZ - 0.22 * spanZ; // ~ -7.0

            const colNodes = [];
            for (let bx of bayXs) {
                colNodes.push({ x: bx, z: rowZFront });
                colNodes.push({ x: bx, z: rowZRear });
            }

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                // ── 1. WESTERN & MID NEGATIVE SPACES (UNDERCROFT & BELLY: x <= 7.0, y <= 9.0) ──
                if (x <= 7.0 && y <= 9.0) {
                    let maxColW = 0;
                    let bestDx = 0, bestDz = 0;
                    for (let c = 0; c < 6; c++) { // Bays 1, 2, 3
                        let node = colNodes[c];
                        let ndx = x - node.x, ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        let rCol = 2.4;
                        if (dist < rCol) {
                            let tDist = dist / rCol;
                            let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                            if (w > maxColW) {
                                maxColW = w; bestDx = ndx; bestDz = ndz;
                            }
                        }
                    }

                    if (maxColW > 0.001) {
                        let depthF = smoothstep(8.5, 4.5, y);
                        let targetFloor = minY + 0.04;
                        let drop = (y - targetFloor);
                        let reach = Math.min(1.0, B * 1.35);
                        let dY_col = -reach * drop * maxColW * depthF;
                        out[i+1] += dY_col;

                        let currY = y + dY_col;
                        let nearFloor = smoothstep(2.5, targetFloor, currY);
                        out[i] += bestDx * 0.35 * nearFloor * maxColW * B;
                        out[i+2] += bestDz * 0.35 * nearFloor * maxColW * B;
                    }

                    // Vaulted arches between western bays (Bay 1 <-> Bay 2 <-> Bay 3)
                    for (let b = 0; b < 2; b++) {
                        let xA = bayXs[b], xB = bayXs[b+1];
                        if (x > xA && x < xB && y <= 6.8) {
                            let tX = (x - xA) / (xB - xA);
                            let archY = Math.sin(Math.PI * tX);
                            let archW = smoothstep(4.5, 6.2, y);
                            out[i+1] += B * 1.4 * archY * archW;
                        }
                    }

                    // Transverse vaulted arches between front and rear rows
                    if (z > rowZRear && z < rowZFront && y <= 6.8) {
                        let tZ = (z - rowZRear) / (rowZFront - rowZRear);
                        let archZ = Math.sin(Math.PI * tZ);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.2 * archZ * archW;
                    }
                }

                // ── 2. CENTRAL LOOP ATRIUM VOID NEGATIVE SPACE (BAY 4: x in [8.5, 17.5]) ──
                if (x >= 8.5 && x <= 17.5) {
                    // Sloped inner ceiling of loop void
                    let ceilY = 5.8 + (18.2 - 5.8) * ((x - 8.0) / 12.0);

                    // (A) Upper ceiling branches downward at Bay 4 columns (Front and Rear trunks)
                    if (y >= ceilY - 2.5) {
                        let maxVoidW = 0;
                        let bVDx = 0, bVDz = 0;
                        for (let c = 6; c < 8; c++) { // Bay 4: Front and Rear
                            let node = colNodes[c];
                            let ndx = x - node.x, ndz = z - node.z;
                            let dist = Math.sqrt(ndx * ndx * 0.8 + ndz * ndz);
                            let rCol = 2.8;
                            if (dist < rCol) {
                                let tDist = dist / rCol;
                                let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                                if (w > maxVoidW) {
                                    maxVoidW = w; bVDx = ndx; bVDz = ndz;
                                }
                            }
                        }

                        if (maxVoidW > 0.001) {
                            let targetY = 3.6; // Meets the rising floor ramp
                            let drop = (y - targetY);
                            let reach = Math.min(1.0, B * 1.30);
                            let dY_void = -reach * drop * maxVoidW * smoothstep(ceilY + 2.5, ceilY - 1.5, y);
                            out[i+1] += dY_void;

                            let currY = y + dY_void;
                            let nearBase = smoothstep(targetY + 4.0, targetY, currY);
                            out[i] += bVDx * 0.25 * nearBase * maxVoidW * B;
                            out[i+2] += bVDz * 0.25 * nearBase * maxVoidW * B;
                        }

                        // Twin vaulted catenary arches across Bay 3 <-> Bay 4 and Bay 4 <-> East Wall
                        if (x > 9.0 && x < bayXs[3]) {
                            let tB = (x - 9.0) / (bayXs[3] - 9.0);
                            out[i+1] += B * 1.5 * Math.sin(Math.PI * tB) * smoothstep(ceilY - 1.0, ceilY + 1.5, y);
                        } else if (x > bayXs[3] && x < 17.5) {
                            let tB = (x - bayXs[3]) / (17.5 - bayXs[3]);
                            out[i+1] += B * 1.5 * Math.sin(Math.PI * tB) * smoothstep(ceilY - 1.0, ceilY + 1.5, y);
                        }

                        // Transverse vaulted arch between front and rear void columns
                        if (z > rowZRear && z < rowZFront && Math.abs(x - bayXs[3]) < 2.5) {
                            let tZ = (z - rowZRear) / (rowZFront - rowZRear);
                            out[i+1] += B * 1.3 * Math.sin(Math.PI * tZ) * smoothstep(ceilY - 1.0, ceilY + 1.5, y);
                        }
                    }

                    // (B) Floor ramp reaches up to meet descending void columns
                    if (y <= 4.0) {
                        for (let c = 6; c < 8; c++) {
                            let node = colNodes[c];
                            let ndx = x - node.x, ndz = z - node.z;
                            let dist = Math.sqrt(ndx * ndx * 0.8 + ndz * ndz);
                            let rBase = 2.6;
                            if (dist < rBase) {
                                let tB = dist / rBase;
                                let wB = 0.5 * (1.0 + Math.cos(tB * Math.PI));
                                out[i+1] += B * 1.6 * wB * (4.0 - y) / 3.0;
                            }
                        }
                    }
                }

                // ── 3. HORIZONTAL SLIT STRUCTURAL MULLION BRANCHES ──
                if (uX <= 0.45 && y >= 8.5 && y <= 11.8) {
                    for (let c = 0; c < 4; c++) {
                        let node = colNodes[c];
                        let ndx = x - node.x, ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        if (dist < 2.0 && y > 9.6) {
                            let wM = 0.5 * (1.0 + Math.cos((dist / 2.0) * Math.PI));
                            let dY_mull = -B * (y - 8.8) * wM * 0.85;
                            out[i+1] += dY_mull;
                        }
                    }
                }

                // ── 4. UPPER ROOF CANOPY DIVISION (SECONDARY ARTICULATED RIBS) ──
                if (uY > 0.65) {
                    let roofW = smoothstep(0.65, 0.90, uY);
                    let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * normZ);
                    out[i+1] += B * 0.08 * spanY * rib * roofW;
                    out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                }
            }
            return out;
        };

        window.renderFullColonnade = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testFullColonnadeBranching(basePos, B);
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

    Eval-JS "window.renderFullColonnade(0.70)"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\colonnade_iso.png"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\colonnade_front.png"

    Eval-JS "window.setView('UNDERCROFT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\colonnade_undercroft.png"

    Eval-JS "window.setView('VOID_CLOSEUP')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\colonnade_void.png"

    Write-Output "Full colonnade rendered and captured"

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
