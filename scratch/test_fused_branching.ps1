$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9360
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
            } else if (type === 'VOID_CLOSEUP') {
                window.threeCamera.position.set(13, 10, 22);
                window.threeControls.target.set(12, 8, -5);
            } else if (type === 'UNDERCROFT') {
                window.threeCamera.position.set(-20, 6, 8);
                window.threeControls.target.set(-2, 5, -5);
            }
            window.threeControls.update();
        };

        window.testFusedBranching = function(meshPos, B) {
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

            // Undercroft colonnade nodes:
            const underNodes = [
                { x: minX + 0.17 * spanX, z: centerZ + 0.22 * spanZ }, // ~ -4.9, -2.6
                { x: minX + 0.17 * spanX, z: centerZ - 0.22 * spanZ }, // ~ -4.9, -7.0
                { x: minX + 0.35 * spanX, z: centerZ + 0.22 * spanZ }, // ~ 0.5, -2.6
                { x: minX + 0.35 * spanX, z: centerZ - 0.22 * spanZ }  // ~ 0.5, -7.0
            ];

            // Void dividing column:
            // Sits at X = 13.5, Z = -4.8, perfectly centered in the trumpet void
            const voidColX = 13.5;
            const voidColZ = centerZ; // -4.8

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                // ── 1. UNDERCROFT NEGATIVE SPACE COLONNADE ──
                if (uX <= 0.48 && y <= 8.8) {
                    let maxColW = 0;
                    let bestDx = 0, bestDz = 0;
                    for (let c = 0; c < underNodes.length; c++) {
                        let node = underNodes[c];
                        let ndx = x - node.x, ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        let rCol = 2.4;
                        if (dist < rCol) {
                            let tDist = dist / rCol;
                            let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                            if (w > maxColW) {
                                maxColW = w;
                                bestDx = ndx; bestDz = ndz;
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

                    // Vaulted arches between colonnade bays
                    let bayX1 = underNodes[0].x, bayX2 = underNodes[2].x;
                    if (x > bayX1 && x < bayX2 && y <= 6.8) {
                        let tX = (x - bayX1) / (bayX2 - bayX1);
                        let archY = Math.sin(Math.PI * tX);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.4 * archY * archW;
                    }

                    // Transverse arches between front and rear rows
                    let rowZ1 = underNodes[0].z, rowZ2 = underNodes[1].z;
                    if (z > rowZ2 && z < rowZ1 && y <= 6.8 && uX < 0.45) {
                        let tZ = (z - rowZ2) / (rowZ1 - rowZ2);
                        let archZ = Math.sin(Math.PI * tZ);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.2 * archZ * archW;
                    }
                }

                // ── 2. CENTRAL ATRIUM VOID NEGATIVE SPACE (FUSED STRUCTURAL TREE COLUMN) ──
                if (x >= 9.0 && x <= 18.5) {
                    let ceilY = 5.8 + (18.2 - 5.8) * ((x - 8.0) / 12.0);
                    let ndx = x - voidColX;
                    let ndz = z - voidColZ;
                    let distCol = Math.sqrt(ndx * ndx * 0.6 + ndz * ndz * 0.35);
                    let rTrunk = 3.8;

                    // (A) Upper ceiling branching down
                    if (y >= ceilY - 2.0 && distCol < rTrunk) {
                        let tTrunk = distCol / rTrunk;
                        let wTrunk = 0.5 * (1.0 + Math.cos(tTrunk * Math.PI));
                        let targetY = 3.8; // Fused junction elevation
                        let drop = (y - targetY);
                        let dY_void = -B * Math.min(1.0, B * 1.25) * drop * wTrunk * smoothstep(ceilY + 2.5, ceilY - 1.0, y);
                        out[i+1] += dY_void;

                        // Capital flare
                        let currY = y + dY_void;
                        let flare = smoothstep(ceilY, targetY, currY);
                        out[i] += ndx * 0.20 * flare * wTrunk * B;
                        out[i+2] += ndz * 0.20 * flare * wTrunk * B;
                    }

                    // (B) Lower floor ramp reaching up to meet at junction
                    if (y <= 4.0 && distCol < rTrunk) {
                        let tTrunk = distCol / rTrunk;
                        let wBase = 0.5 * (1.0 + Math.cos(tTrunk * Math.PI));
                        let targetY = 3.8;
                        let rise = Math.max(0, targetY - y);
                        out[i+1] += B * rise * wBase;
                    }

                    // (C) Twin vaulted cathedral arches over Bay 1 and Bay 2
                    if (y >= ceilY - 1.5 && y <= ceilY + 2.5) {
                        if (x > 9.0 && x < voidColX) {
                            let tB1 = (x - 9.0) / (voidColX - 9.0);
                            out[i+1] += B * 1.4 * Math.sin(Math.PI * tB1);
                        } else if (x > voidColX && x < 18.5) {
                            let tB2 = (x - voidColX) / (18.5 - voidColX);
                            out[i+1] += B * 1.4 * Math.sin(Math.PI * tB2);
                        }
                    }
                }

                // ── 3. HORIZONTAL SLIT STRUCTURAL MULLION BRANCHES ──
                if (uX <= 0.45 && y >= 8.5 && y <= 11.8) {
                    for (let c = 0; c < 4; c++) {
                        let node = underNodes[c];
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

        window.renderFused = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testFusedBranching(basePos, B);
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

    Eval-JS "window.renderFused(0.70)"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\fused_iso.png"

    Eval-JS "window.setView('VOID_CLOSEUP')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\fused_void.png"

    Write-Output "Fused branching rendered and captured"

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
