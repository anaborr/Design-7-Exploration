$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9281
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

    # Test exact surface-to-wall rise on the mid-terrace
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Find exact vertex on the horizontal terrace surface
        // Around x ~ 3.54, y ~ 6.14, z ~ -0.6
        let bestIdx = -1, bestDist = Infinity;
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let ny = norm[i+1];
            if (ny > 0.75) {
                let d = Math.hypot(x - 3.54, y - 6.14, z - (-0.6));
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
        }

        const P0 = new THREE.Vector3(pos[bestIdx], pos[bestIdx+1], pos[bestIdx+2]);
        const N0 = new THREE.Vector3(norm[bestIdx], norm[bestIdx+1], norm[bestIdx+2]).normalize();

        // Tangent along the terrace surface extending outward into the room (+X, +Z)
        let T0 = new THREE.Vector3(0.85, 0.0, 0.52);
        T0.sub(N0.clone().multiplyScalar(T0.dot(N0))).normalize();

        const branchSource = {
            position: P0,
            normal: N0,
            tangent: T0,
            parentObject: mesh
        };

        // Transition: 4.5 ft
        // Total Wall Length: 16 ft
        // Wall Height: 12 ft
        // Wall Thickness: 8 in = 0.67 ft
        const transLen = 4.5;
        const totalLen = 16.0;
        const targetHeight = 12.0;
        const thickness = 8.0 / 12.0;

        // Spine curve: Cubic Bezier strictly beginning with P0 and P1 = P0 + T0 * transLen
        const cp0 = P0.clone();
        const cp1 = P0.clone().add(T0.clone().multiplyScalar(transLen));
        
        // Direction perpendicular to tangent for gentle whiplash curve
        const latVec = new THREE.Vector3(-T0.z, 0, T0.x).normalize();
        const cp2 = cp1.clone().add(T0.clone().multiplyScalar(5.0)).add(latVec.clone().multiplyScalar(2.8));
        const cp3 = cp1.clone().add(T0.clone().multiplyScalar(totalLen - transLen)).add(latVec.clone().multiplyScalar(0.8));

        const spineCurve = new THREE.CubicBezierCurve3(cp0, cp1, cp2, cp3);

        const numSamples = 60;
        const crossSections = [];

        // Start slightly embedded (0.4 ft back along T0) to physically overlap the parent surface
        const embedDist = 0.4;

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            const s = t * totalLen;
            const pt = spineCurve.getPoint(t);
            const tan = spineCurve.getTangent(t).normalize();

            let baseY = 0;
            let curHeight = targetHeight;
            let upVec = new THREE.Vector3(0, 1, 0);

            if (s <= transLen) {
                // TRANSITION ZONE:
                // Floor -> rising curve -> wall
                const u = s / transLen;
                const w = u * u * u * (u * (u * 6 - 15) + 10); // C2 smootherstep

                // Base smoothly settles from surface elevation down to ground 0
                baseY = P0.y * (1.0 - w);

                // Up vector rotates from surface normal N0 to vertical (0, 1, 0)
                upVec = N0.clone().multiplyScalar(1.0 - w).add(new THREE.Vector3(0, 1, 0).multiplyScalar(w)).normalize();

                // Height begins flush with surface (0.2 ft rib) and smoothly RISES to full wall height!
                const hRoot = thickness * 0.25;
                const topY = (P0.y + hRoot) * (1.0 - w) + targetHeight * w;
                curHeight = Math.max(thickness * 0.5, topY - baseY);
            } else {
                baseY = 0;
                upVec = new THREE.Vector3(0, 1, 0);
                const uWall = (s - transLen) / (totalLen - transLen);
                const whiplashCrest = Math.sin(uWall * Math.PI * 1.5) * 0.7 - Math.sin(uWall * Math.PI * 0.5) * 0.35;
                let termTaper = 1.0;
                if (uWall > 0.8) {
                    const v = (uWall - 0.8) / 0.2;
                    termTaper = 1.0 - (3 * v * v - 2 * v * v * v) * 0.35;
                }
                curHeight = (targetHeight + whiplashCrest) * termTaper;
            }

            // Thickness profile: flared at root to match parent surface, then nominal
            let thickMult = 1.0;
            if (s <= transLen) {
                const u = s / transLen;
                thickMult = 1.4 - 0.4 * (3 * u * u - 2 * u * u * u);
            } else {
                const uWall = (s - transLen) / (totalLen - transLen);
                thickMult = 1.0 + 0.12 * Math.sin(uWall * Math.PI) - (uWall > 0.75 ? 0.35 * (uWall - 0.75) / 0.25 : 0);
            }

            crossSections.push({
                base: { x: pt.x, y: baseY, z: pt.z },
                up: { x: upVec.x, y: upVec.y, z: upVec.z },
                height: curHeight,
                thickness: thickness * thickMult,
                s: s
            });
        }

        // Build 10-point organic mesh
        const numPts = crossSections.length;
        const positions = [];
        const indices = [];
        const numPerCross = 10;
        const profileOffsets = [
            { r: +1.00, uFrac: 0.05 },
            { r: +1.08, uFrac: 0.40 },
            { r: +0.85, uFrac: 0.88 },
            { r: +0.45, uFrac: 0.98 },
            { r:  0.00, uFrac: 1.00 },
            { r: -0.45, uFrac: 0.98 },
            { r: -0.85, uFrac: 0.88 },
            { r: -1.08, uFrac: 0.40 },
            { r: -1.00, uFrac: 0.05 },
            { r:  0.00, uFrac: 0.00 }
        ];

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

            const rootTaper = (i === 0) ? 0.35 : ((i === 1) ? 0.70 : 1.0);
            const isLast = (i === numPts - 1);
            const tipTaper = isLast ? 0.25 : ((i === numPts - 2) ? 0.65 : 1.0);
            const effHalfThick = halfThick * rootTaper * tipTaper;

            for (let p = 0; p < numPerCross; p++) {
                const po = profileOffsets[p];
                const latDist = effHalfThick * po.r;
                const vertDist = h * po.uFrac;
                positions.push(bx + rX * latDist + u.x * vertDist, by + rY * latDist + u.y * vertDist, bz + rZ * latDist + u.z * vertDist);
            }
        }

        for (let i = 0; i < numPts - 1; i++) {
            const r0 = i * numPerCross;
            const r1 = (i + 1) * numPerCross;
            for (let p = 0; p < numPerCross; p++) {
                const nextP = (p + 1) % numPerCross;
                indices.push(r0 + p, r1 + p, r1 + nextP);
                indices.push(r0 + p, r1 + nextP, r0 + nextP);
            }
        }
        for (let p = 1; p < numPerCross - 1; p++) indices.push(0, p + 1, p);
        const lastBase = (numPts - 1) * numPerCross;
        for (let p = 1; p < numPerCross - 1; p++) indices.push(lastBase, lastBase + p, lastBase + p + 1);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        let group = window.branchingWallGroup;
        if (!group) {
            group = new THREE.Group();
            group.name = 'branchingWallGroup';
            window.threeScene.add(group);
            window.branchingWallGroup = group;
        }
        while (group.children.length > 0) group.remove(group.children[0]);

        // Wall material matching the aesthetic
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0xe8e8e8,
            roughness: 0.75,
            metalness: 0.05,
            side: THREE.DoubleSide
        });

        const wallMesh = new THREE.Mesh(geom, wallMat);
        wallMesh.name = 'PrimaryArchitecturalWall';
        group.add(wallMesh);

        // DEBUG MARKER AT branchSource (Requirement 3)
        const markerGeom = new THREE.SphereGeometry(0.35, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); // bright gold
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.position.copy(P0);
        marker.name = 'DebugSourceMarker';
        group.add(marker);

        // Direction indicators: Tangent (green), Normal (blue)
        const arrowTangent = new THREE.ArrowHelper(T0, P0, 3.5, 0x00ff88, 0.8, 0.4);
        arrowTangent.name = 'DebugTangentArrow';
        group.add(arrowTangent);

        const arrowNormal = new THREE.ArrowHelper(N0, P0, 2.5, 0x3388ff, 0.6, 0.3);
        arrowNormal.name = 'DebugNormalArrow';
        group.add(arrowNormal);

        return JSON.stringify({
            p0: { x: +P0.x.toFixed(2), y: +P0.y.toFixed(2), z: +P0.z.toFixed(2) },
            t0: { x: +T0.x.toFixed(2), y: +T0.y.toFixed(2), z: +T0.z.toFixed(2) },
            n0: { x: +N0.x.toFixed(2), y: +N0.y.toFixed(2), z: +N0.z.toFixed(2) },
            wallVerts: geom.attributes.position.count,
            wallLength: totalLen,
            hasMarker: true
        });
    })()
"@
    Write-Output "PROTOTYPE RESULT: $res"

    $artifactDir = "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84"

    # Angle 1: Perspective (Default)
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $shot1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("$artifactDir\terrace_wall_persp.png", [Convert]::FromBase64String($j1.result.data))

    # Angle 2: Close-up on the connection zone
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(12, 10, 12);
            window.threeControls.target.set(4.0, 6.0, 0.0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $shot2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("$artifactDir\terrace_wall_connection.png", [Convert]::FromBase64String($j2.result.data))

    Write-Output "Saved terrace screenshots!"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
