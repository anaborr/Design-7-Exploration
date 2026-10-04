$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9277
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

    # Build prototype: Single primary wall grown from exact edge of Rhino geometry with debug marker
    $res = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;

        // Find actual edge vertex on the side waist edge of the Rhino model
        // At x ~ 7.3, y ~ 8.1, z ~ 0.23 (ridge edge)
        let bestIdx = -1, bestDist = Infinity;
        for (let i = 0; i < pos.length; i += 3) {
            let x = pos[i], y = pos[i+1], z = pos[i+2];
            let d = Math.hypot(x - 7.3, y - 8.1, z - 0.23);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        const p0 = new THREE.Vector3(pos[bestIdx], pos[bestIdx+1], pos[bestIdx+2]);
        const n0 = new THREE.Vector3(norm[bestIdx], norm[bestIdx+1], norm[bestIdx+2]).normalize();

        // Local tangent along the edge continuation into the room
        // Edge runs forward along +X with a gentle sweep into +Z and descent in -Y
        let t0 = new THREE.Vector3(0.85, -0.30, 0.42);
        // Orthogonalize with normal
        t0.sub(n0.clone().multiplyScalar(t0.dot(n0))).normalize();

        const branchSource = {
            position: p0,
            normal: n0,
            tangent: t0,
            parentObject: mesh
        };

        // Construct ONLY ONE PRIMARY WALL via smooth cubic Bezier spine
        // P0 = exact branchSource position
        // P1 = branchSource position + source tangent * transition distance (strictly follows parent direction!)
        // P2 = intermediate control point continuing the curve
        // P3 = destination point
        const transDist = 4.5; // 4.5 ft transition
        const wallLength = 16.0; // 16 ft
        const wallHeight = 12.0; // 12 ft
        const wallThickness = 8.0 / 12.0; // 8 in = 0.67 ft

        const P0 = branchSource.position.clone();
        const P1 = P0.clone().add(branchSource.tangent.clone().multiplyScalar(transDist));
        
        // P2 continues forward with whiplash curvature
        const latVec = new THREE.Vector3(-t0.z, 0, t0.x).normalize();
        const P2 = P1.clone().add(branchSource.tangent.clone().multiplyScalar(transDist * 1.2)).add(latVec.clone().multiplyScalar(3.0));
        P2.y = 0; // grounded

        // P3 terminal end of wall
        const P3 = P1.clone().add(branchSource.tangent.clone().multiplyScalar(wallLength - transDist)).add(latVec.clone().multiplyScalar(1.5));
        P3.y = 0; // grounded

        const curve = new THREE.CubicBezierCurve3(P0, P1, P2, P3);

        const numSamples = 60;
        const crossSections = [];
        const embedOffset = 0.5; // embedded inside surface to guarantee 0-gap connection

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            const s = t * wallLength;
            const pt = curve.getPoint(t);
            const tan = curve.getTangent(t).normalize();

            let baseY = 0;
            let curHeight = wallHeight;
            let upVec = new THREE.Vector3(0, 1, 0);

            if (s <= transDist) {
                // Transition zone: smooth C2 blend from parent normal to vertical +Y, and parent Y to floor 0
                const u = s / transDist;
                const w = u * u * u * (u * (u * 6 - 15) + 10);

                baseY = P0.y * (1.0 - w);
                upVec = n0.clone().multiplyScalar(1.0 - w).add(new THREE.Vector3(0, 1, 0).multiplyScalar(w)).normalize();

                const hRoot = wallThickness * 0.4;
                const topY = (P0.y + hRoot) * (1.0 - w) + wallHeight * w;
                curHeight = Math.max(wallThickness * 0.6, topY - baseY);
            } else {
                baseY = 0;
                upVec = new THREE.Vector3(0, 1, 0);
                const uWall = (s - transDist) / (wallLength - transDist);
                const whiplashCrest = Math.sin(uWall * Math.PI * 1.5) * 0.7 - Math.sin(uWall * Math.PI * 0.5) * 0.35;
                let termTaper = 1.0;
                if (uWall > 0.8) {
                    const v = (uWall - 0.8) / 0.2;
                    termTaper = 1.0 - (3 * v * v - 2 * v * v * v) * 0.35;
                }
                curHeight = (wallHeight + whiplashCrest) * termTaper;
            }

            let thickMult = 1.0;
            if (s <= transDist) {
                const u = s / transDist;
                thickMult = 1.45 - 0.45 * (3 * u * u - 2 * u * u * u);
            } else {
                const uWall = (s - transDist) / (wallLength - transDist);
                thickMult = 1.0 + 0.15 * Math.sin(uWall * Math.PI) - (uWall > 0.75 ? 0.35 * (uWall - 0.75) / 0.25 : 0);
            }

            crossSections.push({
                base: { x: pt.x, y: baseY, z: pt.z },
                up: { x: upVec.x, y: upVec.y, z: upVec.z },
                height: curHeight,
                thickness: wallThickness * thickMult,
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
        // Spherical marker at source point
        const markerGeom = new THREE.SphereGeometry(0.35, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); // bright gold
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.position.copy(p0);
        marker.name = 'DebugSourceMarker';
        group.add(marker);

        // Direction indicators: Tangent (green/cyan), Normal (blue/magenta)
        const arrowTangent = new THREE.ArrowHelper(t0, p0, 3.5, 0x00ff88, 0.8, 0.4);
        arrowTangent.name = 'DebugTangentArrow';
        group.add(arrowTangent);

        const arrowNormal = new THREE.ArrowHelper(n0, p0, 2.5, 0x3388ff, 0.6, 0.3);
        arrowNormal.name = 'DebugNormalArrow';
        group.add(arrowNormal);

        return JSON.stringify({
            p0: { x: +p0.x.toFixed(2), y: +p0.y.toFixed(2), z: +p0.z.toFixed(2) },
            t0: { x: +t0.x.toFixed(2), y: +t0.y.toFixed(2), z: +t0.z.toFixed(2) },
            n0: { x: +n0.x.toFixed(2), y: +n0.y.toFixed(2), z: +n0.z.toFixed(2) },
            wallVerts: geom.attributes.position.count,
            wallLength: wallLength,
            hasMarker: true
        });
    })()
"@
    Write-Output "PROTOTYPE RESULT: $res"

    $artifactDir = "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84"

    # Angle 1: Perspective (Default)
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j1 = $shot1 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("$artifactDir\proto_single_wall_persp.png", [Convert]::FromBase64String($j1.result.data))

    # Angle 2: Close-up on the connection zone
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(18, 14, 18);
            window.threeControls.target.set(7.5, 8.0, 0.2);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
    $j2 = $shot2 | ConvertFrom-Json
    [System.IO.File]::WriteAllBytes("$artifactDir\proto_single_wall_connection.png", [Convert]::FromBase64String($j2.result.data))

    Write-Output "Saved perspective and connection close-up screenshots!"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
