$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9345
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

    # Inject new branching formulation into window.applyRule
    Eval-JS @'
    (() => {
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

                for (let i = 0; i < out.length; i += 3) {
                    let x = out[i], y = out[i+1], z = out[i+2];
                    let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                    let uY = Math.min(1, Math.max(0, (y - minY) / spanY));
                    let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));
                    let normZ = (z - centerZ) / (spanZ * 0.5 + 0.001);

                    // =========================================================================
                    // STRUCTURAL COLUMN-LIKE BRANCHES
                    // Organically divides primary form into secondary column branches extending
                    // downward to the floor and organizing open space into distinct spatial zones
                    // =========================================================================
                    
                    // Column nodes along X:
                    // Column 1: uX ~ 0.15 (front cantilever support column)
                    // Column 2: uX ~ 0.35 (intermediate support column)
                    let dX1 = Math.abs(uX - 0.15);
                    let dX2 = Math.abs(uX - 0.35);
                    let wCol1 = Math.exp(-(dX1 * dX1) / (2 * 0.035 * 0.035));
                    let wCol2 = Math.exp(-(dX2 * dX2) / (2 * 0.038 * 0.038));
                    let wCol = Math.max(wCol1, wCol2);

                    // A. DOWNWARD EXTENSION TO GROUND (Lower cantilever undercroft: y between minY and 9.5)
                    if (uX <= 0.48 && y <= 9.5) {
                        if (wCol > 0.005) {
                            // Column shaft reaching down to ground plane (minY + 0.1)
                            let distToFloor = Math.max(0, y - (minY + 0.15));
                            let dropFactor = smoothstep(9.5, 5.0, y); // strongest at bottom of plate
                            let dY_down = -B * distToFloor * dropFactor * wCol;
                            out[i+1] += dY_down;

                            // Column flaring at base and capital (Z & X)
                            let flareZ = (1.0 + 0.35 * Math.cos(Math.PI * Math.min(1.0, y / 8.0)));
                            out[i+2] += normZ * B * 0.10 * spanZ * wCol * flareZ * dropFactor;
                            out[i] += B * 0.04 * spanX * (uX < 0.25 ? (0.15 - uX) : (0.35 - uX)) * wCol * dropFactor;
                        }

                        // Vaulted arch ceiling between columns: arches upward to form distinct spatial rooms
                        let inBay1 = (uX > 0.15 && uX < 0.35);
                        let inBay2 = (uX > 0.35 && uX < 0.50);
                        if (inBay1 && y <= 7.0) {
                            let tArch = (uX - 0.15) / 0.20;
                            let archY = Math.sin(Math.PI * tArch);
                            let archWeight = smoothstep(4.8, 6.2, y);
                            out[i+1] += B * 1.5 * archY * archWeight;
                        } else if (inBay2 && y <= 7.0) {
                            let tArch = (uX - 0.35) / 0.15;
                            let archY = Math.sin(Math.PI * tArch);
                            let archWeight = smoothstep(3.0, 6.0, y);
                            out[i+1] += B * 1.6 * archY * archWeight;
                        }
                    }

                    // B. UPPER PRIMARY CANOPY DIVISION (Secondary rib flutes)
                    if (uY > 0.55) {
                        let roofWeight = smoothstep(0.55, 0.85, uY);
                        // Flutes dividing primary roof mass along longitudinal axis
                        let fluteWave = Math.sin(4.0 * Math.PI * uX) * 0.6 + Math.cos(2.0 * Math.PI * uZ) * 0.4;
                        out[i+1] += B * 0.07 * spanY * fluteWave * roofWeight;
                        out[i] += B * 0.04 * spanX * Math.cos(4.0 * Math.PI * uX) * roofWeight;
                        out[i+2] += normZ * B * 0.05 * spanZ * fluteWave * roofWeight;
                    }

                    // C. TYPOLOGY REFINEMENT
                    if (grammar.branchingConstraint === 'VOID_CLEAR') {
                        // Vertical Void: columns keep atrium void soaring and open
                        if (uX > 0.55 && uX < 0.85 && uY > 0.3) {
                            let voidFlare = Math.sin(Math.PI * (uX - 0.55) / 0.30);
                            out[i+2] += normZ * B * 0.08 * spanZ * voidFlare;
                        }
                    }
                }
                return out;
            }
            return oldApplyRule(mesh, ruleName, ruleStrength, activeTypology, bounds, vNormals);
        };
        // Clear separate floating wireframe struts
        if (window.clearBranchingGeometry) window.clearBranchingGeometry();
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
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\col_b30_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\col_b30_iso.png"

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
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\col_b70_front.png"

    Eval-JS "if(window.setCameraProjection) window.setCameraProjection('ISO'); if(window.render) window.render();" | Out-Null
    Start-Sleep -Milliseconds 400
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\col_b70_iso.png"

    Write-Output "Column branching screenshots captured"
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
