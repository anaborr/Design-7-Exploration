$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9346
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

    # Inject clean column branching formula and disable syncBranchingFromDnaSlider
    Eval-JS @'
    (() => {
        // Disable separate wireframe struts permanently
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

                // Column centers in X
                const colCenters = [-5.2, 0.6]; // Two primary structural column lines

                for (let i = 0; i < out.length; i += 3) {
                    let x = out[i], y = out[i+1], z = out[i+2];
                    let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                    let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                    let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));
                    let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                    // =========================================================================
                    // 1. ORGANIC COLUMN-LIKE BRANCHES (UNDERSIDE EXTENSION TO FLOOR)
                    // =========================================================================
                    if (uX <= 0.48 && y <= 8.5) {
                        for (let cIdx = 0; cIdx < colCenters.length; cIdx++) {
                            let cx = colCenters[cIdx];
                            let dx = x - cx;
                            let dz = z - centerZ;
                            let distXZ = Math.sqrt(dx * dx * 1.0 + dz * dz * 0.18); // elliptical column profile

                            // Column envelope (radius ~ 2.4 ft)
                            let colRadius = 2.4;
                            if (distXZ < colRadius) {
                                let wRadial = Math.cos((distXZ / colRadius) * Math.PI * 0.5); // 1 at center, 0 at edge
                                wRadial = Math.pow(wRadial, 1.4);

                                // Downward vertical extension from ceiling down to ground (minY + 0.05)
                                let targetY = minY + 0.05;
                                let maxDrop = Math.max(0, y - targetY);
                                // The lower surface extends all the way down, while the upper surface dips slightly to form flared capital
                                let depthFactor = smoothstep(8.5, 5.0, y);
                                let dY = -B * maxDrop * wRadial * depthFactor;

                                out[i+1] += dY;

                                // Column trunk shaping: gently pull inwards at mid-height, flare at base and capital
                                let trunkWaist = Math.sin(Math.PI * Math.min(1.0, y / 5.5));
                                out[i] -= dx * B * 0.25 * wRadial * trunkWaist;
                                out[i+2] -= dz * B * 0.20 * wRadial * trunkWaist;
                            }
                        }

                        // Arched vault between the columns (subdividing into positive spatial chambers)
                        if (x > -5.2 && x < 0.6 && y <= 6.5) {
                            let tMid = (x - (-5.2)) / (0.6 - (-5.2));
                            let archLift = Math.sin(Math.PI * tMid);
                            let archWeight = smoothstep(4.8, 6.2, y);
                            out[i+1] += B * 1.8 * archLift * archWeight;
                        }
                    }

                    // =========================================================================
                    // 2. SLIT CHAMBER DIVISION (UPPER-TO-LOWER STRUCTURAL MULLION BRANCHES)
                    // =========================================================================
                    if (uX <= 0.45 && y > 8.0 && y < 11.0) {
                        for (let cIdx = 0; cIdx < colCenters.length; cIdx++) {
                            let cx = colCenters[cIdx];
                            let dx = Math.abs(x - cx);
                            if (dx < 1.8) {
                                let wMullion = Math.cos((dx / 1.8) * Math.PI * 0.5);
                                // Underside of upper arm reaches downward to meet the lower arm
                                if (y > 9.6) {
                                    let dY_mull = -B * (y - 9.0) * wMullion * 0.75;
                                    out[i+1] += dY_mull;
                                }
                            }
                        }
                    }

                    // =========================================================================
                    // 3. UPPER CANOPY SPLITTING INTO SECONDARY ARTICULATED RIBS
                    // =========================================================================
                    if (uY > 0.65) {
                        let roofW = smoothstep(0.65, 0.90, uY);
                        let rib = Math.sin(5.0 * Math.PI * uX) * Math.cos(2.0 * Math.PI * uZ);
                        out[i+1] += B * 0.08 * spanY * rib * roofW;
                        out[i] += B * 0.05 * spanX * Math.cos(5.0 * Math.PI * uX) * roofW;
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
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\clean_b30_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\clean_b30_iso.png"

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
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\clean_b70_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\clean_b70_iso.png"

    Write-Output "Clean column branching screenshots captured"
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
