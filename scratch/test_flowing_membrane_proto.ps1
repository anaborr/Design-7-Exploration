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

    # Build Prototype Flowing Membrane Wall & Alcove Partition
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

        /**
         * FLOWING MEMBRANE WALL GENERATOR
         * Generates a broad, double-curved architectural partition volume with:
         * - Broad base along terrace surface (not a tube point!)
         * - Lofted upper crest reaching and connecting to the roof cantilever
         * - Double-curved Gaudí camber (entasis)
         * - Solid architectural thickness with rounded bullnose edges
         * - Carved portal openings for circulation and view framing
         */
        function generateFlowingMembraneMesh(baseCurve, topCurve, opts) {
            const numU = opts.numU || 40; // along length
            const numV = opts.numV || 16; // across height
            const thickness = opts.thickness || 0.85; // ft (10 inches)
            const growthFrac = opts.growthFrac !== undefined ? opts.growthFrac : 1.0;

            if (growthFrac <= 0.02) return null;

            const activeU = Math.max(3, Math.round(numU * growthFrac));
            const positions = [];
            const indices = [];

            // Grid of midline points, normals, and thicknesses
            const midGrid = [];
            const normGrid = [];

            for (let i = 0; i <= activeU; i++) {
                const u = (i / numU); // parameter along spine
                const uActive = i / activeU;
                
                const pBase = baseCurve.getPoint(Math.min(1.0, u));
                const pTop = topCurve.getPoint(Math.min(1.0, u));

                // Longitudinal tangent along base
                const du = 0.01;
                const pBaseNext = baseCurve.getPoint(Math.min(1.0, u + du));
                const pBasePrev = baseCurve.getPoint(Math.max(0.0, u - du));
                const tanBase = pBaseNext.clone().sub(pBasePrev).normalize();

                // Vector from base to top
                const spanVec = pTop.clone().sub(pBase);
                const spanHeight = spanVec.length();
                const dirUp = spanVec.clone().normalize();

                // Lateral normal vector = tanBase x dirUp
                const latNorm = new THREE.Vector3().crossVectors(tanBase, dirUp).normalize();

                // Double curvature camber (Art Nouveau whiplash S-curve fold)
                const foldCamber = opts.camberAmp || 1.8;
                const camberU = Math.sin(uActive * Math.PI) * foldCamber;

                const midRow = [];
                const normRow = [];

                for (let j = 0; j <= numV; j++) {
                    const v = j / numV; // 0 at base, 1 at top

                    // Gaudí parabolic catenary belly in middle height
                    const camberV = Math.sin(v * Math.PI);
                    const lateralDisp = latNorm.clone().multiplyScalar(camberU * camberV);

                    // Interpolate between base and top
                    let pt = pBase.clone().lerp(pTop, v).add(lateralDisp);

                    // Optional portal arch cutout (carving opening through membrane)
                    if (opts.hasPortal && uActive > 0.25 && uActive < 0.65) {
                        const portalU = (uActive - 0.25) / 0.40;
                        const portalArch = Math.sin(portalU * Math.PI);
                        // Raise bottom of wall in portal zone to create walkthrough arch!
                        if (v < 0.55 * portalArch) {
                            const archRaise = (0.55 * portalArch - v) * (spanHeight * 0.7);
                            pt.add(dirUp.clone().multiplyScalar(archRaise));
                        }
                    }

                    midRow.push(pt);

                    // Approximate surface normal (lateral direction + slight vertical tilt)
                    const n = latNorm.clone().add(dirUp.clone().multiplyScalar(-camberU * Math.cos(v * Math.PI) * 0.15)).normalize();
                    normRow.push(n);
                }

                midGrid.push(midRow);
                normGrid.push(normRow);
            }

            // Generate Front Face and Back Face of the solid membrane wall
            // Vertex index tracking:
            // Front face vertices: 0 to (activeU + 1)*(numV + 1) - 1
            // Back face vertices: offset by N_grid
            const N_grid = (activeU + 1) * (numV + 1);

            // 1. Front face (+ thickness/2)
            for (let i = 0; i <= activeU; i++) {
                const uActive = i / activeU;
                // Root flare to blend seamlessly into parent surface
                let thickMult = 1.0;
                if (uActive < 0.15) {
                    const w = uActive / 0.15;
                    thickMult = 2.2 * (1 - w) + 1.0 * w; // Flared root footprint
                } else if (uActive > 0.85) {
                    const w = (uActive - 0.85) / 0.15;
                    thickMult = 1.0 * (1 - w) + 0.3 * w; // Tapered prow
                }
                const curThick = thickness * thickMult;

                for (let j = 0; j <= numV; j++) {
                    const pt = midGrid[i][j];
                    const n = normGrid[i][j];
                    const pFront = pt.clone().add(n.clone().multiplyScalar(curThick / 2.0));
                    positions.push(pFront.x, pFront.y, pFront.z);
                }
            }

            // 2. Back face (- thickness/2)
            for (let i = 0; i <= activeU; i++) {
                const uActive = i / activeU;
                let thickMult = 1.0;
                if (uActive < 0.15) {
                    const w = uActive / 0.15;
                    thickMult = 2.2 * (1 - w) + 1.0 * w;
                } else if (uActive > 0.85) {
                    const w = (uActive - 0.85) / 0.15;
                    thickMult = 1.0 * (1 - w) + 0.3 * w;
                }
                const curThick = thickness * thickMult;

                for (let j = 0; j <= numV; j++) {
                    const pt = midGrid[i][j];
                    const n = normGrid[i][j];
                    const pBack = pt.clone().sub(n.clone().multiplyScalar(curThick / 2.0));
                    positions.push(pBack.x, pBack.y, pBack.z);
                }
            }

            const stride = numV + 1;

            // Front face quads
            for (let i = 0; i < activeU; i++) {
                for (let j = 0; j < numV; j++) {
                    const v0 = i * stride + j;
                    const v1 = (i + 1) * stride + j;
                    const v2 = (i + 1) * stride + (j + 1);
                    const v3 = i * stride + (j + 1);

                    indices.push(v0, v1, v2);
                    indices.push(v0, v2, v3);
                }
            }

            // Back face quads (reversed winding)
            for (let i = 0; i < activeU; i++) {
                for (let j = 0; j < numV; j++) {
                    const v0 = N_grid + i * stride + j;
                    const v1 = N_grid + (i + 1) * stride + j;
                    const v2 = N_grid + (i + 1) * stride + (j + 1);
                    const v3 = N_grid + i * stride + (j + 1);

                    indices.push(v0, v2, v1);
                    indices.push(v0, v3, v2);
                }
            }

            // Bottom edge rim (connecting front and back at j = 0)
            for (let i = 0; i < activeU; i++) {
                const f0 = i * stride;
                const f1 = (i + 1) * stride;
                const b0 = N_grid + i * stride;
                const b1 = N_grid + (i + 1) * stride;

                indices.push(f0, b0, b1);
                indices.push(f0, b1, f1);
            }

            // Top edge rim (connecting front and back at j = numV)
            for (let i = 0; i < activeU; i++) {
                const f0 = i * stride + numV;
                const f1 = (i + 1) * stride + numV;
                const b0 = N_grid + i * stride + numV;
                const b1 = N_grid + (i + 1) * stride + numV;

                indices.push(f0, f1, b1);
                indices.push(f0, b1, b0);
            }

            // End prow rim (connecting front and back at i = activeU)
            for (let j = 0; j < numV; j++) {
                const f0 = activeU * stride + j;
                const f1 = activeU * stride + (j + 1);
                const b0 = N_grid + activeU * stride + j;
                const b1 = N_grid + activeU * stride + (j + 1);

                indices.push(f0, f1, b1);
                indices.push(f0, b1, b0);
            }

            // Root boundary rim (connecting front and back at i = 0)
            for (let j = 0; j < numV; j++) {
                const f0 = j;
                const f1 = j + 1;
                const b0 = N_grid + j;
                const b1 = N_grid + j + 1;

                indices.push(f0, b1, f1);
                indices.push(f0, b0, b1);
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setIndex(indices);
            geom.computeVertexNormals();
            return geom;
        }

        // --- SPATIAL FRAMEWORK: PRIMARY FLOWING MEMBRANE WALL + SECONDARY ALCOVE FOLD ---
        const g = 0.85; // 85% High Branching test

        // 1. PRIMARY FLOWING WALL MEMBRANE:
        // Broad base along the terrace edge, lofting smoothly up into the roof cantilever,
        // with a carved catenary portal opening for circulation
        const baseA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(3.54, 6.14, -0.60), // Wide terrace root
            new THREE.Vector3(3.20, 6.14,  1.20), // Sweeping along terrace edge
            new THREE.Vector3(1.20, 6.14,  2.80), // Turning across the deck
            new THREE.Vector3(-1.80, 6.14,  3.20), // Framing terrace edge
            new THREE.Vector3(-4.50, 6.14,  2.00)  // Terminating into landscape wing
        ]);

        const topA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(3.80,  8.50, -0.20), // Rising from parent terrace flank
            new THREE.Vector3(2.50, 10.80,  1.60), // Arching toward cantilever roof
            new THREE.Vector3(0.00, 11.50,  2.40), // Merging into roof cantilever soffit
            new THREE.Vector3(-2.80, 11.40,  2.20), // Continuous roof plate weld
            new THREE.Vector3(-5.20,  9.50,  1.00)  // Sloping canopy wing
        ]);

        const geomPrimaryWall = generateFlowingMembraneMesh(baseA, topA, {
            numU: 36,
            numV: 14,
            thickness: 0.90, // ft (11 inches)
            camberAmp: 2.2,  // Gaudí parabolic fold
            hasPortal: true,  // Carved portal opening for circulation!
            growthFrac: Math.min(1.0, g * 1.15)
        });

        // 2. SECONDARY FOLDING MEMBRANE: TERRACE ALCOVE & SEATING POCKET
        // Emerges from the primary wall at medium-high branching, curving inward
        // to define a semi-enclosed spatial pocket / alcove room
        const baseB = new THREE.CatmullRomCurve3([
            new THREE.Vector3(2.80, 6.14, 1.00),  // Bifurcating from terrace deck
            new THREE.Vector3(1.20, 6.14, -0.80), // Folding inward into terrace
            new THREE.Vector3(-0.60, 6.14, -2.20), // Forming intimate alcove boundary
            new THREE.Vector3(-2.50, 6.14, -2.80)  // Encircling seating pocket
        ]);

        const topB = new THREE.CatmullRomCurve3([
            new THREE.Vector3(2.80, 7.80, 1.00),  // Mid-height fold origin
            new THREE.Vector3(1.00, 8.60, -0.60), // Vaulting over alcove
            new THREE.Vector3(-0.80, 8.80, -1.80), // Canopy roof over alcove pocket
            new THREE.Vector3(-2.80, 7.50, -2.40)  // Gently tapering balustrade wing
        ]);

        const geomAlcoveWall = generateFlowingMembraneMesh(baseB, topB, {
            numU: 28,
            numV: 12,
            thickness: 0.75, // ft (9 inches)
            camberAmp: -1.6, // Folds in opposite direction to create spatial pocket!
            hasPortal: false,
            growthFrac: Math.min(1.0, Math.max(0.0, (g - 0.25) * 1.35))
        });

        // Combine both broad membrane surfaces into unified monolithic architectural mesh
        const geometries = [geomPrimaryWall, geomAlcoveWall].filter(Boolean);
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

        // Inherit exact monolithic material from seed mesh
        const mat = seedMesh.material ? seedMesh.material.clone() : new THREE.MeshStandardMaterial({
            color: 0xdcdcdc,
            roughness: 0.82,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const wallMesh = new THREE.Mesh(unifiedGeom, mat);
        wallMesh.name = 'OrganicFlowingMembraneArchitecture';
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        group.add(wallMesh);

        return {
            success: true,
            totalVerts,
            totalTriangles: mergedIdx.length / 3,
            membranesCount: geometries.length
        };
    })()
'@

    $rTest = Eval-JS $jsCode
    Write-Output "Membrane Proto Result: $rTest"

    # Capture 3 camera angles for review
    # 1. Perspective View showing flowing wall dividing space and framing opening
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
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\membrane_proto_persp.png", $bytes1)
    Write-Output "Saved membrane_proto_persp.png"

    # 2. View through Portal Corridor
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(-6, 8.5, 22);
            window.threeControls.target.set(0.0, 7.5, 0.0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes2 = [Convert]::FromBase64String(($shot2 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\membrane_proto_portal.png", $bytes2)
    Write-Output "Saved membrane_proto_portal.png"

    # 3. Close-up on the Alcove Pocket Room & Transition
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set(10, 11, 10);
            window.threeControls.target.set(2.0, 7.0, 0.0);
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot3 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes3 = [Convert]::FromBase64String(($shot3 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\membrane_proto_alcove.png", $bytes3)
    Write-Output "Saved membrane_proto_alcove.png"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
