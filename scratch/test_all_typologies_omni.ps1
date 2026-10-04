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
                window.threeControls.target.set(4, 6, -5);
            }
            window.threeControls.update();
            if (window.renderThree) window.renderThree();
        };

        window.getFullCols = function(B, centerZ) {
            const midCols = [];
            const rShaft = 0.35;
            const rCap = 0.85;

            if (B < 0.35) {
                // Low Branching (Stage 1): 1 central column in gallery + 1 in dip
                midCols.push(
                    {
                        x: -1.5, z: centerZ, xMin: -4.0, xMax: 1.5,
                        ceilMinY: 9.6, ceilMaxY: 10.8, floorY: 7.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                    },
                    {
                        x: 6.0, z: centerZ, xMin: 3.5, xMax: 8.5,
                        ceilMinY: 6.5, ceilMaxY: 7.8, floorY: 4.0,
                        floorMinY: 3.6, floorMaxY: 4.4, rShaft, rCap
                    }
                );
            } else if (B < 0.65) {
                // Medium Branching (Stage 2): 3 in gallery + 3 in transition/dip
                const xGal = [-2.8, -1.2, 0.4];
                xGal.forEach(bx => {
                    midCols.push({
                        x: bx, z: centerZ, xMin: bx - 0.7, xMax: bx + 0.7,
                        ceilMinY: 9.6, ceilMaxY: 10.8, floorY: 7.2,
                        floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                    });
                });
                midCols.push(
                    {
                        x: 3.8, z: centerZ, xMin: 2.8, xMax: 4.8,
                        ceilMinY: 8.4, ceilMaxY: 9.4, floorY: 5.8,
                        floorMinY: 5.4, floorMaxY: 6.2, rShaft, rCap
                    },
                    {
                        x: 5.6, z: centerZ, xMin: 4.8, xMax: 6.6,
                        ceilMinY: 6.8, ceilMaxY: 7.8, floorY: 4.4,
                        floorMinY: 3.9, floorMaxY: 4.8, rShaft, rCap
                    },
                    {
                        x: 7.2, z: centerZ, xMin: 6.6, xMax: 8.0,
                        ceilMinY: 6.0, ceilMaxY: 7.2, floorY: 3.1,
                        floorMinY: 2.8, floorMaxY: 3.5, rShaft, rCap
                    }
                );
            } else {
                // High / 100% Branching (Stage 3 & 4):
                // Populating throughout the ENTIRE space across all 3 spatial zones!
                
                // 1. Cantilever Gallery: 5 bays along X, paired front/rear across Z (10 columns)
                const zGal = 1.15;
                const xGalBays = [-3.6, -2.4, -1.2, 0.0, 1.2];
                xGalBays.forEach(bx => {
                    midCols.push(
                        {
                            x: bx, z: centerZ + zGal, xMin: bx - 0.65, xMax: bx + 0.65,
                            ceilMinY: 9.6, ceilMaxY: 10.8, floorY: 7.2,
                            floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                        },
                        {
                            x: bx, z: centerZ - zGal, xMin: bx - 0.65, xMax: bx + 0.65,
                            ceilMinY: 9.6, ceilMaxY: 10.8, floorY: 7.2,
                            floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                        }
                    );
                });

                // 2. Transition Throat & Chaise Dip: 4 bays along X, paired front/rear (8 columns)
                const zTrans = 0.95;
                const transSteps = [
                    { x: 2.6, ceilMinY: 9.0, ceilMaxY: 9.8, floorY: 6.6, floorMinY: 6.2, floorMaxY: 7.0 },
                    { x: 4.0, ceilMinY: 8.4, ceilMaxY: 9.4, floorY: 5.8, floorMinY: 5.4, floorMaxY: 6.2 },
                    { x: 5.5, ceilMinY: 6.8, ceilMaxY: 7.8, floorY: 4.4, floorMinY: 3.9, floorMaxY: 4.8 },
                    { x: 7.0, ceilMinY: 6.0, ceilMaxY: 7.2, floorY: 3.1, floorMinY: 2.8, floorMaxY: 3.5 }
                ];
                transSteps.forEach(step => {
                    midCols.push(
                        {
                            x: step.x, z: centerZ + zTrans, xMin: step.x - 0.65, xMax: step.x + 0.65,
                            ceilMinY: step.ceilMinY, ceilMaxY: step.ceilMaxY, floorY: step.floorY,
                            floorMinY: step.floorMinY, floorMaxY: step.floorMaxY, rShaft, rCap
                        },
                        {
                            x: step.x, z: centerZ - zTrans, xMin: step.x - 0.65, xMax: step.x + 0.65,
                            ceilMinY: step.ceilMinY, ceilMaxY: step.ceilMaxY, floorY: step.floorY,
                            floorMinY: step.floorMinY, floorMaxY: step.floorMaxY, rShaft, rCap
                        }
                    );
                });

                // 3. Grand Atrium & Vertical Void: 5 bays along X, paired front/rear (10 columns)
                const zAtr = 0.90;
                const atrSteps = [
                    { x: 8.6, ceilMinY: 5.4, ceilMaxY: 6.4, floorY: 2.1, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 10.0, ceilMinY: 5.5, ceilMaxY: 6.8, floorY: 2.1, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 11.4, ceilMinY: 6.4, ceilMaxY: 7.8, floorY: 2.1, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 12.8, ceilMinY: 7.6, ceilMaxY: 9.2, floorY: 2.1, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 14.2, ceilMinY: 11.0, ceilMaxY: 13.0, floorY: 2.1, floorMinY: 1.8, floorMaxY: 2.5 }
                ];
                atrSteps.forEach(step => {
                    midCols.push(
                        {
                            x: step.x, z: centerZ + zAtr, xMin: step.x - 0.70, xMax: step.x + 0.70,
                            ceilMinY: step.ceilMinY, ceilMaxY: step.ceilMaxY, floorY: step.floorY,
                            floorMinY: step.floorMinY, floorMaxY: step.floorMaxY, rShaft: 0.38, rCap: 0.95
                        },
                        {
                            x: step.x, z: centerZ - zAtr, xMin: step.x - 0.70, xMax: step.x + 0.70,
                            ceilMinY: step.ceilMinY, ceilMaxY: step.ceilMaxY, floorY: step.floorY,
                            floorMinY: step.floorMinY, floorMaxY: step.floorMaxY, rShaft: 0.38, rCap: 0.95
                        }
                    );
                });
            }
            return midCols;
        };

        window.testApplyB = function(positions, B) {
            const out = new Float32Array(positions);
            if (B <= 0.001) return out;

            const bnds = window.getModelBounds ? window.getModelBounds() : null;
            const minZ = bnds?.min?.z ?? -10.2;
            const maxZ = bnds?.max?.z ?? 0.5;
            const centerZ = (minZ + maxZ) / 2; // ~ -4.8

            const midCols = window.getFullCols(B, centerZ);
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

                        // Ceiling downward branch extending to meet the floor
                        if (y >= col.ceilMinY && y <= col.ceilMaxY) {
                            let drop = y - (col.floorY - 0.15);
                            let dY = -reach * drop * w;
                            out[i+1] += dY;
                        }
                        // Floor plate upward organic base flaring
                        else if (y >= col.floorMinY && y <= col.floorMaxY) {
                            let dY = reach * 0.22 * w;
                            out[i+1] += dY;
                        }
                    }
                }
            }
            return out;
        };

        window.renderBranchTest = function(B) {
            const mesh = window.originalMeshes[0];
            const basePos = mesh.originalPositions;
            const deformed = window.testApplyB(basePos, B);
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
    Eval-JS "window.renderBranchTest(1.0)"
    Eval-JS "window.setView('FRONT')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/all_space_100_front.png"

    Eval-JS "window.setView('ISO')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/all_space_100_iso.png"

    Eval-JS "window.setView('PERSP')"
    Start-Sleep -Milliseconds 500
    Save-Screenshot "scratch/all_space_100_persp.png"

    Write-Output "Rendered all space 100% branching"

} finally {
    if ($ws -and $ws.State -eq 'Open') { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct).Wait() }
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
