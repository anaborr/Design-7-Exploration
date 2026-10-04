$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9363
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
            }
            window.threeControls.update();
        };

        window.testNegativeSpaceBranching = function(meshPos, B) {
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
            const bayX1 = minX + 0.17 * spanX; // ~ -4.9
            const bayX2 = minX + 0.35 * spanX; // ~ +0.5
            const rowZ1 = centerZ + 0.22 * spanZ; // ~ -2.6
            const rowZ2 = centerZ - 0.22 * spanZ; // ~ -7.0

            const underNodes = [
                { x: bayX1, z: rowZ1 },
                { x: bayX1, z: rowZ2 },
                { x: bayX2, z: rowZ1 },
                { x: bayX2, z: rowZ2 }
            ];

            // Loop Void center:
            const voidCenterX = 13.0;
            const voidCenterY = 9.0;

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                // ─── 1. UNDERCROFT NEGATIVE SPACE (COLUMNS & VAULTED ROOMS) ───
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

                    // Vaulted arches between Bay 1 and Bay 2
                    if (x > bayX1 && x < bayX2 && y <= 6.8) {
                        let tX = (x - bayX1) / (bayX2 - bayX1);
                        let archY = Math.sin(Math.PI * tX);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.4 * archY * archW;
                    }

                    // Transverse vaulted arches between front and rear rows
                    if (z > rowZ2 && z < rowZ1 && y <= 6.8 && uX < 0.45) {
                        let tZ = (z - rowZ2) / (rowZ1 - rowZ2);
                        let archZ = Math.sin(Math.PI * tZ);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.2 * archZ * archW;
                    }
                }

                // ─── 2. HORIZONTAL SLIT NEGATIVE SPACE (PIER MULLIONS & FRAMED APERTURES) ───
                // Upper plate branches downward and lower plate branches upward to meet in the slit
                if (uX <= 0.45 && y >= 7.8 && y <= 12.0) {
                    for (let c = 0; c < underNodes.length; c++) {
                        let node = underNodes[c];
                        let ndx = x - node.x, ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        if (dist < 2.0) {
                            let wM = 0.5 * (1.0 + Math.cos((dist / 2.0) * Math.PI));
                            // If on upper deck (y > 9.8), branch downward
                            if (y > 9.8) {
                                let dY_down = -B * (y - 9.2) * wM * 0.90;
                                out[i+1] += dY_down;
                            }
                            // If on lower deck (y < 9.5), branch upward
                            else if (y > 7.8) {
                                let dY_up = B * (9.2 - y) * wM * 0.90;
                                out[i+1] += dY_up;
                            }
                        }
                    }
                }

                // ─── 3. CENTRAL LOOP ATRIUM VOID NEGATIVE SPACE (HARMONIC LOBED BIFURCATION) ───
                // Organically subdivides the giant void opening into twin interconnected vaulted portals!
                if (x >= 8.5 && x <= 18.0) {
                    let vdx = (x - voidCenterX) / 4.8;
                    let vdy = (y - voidCenterY) / 5.5;
                    let distV = Math.sqrt(vdx * vdx + vdy * vdy);

                    // Vertices bordering the negative space (distV between 0.6 and 1.5)
                    if (distV >= 0.6 && distV <= 1.55) {
                        let theta = Math.atan2(vdy, vdx);
                        let borderWeight = Math.sin(Math.PI * (distV - 0.6) / 0.95);

                        // Vertical dividing branch: cos^2(theta - PI/2) peaks at top (theta = PI/2) and bottom (-PI/2)
                        // This causes the top ceiling to flow downward and bottom ramp to flow upward into the void!
                        let vertSplit = Math.pow(Math.sin(theta), 4); // Concentrates strongly along vertical axis
                        let splitSign = Math.sin(theta) > 0 ? -1.0 : +1.0; // Top moves down, bottom moves up!
                        let dY_voidBranch = splitSign * B * 2.8 * vertSplit * borderWeight;
                        out[i+1] += dY_voidBranch;

                        // Twin portal arch relief on left (theta ~ PI) and right (theta ~ 0)
                        let portalRelief = Math.pow(Math.cos(theta), 2);
                        out[i] += Math.cos(theta) * B * 0.8 * portalRelief * borderWeight;
                        out[i+2] += normZ * B * 0.6 * vertSplit * borderWeight;
                    }
                }

                // ─── 4. SADDLE VALLEY NEGATIVE SPACE (TRANSITION MEZZANINE SPAN) ───
                // Bridges across the open dip between cantilever and tower (x: 2.5 -> 6.5)
                if (x >= 2.5 && x <= 6.5 && y >= 6.0 && y <= 11.0) {
                    let tSaddle = (x - 2.5) / 4.0;
                    let saddleArch = Math.sin(Math.PI * tSaddle);
                    let ribZ = Math.cos(Math.PI * Math.min(1.0, Math.abs(normZ) / 0.7));
                    out[i+1] += B * 1.1 * saddleArch * Math.max(0, ribZ);
                }

                // ─── 5. UPPER ROOF CANOPY DIVISION (SECONDARY ARTICULATED RIBS) ───
                if (uY > 0.65) {
                    let roofW = smoothstep(0.65, 0.90, uY);
                    let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * normZ);
                    out[i+1] += B * 0.08 * spanY * rib * roofW;
                    out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                }
            }

            return out;
        };

        window.renderNegativeSpaceTest = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testNegativeSpaceBranching(basePos, B);
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

    Eval-JS "window.renderNegativeSpaceTest(0.70)"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\negspace_iso.png"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\negspace_front.png"

    Eval-JS "window.setView('UNDERCROFT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\negspace_undercroft.png"

    Write-Output "Negative space branching rendered and captured"

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
