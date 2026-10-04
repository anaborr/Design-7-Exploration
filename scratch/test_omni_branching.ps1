$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
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

    function Capture-Screen($filename) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
        $j = $r | ConvertFrom-Json
        [System.IO.File]::WriteAllBytes($filename, [Convert]::FromBase64String($j.result.data))
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Inject our new omni-directional branching logic temporarily into window.applyRule
    $injectJS = @"
    (() => {
        const oldApplyRule = window.applyRule;
        window.testOmniBranching = function(mesh, strength, orientationFilter = 'ALL') {
            const B = Math.max(0, Math.min(1.0, strength));
            if (B < 0.001) return mesh;

            const out = new Float32Array(mesh);
            const reach = Math.min(1.0, B * 1.35);
            const centerZ = -4.8;
            const zFront = centerZ + 1.15;
            const zRear = centerZ - 1.15;

            // Define structural members:
            // type: 'VERTICAL', 'HORIZONTAL', 'DIAGONAL'
            const members = [];

            // ─── 1. GALLERY INTERIOR (X in [-4.0, 1.8]) ───
            // Vertical Columns
            const gCols = [-3.6, -2.4, -1.2, 0.0, 1.2];
            gCols.forEach(bx => {
                members.push({
                    type: 'VERTICAL',
                    p1: [bx, 10.4, zFront], p2: [bx, 7.05, zFront],
                    rShaft: 0.32, rCap: 0.80,
                    xMin: bx - 0.7, xMax: bx + 0.7, yMin: 9.2, yMax: 10.8,
                    targetY: 7.05, isFloor: false
                });
                members.push({
                    type: 'VERTICAL',
                    p1: [bx, 10.4, zRear], p2: [bx, 7.05, zRear],
                    rShaft: 0.32, rCap: 0.80,
                    xMin: bx - 0.7, xMax: bx + 0.7, yMin: 9.2, yMax: 10.8,
                    targetY: 7.05, isFloor: false
                });
            });

            // Horizontal Members in Gallery:
            // A. Longitudinal arched lintels bridging between adjacent columns along X at ceiling level
            for (let i = 0; i < gCols.length - 1; i++) {
                const xA = gCols[i], xB = gCols[i+1];
                [zFront, zRear].forEach(zPos => {
                    members.push({
                        type: 'HORIZONTAL',
                        p1: [xA, 9.2, zPos], p2: [xB, 9.2, zPos],
                        rShaft: 0.28, rCap: 0.75,
                        xMin: xA - 0.2, xMax: xB + 0.2, yMin: 9.4, yMax: 10.8,
                        targetY: 9.1
                    });
                });
            }

            // B. Transverse horizontal cross-ties bridging between front and rear columns across Z
            gCols.forEach(bx => {
                members.push({
                    type: 'HORIZONTAL',
                    p1: [bx, 8.8, zRear], p2: [bx, 8.8, zFront],
                    rShaft: 0.28, rCap: 0.75,
                    xMin: bx - 0.65, xMax: bx + 0.65, yMin: 9.3, yMax: 10.8,
                    targetY: 8.7
                });
            });

            // Diagonal Members in Gallery:
            // Diagonal knee braces springing at 45° from column shafts toward ceiling
            gCols.forEach(bx => {
                [zFront, zRear].forEach(zPos => {
                    // Rightward diagonal branch
                    members.push({
                        type: 'DIAGONAL',
                        p1: [bx, 8.3, zPos], p2: [bx + 0.75, 10.2, zPos],
                        rShaft: 0.26, rCap: 0.70,
                        xMin: bx, xMax: bx + 0.85, yMin: 9.4, yMax: 10.6
                    });
                    // Leftward diagonal branch
                    members.push({
                        type: 'DIAGONAL',
                        p1: [bx, 8.3, zPos], p2: [bx - 0.75, 10.2, zPos],
                        rShaft: 0.26, rCap: 0.70,
                        xMin: bx - 0.85, xMax: bx, yMin: 9.4, yMax: 10.6
                    });
                });
            });

            // ─── 2. TRANSITION RAMP & CHAISE DIP (X in [2.0, 8.0]) ───
            // Diagonal Raking Struts along slope (pitching from upper gallery down to dip)
            const rSteps = [
                { x1: 2.6, y1: 9.5, x2: 4.2, y2: 6.0, targetFloor: 5.7 },
                { x1: 4.0, y1: 8.8, x2: 5.8, y2: 4.5, targetFloor: 4.3 },
                { x1: 5.5, y1: 7.2, x2: 7.2, y2: 3.5, targetFloor: 3.0 }
            ];

            rSteps.forEach(rs => {
                [zFront, zRear].forEach(zPos => {
                    // Diagonal raking strut following ramp incline
                    members.push({
                        type: 'DIAGONAL',
                        p1: [rs.x1, rs.y1, zPos], p2: [rs.x2, rs.y2, zPos],
                        rShaft: 0.30, rCap: 0.80,
                        xMin: rs.x1 - 0.3, xMax: rs.x2 + 0.3, yMin: 6.5, yMax: 10.0
                    });
                    // Counter diagonal forming A-frame
                    members.push({
                        type: 'DIAGONAL',
                        p1: [rs.x2, rs.y1, zPos], p2: [rs.x1, rs.y2, zPos],
                        rShaft: 0.26, rCap: 0.75,
                        xMin: rs.x1 - 0.3, xMax: rs.x2 + 0.3, yMin: 6.5, yMax: 10.0
                    });
                });
            });

            // Vertical columns along ramp
            const rampCols = [
                { x: 2.6, ceilMinY: 9.0, ceilMaxY: 9.8, targetFloor: 6.5 },
                { x: 4.0, ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.7 },
                { x: 5.5, ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 4.3 },
                { x: 7.0, ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 3.0 }
            ];
            rampCols.forEach(rc => {
                [zFront, zRear].forEach(zPos => {
                    members.push({
                        type: 'VERTICAL',
                        p1: [rc.x, rc.ceilMaxY, zPos], p2: [rc.x, rc.targetFloor, zPos],
                        rShaft: 0.32, rCap: 0.80,
                        xMin: rc.x - 0.65, xMax: rc.x + 0.65, yMin: rc.ceilMinY, yMax: rc.ceilMaxY,
                        targetY: rc.targetFloor, isFloor: false
                    });
                });
            });

            // Horizontal threshold ties across ramp
            [3.3, 5.5, 7.0].forEach(hx => {
                members.push({
                    type: 'HORIZONTAL',
                    p1: [hx, 5.5, zRear], p2: [hx, 5.5, zFront],
                    rShaft: 0.28, rCap: 0.75,
                    xMin: hx - 0.6, xMax: hx + 0.6, yMin: 6.2, yMax: 8.5,
                    targetY: 5.5
                });
            });

            // ─── 3. GRAND ATRIUM & VERTICAL VOID (X in [8.0, 15.0]) ───
            // Monumental vertical columns flanking atrium
            const atriumCols = [
                { x: 8.6, ceilMinY: 5.4, ceilMaxY: 6.4, targetFloor: 2.05 },
                { x: 10.5, ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.05 },
                { x: 12.8, ceilMinY: 7.6, ceilMaxY: 9.2, targetFloor: 2.05 },
                { x: 14.2, ceilMinY: 11.0, ceilMaxY: 13.0, targetFloor: 2.05 }
            ];
            atriumCols.forEach(ac => {
                [zFront, zRear].forEach(zPos => {
                    members.push({
                        type: 'VERTICAL',
                        p1: [ac.x, ac.ceilMaxY, zPos], p2: [ac.x, ac.targetFloor, zPos],
                        rShaft: 0.36, rCap: 0.88,
                        xMin: ac.x - 0.70, xMax: ac.x + 0.70, yMin: ac.ceilMinY, yMax: ac.ceilMaxY,
                        targetY: ac.targetFloor, isFloor: false
                    });
                });
            });

            // Diagonal Soaring Tree Buttresses in Atrium
            [zFront, zRear].forEach(zPos => {
                // Diagonal soaring buttress reaching into high canopy
                members.push({
                    type: 'DIAGONAL',
                    p1: [8.6, 2.5, zPos], p2: [12.5, 8.5, zPos],
                    rShaft: 0.32, rCap: 0.85,
                    xMin: 8.0, xMax: 13.5, yMin: 6.5, yMax: 9.5
                });
                members.push({
                    type: 'DIAGONAL',
                    p1: [10.5, 2.5, zPos], p2: [14.2, 12.5, zPos],
                    rShaft: 0.32, rCap: 0.85,
                    xMin: 9.8, xMax: 15.0, yMin: 8.0, yMax: 13.5
                });
            });

            // Horizontal gallery rings along perimeter of atrium
            for (let i = 0; i < atriumCols.length - 1; i++) {
                const xA = atriumCols[i].x, xB = atriumCols[i+1].x;
                [zFront, zRear].forEach(zPos => {
                    members.push({
                        type: 'HORIZONTAL',
                        p1: [xA, 5.8, zPos], p2: [xB, 5.8, zPos],
                        rShaft: 0.28, rCap: 0.75,
                        xMin: xA - 0.2, xMax: xB + 0.2, yMin: 6.2, yMax: 8.5,
                        targetY: 5.8
                    });
                });
            }

            // Filter members if orientation requested
            const activeMembers = members.filter(m => orientationFilter === 'ALL' || m.type === orientationFilter);

            // Apply deformation to vertices
            for (let i = 0; i < out.length; i += 3) {
                const x = out[i], y = out[i+1], z = out[i+2];

                for (let m = 0; m < activeMembers.length; m++) {
                    const mem = activeMembers[m];
                    if (x < mem.xMin || x > mem.xMax) continue;
                    if (y < mem.yMin || y > mem.yMax) continue;

                    if (mem.type === 'VERTICAL') {
                        const cdx = x - mem.p1[0];
                        const cdz = z - mem.p1[2];
                        const dist = Math.sqrt(cdx * cdx + cdz * cdz);
                        if (dist < mem.rCap) {
                            let w;
                            if (dist <= mem.rShaft) w = 1.0;
                            else {
                                const t = (dist - mem.rShaft) / (mem.rCap - mem.rShaft);
                                w = 0.5 * (1.0 + Math.cos(t * Math.PI));
                            }
                            const drop = y - mem.targetY;
                            out[i+1] -= reach * drop * w;
                        }
                    } else if (mem.type === 'HORIZONTAL') {
                        // Project onto horizontal line segment p1 -> p2
                        const p1x = mem.p1[0], p1z = mem.p1[2];
                        const p2x = mem.p2[0], p2z = mem.p2[2];
                        const vx = p2x - p1x, vz = p2z - p1z;
                        const vLenSq = vx * vx + vz * vz || 0.001;
                        const t = Math.max(0, Math.min(1, ((x - p1x) * vx + (z - p1z) * vz) / vLenSq));
                        const projX = p1x + t * vx;
                        const projZ = p1z + t * vz;
                        const dist = Math.hypot(x - projX, z - projZ);

                        if (dist < mem.rCap) {
                            let w;
                            if (dist <= mem.rShaft) w = 1.0;
                            else {
                                const st = (dist - mem.rShaft) / (mem.rCap - mem.rShaft);
                                w = 0.5 * (1.0 + Math.cos(st * Math.PI));
                            }
                            // Form arched downward bow
                            const archBow = Math.sin(t * Math.PI) * 0.35;
                            const drop = y - (mem.targetY + archBow);
                            out[i+1] -= reach * drop * w * 0.85;
                            out[i] += (projX - x) * reach * w * 0.30;
                            out[i+2] += (projZ - z) * reach * w * 0.30;
                        }
                    } else if (mem.type === 'DIAGONAL') {
                        // Project 3D vertex onto 3D line segment p1 -> p2
                        const p1 = mem.p1, p2 = mem.p2;
                        const vx = p2[0] - p1[0], vy = p2[1] - p1[1], vz = p2[2] - p1[2];
                        const vLenSq = vx * vx + vy * vy + vz * vz || 0.001;
                        const t = Math.max(0, Math.min(1, ((x - p1[0]) * vx + (y - p1[1]) * vy + (z - p1[2]) * vz) / vLenSq));
                        const projX = p1[0] + t * vx;
                        const projY = p1[1] + t * vy;
                        const projZ = p1[2] + t * vz;
                        const dist = Math.hypot(x - projX, y - projY, z - projZ);

                        if (dist < mem.rCap) {
                            let w;
                            if (dist <= mem.rShaft) w = 1.0;
                            else {
                                const st = (dist - mem.rShaft) / (mem.rCap - mem.rShaft);
                                w = 0.5 * (1.0 + Math.cos(st * Math.PI));
                            }
                            out[i] += (projX - x) * reach * w * 0.65;
                            out[i+1] += (projY - y) * reach * w * 0.75;
                            out[i+2] += (projZ - z) * reach * w * 0.65;
                        }
                    }
                }
            }
            return out;
        };
    })()
"@
    Eval-JS $injectJS | Out-Null

    # Test applying omni branching at B=75%
    Eval-JS @"
    (() => {
        const orig = window.originalMeshes[0].originalPositions;
        const deformed = window.testOmniBranching(orig, 0.75, 'ALL');
        const m = window.originalMeshes[0].mesh;
        const attr = m.geometry.attributes.position;
        for (let i = 0; i < deformed.length; i++) attr.array[i] = deformed[i];
        attr.needsUpdate = true;
        m.geometry.computeVertexNormals();
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    Eval-JS "window.setCameraProjection('FRONT')" | Out-Null
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/omni_front.png"

    Eval-JS "window.setCameraProjection('ISO')" | Out-Null
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/omni_iso.png"

    Write-Output "Omni test screenshots saved."
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
