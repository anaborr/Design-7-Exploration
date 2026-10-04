$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9347
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

    # Inject refined tree-column branching
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

                // Two primary structural column lines along X
                const colCenters = [-5.0, 0.5];

                for (let i = 0; i < out.length; i += 3) {
                    let x = out[i], y = out[i+1], z = out[i+2];
                    let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                    let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                    let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));
                    let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                    // =========================================================================
                    // 1. ORGANIC STRUCTURAL COLUMN-LIKE BRANCHES
                    // Organically divides primary form into secondary column branches extending
                    // downward to the floor and organizing open space into distinct spatial zones
                    // =========================================================================
                    if (uX <= 0.48 && y <= 8.8) {
                        for (let cIdx = 0; cIdx < colCenters.length; cIdx++) {
                            let cx = colCenters[cIdx];
                            let dx = x - cx;
                            let dz = z - centerZ;
                            // Elliptical radial distance
                            let distXZ = Math.sqrt(dx * dx + dz * dz * 0.16);
                            let colRadius = 2.6;

                            if (distXZ < colRadius) {
                                // Smooth cosine radial falloff
                                let wRadial = 0.5 * (1.0 + Math.cos((distXZ / colRadius) * Math.PI));
                                wRadial = Math.pow(wRadial, 1.1);

                                // Depth factor: lower surface (y ~ 5.0) extends all the way to ground
                                let depthFactor = smoothstep(8.5, 4.9, y);
                                let targetGroundY = minY + 0.02;
                                let dropDistance = (y - targetGroundY);

                                // At B = 1.0, column lands completely on ground; at B = 0.7, reaches ground firmly
                                let reach = Math.min(1.0, B * 1.35);
                                let dY = -reach * dropDistance * wRadial * depthFactor;
                                out[i+1] += dY;

                                // Column base footing & capital flaring:
                                // Near the ground (after drop), flare outward in X and Z
                                let currentY = y + dY;
                                let nearFloor = smoothstep(3.0, targetGroundY, currentY);
                                out[i] += dx * 0.35 * nearFloor * wRadial * B;
                                out[i+2] += dz * 0.35 * nearFloor * wRadial * B;

                                // Waist tapering at mid-height of column (between 1.5 and 4.0 ft)
                                let atWaist = Math.sin(Math.PI * Math.min(1.0, Math.max(0.0, (currentY - targetGroundY) / 4.0)));
                                out[i] -= dx * 0.20 * atWaist * wRadial * B;
                                out[i+2] -= dz * 0.15 * atWaist * wRadial * B;
                            }
                        }

                        // Smooth vaulted arch portal between the columns (carves negative space into room zones)
                        if (x > -5.0 && x < 0.5 && y <= 6.5) {
                            let tMid = (x - (-5.0)) / (0.5 - (-5.0));
                            let archLift = Math.sin(Math.PI * tMid);
                            let archWeight = smoothstep(4.8, 6.2, y);
                            out[i+1] += B * 1.6 * archLift * archWeight;
                        }
                    }

                    // =========================================================================
                    // 2. SLIT CHAMBER DIVISION (UPPER-TO-LOWER STRUCTURAL MULLION BRANCHES)
                    // =========================================================================
                    if (uX <= 0.45 && y >= 8.5 && y <= 11.5) {
                        for (let cIdx = 0; cIdx < colCenters.length; cIdx++) {
                            let cx = colCenters[cIdx];
                            let dx = Math.abs(x - cx);
                            if (dx < 1.8) {
                                let wMull = 0.5 * (1.0 + Math.cos((dx / 1.8) * Math.PI));
                                if (y > 9.8) {
                                    // Upper arm ceiling extends downward to meet lower floor
                                    let dY_mull = -B * (y - 9.0) * wMull * 0.80;
                                    out[i+1] += dY_mull;
                                }
                            }
                        }
                    }

                    // =========================================================================
                    // 3. UPPER CANOPY: SECONDARY INTERCONNECTED RIBS
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
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\tree_b30_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\tree_b30_iso.png"

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
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\tree_b70_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\tree_b70_iso.png"

    Write-Output "Tree column branching screenshots captured"
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
