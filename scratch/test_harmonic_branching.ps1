$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9357
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
            } else if (type === 'FRONT') {
                window.threeCamera.position.set(4, 8, 38);
                window.threeControls.target.set(4, 7, -5);
            }
            window.threeControls.update();
        };

        window.testHarmonicBranching = function(meshPos, B) {
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

                    // Longitudinal vaulted arches between Bay 1 and Bay 2
                    let bayX1 = underNodes[0].x, bayX2 = underNodes[2].x;
                    if (x > bayX1 && x < bayX2 && y <= 6.8) {
                        let tX = (x - bayX1) / (bayX2 - bayX1);
                        let archY = Math.sin(Math.PI * tX);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.4 * archY * archW;
                    }

                    // Transverse vaulted arches between front and rear rows
                    let rowZ1 = underNodes[0].z, rowZ2 = underNodes[1].z;
                    if (z > rowZ2 && z < rowZ1 && y <= 6.8 && uX < 0.45) {
                        let tZ = (z - rowZ2) / (rowZ1 - rowZ2);
                        let archZ = Math.sin(Math.PI * tZ);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.2 * archZ * archW;
                    }
                }

                // ── 2. CENTRAL ATRIUM VOID (SMOOTH HARMONIC BIFURCATION & DUAL VAULTED PORTALS) ──
                // The upper mass arching over the loop void (x between 6.5 and 17.5, y between 10 and 20)
                // divides into twin vaulted spatial portals separated by a central descending structural branch!
                if (x >= 6.5 && x <= 17.5) {
                    let tVoidX = (x - 6.5) / (17.5 - 6.5); // 0 to 1 across the void opening

                    // (A) Upper void arch dividing downward
                    if (y >= 9.5 && y <= 18.5) {
                        // Harmonic division: center pier at tVoidX = 0.50 (x = 12.0)
                        // Uses continuous smooth cosine: cos(2*PI*(tVoidX - 0.5)) peaks at center!
                        let centerWeight = 0.5 * (1.0 + Math.cos(2.0 * Math.PI * (tVoidX - 0.5)));
                        let inCenterSpan = (tVoidX >= 0.25 && tVoidX <= 0.75) ? centerWeight : 0;

                        // Downward branch flow in negative space:
                        // Descends toward mid-ramp floor (~ y = 4.2)
                        let dropHeight = y - 4.2;
                        let dY_voidBranch = -B * 0.75 * dropHeight * inCenterSpan * smoothstep(18.0, 10.5, y);
                        out[i+1] += dY_voidBranch;

                        // Twin vaulted arch relief over the two sub-bays
                        // Bay 1: tVoidX in [0.05, 0.45], Bay 2: tVoidX in [0.55, 0.95]
                        let bay1Arch = Math.sin(Math.PI * (tVoidX - 0.05) / 0.40);
                        let bay2Arch = Math.sin(Math.PI * (tVoidX - 0.55) / 0.40);
                        if (tVoidX >= 0.05 && tVoidX <= 0.45) {
                            out[i+1] += B * 1.2 * Math.max(0, bay1Arch) * smoothstep(9.5, 14.0, y);
                        } else if (tVoidX >= 0.55 && tVoidX <= 0.95) {
                            out[i+1] += B * 1.2 * Math.max(0, bay2Arch) * smoothstep(9.5, 14.0, y);
                        }

                        // Lateral branch flaring along Z
                        out[i+2] += normZ * B * 0.6 * inCenterSpan * smoothstep(16.0, 7.0, y + dY_voidBranch);
                    }

                    // (B) Lower floor ramp reaching upward at center to meet the descending branch
                    if (y >= 1.0 && y <= 6.5 && tVoidX >= 0.30 && tVoidX <= 0.70) {
                        let centerWeight = 0.5 * (1.0 + Math.cos(2.0 * Math.PI * (tVoidX - 0.5) / 0.40));
                        let rise = (4.8 - y);
                        if (rise > 0) {
                            out[i+1] += B * 0.75 * rise * centerWeight;
                        }
                    }
                }

                // ── 3. HORIZONTAL SLIT NEGATIVE SPACE (STRUCTURAL MULLION BRANCHES) ──
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

                // ── 4. SADDLE VALLEY THRESHOLD (BETWEEN CANTILEVER & TOWER) ──
                // Smoothly articulates the transition negative space
                if (x >= 2.0 && x <= 6.5 && y >= 6.5 && y <= 11.5) {
                    let tSaddle = (x - 2.0) / 4.5;
                    let saddleWave = Math.sin(Math.PI * tSaddle);
                    out[i+1] += B * 0.9 * saddleWave * (1.0 - Math.min(1.0, Math.abs(normZ) * 0.5));
                }

                // ── 5. UPPER ROOF CANOPY DIVISION (SECONDARY ARTICULATED RIBS) ──
                if (uY > 0.65) {
                    let roofW = smoothstep(0.65, 0.90, uY);
                    let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * normZ);
                    out[i+1] += B * 0.08 * spanY * rib * roofW;
                    out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                }
            }
            return out;
        };

        window.renderHarmonic = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testHarmonicBranching(basePos, B);
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

    Eval-JS "window.renderHarmonic(0.70)"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\harmonic_iso.png"

    Eval-JS "window.setView('VOID_CLOSEUP')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\harmonic_void.png"

    Eval-JS "window.setView('UNDERCROFT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\harmonic_undercroft.png"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\harmonic_front.png"

    Write-Output "Harmonic branching rendered and captured"

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
