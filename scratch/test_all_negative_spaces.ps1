$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9354
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
                // Looking right through the central void loop
                window.threeCamera.position.set(12, 10, 22);
                window.threeControls.target.set(12, 9, -5);
            }
            window.threeControls.update();
        };

        // Prototype Branching across ALL negative spaces inbetween the mesh geometry
        window.applyBranchingAllSpaces = function(meshPos, B, typoKey, bounds) {
            if (B <= 0.001) return new Float32Array(meshPos);
            const out = new Float32Array(meshPos);

            const minX = bounds?.minX ?? -10.02;
            const maxX = bounds?.maxX ?? 20.20;
            const minY = bounds?.minY ?? -0.20;
            const maxY = bounds?.maxY ?? 20.41;
            const minZ = bounds?.minZ ?? -10.16;
            const maxZ = bounds?.maxZ ?? 0.54;

            const spanX = maxX - minX;
            const spanY = maxY - minY;
            const spanZ = maxZ - minZ;
            const centerX = (minX + maxX) / 2;
            const centerZ = (minZ + maxZ) / 2;

            const smoothstep = (e0, e1, v) => {
                const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
                return t * t * (3 - 2 * t);
            };

            // Define column and dividing branch nodes across all negative spaces:
            // Group A: Undercroft negative space (cantilever overhang to ground)
            const underNodes = [
                { x: minX + 0.17 * spanX, z: centerZ + 0.22 * spanZ }, // ~ -4.9, -2.6
                { x: minX + 0.17 * spanX, z: centerZ - 0.22 * spanZ }, // ~ -4.9, -7.0
                { x: minX + 0.35 * spanX, z: centerZ + 0.22 * spanZ }, // ~ 0.5, -2.6
                { x: minX + 0.35 * spanX, z: centerZ - 0.22 * spanZ }, // ~ 0.5, -7.0
                { x: minX + 0.46 * spanX, z: centerZ + 0.22 * spanZ }, // ~ 3.8, -2.6 (Transition under belly)
                { x: minX + 0.46 * spanX, z: centerZ - 0.22 * spanZ }  // ~ 3.8, -7.0
            ];

            // Group B: Central Atrium Void negative space (inside the giant loop)
            // Upper ceiling divides and branches down through the void opening to meet lower floor ramp
            const voidNodes = [
                { x: 9.8, z: centerZ + 0.20 * spanZ }, // ~ 9.8, -2.8 (Mid-throat of loop void)
                { x: 9.8, z: centerZ - 0.20 * spanZ }, // ~ 9.8, -7.0
                { x: 14.2, z: centerZ + 0.20 * spanZ }, // ~ 14.2, -2.8 (East bay of loop void)
                { x: 14.2, z: centerZ - 0.20 * spanZ }  // ~ 14.2, -7.0
            ];

            // Group C: Horizontal slit negative space mullions
            const slitNodes = [
                { x: minX + 0.17 * spanX, z: centerZ + 0.22 * spanZ },
                { x: minX + 0.17 * spanX, z: centerZ - 0.22 * spanZ },
                { x: minX + 0.35 * spanX, z: centerZ + 0.22 * spanZ },
                { x: minX + 0.35 * spanX, z: centerZ - 0.22 * spanZ }
            ];

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                // ── 1. UNDERCROFT NEGATIVE SPACE (CANTILEVER & BELLY TO GROUND PLINTH) ──
                if (uX <= 0.52 && y <= 9.0) {
                    let maxColW = 0;
                    let bestDx = 0, bestDz = 0;
                    for (let c = 0; c < underNodes.length; c++) {
                        let node = underNodes[c];
                        let ndx = x - node.x;
                        let ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        let rCol = 2.2;
                        if (dist < rCol) {
                            let tDist = Math.max(0, dist - 0.4) / (rCol - 0.4);
                            let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                            if (w > maxColW) {
                                maxColW = w;
                                bestDx = ndx;
                                bestDz = ndz;
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

                    // Longitudinal vaulted arches between bays
                    for (let b = 0; b < 2; b++) {
                        let xA = underNodes[b*2].x;
                        let xB = underNodes[(b+1)*2].x;
                        if (x > xA && x < xB && y <= 6.8) {
                            let tX = (x - xA) / (xB - xA);
                            let archY = Math.sin(Math.PI * tX);
                            let archW = smoothstep(4.5, 6.2, y);
                            out[i+1] += B * 1.4 * archY * archW;
                        }
                    }

                    // Transverse vaulted arches between front and rear rows
                    let zFront = underNodes[0].z;
                    let zRear = underNodes[1].z;
                    if (z > zRear && z < zFront && y <= 6.8) {
                        let tZ = (z - zRear) / (zFront - zRear);
                        let archZ = Math.sin(Math.PI * tZ);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.2 * archZ * archW;
                    }
                }

                // ── 2. CENTRAL ATRIUM VOID NEGATIVE SPACE (INSIDE THE LOOP OPENING) ──
                // The primary form divides into structural column branches that extend downward
                // from the upper arch ceiling to meet the lower floor ramp, subdividing the void!
                if (x >= 7.5 && x <= 16.5) {
                    // (A) Upper ceiling branching downward into void
                    if (y >= 10.0 && y <= 18.5) {
                        let maxVoidW = 0;
                        let bestVDx = 0, bestVDz = 0;
                        for (let c = 0; c < voidNodes.length; c++) {
                            let node = voidNodes[c];
                            let ndx = x - node.x;
                            let ndz = z - node.z;
                            let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                            let rCol = 2.4;
                            if (dist < rCol) {
                                let tDist = Math.max(0, dist - 0.4) / (rCol - 0.4);
                                let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                                if (w > maxVoidW) {
                                    maxVoidW = w;
                                    bestVDx = ndx;
                                    bestVDz = ndz;
                                }
                            }
                        }

                        if (maxVoidW > 0.001) {
                            // Target meets the lower ramp at ~ y = 4.5
                            let targetY = 4.5;
                            let drop = (y - targetY);
                            let depthF = smoothstep(18.0, 11.0, y);
                            let reach = Math.min(1.0, B * 1.30);
                            let dY_voidCol = -reach * drop * maxVoidW * depthF;
                            out[i+1] += dY_voidCol;

                            // Flared tree-like capitals and column trunk tapering
                            let currY = y + dY_voidCol;
                            let midHeight = smoothstep(16.0, 6.0, currY);
                            out[i] += bestVDx * 0.28 * midHeight * maxVoidW * B;
                            out[i+2] += bestVDz * 0.28 * midHeight * maxVoidW * B;
                        }

                        // Vaulted cathedral arch across the void bay between x=9.8 and x=14.2
                        if (x > 9.8 && x < 14.2 && y <= 14.0) {
                            let tX = (x - 9.8) / (14.2 - 9.8);
                            let archY = Math.sin(Math.PI * tX);
                            let archW = smoothstep(11.0, 13.5, y);
                            out[i+1] += B * 1.8 * archY * archW;
                        }
                    }

                    // (B) Lower floor ramp reaching up into the void to form column footings
                    if (y >= 1.0 && y <= 6.5) {
                        let maxBaseW = 0;
                        for (let c = 0; c < voidNodes.length; c++) {
                            let node = voidNodes[c];
                            let ndx = x - node.x;
                            let ndz = z - node.z;
                            let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                            let rCol = 2.0;
                            if (dist < rCol) {
                                let tDist = Math.max(0, dist - 0.3) / (rCol - 0.3);
                                let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                                if (w > maxBaseW) maxBaseW = w;
                            }
                        }
                        if (maxBaseW > 0.001) {
                            let rise = (5.5 - y);
                            let riseF = smoothstep(1.5, 5.5, y);
                            out[i+1] += B * 0.85 * rise * maxBaseW * riseF;
                        }
                    }
                }

                // ── 3. HORIZONTAL SLIT NEGATIVE SPACE (BETWEEN UPPER ROOF & LOWER DECK) ──
                if (uX <= 0.45 && y >= 8.5 && y <= 11.8) {
                    for (let c = 0; c < slitNodes.length; c++) {
                        let node = slitNodes[c];
                        let ndx = x - node.x;
                        let ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        if (dist < 1.9 && y > 9.6) {
                            let wM = 0.5 * (1.0 + Math.cos((dist / 1.9) * Math.PI));
                            let dY_mull = -B * (y - 8.8) * wM * 0.85;
                            out[i+1] += dY_mull;
                        }
                    }
                }

                // ── 4. TRANSVERSE GAP NEGATIVE SPACE (BETWEEN FRONT & REAR WINGS) ──
                // Secondary transverse ribs bridge across the chasm at mid-height
                if (Math.abs(normZ) < 0.35 && y >= 4.0 && y <= 12.0 && x >= 1.0 && x <= 12.0) {
                    let ribWave = Math.sin(3.0 * Math.PI * (x - 1.0) / 11.0);
                    let spanRib = Math.cos(Math.PI * normZ / 0.35);
                    out[i+1] += B * 0.85 * Math.max(0, ribWave) * spanRib;
                }

                // ── 5. UPPER CANOPY SPLIT (SECONDARY ROOF RIBS) ──
                if (uY > 0.65) {
                    let roofW = smoothstep(0.65, 0.90, uY);
                    let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * normZ);
                    out[i+1] += B * 0.08 * spanY * rib * roofW;
                    out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                }
            }

            return out;
        };

        window.testRenderBranching = function(strengthB) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const bounds = window.getModelBounds();
            const deformed = window.applyBranchingAllSpaces(basePos, strengthB, 'VERTICAL_VOID', bounds);
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

    # Render at B = 0.70 across 4 key views
    Eval-JS "window.testRenderBranching(0.70)"
    
    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\proto_branch_iso.png"

    Eval-JS "window.setView('VOID_CLOSEUP')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\proto_branch_void.png"

    Eval-JS "window.setView('UNDERCROFT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\proto_branch_undercroft.png"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\proto_branch_front.png"

    Write-Output "Branching in all negative spaces tested and screenshots saved"

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
