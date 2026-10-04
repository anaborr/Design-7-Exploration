$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9348
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

    # Inject 4-column colonnade branching
    Eval-JS @'
    (() => {
        window.syncBranchingFromDnaSlider = function() {
            if (window.clearBranchingGeometry) window.clearBranchingGeometry();
        };
        if (window.clearBranchingGeometry) window.clearBranchingGeometry();

        const oldApplyRule = window.applyRule;
        window.applyRule = function(mesh, ruleName, ruleStrength, activeTypology, bounds, vNormals) {
            const upperRule = (ruleName || '').toUpperCase();
            if (upperRule === 'BRANCHING' || upperRule === 'B') {
                const B = Math.max(0, Math.min(1.0, ruleStrength));
                if (B <= 0.001) return new Float32Array(mesh);

                const out = new Float32Array(mesh);
                const minX = bounds?.min?.x ?? bounds?.minX ?? -10.02;
                const maxX = bounds?.max?.x ?? bounds?.maxX ?? 20.20;
                const minY = bounds?.min?.y ?? bounds?.minY ?? -0.20;
                const maxY = bounds?.max?.y ?? bounds?.maxY ?? 20.41;
                const minZ = bounds?.min?.z ?? bounds?.minZ ?? -10.16;
                const maxZ = bounds?.max?.z ?? bounds?.maxZ ?? 0.54;

                const spanX = Math.max(0.1, maxX - minX);
                const spanY = Math.max(0.1, maxY - minY);
                const spanZ = Math.max(0.1, maxZ - minZ);
                const centerZ = (minZ + maxZ) / 2;

                const typoKey = typeof activeTypology === 'string'
                    ? activeTypology
                    : (activeTypology?.id || (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID');
                const typoDef = (window.BASE_TYPOLOGIES && window.BASE_TYPOLOGIES[typoKey]) || null;
                const grammar = (typoDef && typoDef.spatialGrammar) || { branchingConstraint: 'VOID_CLEAR' };

                const smoothstep = (e0, e1, x) => {
                    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
                    return t * t * (3 - 2 * t);
                };

                // Column grid: 2 longitudinal bays (X = -5.0, 0.5) x 2 transverse rows (Z = -2.6, -7.0)
                const colNodes = [
                    { x: -5.0, z: -2.6 },
                    { x: -5.0, z: -7.0 },
                    { x: 0.5, z: -2.6 },
                    { x: 0.5, z: -7.0 }
                ];

                for (let i = 0; i < out.length; i += 3) {
                    let x = out[i], y = out[i+1], z = out[i+2];
                    let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                    let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                    let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));
                    let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                    // =========================================================================
                    // 1. FOUR STRUCTURAL COLONNADE BRANCHES
                    // Dividing primary cantilever into 4 column legs grounding into the plinth
                    // =========================================================================
                    if (uX <= 0.48 && y <= 8.8) {
                        let maxColW = 0;
                        let bestDx = 0, bestDz = 0;

                        for (let c = 0; c < colNodes.length; c++) {
                            let node = colNodes[c];
                            let dx = x - node.x;
                            let dz = z - node.z;
                            let dist = Math.sqrt(dx * dx + dz * dz);
                            let rCol = 2.2;
                            if (dist < rCol) {
                                // Plateau function: flat core of radius 0.6, smooth cosine taper to 2.2
                                let tDist = Math.max(0, dist - 0.4) / (rCol - 0.4);
                                let w = 0.5 * (1.0 + Math.cos(tDist * Math.PI));
                                if (w > maxColW) {
                                    maxColW = w;
                                    bestDx = dx;
                                    bestDz = dz;
                                }
                            }
                        }

                        if (maxColW > 0.001) {
                            let depthF = smoothstep(8.5, 4.9, y);
                            let targetFloor = minY + 0.05;
                            let drop = (y - targetFloor);

                            // Reach scales with B: at B = 0.7-1.0 lands firmly on ground
                            let reach = Math.min(1.0, B * 1.35);
                            let dY = -reach * drop * maxColW * depthF;
                            out[i+1] += dY;

                            // Column footing flaring near ground
                            let currY = y + dY;
                            let nearFloor = smoothstep(2.5, targetFloor, currY);
                            out[i] += bestDx * 0.35 * nearFloor * maxColW * B;
                            out[i+2] += bestDz * 0.35 * nearFloor * maxColW * B;
                        }

                        // Longitudinal arched vaults between bays
                        if (x > -5.0 && x < 0.5 && y <= 6.5) {
                            let tX = (x - (-5.0)) / 5.5;
                            let archY = Math.sin(Math.PI * tX);
                            let archW = smoothstep(4.8, 6.2, y);
                            out[i+1] += B * 1.5 * archY * archW;
                        }
                        // Transverse arched vault between front and rear column rows
                        if (z > -7.0 && z < -2.6 && y <= 6.5 && uX < 0.45) {
                            let tZ = (z - (-7.0)) / 4.4;
                            let archZ = Math.sin(Math.PI * tZ);
                            let archW = smoothstep(4.8, 6.2, y);
                            out[i+1] += B * 1.2 * archZ * archW;
                        }
                    }

                    // =========================================================================
                    // 2. SLIT CHAMBER DIVISION (UPPER-TO-LOWER STRUCTURAL MULLION BRANCHES)
                    // =========================================================================
                    if (uX <= 0.45 && y >= 8.5 && y <= 11.5) {
                        for (let c = 0; c < colNodes.length; c++) {
                            let node = colNodes[c];
                            let dx = x - node.x;
                            let dz = z - node.z;
                            let dist = Math.sqrt(dx * dx + dz * dz);
                            if (dist < 1.8 && y > 9.8) {
                                let wM = 0.5 * (1.0 + Math.cos((dist / 1.8) * Math.PI));
                                let dY_mull = -B * (y - 9.0) * wM * 0.80;
                                out[i+1] += dY_mull;
                            }
                        }
                    }

                    // =========================================================================
                    // 3. UPPER CANOPY: SECONDARY RIBS
                    // =========================================================================
                    if (uY > 0.65) {
                        let roofW = smoothstep(0.65, 0.90, uY);
                        let rib = Math.sin(4.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * uZ);
                        out[i+1] += B * 0.08 * spanY * rib * roofW;
                        out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofW;
                    }
                }
                return out;
            }
            return oldApplyRule(mesh, ruleName, ruleStrength, activeTypology, bounds, vNormals);
        };
    })()
'@ | Out-Null

    # Set B to 30% and snap
    Eval-JS @'
    (() => {
        const sB = document.getElementById('slider-dna-b');
        if (sB) { sB.value = 30; sB.dispatchEvent(new Event('input', { bubbles: true })); }
        ['slider-dna-c', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        if (window.clearBranchingGeometry) window.clearBranchingGeometry();
        if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');
        if (window.render) window.render();
    })()
'@ | Out-Null
    Start-Sleep -Milliseconds 600

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('FRONT'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\quad_b30_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\quad_b30_iso.png"

    # Set B to 70% and snap
    Eval-JS @'
    (() => {
        const sB = document.getElementById('slider-dna-b');
        if (sB) { sB.value = 70; sB.dispatchEvent(new Event('input', { bubbles: true })); }
        if (window.clearBranchingGeometry) window.clearBranchingGeometry();
        if (window.render) window.render();
    })()
'@ | Out-Null
    Start-Sleep -Milliseconds 600

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('FRONT'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\quad_b70_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\quad_b70_iso.png"

    Write-Output "Quad colonnade screenshots captured"
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
