$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
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
    
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 500
        $check = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0].originalPositions)"
        if ($check -eq $true) { break }
    }

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
            } else if (type === 'PERSP') {
                window.threeCamera.position.set(22, 14, 28);
                window.threeControls.target.set(3, 6, -5);
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        window.computeOmnipresentBranching = function(positions, B) {
            const out = new Float32Array(positions);
            if (B <= 0.001) return out;

            const bnds = window.getModelBounds ? window.getModelBounds() : null;
            const minX = bnds?.min?.x ?? -10.0;
            const maxX = bnds?.max?.x ?? 20.2;
            const minZ = bnds?.min?.z ?? -10.2;
            const maxZ = bnds?.max?.z ?? 0.5;
            const centerZ = (minZ + maxZ) / 2; // ~ -4.8

            const midCols = [];

            // ─── 1. GALLERY INTERIOR SPACE (X in [-4.0, 1.8]) ───
            if (B < 0.35) {
                // Low Branching (Stage 1): 1 central slender column
                midCols.push({
                    x: -1.5, z: centerZ, xMin: -4.0, xMax: 1.5,
                    ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                    floorMinY: 6.8, floorMaxY: 7.5, rShaft: 0.35, rCap: 0.80
                });
            } else if (B < 0.65) {
                // Medium Branching (Stage 2): 3 columns along center line
                const xBays = [-2.8, -1.2, 0.4];
                xBays.forEach(bx => {
                    midCols.push({
                        x: bx, z: centerZ, xMin: bx - 0.7, xMax: bx + 0.7,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft: 0.32, rCap: 0.75
                    });
                });
            } else {
                // High / 100% Branching (Stage 3 & 4):
                // 6 longitudinal bays along X with double rows across Z (front & rear)
                // forming a 12-column hypostyle colonnade filling the entire gallery!
                const zOffset = 1.15;
                const rShaft = 0.30;
                const rCap = 0.72;
                const xBays = [-3.7, -2.7, -1.7, -0.7, 0.3, 1.3];
                xBays.forEach((bx) => {
                    // Front column
                    midCols.push({
                        x: bx, z: centerZ + zOffset,
                        xMin: bx - 0.6, xMax: bx + 0.6,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                    });
                    // Rear column
                    midCols.push({
                        x: bx, z: centerZ - zOffset,
                        xMin: bx - 0.6, xMax: bx + 0.6,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                    });
                });
            }

            // ─── 2. TRANSITION RAMP & CHAISE DIP (X in [2.0, 8.0]) ───
            if (B < 0.35) {
                // Low Branching: 1 column under dip
                midCols.push({
                    x: 6.0, z: centerZ, xMin: 3.5, xMax: 8.5,
                    ceilMinY: 6.5, ceilMaxY: 7.8, targetFloor: 3.8,
                    floorMinY: 3.5, floorMaxY: 4.5, rShaft: 0.35, rCap: 0.80
                });
            } else if (B < 0.65) {
                // Medium Branching: 3 columns along ramp and under dip
                midCols.push(
                    {
                        x: 3.8, z: centerZ, xMin: 2.8, xMax: 4.8,
                        ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.6,
                        floorMinY: 5.2, floorMaxY: 6.2, rShaft: 0.32, rCap: 0.75
                    },
                    {
                        x: 5.6, z: centerZ, xMin: 4.8, xMax: 6.6,
                        ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 3.9,
                        floorMinY: 3.5, floorMaxY: 4.4, rShaft: 0.32, rCap: 0.75
                    },
                    {
                        x: 7.2, z: centerZ, xMin: 6.6, xMax: 8.0,
                        ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.8,
                        floorMinY: 2.5, floorMaxY: 3.4, rShaft: 0.32, rCap: 0.75
                    }
                );
            } else {
                // High / 100% Branching:
                // Double-row colonnade along the transition slope and under the chaise curve!
                const rShaft = 0.30;
                const rCap = 0.72;
                const zOffset = 0.95;
                const xSteps = [
                    { x: 2.8, ceilMinY: 9.0, ceilMaxY: 9.8, targetFloor: 6.2, floorMinY: 5.8, floorMaxY: 6.6 },
                    { x: 4.2, ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.4, floorMinY: 5.0, floorMaxY: 5.9 },
                    { x: 5.6, ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 3.9, floorMinY: 3.5, floorMaxY: 4.4 },
                    { x: 7.0, ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.8, floorMinY: 2.5, floorMaxY: 3.4 }
                ];
                xSteps.forEach(step => {
                    midCols.push({
                        x: step.x, z: centerZ + zOffset, xMin: step.x - 0.65, xMax: step.x + 0.65,
                        ceilMinY: step.ceilMinY, ceilMaxY: step.ceilMaxY, targetFloor: step.targetFloor,
                        floorMinY: step.floorMinY, floorMaxY: step.floorMaxY, rShaft, rCap
                    });
                    midCols.push({
                        x: step.x, z: centerZ - zOffset, xMin: step.x - 0.65, xMax: step.x + 0.65,
                        ceilMinY: step.ceilMinY, ceilMaxY: step.ceilMaxY, targetFloor: step.targetFloor,
                        floorMinY: step.floorMinY, floorMaxY: step.floorMaxY, rShaft, rCap
                    });
                });
            }

            // ─── 3. GRAND ATRIUM & VERTICAL VOID (X in [8.0, 15.0]) ───
            // When B >= 0.5, branching expands into the grand vertical void throughout the entire space!
            if (B >= 0.50) {
                const rShaft = 0.32;
                const rCap = 0.78;
                const zOffset = 0.90;

                // Threshold colonnade
                midCols.push(
                    {
                        x: 8.6, z: centerZ + zOffset, xMin: 8.0, xMax: 9.4,
                        ceilMinY: 5.4, ceilMaxY: 6.4, targetFloor: 2.0,
                        floorMinY: 1.6, floorMaxY: 2.4, rShaft, rCap
                    },
                    {
                        x: 8.6, z: centerZ - zOffset, xMin: 8.0, xMax: 9.4,
                        ceilMinY: 5.4, ceilMaxY: 6.4, targetFloor: 2.0,
                        floorMinY: 1.6, floorMaxY: 2.4, rShaft, rCap
                    }
                );

                // Deep atrium columns (at B >= 0.70 / 100%)
                if (B >= 0.70) {
                    midCols.push(
                        {
                            x: 10.2, z: centerZ + zOffset, xMin: 9.6, xMax: 11.0,
                            ceilMinY: 5.4, ceilMaxY: 6.8, targetFloor: 2.0,
                            floorMinY: 1.6, floorMaxY: 2.4, rShaft, rCap
                        },
                        {
                            x: 10.2, z: centerZ - zOffset, xMin: 9.6, xMax: 11.0,
                            ceilMinY: 5.4, ceilMaxY: 6.8, targetFloor: 2.0,
                            floorMinY: 1.6, floorMaxY: 2.4, rShaft, rCap
                        },
                        {
                            x: 11.8, z: centerZ + zOffset, xMin: 11.2, xMax: 12.6,
                            ceilMinY: 6.8, ceilMaxY: 8.2, targetFloor: 2.0,
                            floorMinY: 1.6, floorMaxY: 2.4, rShaft, rCap
                        },
                        {
                            x: 11.8, z: centerZ - zOffset, xMin: 11.2, xMax: 12.6,
                            ceilMinY: 6.8, ceilMaxY: 8.2, targetFloor: 2.0,
                            floorMinY: 1.6, floorMaxY: 2.4, rShaft, rCap
                        },
                        {
                            x: 13.2, z: centerZ, xMin: 12.6, xMax: 14.0,
                            ceilMinY: 9.2, ceilMaxY: 10.6, targetFloor: 2.0,
                            floorMinY: 1.6, floorMaxY: 2.4, rShaft: 0.34, rCap: 0.85
                        }
                    );
                }
            }

            const reach = Math.min(1.0, B * 1.35);

            for (let i = 0; i < out.length; i += 3) {
                let x = out[i], y = out[i+1], z = out[i+2];

                for (let c = 0; c < midCols.length; c++) {
                    let col = midCols[c];
                    if (x < col.xMin || x > col.xMax) continue;

                    let dx = x - col.x;
                    let dz = z - col.z;
                    let dist = Math.sqrt(dx * dx + dz * dz);

                    if (dist < col.rCap) {
                        let w;
                        if (dist <= col.rShaft) {
                            w = 1.0;
                        } else {
                            let t = (dist - col.rShaft) / (col.rCap - col.rShaft);
                            w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                        }

                        // Ceiling downward branch extending across the space to the floor
                        if (y >= col.ceilMinY && y <= col.ceilMaxY) {
                            let drop = y - col.targetFloor;
                            let dY = -reach * drop * w;
                            out[i+1] += dY;
                        }
                        // Floor plate upward pedestal flaring to meet the descending column
                        else if (y >= col.floorMinY && y <= col.floorMaxY) {
                            let pedestalHeight = Math.min(0.35, (col.ceilMinY - col.targetFloor) * 0.08);
                            let targetPedestal = col.targetFloor + pedestalHeight;
                            let rise = Math.max(0, targetPedestal - y);
                            let dY = reach * rise * w;
                            out[i+1] += dY;
                        }
                    }
                }
            }

            return out;
        };

        window.renderOmniTest = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.computeOmnipresentBranching(basePos, B);
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

    # Render at 100% (B = 1.0)
    Eval-JS "window.renderOmniTest(1.0)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/omni_100_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/omni_100_iso.png"

    Eval-JS "window.setView('PERSP')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/omni_100_persp.png"

    Write-Output "Omnipresent branching rendered at 100%"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
