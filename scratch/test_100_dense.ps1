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
    
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
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
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        window.computeDenseOrganicBranching = function(positions, B) {
            const out = new Float32Array(positions);
            if (B <= 0.001) return out;

            const bnds = window.getModelBounds ? window.getModelBounds() : null;
            const minX = bnds?.min?.x ?? -10.0;
            const maxX = bnds?.max?.x ?? 20.2;
            const minZ = bnds?.min?.z ?? -10.2;
            const maxZ = bnds?.max?.z ?? 0.5;
            const centerZ = (minZ + maxZ) / 2; // ~ -4.8

            const midCols = [];

            // ─── 1. GALLERY INTERIOR SPACE (X in [-4.0, 1.5]) ───
            if (B < 0.35) {
                // Low Branching (Stage 1): 1 central slender column
                midCols.push({
                    x: -1.5, z: centerZ, xMin: -4.0, xMax: 1.5,
                    ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                    floorMinY: 6.8, floorMaxY: 7.5, rShaft: 0.35, rCap: 0.80
                });
            } else if (B < 0.70) {
                // Medium Branching (Stage 2): 2 longitudinal columns along center line
                midCols.push(
                    {
                        x: -2.5, z: centerZ, xMin: -4.0, xMax: -1.3,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft: 0.35, rCap: 0.80
                    },
                    {
                        x: -0.5, z: centerZ, xMin: -1.3, xMax: 1.5,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft: 0.35, rCap: 0.80
                    }
                );
            } else {
                // High / 100% Branching (Stage 3):
                // 4 bays along X (-3.3, -2.1, -0.9, 0.3) with double rows across Z (front & rear),
                // forming an 8-column hypostyle colonnade richly filling the gallery!
                const zOffset = 1.1;
                const rShaft = 0.32;
                const rCap = 0.75;
                const xBays = [-3.3, -2.1, -0.9, 0.3];
                xBays.forEach((bx) => {
                    // Front column
                    midCols.push({
                        x: bx, z: centerZ + zOffset,
                        xMin: bx - 0.75, xMax: bx + 0.75,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                    });
                    // Rear column
                    midCols.push({
                        x: bx, z: centerZ - zOffset,
                        xMin: bx - 0.75, xMax: bx + 0.75,
                        ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                    });
                });
            }

            // ─── 2. TRANSITION & ATRIUM SPACE (X in [3.0, 11.5]) ───
            if (B < 0.35) {
                // Low Branching (Stage 1): 1 central slender column under dip
                midCols.push({
                    x: 6.0, z: centerZ, xMin: 3.5, xMax: 8.5,
                    ceilMinY: 6.5, ceilMaxY: 7.8, targetFloor: 3.8,
                    floorMinY: 3.5, floorMaxY: 4.5, rShaft: 0.35, rCap: 0.80
                });
            } else if (B < 0.70) {
                // Medium Branching (Stage 2): 2 columns (under ramp & under dip)
                midCols.push(
                    {
                        x: 5.0, z: centerZ, xMin: 3.8, xMax: 6.0,
                        ceilMinY: 7.5, ceilMaxY: 8.8, targetFloor: 4.8,
                        floorMinY: 4.5, floorMaxY: 5.5, rShaft: 0.35, rCap: 0.80
                    },
                    {
                        x: 7.0, z: centerZ, xMin: 6.0, xMax: 8.5,
                        ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.8,
                        floorMinY: 2.5, floorMaxY: 3.5, rShaft: 0.35, rCap: 0.80
                    }
                );
            } else {
                // High / 100% Branching (Stage 3):
                // Slender columns spanning across the transition ramp, under the chaise dip,
                // and rising through the grand atrium void!
                const rShaft = 0.32;
                const rCap = 0.75;
                midCols.push(
                    // 1. Transition slope column
                    {
                        x: 4.2, z: centerZ, xMin: 3.4, xMax: 4.9,
                        ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.5,
                        floorMinY: 5.2, floorMaxY: 6.0, rShaft, rCap
                    },
                    // 2. Chaise dip front column
                    {
                        x: 5.8, z: centerZ + 0.85, xMin: 5.0, xMax: 6.6,
                        ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 3.8,
                        floorMinY: 3.5, floorMaxY: 4.3, rShaft, rCap
                    },
                    // 3. Chaise dip rear column
                    {
                        x: 5.8, z: centerZ - 0.85, xMin: 5.0, xMax: 6.6,
                        ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 3.8,
                        floorMinY: 3.5, floorMaxY: 4.3, rShaft, rCap
                    },
                    // 4. Chaise base front column
                    {
                        x: 7.2, z: centerZ + 0.85, xMin: 6.5, xMax: 8.0,
                        ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.8,
                        floorMinY: 2.5, floorMaxY: 3.4, rShaft, rCap
                    },
                    // 5. Chaise base rear column
                    {
                        x: 7.2, z: centerZ - 0.85, xMin: 6.5, xMax: 8.0,
                        ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.8,
                        floorMinY: 2.5, floorMaxY: 3.4, rShaft, rCap
                    },
                    // 6. Atrium threshold column
                    {
                        x: 8.6, z: centerZ, xMin: 8.0, xMax: 9.6,
                        ceilMinY: 5.4, ceilMaxY: 6.5, targetFloor: 2.0,
                        floorMinY: 1.5, floorMaxY: 2.4, rShaft, rCap
                    }
                );
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

        window.renderRichTest = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.computeDenseOrganicBranching(basePos, B);
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
    Eval-JS "window.renderRichTest(1.0)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/dense_100_v2_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/dense_100_v2_iso.png"

    # Render at 50% (B = 0.5)
    Eval-JS "window.renderRichTest(0.5)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/dense_50_v2_front.png"

    Write-Output "Dense branching v2 rendered at 100% and 50%"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
