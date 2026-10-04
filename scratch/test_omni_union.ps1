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

    # Test the clean non-additive union algorithm
    $testJS = @"
    (() => {
        function computeMultiDirectionalBranching(mesh, strength, orientationMode = 'ALL') {
            const B = Math.max(0, Math.min(1.0, strength));
            if (B < 0.001) return mesh;

            const out = new Float32Array(mesh);
            const reach = Math.min(1.0, B * 1.35);
            const centerZ = -4.8;
            const zFront = centerZ + 1.15;
            const zRear = centerZ - 1.15;

            const members = [];

            // ─── 1. GALLERY INTERIOR (X in [-4.0, 1.8]) ───
            // Longitudinal bays along X
            const gBays = B < 0.35 ? [-1.5] : (B < 0.65 ? [-2.8, -1.2, 0.4] : [-3.6, -2.4, -1.2, 0.0, 1.2]);

            // VERTICAL COLUMNS:
            gBays.forEach(bx => {
                const zRows = (B >= 0.65) ? [zFront, zRear] : [centerZ];
                zRows.forEach(zPos => {
                    members.push({
                        type: 'VERTICAL',
                        p1: [bx, 10.4, zPos], p2: [bx, 7.05, zPos],
                        rShaft: 0.32, rCap: 0.80,
                        xMin: bx - 0.75, xMax: bx + 0.75,
                        ceilMinY: 9.4, ceilMaxY: 10.8,
                        targetFloor: 7.05, floorMinY: 6.8, floorMaxY: 7.5
                    });
                });
            });

            // HORIZONTAL MEMBERS:
            // A. Longitudinal arched lintels bridging between adjacent columns along X at ceiling level
            if (gBays.length >= 2 && (orientationMode === 'ALL' || orientationMode === 'HORIZONTAL')) {
                for (let i = 0; i < gBays.length - 1; i++) {
                    const xA = gBays[i], xB = gBays[i+1];
                    const zRows = (B >= 0.65) ? [zFront, zRear] : [centerZ];
                    zRows.forEach(zPos => {
                        members.push({
                            type: 'HORIZONTAL',
                            p1: [xA, 9.2, zPos], p2: [xB, 9.2, zPos],
                            rShaft: 0.30, rCap: 0.80,
                            xMin: xA - 0.2, xMax: xB + 0.2,
                            ceilMinY: 9.4, ceilMaxY: 10.8, targetY: 9.15
                        });
                    });
                }
            }

            // B. Transverse cross-ties bridging between front and rear columns across Z
            if (B >= 0.65 && (orientationMode === 'ALL' || orientationMode === 'HORIZONTAL')) {
                gBays.forEach(bx => {
                    members.push({
                        type: 'HORIZONTAL',
                        p1: [bx, 8.8, zRear], p2: [bx, 8.8, zFront],
                        rShaft: 0.30, rCap: 0.80,
                        xMin: bx - 0.65, xMax: bx + 0.65,
                        ceilMinY: 9.3, ceilMaxY: 10.8, targetY: 8.75
                    });
                });
            }

            // DIAGONAL MEMBERS:
            // Diagonal knee braces springing at 45° from column capitals into ceiling
            if (B >= 0.35 && (orientationMode === 'ALL' || orientationMode === 'DIAGONAL')) {
                gBays.forEach(bx => {
                    const zRows = (B >= 0.65) ? [zFront, zRear] : [centerZ];
                    zRows.forEach(zPos => {
                        // Rightward diagonal branch
                        members.push({
                            type: 'DIAGONAL',
                            p1: [bx, 8.2, zPos], p2: [bx + 0.70, 10.3, zPos],
                            rShaft: 0.26, rCap: 0.72,
                            xMin: bx - 0.1, xMax: bx + 0.85,
                            ceilMinY: 9.2, ceilMaxY: 10.8
                        });
                        // Leftward diagonal branch
                        members.push({
                            type: 'DIAGONAL',
                            p1: [bx, 8.2, zPos], p2: [bx - 0.70, 10.3, zPos],
                            rShaft: 0.26, rCap: 0.72,
                            xMin: bx - 0.85, xMax: bx + 0.1,
                            ceilMinY: 9.2, ceilMaxY: 10.8
                        });
                    });
                });
            }

            // ─── 2. TRANSITION RAMP & CHAISE DIP (X in [2.0, 8.0]) ───
            // DIAGONAL RAKING STRUTS (Dominant in the sloped transition zone!)
            if (orientationMode === 'ALL' || orientationMode === 'DIAGONAL') {
                const rPairs = [
                    { x1: 2.6, y1: 9.2, x2: 4.2, y2: 6.2 },
                    { x1: 4.0, y1: 8.6, x2: 5.6, y2: 4.6 },
                    { x1: 5.5, y1: 7.0, x2: 7.0, y2: 3.4 }
                ];
                rPairs.forEach(rp => {
                    const zRows = (B >= 0.65) ? [zFront, zRear] : [centerZ];
                    zRows.forEach(zPos => {
                        // Forward raking diagonal strut
                        members.push({
                            type: 'DIAGONAL',
                            p1: [rp.x1, rp.y1, zPos], p2: [rp.x2, rp.y2, zPos],
                            rShaft: 0.32, rCap: 0.82,
                            xMin: rp.x1 - 0.3, xMax: rp.x2 + 0.3,
                            ceilMinY: 6.2, ceilMaxY: 9.8
                        });
                        if (B >= 0.50) {
                            // Opposing counter-diagonal forming triangulated truss
                            members.push({
                                type: 'DIAGONAL',
                                p1: [rp.x2, rp.y1, zPos], p2: [rp.x1, rp.y2, zPos],
                                rShaft: 0.28, rCap: 0.78,
                                xMin: rp.x1 - 0.3, xMax: rp.x2 + 0.3,
                                ceilMinY: 6.2, ceilMaxY: 9.8
                            });
                        }
                    });
                });
            }

            // VERTICAL COLUMNS:
            if (orientationMode === 'ALL' || orientationMode === 'VERTICAL') {
                const rampSteps = B < 0.35 ? [{ x: 6.0, ceilMinY: 6.5, ceilMaxY: 7.8, targetFloor: 4.0, floorMinY: 3.6, floorMaxY: 4.4 }] :
                    (B < 0.65 ? [
                        { x: 3.8, ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.8, floorMinY: 5.4, floorMaxY: 6.2 },
                        { x: 5.6, ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 4.4, floorMinY: 3.9, floorMaxY: 4.8 },
                        { x: 7.2, ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 3.1, floorMinY: 2.8, floorMaxY: 3.5 }
                    ] : [
                        { x: 2.6, ceilMinY: 9.0, ceilMaxY: 9.8, targetFloor: 6.5, floorMinY: 6.2, floorMaxY: 7.0 },
                        { x: 4.0, ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.7, floorMinY: 5.4, floorMaxY: 6.2 },
                        { x: 5.5, ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 4.3, floorMinY: 3.9, floorMaxY: 4.8 },
                        { x: 7.0, ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 3.0, floorMinY: 2.8, floorMaxY: 3.5 }
                    ]);

                rampSteps.forEach(rs => {
                    const zRows = (B >= 0.65) ? [zFront, zRear] : [centerZ];
                    zRows.forEach(zPos => {
                        members.push({
                            type: 'VERTICAL',
                            p1: [rs.x, rs.ceilMaxY, zPos], p2: [rs.x, rs.targetFloor, zPos],
                            rShaft: 0.32, rCap: 0.80,
                            xMin: rs.x - 0.65, xMax: rs.x + 0.65,
                            ceilMinY: rs.ceilMinY, ceilMaxY: rs.ceilMaxY,
                            targetFloor: rs.targetFloor, floorMinY: rs.floorMinY, floorMaxY: rs.floorMaxY
                        });
                    });
                });
            }

            // HORIZONTAL TIES ACROSS RAMP:
            if (B >= 0.50 && (orientationMode === 'ALL' || orientationMode === 'HORIZONTAL')) {
                [3.5, 5.5, 7.0].forEach(hx => {
                    members.push({
                        type: 'HORIZONTAL',
                        p1: [hx, 5.2, zRear], p2: [hx, 5.2, zFront],
                        rShaft: 0.30, rCap: 0.80,
                        xMin: hx - 0.6, xMax: hx + 0.6,
                        ceilMinY: 6.2, ceilMaxY: 8.5, targetY: 5.2
                    });
                });
            }

            // ─── 3. GRAND ATRIUM & VERTICAL VOID (X in [8.0, 15.0]) ───
            // VERTICAL COLUMNS ALONG PERIMETER
            if (orientationMode === 'ALL' || orientationMode === 'VERTICAL') {
                const atriumSteps = B < 0.65 ? [
                    { x: 8.6, ceilMinY: 5.4, ceilMaxY: 6.4, targetFloor: 2.05, floorMinY: 1.8, floorMaxY: 2.5 }
                ] : [
                    { x: 8.6, ceilMinY: 5.4, ceilMaxY: 6.4, targetFloor: 2.05, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 10.4, ceilMinY: 6.2, ceilMaxY: 7.4, targetFloor: 2.05, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 12.6, ceilMinY: 7.6, ceilMaxY: 9.2, targetFloor: 2.05, floorMinY: 1.8, floorMaxY: 2.5 },
                    { x: 14.2, ceilMinY: 11.0, ceilMaxY: 13.0, targetFloor: 2.05, floorMinY: 1.8, floorMaxY: 2.5 }
                ];
                atriumSteps.forEach(as => {
                    [zFront, zRear].forEach(zPos => {
                        members.push({
                            type: 'VERTICAL',
                            p1: [as.x, as.ceilMaxY, zPos], p2: [as.x, as.targetFloor, zPos],
                            rShaft: 0.36, rCap: 0.88,
                            xMin: as.x - 0.70, xMax: as.x + 0.70,
                            ceilMinY: as.ceilMinY, ceilMaxY: as.ceilMaxY,
                            targetFloor: as.targetFloor, floorMinY: as.floorMinY, floorMaxY: as.floorMaxY
                        });
                    });
                });
            }

            // DIAGONAL SOARING TREE BUTTRESSES IN ATRIUM:
            if (B >= 0.50 && (orientationMode === 'ALL' || orientationMode === 'DIAGONAL')) {
                [zFront, zRear].forEach(zPos => {
                    // Tree branch springing from threshold column toward mid atrium ceiling
                    members.push({
                        type: 'DIAGONAL',
                        p1: [8.6, 3.2, zPos], p2: [11.5, 7.5, zPos],
                        rShaft: 0.32, rCap: 0.85,
                        xMin: 8.2, xMax: 12.0, ceilMinY: 5.2, ceilMaxY: 8.2
                    });
                    if (B >= 0.70) {
                        // High soaring buttress springing from mid-column into high roof vault
                        members.push({
                            type: 'DIAGONAL',
                            p1: [10.4, 3.5, zPos], p2: [14.0, 12.5, zPos],
                            rShaft: 0.34, rCap: 0.88,
                            xMin: 10.0, xMax: 14.8, ceilMinY: 6.8, ceilMaxY: 13.5
                        });
                    }
                });
            }

            // HORIZONTAL GALLERY TIES IN ATRIUM:
            if (B >= 0.65 && (orientationMode === 'ALL' || orientationMode === 'HORIZONTAL')) {
                [zFront, zRear].forEach(zPos => {
                    members.push({
                        type: 'HORIZONTAL',
                        p1: [8.6, 5.6, zPos], p2: [12.6, 5.6, zPos],
                        rShaft: 0.28, rCap: 0.75,
                        xMin: 8.4, xMax: 12.8, ceilMinY: 6.0, ceilMaxY: 8.5, targetY: 5.6
                    });
                });
            }

            // Execute Non-Additive Union Deformation on Mesh Vertices
            for (let i = 0; i < out.length; i += 3) {
                const x = out[i], y = out[i+1], z = out[i+2];

                let maxDropY = 0;
                let maxPedestalY = 0;
                let bestDispX = 0, bestDispY = 0, bestDispZ = 0;
                let maxWeight = 0;

                for (let m = 0; m < members.length; m++) {
                    const mem = members[m];
                    if (x < mem.xMin || x > mem.xMax) continue;

                    if (mem.type === 'VERTICAL') {
                        const cdx = x - mem.p1[0], cdz = z - mem.p1[2];
                        const dist = Math.sqrt(cdx * cdx + cdz * cdz);
                        if (dist < mem.rCap) {
                            let w = dist <= mem.rShaft ? 1.0 : 0.5 * (1.0 + Math.cos(((dist - mem.rShaft) / (mem.rCap - mem.rShaft)) * Math.PI));
                            if (y >= mem.ceilMinY && y <= mem.ceilMaxY) {
                                const drop = (y - mem.targetFloor) * reach * w;
                                if (drop > maxDropY) maxDropY = drop;
                            } else if (y >= mem.floorMinY && y <= mem.floorMaxY) {
                                const lift = reach * 0.22 * w;
                                if (lift > maxPedestalY) maxPedestalY = lift;
                            }
                        }
                    } else if (mem.type === 'HORIZONTAL') {
                        if (y < mem.ceilMinY || y > mem.ceilMaxY) continue;
                        const p1x = mem.p1[0], p1z = mem.p1[2];
                        const p2x = mem.p2[0], p2z = mem.p2[2];
                        const vx = p2x - p1x, vz = p2z - p1z;
                        const vLenSq = vx * vx + vz * vz || 0.001;
                        const t = Math.max(0, Math.min(1, ((x - p1x) * vx + (z - p1z) * vz) / vLenSq));
                        const projX = p1x + t * vx;
                        const projZ = p1z + t * vz;
                        const dist = Math.hypot(x - projX, z - projZ);

                        if (dist < mem.rCap) {
                            let w = dist <= mem.rShaft ? 1.0 : 0.5 * (1.0 + Math.cos(((dist - mem.rShaft) / (mem.rCap - mem.rShaft)) * Math.PI));
                            const archBow = Math.sin(t * Math.PI) * 0.30;
                            const targetY = mem.targetY + archBow;
                            const drop = (y - targetY) * reach * w * 0.85;
                            if (drop > maxDropY) maxDropY = drop;

                            if (w > maxWeight) {
                                maxWeight = w;
                                bestDispX = (projX - x) * reach * w * 0.35;
                                bestDispZ = (projZ - z) * reach * w * 0.35;
                            }
                        }
                    } else if (mem.type === 'DIAGONAL') {
                        if (y < mem.ceilMinY || y > mem.ceilMaxY) continue;
                        const p1 = mem.p1, p2 = mem.p2;
                        const vx = p2[0] - p1[0], vy = p2[1] - p1[1], vz = p2[2] - p1[2];
                        const vLenSq = vx * vx + vy * vy + vz * vz || 0.001;
                        const t = Math.max(0, Math.min(1, ((x - p1[0]) * vx + (y - p1[1]) * vy + (z - p1[2]) * vz) / vLenSq));
                        const projX = p1[0] + t * vx;
                        const projY = p1[1] + t * vy;
                        const projZ = p1[2] + t * vz;
                        const dist = Math.hypot(x - projX, y - projY, z - projZ);

                        if (dist < mem.rCap) {
                            let w = dist <= mem.rShaft ? 1.0 : 0.5 * (1.0 + Math.cos(((dist - mem.rShaft) / (mem.rCap - mem.rShaft)) * Math.PI));
                            const drop = (y - projY) * reach * w * 0.80;
                            if (drop > maxDropY) maxDropY = drop;

                            if (w > maxWeight) {
                                maxWeight = w;
                                bestDispX = (projX - x) * reach * w * 0.50;
                                bestDispZ = (projZ - z) * reach * w * 0.50;
                            }
                        }
                    }
                }

                // Apply union displacements cleanly without spikes
                if (maxDropY > 0) out[i+1] -= maxDropY;
                else if (maxPedestalY > 0) out[i+1] += maxPedestalY;

                if (maxWeight > 0) {
                    out[i] += bestDispX;
                    out[i+2] += bestDispZ;
                }
            }

            return {
                deformed: out,
                members: members,
                counts: {
                    vertical: members.filter(m => m.type === 'VERTICAL').length,
                    horizontal: members.filter(m => m.type === 'HORIZONTAL').length,
                    diagonal: members.filter(m => m.type === 'DIAGONAL').length,
                    total: members.length
                }
            };
        }

        window.testUnionFunction = computeMultiDirectionalBranching;
    })()
"@
    Eval-JS $testJS | Out-Null

    $stats = Eval-JS @"
    (() => {
        const orig = window.originalMeshes[0].originalPositions;
        const res = window.testUnionFunction(orig, 0.75, 'ALL');
        const m = window.originalMeshes[0].mesh;
        const attr = m.geometry.attributes.position;
        for (let i = 0; i < res.deformed.length; i++) attr.array[i] = res.deformed[i];
        attr.needsUpdate = true;
        m.geometry.computeVertexNormals();
        return res.counts;
    })()
"@
    Write-Output "Member counts: $($stats | ConvertTo-Json)"

    Start-Sleep -Seconds 1
    Eval-JS "window.setCameraProjection('FRONT')" | Out-Null
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/union_front.png"

    Eval-JS "window.setCameraProjection('ISO')" | Out-Null
    Start-Sleep -Seconds 1
    Capture-Screen "scratch/union_iso.png"

    Write-Output "Union test screenshots saved."
} finally {
    if ($proc) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
