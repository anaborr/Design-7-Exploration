$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9371
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
                window.threeCamera.position.set(-18, 5, 12);
                window.threeControls.target.set(-3, 4, -5);
            } else if (type === 'VOID') {
                window.threeCamera.position.set(16, 12, 28);
                window.threeControls.target.set(14, 9, -5);
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        // Let's test a refined, organic branching function directly:
        const oldApplyRule = window.applyRule;
        window.applyRule = function(mesh, ruleName, ruleStrength, activeTypology, bounds, vNormals) {
            if (ruleName !== 'BRANCHING') {
                return oldApplyRule(mesh, ruleName, ruleStrength, activeTypology, bounds, vNormals);
            }

            let B = ruleStrength;
            let typoKey = activeTypology || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
            let grammar = (window.SPATIAL_GRAMMAR && window.SPATIAL_GRAMMAR[typoKey]) || {};

            let b = bounds || (window.domainState && window.domainState.importedModelBounds);
            let minX = b ? b.min.x : -10.0;
            let maxX = b ? b.max.x : 21.0;
            let minY = b ? b.min.y : 0.0;
            let maxY = b ? b.max.y : 19.5;
            let minZ = b ? b.min.z : -12.0;
            let maxZ = b ? b.max.z : 1.5;

            let spanX = maxX - minX;
            let spanY = maxY - minY;
            let spanZ = maxZ - minZ;
            let centerX = (minX + maxX) * 0.5;
            let centerY = (minY + maxY) * 0.5;
            let centerZ = (minZ + maxZ) * 0.5;

            let out = new Float32Array(mesh);

            // Columns under cantilever
            let bayX1 = -4.9;
            let bayX2 = -0.2;
            let rowZ1 = -2.6;
            let rowZ2 = -7.0;

            let colNodes = [
                { x: bayX1, z: rowZ1 },
                { x: bayX1, z: rowZ2 },
                { x: bayX2, z: rowZ1 },
                { x: bayX2, z: rowZ2 }
            ];

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                // ─── 1. UNDERCROFT COLUMN BRANCHES (SMOOTH FLUTED TRUNKS & VAULTS)
                if (x <= 1.8 && y <= 8.8) {
                    let maxColW = 0;
                    let bestDist = 999;
                    let bestDx = 0, bestDz = 0;

                    for (let c = 0; c < colNodes.length; c++) {
                        let node = colNodes[c];
                        let ndx = x - node.x;
                        let ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        let rCol = 2.6; // Wider radius to embrace multiple vertices
                        let rCore = 0.6; // Core cylinder
                        if (dist < rCol) {
                            let w;
                            if (dist <= rCore) {
                                w = 1.0;
                            } else {
                                let tDist = (dist - rCore) / (rCol - rCore);
                                w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                            }
                            if (w > maxColW) {
                                maxColW = w;
                                bestDist = dist;
                                bestDx = ndx;
                                bestDz = ndz;
                            }
                        }
                    }

                    if (maxColW > 0.001) {
                        let depthF = Math.sin(Math.min(1.0, Math.max(0, (8.5 - y) / 4.0)) * Math.PI * 0.5);
                        let targetFloor = minY + 0.08;
                        let drop = (y - targetFloor);

                        // Organic column reach: descends smoothly to floor
                        let reach = Math.min(1.0, B * 1.35);
                        let dY_col = -reach * drop * maxColW * depthF;
                        out[i+1] += dY_col;

                        // Flared column capital & base plinth for architectural column character
                        let currY = y + dY_col;
                        let baseFlare = Math.exp(-Math.pow((currY - targetFloor) * 1.2, 2.0));
                        let capitalFlare = Math.exp(-Math.pow((y - 7.5) * 0.8, 2.0));
                        let flare = (baseFlare * 0.25 + capitalFlare * 0.15) * B * maxColW;
                        if (bestDist > 0.01) {
                            out[i] += (bestDx / bestDist) * flare;
                            out[i+2] += (bestDz / bestDist) * flare;
                        }
                    }

                    // Vaulted arches between columns (connecting column bays smoothly without pulling up)
                    if (x > bayX1 && x < bayX2 && y >= 3.0 && y <= 6.5) {
                        let tX = (x - bayX1) / (bayX2 - bayX1);
                        let archProfile = Math.sin(Math.PI * tX);
                        out[i+1] += B * 0.8 * archProfile * Math.sin(Math.PI * (y - 3.0) / 3.5);
                    }
                    if (z > rowZ2 && z < rowZ1 && y >= 3.0 && y <= 6.5 && x < bayX2 + 0.5) {
                        let tZ = (z - rowZ2) / (rowZ1 - rowZ2);
                        let archZ = Math.sin(Math.PI * tZ);
                        out[i+1] += B * 0.7 * archZ * Math.sin(Math.PI * (y - 3.0) / 3.5);
                    }
                }

                // ─── 2. NEGATIVE SPACE BETWEEN UPPER & LOWER PLATES (HORIZONTAL SLIT BRANCHING)
                // Both roof plate (descending) and floor plate (ascending) branch toward each other
                // across the horizontal void to form rhythmic structural piers / window mullions
                if (x <= 1.5 && y >= 8.2 && y <= 12.0) {
                    for (let c = 0; c < colNodes.length; c++) {
                        let node = colNodes[c];
                        let ndx = x - node.x;
                        let ndz = z - node.z;
                        let dist = Math.sqrt(ndx * ndx + ndz * ndz);
                        let rMull = 1.9;
                        if (dist < rMull) {
                            let wM = 0.5 * (1.0 + Math.cos((dist / rMull) * Math.PI));
                            // Midplane of slit is at y ~ 10.1
                            let midSlit = 10.1;
                            if (y > midSlit) {
                                // Upper plate ceiling branches downward into negative space
                                let dY_top = -B * (y - midSlit) * wM * 0.82;
                                out[i+1] += dY_top;
                            } else {
                                // Lower plate floor branches upward into negative space
                                let dY_bot = B * (midSlit - y) * wM * 0.75;
                                out[i+1] += dY_bot;
                            }
                        }
                    }
                }

                // ─── 3. UPPER ROOF DIVISION (SECONDARY STRUCTURAL RIBS)
                if (uY > 0.65) {
                    let roofW = Math.sin(Math.min(1.0, Math.max(0, (uY - 0.65) / 0.30)) * Math.PI * 0.5);
                    let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * normZ);
                    out[i+1] += B * 0.07 * spanY * rib * roofW;
                    out[i] += B * 0.03 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                }

                // ─── 4. CENTRAL ATRIUM NEGATIVE SPACE BRANCHING (INWARD MEZZANINES & FLYING ARCHES)
                // When Vertical Void is active, encourage branching across the vast interior void
                if (grammar.branchingConstraint === 'VOID_CLEAR' || grammar.branchingConstraint === 'VOID_BRANCH' || typoKey === 'VERTICAL_VOID') {
                    if (uX > 0.44 && uX < 0.88) {
                        let voidSpan = Math.sin(Math.PI * (uX - 0.44) / 0.44);
                        // Two distinct mezzanine tier levels spanning into the negative space
                        let tier1 = Math.exp(-Math.pow((uY - 0.42) * 5.0, 2.0));
                        let tier2 = Math.exp(-Math.pow((uY - 0.68) * 5.0, 2.0));
                        let bridgeTier = (tier1 + tier2) * voidSpan;

                        if (bridgeTier > 0.01) {
                            // Secondary branches reach inward across the negative space
                            let inwardReach = -normZ * B * 0.18 * spanZ * bridgeTier;
                            out[i+2] += inwardReach;
                            out[i+1] += B * 0.08 * spanY * voidSpan * (tier1 * 0.5 - tier2 * 0.5);
                        }
                    }
                } else if (grammar.branchingConstraint === 'CHOKE_PORTALS') {
                    let atChoke = Math.exp(-Math.pow((uX - 0.38) * 8.0, 2));
                    out[i+1] += B * 0.16 * spanY * atChoke * Math.sin(Math.PI * uY);
                    out[i+2] += normZ * B * 0.14 * spanZ * atChoke;
                } else if (grammar.branchingConstraint === 'PERIMETER_BUTTRESS' || grammar.branchingConstraint === 'PERIMETER_ALCOVES') {
                    let flankDist = Math.abs(normZ);
                    if (flankDist > 0.35) {
                        let buttressW = (flankDist - 0.35) / 0.50;
                        out[i+2] += normZ * B * 0.16 * spanZ * buttressW * Math.sin(3.0 * Math.PI * uX);
                        out[i+1] += B * 0.09 * spanY * buttressW * Math.sin(Math.PI * uX);
                    }
                } else if (grammar.branchingConstraint === 'TERRACE_CANTILEVERS' || grammar.branchingConstraint === 'GROUND_DIVIDE') {
                    let tierU = (uX * 3.0) % 1.0;
                    out[i+1] -= B * 0.14 * spanY * tierU * Math.sin(Math.PI * uY);
                } else if (grammar.branchingConstraint === 'SECONDARY_AXIAL') {
                    let enfiladeBay = Math.sin(4.0 * Math.PI * uX);
                    out[i+2] += normZ * B * 0.15 * spanZ * Math.max(0, enfiladeBay);
                } else if (grammar.branchingConstraint === 'CREST_NOOKS') {
                    let foldDiag = Math.sin(3.0 * Math.PI * (uX + normZ * 0.5));
                    out[i+1] -= B * 0.13 * spanY * Math.max(0, -foldDiag) * Math.sin(Math.PI * uY);
                }
            }

            return out;
        };

        // Select Vertical Void and set Branching to 70%
        window.domainState.selectedTypology = 'VERTICAL_VOID';
        window.updateDnaSlider('branching', 70);
    })();
'@

    Start-Sleep -Seconds 2

    # Capture all 4 viewpoints
    Eval-JS "window.setView('FRONT')" | Out-Null
    Start-Sleep -Milliseconds 600
    Save-Screenshot 'scratch/proto_branch_front.png'

    Eval-JS "window.setView('ISO')" | Out-Null
    Start-Sleep -Milliseconds 600
    Save-Screenshot 'scratch/proto_branch_iso.png'

    Eval-JS "window.setView('UNDERCROFT')" | Out-Null
    Start-Sleep -Milliseconds 600
    Save-Screenshot 'scratch/proto_branch_undercroft.png'

    Eval-JS "window.setView('VOID')" | Out-Null
    Start-Sleep -Milliseconds 600
    Save-Screenshot 'scratch/proto_branch_void.png'

    Write-Host "All prototype screenshots rendered and captured successfully!"
} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
