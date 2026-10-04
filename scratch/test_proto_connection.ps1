$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9240
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

    # Test the continuous surface-to-wall generation
    $genRes = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Locate anchor on the curved flank
        let bestIdx = -1, bestDist = Infinity;
        const targetX = 3.54, targetY = 5.98, targetZ = 0.04;
        for (let i = 0; i < pos.length; i += 3) {
            const d = Math.hypot(pos[i]-targetX, pos[i+1]-targetY, pos[i+2]-targetZ);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        const source = {
            origin: { x: pos[bestIdx], y: pos[bestIdx+1], z: pos[bestIdx+2] },
            normal: { x: norm[bestIdx], y: norm[bestIdx+1], z: norm[bestIdx+2] }
        };
        const nLen = Math.hypot(source.normal.x, source.normal.y, source.normal.z) || 1;
        source.normal.x /= nLen; source.normal.y /= nLen; source.normal.z /= nLen;

        // Surface tangent at the flank: flowing along the flank curve towards +Z
        source.tangent = { x: 0.15, y: -0.05, z: 0.98 };
        const tLen = Math.hypot(source.tangent.x, source.tangent.y, source.tangent.z) || 1;
        source.tangent.x /= tLen; source.tangent.y /= tLen; source.tangent.z /= tLen;

        // Parameters
        const wallThickness = 8.0 / 12.0; // 8 inches in feet
        const targetHeight = 12.0; // 12 ft
        const primaryLength = 15.0; // 15 ft
        const transLen = 4.0; // 4 ft transition
        const totalLen = transLen + primaryLength;

        const embedOffset = 0.6; // embedded 0.6 ft inside mesh
        const numSamples = 60;
        const crossSections = [];

        // Curvature amplitude
        const curvAmp = 2.8;

        for (let i = 0; i <= numSamples; i++) {
            const s = (i / numSamples) * totalLen;
            const sRel = s - embedOffset;

            // Direction and position
            const tNorm = s / totalLen;
            // Smooth Art Nouveau curve deviation
            const curveOffset = Math.sin(tNorm * Math.PI) * (1.0 - 0.3 * Math.cos(tNorm * Math.PI)) * curvAmp;

            // Lateral vector for curvature
            const latX = -source.tangent.z;
            const latZ = source.tangent.x;

            const baseX = source.origin.x + source.tangent.x * sRel + latX * curveOffset;
            const baseZ = source.origin.z + source.tangent.z * sRel + latZ * curveOffset;

            // Base elevation: starts at surface origin.y, descends smoothly to 0 (ground)
            let baseY = 0;
            let currentHeight = targetHeight;
            let upVec = { x: 0, y: 1, z: 0 };

            if (s <= transLen) {
                const u = Math.max(0, s / transLen);
                // Quintic smoothstep for ultra-smooth C2 continuity
                const w = u * u * u * (u * (u * 6 - 15) + 10);

                // Base elevation descends from surface to 0
                baseY = source.origin.y * (1.0 - w);

                // Orientation rotates from surface normal to vertical
                upVec = {
                    x: source.normal.x * (1.0 - w),
                    y: source.normal.y * (1.0 - w) + 1.0 * w,
                    z: source.normal.z * (1.0 - w)
                };
                const uLen = Math.hypot(upVec.x, upVec.y, upVec.z) || 1;
                upVec.x /= uLen; upVec.y /= uLen; upVec.z /= uLen;

                // Height starts flush with surface (0.25 ft) and gradually rises to full targetHeight
                const hRoot = wallThickness * 0.4;
                currentHeight = hRoot + (targetHeight - hRoot) * w;
            } else {
                baseY = 0;
                upVec = { x: 0, y: 1, z: 0 };
                currentHeight = targetHeight;
            }

            // Cross section
            crossSections.push({
                base: { x: baseX, y: baseY, z: baseZ },
                up: upVec,
                height: currentHeight,
                thickness: wallThickness * (1.0 + 0.1 * Math.sin(tNorm * Math.PI * 2))
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

            // Lateral normal R = T x Up
            const u = cs.up;
            let rX = tanY * u.z - tanZ * u.y;
            let rY = tanZ * u.x - tanX * u.z;
            let rZ = tanX * u.y - tanY * u.x;
            const rLen = Math.hypot(rX, rY, rZ) || 1;
            rX /= rLen; rY /= rLen; rZ /= rLen;

            const halfThick = cs.thickness / 2.0;
            const h = cs.height;
            const bx = cs.base.x, by = cs.base.y, bz = cs.base.z;

            // 4 corners:
            // 0: Bottom-Left
            positions.push(bx - rX * halfThick, by - rY * halfThick, bz - rZ * halfThick);
            // 1: Bottom-Right
            positions.push(bx + rX * halfThick, by + rY * halfThick, bz + rZ * halfThick);
            // 2: Top-Right
            positions.push(bx + rX * halfThick + u.x * h, by + rY * halfThick + u.y * h, bz + rZ * halfThick + u.z * h);
            // 3: Top-Left
            positions.push(bx - rX * halfThick + u.x * h, by - rY * halfThick + u.y * h, bz - rZ * halfThick + u.z * h);
        }

        for (let i = 0; i < numPts - 1; i++) {
            const r0 = i * 4;
            const r1 = (i + 1) * 4;

            // Right face
            indices.push(r0 + 1, r1 + 1, r1 + 2);
            indices.push(r0 + 1, r1 + 2, r0 + 2);
            // Left face
            indices.push(r0 + 0, r0 + 3, r1 + 3);
            indices.push(r0 + 0, r1 + 3, r1 + 0);
            // Top face
            indices.push(r0 + 3, r0 + 2, r1 + 2);
            indices.push(r0 + 3, r1 + 2, r1 + 3);
            // Bottom face
            indices.push(r0 + 0, r1 + 0, r1 + 1);
            indices.push(r0 + 0, r1 + 1, r0 + 1);
        }

        // Start cap
        indices.push(0, 3, 2);
        indices.push(0, 2, 1);
        // End cap
        const lastR = (numPts - 1) * 4;
        indices.push(lastR + 0, lastR + 1, lastR + 2);
        indices.push(lastR + 0, lastR + 2, lastR + 3);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        // Add to group
        const group = window.branchingWallGroup || new THREE.Group();
        while (group.children.length > 0) group.remove(group.children[0]);

        const mat = new THREE.MeshStandardMaterial({
            color: 0xe8e8e8,
            roughness: 0.8,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const meshObj = new THREE.Mesh(geom, mat);
        group.add(meshObj);
        if (!window.branchingWallGroup) {
            window.threeScene.add(group);
            window.branchingWallGroup = group;
        }

        return "SUCCESS";
    })()
"@
    Write-Output "GENERATION: $genRes"

    # Capture View 1 (Default Perspective)
    $s1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $s1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\proto_view1.png", [Convert]::FromBase64String($j1.result.data))

    # Angle 2: Close-up on the connection zone
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(12, 10, 10);
            window.threeControls.target.set(4, 5, 2);
            window.threeControls.update();
            window.threeRenderer.render(window.threeScene, window.threeCamera);
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $s2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $s2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\proto_view2_closeup.png", [Convert]::FromBase64String($j2.result.data))

    # Angle 3: Reverse angle looking back from the wall into the surface
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(-5, 12, 22);
            window.threeControls.target.set(4, 5, 2);
            window.threeControls.update();
            window.threeRenderer.render(window.threeScene, window.threeCamera);
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $s3 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j3 = $s3 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\proto_view3_reverse.png", [Convert]::FromBase64String($j3.result.data))

    Write-Output "Captured 3 prototype views."
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
