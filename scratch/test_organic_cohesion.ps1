$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9248
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

    # Build organic flowing wall prototype
    $code = @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return "no mesh";
        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Shoulder source: x: 7.8, y: 8.3, z: 0.0
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

        const wallThickness = 8.0 / 12.0; // 8 in = 0.67 ft
        const targetHeight = 12.0; // 12 ft
        const primaryLength = 16.0; // 16 ft
        const transLen = 5.0; // 5 ft
        const totalLen = transLen + primaryLength;
        const embedOffset = 0.65; // embedded inside surface to guarantee 0 gap

        const numLongitudinal = 80;
        const crossSections = [];
        const curvAmp = 3.2;

        for (let i = 0; i <= numLongitudinal; i++) {
            const s = (i / numLongitudinal) * totalLen;
            const sRel = s - embedOffset;
            const tNorm = s / totalLen;

            // Fluid Art Nouveau whiplash plan curve
            // Smooth double-curvature: forward sweep with a gentle whiplash return
            const curveOffset = (Math.sin(tNorm * Math.PI) * 0.85 + Math.sin(tNorm * Math.PI * 2) * 0.25) * curvAmp;
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

                baseY = origin.y * (1.0 - w);

                upVec = {
                    x: normal.x * (1.0 - w),
                    y: normal.y * (1.0 - w) + 1.0 * w,
                    z: normal.z * (1.0 - w)
                };
                const uLen = Math.hypot(upVec.x, upVec.y, upVec.z) || 1;
                upVec.x /= uLen; upVec.y /= uLen; upVec.z /= uLen;

                const hRoot = wallThickness * 0.35;
                // Transition height
                const topY = (origin.y + hRoot) * (1.0 - w) + targetHeight * w;
                currentHeight = Math.max(wallThickness * 0.5, topY - baseY);
            } else {
                baseY = 0;
                upVec = { x: 0, y: 1, z: 0 };
                // Fluid whiplash crest variation: subtle organic rise and fall along the top edge
                const uWall = (s - transLen) / primaryLength;
                const whiplashCrest = Math.sin(uWall * Math.PI * 1.5) * 0.8 - Math.sin(uWall * Math.PI * 0.5) * 0.4;
                // Taper down smoothly towards the terminal tip (last 15% of wall)
                let termTaper = 1.0;
                if (uWall > 0.80) {
                    const v = (uWall - 0.80) / 0.20;
                    termTaper = 1.0 - (3 * v * v - 2 * v * v * v) * 0.35; // gentle graceful dip at end
                }
                currentHeight = (targetHeight + whiplashCrest) * termTaper;
            }

            // Organic thickness variation (flared root + subtle swelling entasis + tapered end)
            let thickMultiplier = 1.0;
            if (s <= transLen) {
                // Flared root connecting to seed surface
                const u = s / transLen;
                thickMultiplier = 1.5 - 0.5 * (3 * u * u - 2 * u * u * u);
            } else {
                const uWall = (s - transLen) / primaryLength;
                // Entasis in mid-section, tapered toward terminal end
                thickMultiplier = 1.0 + 0.15 * Math.sin(uWall * Math.PI) - (uWall > 0.75 ? 0.35 * (uWall - 0.75) / 0.25 : 0);
            }
            const currentThickness = wallThickness * thickMultiplier;

            crossSections.push({
                base: { x: baseX, y: baseY, z: baseZ },
                up: upVec,
                height: currentHeight,
                thickness: currentThickness,
                s: s,
                i: i
            });
        }

        // BUILD SMOOTH ORGANIC 3D PROFILE
        // Instead of 4 sharp corners, we use a 10-point smooth filleted organic cross-section:
        // 0..4: Right flank going up, rounding over the top crest
        // 5..9: Left flank rounding over the top crest down to base
        // This eliminates all sharp CAD crease edges and produces a fluid, continuous SubD-like surface!
        const numPts = crossSections.length;
        const positions = [];
        const indices = [];

        // Number of profile vertices per cross-section
        const numPerCross = 10;

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

            // Embedded root knife-edge taper
            const rootTaper = (i === 0) ? 0.3 : ((i === 1) ? 0.65 : 1.0);
            // Terminal tip taper (soft rounded prow at end of wall)
            const isLast = (i === numPts - 1);
            const tipTaper = isLast ? 0.25 : (i === numPts - 2 ? 0.65 : 1.0);
            const effHalfThick = halfThick * rootTaper * tipTaper;

            // Compute 10 points along the organic curved profile:
            // Point 0: Bottom-Center-Right
            // Point 1: Mid-Flank Right (slightly bulged for muscular organic tension)
            // Point 2: Shoulder Right (rounding toward crest)
            // Point 3: Crest Right
            // Point 4: Crest Peak (smooth rounded apex)
            // Point 5: Crest Left
            // Point 6: Shoulder Left (rounding toward crest)
            // Point 7: Mid-Flank Left
            // Point 8: Bottom-Center-Left
            // Point 9: Bottom Under-Center (sealing bottom smoothly)

            const profileOffsets = [
                { r: +1.0, uFrac: 0.05 },
                { r: +1.08, uFrac: 0.40 },  // subtle organic flank bulge
                { r: +0.85, uFrac: 0.88 },  // rounded shoulder
                { r: +0.45, uFrac: 0.98 },  // rounding into crest
                { r:  0.0,  uFrac: 1.00 },  // smooth apex crown
                { r: -0.45, uFrac: 0.98 },
                { r: -0.85, uFrac: 0.88 },
                { r: -1.08, uFrac: 0.40 },
                { r: -1.0,  uFrac: 0.05 },
                { r:  0.0,  uFrac: 0.00 }   // bottom center
            ];

            for (let p = 0; p < numPerCross; p++) {
                const po = profileOffsets[p];
                const latDist = effHalfThick * po.r;
                const vertDist = h * po.uFrac;

                const vx = bx + rX * latDist + u.x * vertDist;
                const vy = by + rY * latDist + u.y * vertDist;
                const vz = bz + rZ * latDist + u.z * vertDist;

                positions.push(vx, vy, vz);
            }
        }

        // Connect cross sections with continuous quads (numPerCross ring)
        for (let i = 0; i < numPts - 1; i++) {
            const r0 = i * numPerCross;
            const r1 = (i + 1) * numPerCross;

            for (let p = 0; p < numPerCross; p++) {
                const nextP = (p + 1) % numPerCross;
                indices.push(r0 + p, r1 + p, r1 + nextP);
                indices.push(r0 + p, r1 + nextP, r0 + nextP);
            }
        }

        // Smooth start cap fan (embedded in mesh)
        const centerStart = [positions[0], positions[1], positions[2]];
        for (let p = 1; p < numPerCross - 1; p++) {
            indices.push(0, p + 1, p);
        }

        // Smooth end cap fan (rounded prow)
        const lastBase = (numPts - 1) * numPerCross;
        for (let p = 1; p < numPerCross - 1; p++) {
            indices.push(lastBase, lastBase + p, lastBase + p + 1);
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const group = window.branchingWallGroup || new THREE.Group();
        while (group.children.length > 0) group.remove(group.children[0]);

        // Exact material matching seed geometry
        const mat = new THREE.MeshStandardMaterial({
            color: 0xdcdcdc,
            roughness: 0.82,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        const meshObj = new THREE.Mesh(geom, mat);
        meshObj.castShadow = true;
        meshObj.receiveShadow = true;
        group.add(meshObj);
        if (!window.branchingWallGroup) {
            window.threeScene.add(group);
            window.branchingWallGroup = group;
        }

        return "ORGANIC_SUCCESS";
    })()
"@

    $r = Eval-JS $code
    Write-Output "RES: $r"

    # Screenshot 1: Perspective view showing organic flow
    $s1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $s1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\organic_view1_perspective.png", [Convert]::FromBase64String($j1.result.data))

    # Screenshot 2: Close-up on the crest rounding & wall end
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(18, 14, 14);
        window.threeControls.target.set(10, 7, 4);
        window.threeControls.update();
        window.threeRenderer.render(window.threeScene, window.threeCamera);
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $s2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $s2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\organic_view2_closeup.png", [Convert]::FromBase64String($j2.result.data))

    # Screenshot 3: View looking along the top whiplash spine
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(2, 22, 26);
        window.threeControls.target.set(8, 7, 2);
        window.threeControls.update();
        window.threeRenderer.render(window.threeScene, window.threeCamera);
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $s3 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j3 = $s3 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\fa3885b3-654a-46cf-877a-513450cb0dc0\organic_view3_spine.png", [Convert]::FromBase64String($j3.result.data))

    Write-Output "Captured 3 organic views."
} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
