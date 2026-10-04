$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9369
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

        window.testOptimizedBranching = function(meshPos, B, typoKey) {
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
            // Bay 1: X = -4.9 (Cantilever tip)
            // Bay 2: X = -0.2 (Cantilever root, comfortably before belly slope)
            const bayX1 = minX + 0.17 * spanX;
            const bayX2 = minX + 0.325 * spanX; // ~ -0.2
            const rowZ1 = centerZ + 0.22 * spanZ; // ~ -2.6
            const rowZ2 = centerZ - 0.22 * spanZ; // ~ -7.0

            const colNodes = [
                { x: bayX1, z: rowZ1 },
                { x: bayX1, z: rowZ2 },
                { x: bayX2, z: rowZ1 },
                { x: bayX2, z: rowZ2 }
            ];

            const activeTypo = typoKey || 'VERTICAL_VOID';

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                // ─── 1. UNDERCROFT NEGATIVE SPACE (QUAD COLUMN-LIKE BRANCHES) ───
                // Strict bounds x <= 1.8 to preserve belly slope
                if (x <= 1.8 && y <= 8.8) {
                    let maxColW = 0;
                    let bestDx = 0, bestDz = 0;
                    for (let c = 0; c < colNodes.length; c++) {
                        let node = colNodes[c];
                        let ndx = x - node.x, ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        let rCol = 2.1;
                        if (dist < rCol) {
                            let tDist = dist / rCol;
                            let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                            if (w > maxColW) {
                                maxColW = w; bestDx = ndx; bestDz = ndz;
                            }
                        }
                    }

                    if (maxColW > 0.001) {
                        let depthF = smoothstep(8.5, 4.4, y);
                        let targetFloor = minY + 0.04;
                        let drop = (y - targetFloor);
                        let reach = Math.min(1.0, B * 1.50);
                        let dY_col = -reach * drop * maxColW * depthF;
                        out[i+1] += dY_col;

                        let currY = y + dY_col;
                        let nearFloor = smoothstep(2.6, targetFloor, currY);
                        out[i] += bestDx * 0.35 * nearFloor * maxColW * B;
                        out[i+2] += bestDz * 0.35 * nearFloor * maxColW * B;
                    }

                    // Vaulted longitudinal arches between Bay 1 and Bay 2
                    if (x > bayX1 && x < bayX2 && y <= 6.8) {
                        let tX = (x - bayX1) / (bayX2 - bayX1);
                        let archY = Math.sin(Math.PI * tX);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.5 * archY * archW;
                    }

                    // Vaulted transverse arches between front and rear rows
                    if (z > rowZ2 && z < rowZ1 && y <= 6.8 && x < bayX2 + 0.5) {
                        let tZ = (z - rowZ2) / (rowZ1 - rowZ2);
                        let archZ = Math.sin(Math.PI * tZ);
                        let archW = smoothstep(4.5, 6.2, y);
                        out[i+1] += B * 1.3 * archZ * archW;
                    }
                }

                // ─── 2. HORIZONTAL SLIT NEGATIVE SPACE (STRUCTURAL PIER MULLIONS) ───
                // Upper plate branches downward to meet lower floor plate at structural bays
                if (x <= 1.5 && y >= 8.5 && y <= 11.8) {
                    for (let c = 0; c < colNodes.length; c++) {
                        let node = colNodes[c];
                        let ndx = x - node.x, ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        if (dist < 1.8 && y > 9.6) {
                            let wM = 0.5 * (1.0 + Math.cos((dist / 1.8) * Math.PI));
                            let dY_mull = -B * (y - 9.0) * wM * 0.85;
                            out[i+1] += dY_mull;
                        }
                    }
                }

                // ─── 3. UPPER CANOPY SPLIT (SECONDARY ROOF RIBS) ───
                if (uY > 0.65) {
                    let roofW = smoothstep(0.65, 0.90, uY);
                    let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * normZ);
                    out[i+1] += B * 0.08 * spanY * rib * roofW;
                    out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                }

                // ─── 4. DOMAIN A TYPOLOGY MODULATION: ALLOW & ENCOURAGE BRANCHING ON NEGATIVE SPACES ───
                if (activeTypo === 'VERTICAL_VOID') {
                    // Vertical Void: Primary form branches into the soaring central atrium void,
                    // extending secondary structural bridges and flying arches across the negative space
                    if (uX > 0.46 && uX < 0.86) {
                        let voidSpan = Math.sin(Math.PI * (uX - 0.46) / 0.40);
                        let tierLevel = Math.sin(3.0 * Math.PI * uY);
                        if (tierLevel > 0 && uY > 0.25 && uY < 0.85) {
                            let bridgeInward = -normZ * B * 0.16 * spanZ * voidSpan * tierLevel;
                            out[i+2] += bridgeInward;
                            out[i+1] += B * 0.10 * spanY * voidSpan * Math.sin(Math.PI * uY);
                        }
                    }
                } else if (activeTypo === 'COMPRESSED_EXPANDED' || activeTypo === 'CHOKE_PORTALS') {
                    let atChoke = Math.exp(-Math.pow((uX - 0.38) * 8.0, 2));
                    out[i+1] += B * 0.18 * spanY * atChoke * smoothstep(0.2, 0.6, uY);
                    out[i+2] += normZ * B * 0.14 * spanZ * atChoke;
                } else if (activeTypo === 'OPEN_HALL' || activeTypo === 'PERIMETER_BUTTRESS' || activeTypo === 'PERIMETER_ALCOVES') {
                    let flankDist = Math.abs(normZ);
                    if (flankDist > 0.35) {
                        let buttressW = smoothstep(0.35, 0.85, flankDist);
                        out[i+2] += normZ * B * 0.16 * spanZ * buttressW * Math.sin(3.0 * Math.PI * uX);
                        out[i+1] += B * 0.10 * spanY * buttressW * Math.sin(Math.PI * uX);
                    }
                } else if (activeTypo === 'TERRACED_STEPPED' || activeTypo === 'TERRACE_CANTILEVERS' || activeTypo === 'GROUND_DIVIDE') {
                    let tierU = (uX * 3.0) % 1.0;
                    out[i+1] -= B * 0.15 * spanY * tierU * smoothstep(0.1, 0.45, uY);
                } else if (activeTypo === 'LINEAR_DIRECTIONAL' || activeTypo === 'SECONDARY_AXIAL') {
                    let enfiladeBay = Math.sin(4.0 * Math.PI * uX);
                    out[i+2] += normZ * B * 0.16 * spanZ * Math.max(0, enfiladeBay);
                } else if (activeTypo === 'FOLDED_UNDULATING' || activeTypo === 'CREST_NOOKS') {
                    let foldDiag = Math.sin(3.0 * Math.PI * (uX + normZ * 0.5));
                    out[i+1] -= B * 0.14 * spanY * Math.max(0, -foldDiag) * smoothstep(0.2, 0.5, uY);
                }
            }

            return out;
        };

        window.renderOptimized = function(B, typo) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testOptimizedBranching(basePos, B, typo);
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

    Eval-JS "window.renderOptimized(0.70, 'VERTICAL_VOID')"

    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\optimized_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\optimized_iso.png"

    Write-Output "Optimized branching rendered and captured"

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
