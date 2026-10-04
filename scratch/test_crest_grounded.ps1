$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9245
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
        return $r
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $testGrounded = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Crest shoulder: x: 7.8, y: 8.3, z: 0.0
        let bestIdx = -1, bestDist = Infinity;
        for (let i = 0; i < pos.length; i += 3) {
            const d = Math.hypot(pos[i]-7.8, pos[i+1]-8.3, pos[i+2]-0.0);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        const origin = { x: pos[bestIdx], y: pos[bestIdx+1], z: pos[bestIdx+2] };
        const normal = { x: norm[bestIdx], y: norm[bestIdx+1], z: norm[bestIdx+2] };
        const nLen = Math.hypot(normal.x, normal.y, normal.z) || 1;
        normal.x /= nLen; normal.y /= nLen; normal.z /= nLen;

        const tangent = { x: 0.8, y: 0.2, z: 0.5 };
        const tLen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
        tangent.x /= tLen; tangent.y /= tLen; tangent.z /= tLen;

        const wallThickness = 8.0 / 12.0;
        const targetHeight = 12.0;
        const primaryLength = 15.0;
        const transLen = 5.0;
        const totalLen = transLen + primaryLength;
        const embedOffset = 0.6;
        const numSamples = 60;
        const crossSections = [];
        const curvAmp = 3.0;

        for (let i = 0; i <= numSamples; i++) {
            const s = (i / numSamples) * totalLen;
            const sRel = s - embedOffset;
            const tNorm = s / totalLen;

            // Plan curve
            const curveOffset = Math.sin(tNorm * Math.PI) * (1.0 - 0.25 * Math.cos(tNorm * Math.PI)) * curvAmp;
            const latX = -tangent.z;
            const latZ = tangent.x;

            const baseX = origin.x + tangent.x * sRel + latX * curveOffset;
            const baseZ = origin.z + tangent.z * sRel + latZ * curveOffset;

            let baseY = 0;
            let currentHeight = targetHeight;
            let upVec = { x: 0, y: 1, z: 0 };

            if (s <= transLen) {
                const u = Math.max(0, s / transLen);
                // Quintic smoothstep
                const w = u * u * u * (u * (u * 6 - 15) + 10);

                // Base smoothly transitions from origin.y down to 0 (ground)
                baseY = origin.y * (1.0 - w);

                // Up vector rotates from surface normal to vertical
                upVec = {
                    x: normal.x * (1.0 - w),
                    y: normal.y * (1.0 - w) + 1.0 * w,
                    z: normal.z * (1.0 - w)
                };
                const uLen = Math.hypot(upVec.x, upVec.y, upVec.z) || 1;
                upVec.x /= uLen; upVec.y /= uLen; upVec.z /= uLen;

                // Top elevation: starts at origin.y + hRoot and rises to targetHeight
                const hRoot = wallThickness * 0.35;
                const topY = (origin.y + hRoot) * (1.0 - w) + targetHeight * w;
                currentHeight = Math.max(wallThickness * 0.6, topY - baseY);
            } else {
                baseY = 0;
                upVec = { x: 0, y: 1, z: 0 };
                currentHeight = targetHeight;
            }

            crossSections.push({
                base: { x: baseX, y: baseY, z: baseZ },
                up: upVec,
                height: currentHeight,
                thickness: wallThickness * (1.0 + 0.12 * Math.sin(tNorm * Math.PI * 2))
            });
        }

        // Build 3D mesh
        const numPts = crossSections.length;
        const positions = [];
        const indices = [];

        for (let i = 0; i < numPts; i++) {
            const cs = crossSections[i];
            const prev = crossSections[Math.max(0, i - 1)];
            const next = crossSections[Math.min(numPts - 1, i + 1)];

            let tanX = next.base.x - prev.base.x;
            let tanY = next.base.y - prev.base.y;
            let tanZ = next.base.z - prev.base.z;
            const tLen = Math.hypot(tanX, tanY, tanZ) || 1;
            tanX /= tLen; tanY /= tLen; tanZ /= tLen;

            const u = cs.up;
            let rX = tanY * u.z - tanZ * u.y;
            let rY = tanZ * u.x - tanX * u.z;
            let rZ = tanX * u.y - tanY * u.x;
            const rLen = Math.hypot(rX, rY, rZ) || 1;
            rX /= rLen; rY /= rLen; rZ /= rLen;

            const halfThick = cs.thickness / 2.0;
            const h = cs.height;
            const bx = cs.base.x, by = cs.base.y, bz = cs.base.z;

            const taper = i === 0 ? 0.3 : (i === 1 ? 0.7 : 1.0);
            const ht = halfThick * taper;

            positions.push(bx - rX * ht, by - rY * ht, bz - rZ * ht);
            positions.push(bx + rX * ht, by + rY * ht, bz + rZ * ht);
            positions.push(bx + rX * ht + u.x * h, by + rY * ht + u.y * h, bz + rZ * ht + u.z * h);
            positions.push(bx - rX * ht + u.x * h, by - rY * ht + u.y * h, bz - rZ * ht + u.z * h);
        }

        for (let i = 0; i < numPts - 1; i++) {
            const r0 = i * 4, r1 = (i + 1) * 4;
            indices.push(r0 + 1, r1 + 1, r1 + 2);
            indices.push(r0 + 1, r1 + 2, r0 + 2);
            indices.push(r0 + 0, r0 + 3, r1 + 3);
            indices.push(r0 + 0, r1 + 3, r1 + 0);
            indices.push(r0 + 3, r0 + 2, r1 + 2);
            indices.push(r0 + 3, r1 + 2, r1 + 3);
            indices.push(r0 + 0, r1 + 0, r1 + 1);
            indices.push(r0 + 0, r1 + 1, r0 + 1);
        }

        indices.push(0, 3, 2);
        indices.push(0, 2, 1);
        const lastR = (numPts - 1) * 4;
        indices.push(lastR + 0, lastR + 1, lastR + 2);
        indices.push(lastR + 0, lastR + 2, lastR + 3);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const group = window.branchingWallGroup || new THREE.Group();
        while (group.children.length > 0) group.remove(group.children[0]);

        const mat = new THREE.MeshStandardMaterial({
            color: 0xe8e8e8,
            roughness: 0.75,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const meshObj = new THREE.Mesh(geom, mat);
        group.add(meshObj);
        if (!window.branchingWallGroup) {
            window.threeScene.add(group);
            window.branchingWallGroup = group;
        }

        return "GROUNDED_SUCCESS";
    })()
"@
    Write-Output "RES: $testGrounded"

    $s1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $s1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\crest_grounded_view.png", [Convert]::FromBase64String($j1.result.data))

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
