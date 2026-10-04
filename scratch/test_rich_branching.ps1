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

        // Fully rich branching filling both spaces progressively from 0 to 100%
        window.computeDenseOrganicBranching = function(positions, B) {
            const out = new Float32Array(positions);
            if (B <= 0.001) return out;

            const bnds = window.getModelBounds ? window.getModelBounds() : null;
            const minX = bnds?.min?.x ?? -10.0;
            const maxX = bnds?.max?.x ?? 20.2;
            const minZ = bnds?.min?.z ?? -10.2;
            const maxZ = bnds?.max?.z ?? 0.5;
            const spanX = maxX - minX;
            const spanZ = maxZ - minZ;
            const centerZ = (minZ + maxZ) / 2; // ~ -4.8

            const midCols = [];

            // ─── 1. GALLERY INTERIOR SPACE (X in [-4.0, 1.8]) ───
            if (B < 0.35) {
                // Low Branching (Stage 1): 1 central slender column
                midCols.push({
                    x: -1.5, z: centerZ, xMin: -4.0, xMax: 1.5,
                    ceilMinY: 9.0, ceilMaxY: 11.5, targetFloor: 6.2,
                    floorMinY: 5.5, floorMaxY: 7.6, rShaft: 0.30, rCap: 0.68
                });
            } else if (B < 0.65) {
                // Medium Branching (Stage 2): 2 columns along center line
                midCols.push(
                    {
                        x: -2.4, z: centerZ, xMin: -4.0, xMax: -1.4,
                        ceilMinY: 9.0, ceilMaxY: 11.5, targetFloor: 6.2,
                        floorMinY: 5.5, floorMaxY: 7.6, rShaft: 0.30, rCap: 0.68
                    },
                    {
                        x: -0.6, z: centerZ, xMin: -1.4, xMax: 1.5,
                        ceilMinY: 9.0, ceilMaxY: 11.5, targetFloor: 6.2,
                        floorMinY: 5.5, floorMaxY: 7.6, rShaft: 0.30, rCap: 0.68
                    }
                );
            } else {
                // High / Maximum Branching (Stage 3 & 4, B >= 0.65 -> 100%):
                // 3 bays along X (-2.7, -1.4, 0.0) with front and rear columns across Z depth,
                // completely populating the gallery space with a slender colonnade!
                const zOffset = 1.05;
                const rShaft = 0.26;
                const rCap = 0.62;

                const xBays = [-2.7, -1.4, 0.0];
                xBays.forEach((bx, idx) => {
                    // Front column
                    midCols.push({
                        x: bx, z: centerZ + zOffset,
                        xMin: bx - 0.7, xMax: bx + 0.7,
                        ceilMinY: 9.0, ceilMaxY: 11.5, targetFloor: 6.2,
                        floorMinY: 5.5, floorMaxY: 7.6, rShaft, rCap
                    });
                    // Rear column
                    midCols.push({
                        x: bx, z: centerZ - zOffset,
                        xMin: bx - 0.7, xMax: bx + 0.7,
                        ceilMinY: 9.0, ceilMaxY: 11.5, targetFloor: 6.2,
                        floorMinY: 5.5, floorMaxY: 7.6, rShaft, rCap
                    });
                });
            }

            // ─── 2. ATRIUM INTERIOR SPACE (X in [3.5, 11.5]) ───
            if (B < 0.35) {
                // Low Branching (Stage 1): 1 central slender column under the dip
                midCols.push({
                    x: 6.0, z: centerZ, xMin: 3.5, xMax: 8.5,
                    ceilMinY: 4.8, ceilMaxY: 8.5, targetFloor: 1.6,
                    floorMinY: 0.5, floorMaxY: 2.2, rShaft: 0.30, rCap: 0.72
                });
            } else if (B < 0.65) {
                // Medium Branching (Stage 2): 2 columns (under dip and under rising canopy)
                midCols.push(
                    {
                        x: 5.5, z: centerZ, xMin: 3.5, xMax: 6.8,
                        ceilMinY: 4.8, ceilMaxY: 8.5, targetFloor: 1.85, // matches ramp height
                        floorMinY: 0.5, floorMaxY: 2.5, rShaft: 0.28, rCap: 0.68
                    },
                    {
                        x: 7.8, z: centerZ, xMin: 6.8, xMax: 10.0,
                        ceilMinY: 4.8, ceilMaxY: 11.0, targetFloor: 1.15,
                        floorMinY: 0.5, floorMaxY: 2.2, rShaft: 0.28, rCap: 0.70
                    }
                );
            } else {
                // High / Maximum Branching (Stage 3 & 4, B >= 0.65 -> 100%):
                // 3 slender columns spanning the grand atrium void from ramp to crown!
                midCols.push(
                    {
                        x: 5.4, z: centerZ, xMin: 3.5, xMax: 6.4,
                        ceilMinY: 4.8, ceilMaxY: 8.5, targetFloor: 1.85, // matches rising ramp
                        floorMinY: 0.5, floorMaxY: 2.6, rShaft: 0.27, rCap: 0.65
                    },
                    {
                        x: 7.4, z: centerZ - 0.75, xMin: 6.4, xMax: 8.4,
                        ceilMinY: 4.8, ceilMaxY: 10.5, targetFloor: 1.15,
                        floorMinY: 0.5, floorMaxY: 2.2, rShaft: 0.27, rCap: 0.65
                    },
                    {
                        x: 9.0, z: centerZ + 0.75, xMin: 8.2, xMax: 11.5,
                        ceilMinY: 5.5, ceilMaxY: 14.5, targetFloor: 1.10,
                        floorMinY: 0.5, floorMaxY: 2.2, rShaft: 0.28, rCap: 0.68
                    }
                );
            }

            const reach = Math.min(1.0, B * 1.45);

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
                        // Floor plate upward flaring to form organic column base
                        else if (y >= col.floorMinY && y <= col.floorMaxY) {
                            let baseLift = reach * 0.28 * w;
                            out[i+1] += baseLift;
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
    Save-Screenshot "scratch/dense_100_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/dense_100_iso.png"

    # Render at 50% (B = 0.5)
    Eval-JS "window.renderRichTest(0.5)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/dense_50_front.png"

    Write-Output "Dense branching rendered at 100% and 50%"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
