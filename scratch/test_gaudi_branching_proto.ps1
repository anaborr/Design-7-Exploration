$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9285
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

    # Build Prototype Gaudi Organic Spatial Framework
    $jsCode = @'
    (() => {
        const seedMesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!seedMesh) return { error: 'no seed mesh' };
        
        const group = window.branchingWallGroup;
        while(group.children.length > 0) {
            const c = group.children[0];
            group.remove(c);
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        }

        // Gaudi Organic Rib Profile Generator (14-point asymmetric teardrop / catenary rib)
        function createRibProfileOffsets() {
            return [
                { x:  0.00, y:  1.00 }, // acute top crest / ridge
                { x:  0.35, y:  0.88 }, // upper flank camber
                { x:  0.65, y:  0.62 }, // mid flank
                { x:  0.90, y:  0.25 }, // lower flank flare
                { x:  1.05, y: -0.15 }, // outer cove
                { x:  0.85, y: -0.55 }, // bottom corner
                { x:  0.45, y: -0.85 }, // lower belly
                { x:  0.00, y: -1.00 }, // bottom keel
                { x: -0.45, y: -0.85 }, // lower belly
                { x: -0.85, y: -0.55 }, // bottom corner
                { x: -1.05, y: -0.15 }, // inner cove
                { x: -0.90, y:  0.25 }, // lower flank flare
                { x: -0.65, y:  0.62 }, // mid flank
                { x: -0.35, y:  0.88 }  // upper flank camber
            ];
        }

        // Generate Mesh for a single organic branch rib along a 3D spline
        function generateOrganicRibMesh(curve, opts) {
            const numSamples = opts.numSamples || 55;
            const profile = createRibProfileOffsets();
            const numPerRing = profile.length;
            const positions = [];
            const indices = [];

            const baseRadius = opts.baseRadius || 0.65; // ft
            const rootFlare = opts.rootFlare || 2.2;
            const tipTaper = opts.reconnect ? 1.5 : (opts.tipTaper || 0.20);
            const growthFrac = opts.growthFrac !== undefined ? opts.growthFrac : 1.0;
            const activeSamples = Math.max(3, Math.round(numSamples * growthFrac));

            for (let i = 0; i <= activeSamples; i++) {
                const u = i / numSamples; // normalized along total curve
                const uActive = i / activeSamples;
                const pt = curve.getPoint(u);

                // Tangent & Frenet-style adaptive orthonormal frame
                const prevPt = curve.getPoint(Math.max(0, u - 0.015));
                const nextPt = curve.getPoint(Math.min(1.0, u + 0.015));
                let tan = nextPt.clone().sub(prevPt).normalize();

                // Up vector smoothly blends with world up / curvature normal
                let upHint = opts.initialUp ? opts.initialUp.clone() : new THREE.Vector3(0, 1, 0);
                if (opts.targetUp && u > 0.5) {
                    const blend = (u - 0.5) / 0.5;
                    upHint.lerp(opts.targetUp, blend * blend);
                }
                // Gram-Schmidt orthogonalization
                let up = upHint.clone().sub(tan.clone().multiplyScalar(tan.dot(upHint))).normalize();
                let right = new THREE.Vector3().crossVectors(tan, up).normalize();

                // Swelling at root & graceful taper along length
                let rScale = 1.0;
                if (uActive < 0.20) {
                    const w = uActive / 0.20;
                    const smoothW = w * w * (3 - 2 * w);
                    rScale = rootFlare * (1 - smoothW) + 1.0 * smoothW;
                } else if (uActive > 0.70) {
                    const w = (uActive - 0.70) / 0.30;
                    const smoothW = w * w * (3 - 2 * w);
                    rScale = 1.0 * (1 - smoothW) + tipTaper * smoothW;
                }

                // Sculptural entasis (subtle organic breathing along the rib body)
                const entasis = 1.0 + 0.08 * Math.sin(uActive * Math.PI * 2.0);
                const curRadius = baseRadius * rScale * entasis;

                for (let p = 0; p < numPerRing; p++) {
                    const po = profile[p];
                    const rx = right.x * (po.x * curRadius) + up.x * (po.y * curRadius * (opts.aspectY || 1.35));
                    const ry = right.y * (po.x * curRadius) + up.y * (po.y * curRadius * (opts.aspectY || 1.35));
                    const rz = right.z * (po.x * curRadius) + up.y * (po.y * curRadius * (opts.aspectY || 1.35));

                    positions.push(pt.x + rx, pt.y + ry, pt.z + rz);
                }
            }

            // Quads connecting rings
            for (let i = 0; i < activeSamples; i++) {
                const r0 = i * numPerRing;
                const r1 = (i + 1) * numPerRing;
                for (let p = 0; p < numPerRing; p++) {
                    const nextP = (p + 1) % numPerRing;
                    indices.push(r0 + p, r1 + p, r1 + nextP);
                    indices.push(r0 + p, r1 + nextP, r0 + nextP);
                }
            }
            // Root cap (sealed embedded)
            for (let p = 1; p < numPerRing - 1; p++) {
                indices.push(0, p + 1, p);
            }
            // Tip cap (smooth rounded prow)
            const lastBase = activeSamples * numPerRing;
            for (let p = 1; p < numPerRing - 1; p++) {
                indices.push(lastBase, lastBase + p, lastBase + p + 1);
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setIndex(indices);
            geom.computeVertexNormals();
            return geom;
        }

        // --- DEFINE SPATIAL GAUDÍ ORGANISM BRANCHES ---
        // Growth complexity fraction (80% slider value)
        const g = 0.80;

        // 1. PRIMARY STRUCTURAL RIB A: The Great Terrace Portal & Vault
        // Swells from Mid-Terrace, curves upward across void, and bridges into Upper Cantilever
        const pA0 = new THREE.Vector3(3.54, 6.14, -0.60); // Mid-terrace edge root
        const pA1 = new THREE.Vector3(5.2, 6.8, 0.4);     // Initial tangential swelling
        const pA2 = new THREE.Vector3(4.5, 9.2, 2.2);     // Upward parabolic vault crest
        const pA3 = new THREE.Vector3(1.0, 11.0, 1.0);    // Reaching across the central void
        const pA4 = new THREE.Vector3(-2.8, 11.5, -1.8);  // Merging into Upper Cantilever soffit
        const curveA = new THREE.CatmullRomCurve3([pA0, pA1, pA2, pA3, pA4]);
        const geomA = generateOrganicRibMesh(curveA, {
            baseRadius: 0.62,
            rootFlare: 2.4,
            reconnect: g > 0.65,
            growthFrac: Math.min(1.0, g * 1.25),
            initialUp: new THREE.Vector3(0.57, 0.82, 0.08),
            targetUp: new THREE.Vector3(0.0, -1.0, 0.0) // blends into roof soffit
        });

        // 2. PRIMARY STRUCTURAL RIB B: Terrace Alcove & Balustrade Ribbon
        // Swells from terrace flank, sweeping around the deck to carve an intimate pocket
        const pB0 = new THREE.Vector3(3.13, 6.35, -0.26);
        const pB1 = new THREE.Vector3(1.5, 6.5, -1.8);
        const pB2 = new THREE.Vector3(-0.5, 7.2, -3.2);
        const pB3 = new THREE.Vector3(-3.2, 7.8, -4.0);
        const curveB = new THREE.CatmullRomCurve3([pB0, pB1, pB2, pB3]);
        const geomB = generateOrganicRibMesh(curveB, {
            baseRadius: 0.52,
            rootFlare: 2.1,
            reconnect: false,
            growthFrac: Math.min(1.0, Math.max(0.0, (g - 0.20) * 1.35)),
            initialUp: new THREE.Vector3(0.47, 0.85, 0.22)
        });

        // 3. SECONDARY BRANCH C: Transverse Flying Rib (Bifurcates from Primary Rib A)
        // Sprouts from Rib A at mid-height, branching across to frame secondary portal
        const pC0 = curveA.getPoint(0.38); // Exact bifurcation node on Rib A
        const pC1 = pC0.clone().add(new THREE.Vector3(-1.8, 0.8, 2.2));
        const pC2 = new THREE.Vector3(0.2, 8.2, 4.5);
        const pC3 = new THREE.Vector3(-2.0, 7.0, 5.0);
        const curveC = new THREE.CatmullRomCurve3([pC0, pC1, pC2, pC3]);
        const geomC = generateOrganicRibMesh(curveC, {
            baseRadius: 0.40,
            rootFlare: 1.8,
            reconnect: false,
            growthFrac: Math.min(1.0, Math.max(0.0, (g - 0.35) * 1.55)),
            initialUp: new THREE.Vector3(0.2, 1.0, 0.3)
        });

        // 4. SECONDARY BRANCH D: Upper Canopy Spandrel
        // Sprouts near the top of Rib A, sweeping along the roof cantilever
        const pD0 = curveA.getPoint(0.72);
        const pD1 = pD0.clone().add(new THREE.Vector3(-2.2, 0.4, 0.8));
        const pD2 = new THREE.Vector3(-6.2, 11.8, -0.5);
        const curveD = new THREE.CatmullRomCurve3([pD0, pD1, pD2]);
        const geomD = generateOrganicRibMesh(curveD, {
            baseRadius: 0.35,
            rootFlare: 1.7,
            reconnect: false,
            growthFrac: Math.min(1.0, Math.max(0.0, (g - 0.55) * 2.0)),
            initialUp: new THREE.Vector3(0.0, 1.0, 0.0)
        });

        // Merge Geometries into one single continuous monolithic architectural mesh!
        const geometries = [geomA, geomB, geomC, geomD];
        // Combine all into single BufferGeometry
        let totalVerts = 0;
        let totalIndices = 0;
        geometries.forEach(g => {
            totalVerts += g.attributes.position.count;
            totalIndices += g.index.count;
        });

        const mergedPos = new Float32Array(totalVerts * 3);
        const mergedNorm = new Float32Array(totalVerts * 3);
        const mergedIdx = [];

        let vOffset = 0;
        geometries.forEach(g => {
            const p = g.attributes.position.array;
            const n = g.attributes.normal.array;
            const idx = g.index.array;
            
            mergedPos.set(p, vOffset * 3);
            mergedNorm.set(n, vOffset * 3);
            for (let i = 0; i < idx.length; i++) {
                mergedIdx.push(idx[i] + vOffset);
            }
            vOffset += g.attributes.position.count;
        });

        const unifiedGeom = new THREE.BufferGeometry();
        unifiedGeom.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
        unifiedGeom.setAttribute('normal', new THREE.BufferAttribute(mergedNorm, 3));
        unifiedGeom.setIndex(mergedIdx);

        // Inherit exact material from seed mesh
        const mat = seedMesh.material ? seedMesh.material.clone() : new THREE.MeshStandardMaterial({
            color: 0xdcdcdc,
            roughness: 0.82,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const unifiedMesh = new THREE.Mesh(unifiedGeom, mat);
        unifiedMesh.name = 'OrganicSpatialBranchingOrganism';
        unifiedMesh.castShadow = true;
        unifiedMesh.receiveShadow = true;
        group.add(unifiedMesh);

        return {
            success: true,
            totalVerts,
            totalTriangles: mergedIdx.length / 3,
            branchCount: geometries.length
        };
    })()
'@

    $rTest = Eval-JS $jsCode
    Write-Output "Gaudi Proto Result: $rTest"

    # Capture 3 Camera Views for inspection
    # 1. Perspective View showing central framed portal and terrace alcove
    Eval-JS @"
    (() => {
        const bCage = document.getElementById('btn-toggle-cage');
        const bCurves = document.getElementById('btn-toggle-curves');
        if (bCage && bCage.classList.contains('active')) bCage.click();
        if (bCurves && bCurves.classList.contains('active')) bCurves.click();
        
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(28, 18, 32);
            window.threeControls.target.set(1.5, 7.5, 0.0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes1 = [Convert]::FromBase64String(($shot1 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\gaudi_proto_persp.png", $bytes1)
    Write-Output "Saved gaudi_proto_persp.png"

    # 2. Close-up View of the Swelling Root & Portal Vault
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(12, 10, 10);
            window.threeControls.target.set(3.5, 7.0, 0.0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes2 = [Convert]::FromBase64String(($shot2 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\gaudi_proto_closeup.png", $bytes2)
    Write-Output "Saved gaudi_proto_closeup.png"

    # 3. View through the Framed Opening / Spatial Corridor
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(-6, 9, 22);
            window.threeControls.target.set(0.0, 8.0, 0.0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot3 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes3 = [Convert]::FromBase64String(($shot3 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\gaudi_proto_portal.png", $bytes3)
    Write-Output "Saved gaudi_proto_portal.png"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
