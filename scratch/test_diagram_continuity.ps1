$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9305
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
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Screenshot($filename) {
        $clip = @{
            format = "png"
            clip = @{ x = 0; y = 0; width = 1600; height = 1000; scale = 1 }
        }
        $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
        $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
        if ($screenshotData) {
            $bytes = [System.Convert]::FromBase64String($screenshotData)
            [System.IO.File]::WriteAllBytes($filename, $bytes)
            Write-Output "Screenshot saved to $filename"
        }
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 5

    # Switch to FRONT view and ITERATION mode, zero other sliders
    Eval-JS @"
    (() => {
        const btnFront = document.querySelector('button[data-proj=\"FRONT\"]');
        if (btnFront) btnFront.click();
        if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');
        ['slider-dna-b', 'slider-dna-w', 'slider-dna-m', 'slider-dna-v', 'slider-dna-g'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.value = 0; el.dispatchEvent(new Event('input', { bubbles: true })); }
        });
        if (window.render) window.render();
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    # Inject the new Continuity rule directly for rapid visual iteration
    Eval-JS @"
    (() => {
        window.customContinuityRule = function(positions, bounds, C, grammar) {
            const out = new Float32Array(positions);
            const minX = bounds.min[0], maxX = bounds.max[0], spanX = maxX - minX;
            const minY = bounds.min[1], maxY = bounds.max[1], spanY = maxY - minY;
            const minZ = bounds.min[2], maxZ = bounds.max[2], spanZ = maxZ - minZ;
            const centerX = (minX + maxX) * 0.5;
            const centerY = (minY + maxY) * 0.5;
            const centerZ = (minZ + maxZ) * 0.5;

            function smoothstep(min, max, val) {
                let t = Math.max(0, Math.min(1, (val - min) / (max - min)));
                return t * t * (3 - 2 * t);
            }

            // Stage 1 (Low C, 0–30%): Elements are separate parallel plates with open gaps at both ends
            const lowFactor = C <= 0.30 ? (1.0 - (C / 0.30)) : 0.0;
            // Stage 2 (Med C, 30–70%): Right side connects, left side remains open (U-profile)
            const medFactor = (C > 0.15 && C <= 0.70) ? smoothstep(0.15, 0.50, C) : (C > 0.70 ? 1.0 : 0.0);
            // Stage 3 (High C, 70–100%): Left cantilever arms ALSO extend and connect into rounded U-bridge!
            const highFactor = C <= 0.40 ? 0.0 : smoothstep(0.40, 0.85, C);

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];
                let uX = Math.min(1, Math.max(0, (x - minX) / spanX));
                let uZ = Math.min(1, Math.max(0, (z - minZ) / spanZ));

                let dX = 0, dY = 0, dZ = 0;

                // ─── 1. LOW CONTINUITY: SEPARATE ELEMENTS ACROSS X, Y, Z ─────────────
                if (lowFactor > 0.001) {
                    // Right side vertical connection opens up into a horizontal gap
                    if (x > 14.0) {
                        let wRight = smoothstep(14.0, 19.0, x);
                        let midRightY = 10.0;
                        let gapY = Math.sign(y - midRightY) * Math.pow(Math.abs(y - midRightY) / 10.0, 0.5) * 3.5;
                        dY += gapY * wRight * lowFactor;
                        // Retract slightly from outer edge to show break
                        dX -= 1.8 * wRight * lowFactor;
                    }
                    // Left cantilever arms separate vertically
                    if (x < -2.0) {
                        let wLeft = smoothstep(-2.0, -8.0, x);
                        let armMidY = 8.2;
                        dY += Math.sign(y - armMidY) * 1.5 * wLeft * lowFactor;
                        dX += 1.2 * wLeft * lowFactor; // pull inward
                    }
                    // Transverse Z gaps (front/back edges separate)
                    let wZ = Math.sin(uZ * Math.PI);
                    dZ += Math.sign(z - centerZ) * 1.2 * (1.0 - wZ) * lowFactor;
                }

                // ─── 2. HIGH CONTINUITY: LEFT CANTILEVER ARMS EXTEND & CONNECT ────────
                // Left cantilever arms (uX < 0.25, x < -2.5) extend outward (-X) and fuse at Y = 8.2
                if (highFactor > 0.001) {
                    let wArm = smoothstep(0.24, 0.0, uX);
                    if (wArm > 0.001) {
                        let armMidY = 8.2;
                        let distY = (y - armMidY) / 2.8;
                        let clampedDist = Math.max(-1.0, Math.min(1.0, distY));
                        let capCurve = 1.0 - clampedDist * clampedDist;

                        // Vertically pull upper and lower arm surfaces to MEET at 8.2
                        let bridgeY = -(y - armMidY) * 1.0 * wArm * highFactor;
                        // Horizontally extend outward to the left to form the smooth rounded U-cap
                        let extendX = -capCurve * 4.5 * wArm * highFactor;

                        dX += extendX;
                        dY += bridgeY;
                    }
                }

                // ─── 3. HIGH CONTINUITY: TRANSVERSE Z CLOSURE (ALL AXIAL PLANES) ──────
                if (highFactor > 0.001) {
                    // Front and back edges extend towards centerZ to form continuous wrapping shell
                    let zEdge = Math.pow(Math.abs((z - centerZ) / (spanZ * 0.5)), 2);
                    dZ -= (z - centerZ) * 0.22 * zEdge * highFactor;
                    // Camber continuity across top and bottom plates
                    dY += Math.sign(y - centerY) * 0.6 * Math.sin(Math.PI * uX) * Math.sin(Math.PI * uZ) * highFactor;
                }

                out[i] += dX;
                out[i+1] += dY;
                out[i+2] += dZ;
            }
            return out;
        };

        // Hook into renderIterationGeometry
        const originalRender = window.renderIterationGeometry;
        window.renderIterationGeometry = function(dna, mode, typoKey) {
            const meshes = window.originalMeshes || [];
            if (!meshes.length) return;
            const bounds = window.getModelBounds ? window.getModelBounds() : null;
            if (!bounds) return;

            const C = dna[0];
            const defPos0 = window.customContinuityRule(meshes[0].originalPositions, bounds, C, {});
            const posAttr0 = meshes[0].geometry.attributes.position;
            posAttr0.copyArray(defPos0);
            posAttr0.needsUpdate = true;
            meshes[0].geometry.computeVertexNormals();

            if (meshes[1]) {
                const defPos1 = window.customContinuityRule(meshes[1].originalPositions, bounds, C, {});
                const posAttr1 = meshes[1].geometry.attributes.position;
                posAttr1.copyArray(defPos1);
                posAttr1.needsUpdate = true;
                meshes[1].geometry.computeVertexNormals();
            }

            if (window.render) window.render();
        };
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    function Snap-C($val, $prefix) {
        Eval-JS @"
        (() => {
            const s = document.getElementById('slider-dna-c');
            s.value = $val;
            s.dispatchEvent(new Event('input', { bubbles: true }));
        })()
"@ | Out-Null
        Start-Sleep -Milliseconds 600

        # Front
        Eval-JS "const b = document.querySelector('button[data-proj=\"FRONT\"]'); if(b) b.click(); if(window.render) window.render();" | Out-Null
        Start-Sleep -Milliseconds 400
        Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\${prefix}_front.png"

        # ISO
        Eval-JS "const b = document.querySelector('button[data-proj=\"ISO\"]'); if(b) b.click(); if(window.render) window.render();" | Out-Null
        Start-Sleep -Milliseconds 400
        Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\${prefix}_iso.png"
    }

    Snap-C 15 "diag_c15"
    Snap-C 50 "diag_c50"
    Snap-C 85 "diag_c85"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
