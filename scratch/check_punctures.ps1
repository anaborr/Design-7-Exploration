$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$port = 9388
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3
try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()
    function Send-CDP($m, $p) {
        $payload = @{ id = 1; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 10
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
        $r = Send-CDP 'Runtime.evaluate' @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return ($r | ConvertFrom-Json).result.result.value
    }
    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 3

    # Load test script logic
    $res = Eval-JS @'
    (() => {
        const mesh = window.originalMeshes[0];
        const basePos = mesh.originalPositions;

        const computeDense = function(positions, B) {
            const out = new Float32Array(positions);
            if (B <= 0.001) return out;

            const bnds = window.getModelBounds ? window.getModelBounds() : null;
            const minX = bnds?.min?.x ?? -10.0;
            const maxX = bnds?.max?.x ?? 20.2;
            const minZ = bnds?.min?.z ?? -10.2;
            const maxZ = bnds?.max?.z ?? 0.5;
            const centerZ = (minZ + maxZ) / 2; // ~ -4.8

            const midCols = [];
            const zOffset = 1.1;
            const rShaft = 0.32;
            const rCap = 0.75;
            const xBays = [-3.3, -2.1, -0.9, 0.3];
            xBays.forEach((bx) => {
                midCols.push({
                    x: bx, z: centerZ + zOffset,
                    xMin: bx - 0.75, xMax: bx + 0.75,
                    ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                    floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                });
                midCols.push({
                    x: bx, z: centerZ - zOffset,
                    xMin: bx - 0.75, xMax: bx + 0.75,
                    ceilMinY: 9.6, ceilMaxY: 10.8, targetFloor: 6.2,
                    floorMinY: 6.8, floorMaxY: 7.5, rShaft, rCap
                });
            });

            midCols.push(
                {
                    x: 4.2, z: centerZ, xMin: 3.4, xMax: 5.0,
                    ceilMinY: 8.4, ceilMaxY: 9.4, targetFloor: 5.5,
                    floorMinY: 5.2, floorMaxY: 6.0, rShaft, rCap
                },
                {
                    x: 5.8, z: centerZ + 0.9, xMin: 5.0, xMax: 6.6,
                    ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 3.8,
                    floorMinY: 3.5, floorMaxY: 4.3, rShaft, rCap
                },
                {
                    x: 5.8, z: centerZ - 0.9, xMin: 5.0, xMax: 6.6,
                    ceilMinY: 6.8, ceilMaxY: 7.8, targetFloor: 3.8,
                    floorMinY: 3.5, floorMaxY: 4.3, rShaft, rCap
                },
                {
                    x: 7.3, z: centerZ, xMin: 6.6, xMax: 8.2,
                    ceilMinY: 6.0, ceilMaxY: 7.2, targetFloor: 2.8,
                    floorMinY: 2.5, floorMaxY: 3.4, rShaft, rCap
                },
                {
                    x: 8.8, z: centerZ, xMin: 8.2, xMax: 10.5,
                    ceilMinY: 5.4, ceilMaxY: 6.5, targetFloor: 1.9,
                    floorMinY: 1.5, floorMaxY: 2.4, rShaft, rCap
                }
            );

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

                        if (y >= col.ceilMinY && y <= col.ceilMaxY) {
                            let drop = y - col.targetFloor;
                            let dY = -reach * drop * w;
                            out[i+1] += dY;
                        }
                        else if (y >= col.floorMinY && y <= col.floorMaxY) {
                            let pedestalHeight = (col.ceilMinY - col.targetFloor) * 0.30;
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
        
        // Find minimum Y in original mesh as a function of X (in bins of 0.5)
        const minYByX = {};
        for (let i = 0; i < basePos.length; i += 3) {
            let bin = Math.round(basePos[i] * 2) / 2;
            if (minYByX[bin] === undefined || basePos[i+1] < minYByX[bin]) {
                minYByX[bin] = basePos[i+1];
            }
        }

        const deformed = computeDense(basePos, 1.0);

        let punctures = [];
        for (let i = 0; i < deformed.length; i += 3) {
            let x = deformed[i], y = deformed[i+1], z = deformed[i+2];
            let bin = Math.round(x * 2) / 2;
            let minAllowed = minYByX[bin] ?? -0.2;
            if (y < minAllowed - 0.05) {
                punctures.push({
                    origX: basePos[i], origY: basePos[i+1], origZ: basePos[i+2],
                    defX: x, defY: y, defZ: z,
                    minAllowed: minAllowed,
                    diff: minAllowed - y
                });
            }
        }
        return { punctureCount: punctures.length, punctures: punctures.slice(0, 5) };
    })()
'@
    $res | ConvertTo-Json -Depth 5
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
