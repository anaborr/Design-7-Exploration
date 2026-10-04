$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9289
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

    function Capture-Screenshot($path) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = "png" }
        $json = $r | ConvertFrom-Json
        $bytes = [System.Convert]::FromBase64String($json.result.data)
        [System.IO.File]::WriteAllBytes($path, $bytes)
        Write-Output "Screenshot saved to $path"
    }

    Start-Sleep -Seconds 2
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    # Disable wireframe cage for clean architectural view
    Eval-JS @"
    (() => {
        // Find cage toggle and uncheck if active
        if (window.wireframeCage) window.wireframeCage.visible = false;
        if (window.cageLinesGroup) window.cageLinesGroup.visible = false;
        const cageBtn = Array.from(document.querySelectorAll('button, label')).find(el => el.textContent.includes('Cage'));
        // Make sure SubD mesh is visible and clean
        if (window.originalMeshes && window.originalMeshes[0]) {
            const m = window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh;
            if (m) m.visible = true;
        }
    })()
"@ | Out-Null

    # Inject and generate true continuous organic architecture on seed
    $jsTest = @'
    (() => {
        const group = window.branchingWallGroup;
        while(group.children.length > 0) {
            const c = group.children[0];
            group.remove(c);
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
        }

        // Helper to generate seamless double-curved membrane with rounded bullnose edges
        function buildMembrane(baseCurve, topCurve, opts) {
            const numU = opts.numU || 48;
            const numV = opts.numV || 20;
            const thickness = opts.thickness || 0.70; // ~8.5 inches
            const growthFrac = opts.growthFrac !== undefined ? opts.growthFrac : 1.0;
            if (growthFrac <= 0.02) return null;

            const activeU = Math.max(4, Math.round(numU * growthFrac));
            const midGrid = [];
            const normGrid = [];
            const thickGrid = [];

            for (let i = 0; i <= activeU; i++) {
                const u = i / numU;
                const uActive = i / activeU;

                const pB = baseCurve.getPoint(Math.min(1.0, u));
                const pT = topCurve.getPoint(Math.min(1.0, u));

                // Longitudinal tangent along base
                const du = 0.01;
                const pBNext = baseCurve.getPoint(Math.min(1.0, u + du));
                const pBPrev = baseCurve.getPoint(Math.max(0.0, u - du));
                const tanB = pBNext.clone().sub(pBPrev).normalize();

                const span = pT.clone().sub(pB);
                const h = span.length();
                const dirUp = span.clone().normalize();
                const latNorm = new THREE.Vector3().crossVectors(tanB, dirUp).normalize();

                // Double-curved camber: Art Nouveau whiplash S-wave
                const foldCamber = opts.camberAmp || 1.2;
                const camberU = Math.sin(uActive * Math.PI) * foldCamber;

                const midRow = [];
                const normRow = [];
                const thickRow = [];

                // Thickness modulation:
                // Wide root flare at i=0 to merge seamlessly into seed flank
                // Tapered aerodynamic prow at end
                let tMult = 1.0;
                if (uActive < 0.20) {
                    const w = uActive / 0.20;
                    tMult = 2.5 * (1.0 - w) + 1.0 * w; // Flared buttress root
                } else if (uActive > 0.80) {
                    const w = (uActive - 0.80) / 0.20;
                    tMult = 1.0 * (1.0 - w) + 0.20 * w; // Graceful rounded prow
                }

                for (let j = 0; j <= numV; j++) {
                    const v = j / numV; // 0 = base, 1 = top
                    const camberV = Math.sin(v * Math.PI);
                    const disp = latNorm.clone().multiplyScalar(camberU * camberV);

                    // Interpolate point
                    let pt = pB.clone().lerp(pT, v).add(disp);

                    // Flared base and top fillets (melt directly into floor and ceiling!)
                    let localThick = thickness * tMult;
                    if (v < 0.22) {
                        const wBase = (0.22 - v) / 0.22;
                        localThick += thickness * 1.4 * wBase * wBase; // Flared floor fillet
                    }
                    if (v > 0.78) {
                        const wTop = (v - 0.78) / 0.22;
                        localThick += thickness * 1.2 * wTop * wTop; // Flared ceiling fillet
                    }

                    // Sculpted catenary portal arch (walkthrough opening)
                    if (opts.hasPortal && uActive > 0.28 && uActive < 0.68) {
                        const pU = (uActive - 0.28) / 0.40;
                        const archCatenary = Math.sin(pU * Math.PI);
                        if (v < 0.62 * archCatenary) {
                            const raiseAmt = (0.62 * archCatenary - v) * (h * 0.78);
                            pt.add(dirUp.clone().multiplyScalar(raiseAmt));
                        }
                    }

                    midRow.push(pt);
                    normRow.push(latNorm.clone().normalize());
                    thickRow.push(localThick);
                }
                midGrid.push(midRow);
                normGrid.push(normRow);
                thickGrid.push(thickRow);
            }

            const positions = [];
            const indices = [];
            const N_grid = (activeU + 1) * (numV + 1);

            // Front face (+ localThick/2)
            for (let i = 0; i <= activeU; i++) {
                for (let j = 0; j <= numV; j++) {
                    const p = midGrid[i][j];
                    const n = normGrid[i][j];
                    const th = thickGrid[i][j];
                    const pF = p.clone().add(n.clone().multiplyScalar(th * 0.5));
                    positions.push(pF.x, pF.y, pF.z);
                }
            }

            // Back face (- localThick/2)
            for (let i = 0; i <= activeU; i++) {
                for (let j = 0; j <= numV; j++) {
                    const p = midGrid[i][j];
                    const n = normGrid[i][j];
                    const th = thickGrid[i][j];
                    const pB = p.clone().sub(n.clone().multiplyScalar(th * 0.5));
                    positions.push(pB.x, pB.y, pB.z);
                }
            }

            const stride = numV + 1;
            // Front quads
            for (let i = 0; i < activeU; i++) {
                for (let j = 0; j < numV; j++) {
                    const v0 = i * stride + j;
                    const v1 = (i + 1) * stride + j;
                    const v2 = (i + 1) * stride + (j + 1);
                    const v3 = i * stride + (j + 1);
                    indices.push(v0, v1, v2, v0, v2, v3);
                }
            }
            // Back quads
            for (let i = 0; i < activeU; i++) {
                for (let j = 0; j < numV; j++) {
                    const v0 = N_grid + i * stride + j;
                    const v1 = N_grid + (i + 1) * stride + j;
                    const v2 = N_grid + (i + 1) * stride + (j + 1);
                    const v3 = N_grid + i * stride + (j + 1);
                    indices.push(v0, v2, v1, v0, v3, v2);
                }
            }
            // Bottom rim
            for (let i = 0; i < activeU; i++) {
                const f0 = i * stride, f1 = (i + 1) * stride;
                const b0 = N_grid + i * stride, b1 = N_grid + (i + 1) * stride;
                indices.push(f0, b0, b1, f0, b1, f1);
            }
            // Top rim
            for (let i = 0; i < activeU; i++) {
                const f0 = i * stride + numV, f1 = (i + 1) * stride + numV;
                const b0 = N_grid + i * stride + numV, b1 = N_grid + (i + 1) * stride + numV;
                indices.push(f0, f1, b1, f0, b1, b0);
            }
            // End prow rim
            for (let j = 0; j < numV; j++) {
                const f0 = activeU * stride + j, f1 = activeU * stride + (j + 1);
                const b0 = N_grid + activeU * stride + j, b1 = N_grid + activeU * stride + (j + 1);
                indices.push(f0, f1, b1, f0, b1, b0);
            }
            // Root rim
            for (let j = 0; j < numV; j++) {
                const f0 = j, f1 = j + 1;
                const b0 = N_grid + j, b1 = N_grid + j + 1;
                indices.push(f0, b1, f1, f0, b0, b1);
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geom.setIndex(indices);
            geom.computeVertexNormals();
            return geom;
        }

        // 1. PRIMARY FLOWING PARTITION WALL (Terrace Boundary & Portal Walkthrough)
        // Base curves along true terrace floor (y=5.8 to 6.6, z=0.25 to -0.4)
        // Top curves along true ceiling soffit (y=9.8 to 10.9, z=0.28 to -0.3)
        const baseA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(3.54, 5.78, 0.27),  // Seamless emergence from rear column flank
            new THREE.Vector3(2.10, 6.45, 0.25),  // Following outer terrace rim
            new THREE.Vector3(0.00, 6.63, 0.15),  // Mid-terrace threshold
            new THREE.Vector3(-2.30, 6.63, -0.10), // Sheltering outer deck
            new THREE.Vector3(-4.80, 6.63, 0.20)   // Gracefully merging back into cantilever nose
        ]);

        const topA = new THREE.CatmullRomCurve3([
            new THREE.Vector3(3.54, 9.81, 0.35),   // Merging into column shoulder
            new THREE.Vector3(2.00, 10.77, 0.36),  // Vaulting along cantilever ceiling
            new THREE.Vector3(0.00, 10.91, 0.25),  // Apex of catenary vault
            new THREE.Vector3(-2.30, 10.92, 0.15), // Flowing along soffit plate
            new THREE.Vector3(-4.80, 10.92, 0.25)  // Reconnecting to cantilever prow
        ]);

        const geom1 = buildMembrane(baseA, topA, {
            numU: 52,
            numV: 24,
            thickness: 0.72,
            camberAmp: 1.15,
            hasPortal: true,
            growthFrac: 1.0
        });

        // 2. SECONDARY BIFURCATING FOLD: INTERIOR TERRACE ALCOVE & SEATING POCKET
        // Branches off into the interior terrace deck (z from 0.0 down to -2.8)
        const baseB = new THREE.CatmullRomCurve3([
            new THREE.Vector3(1.80, 6.45, 0.15),   // Bifurcating from primary wall
            new THREE.Vector3(0.60, 6.80, -1.20),  // Curving inward into deck interior
            new THREE.Vector3(-0.90, 7.00, -2.20), // Enclosing intimate circular alcove
            new THREE.Vector3(-2.60, 6.90, -2.40), // Cradling seating pocket
            new THREE.Vector3(-3.80, 6.70, -1.20)  // Reconnecting back to outer floor
        ]);

        const topB = new THREE.CatmullRomCurve3([
            new THREE.Vector3(1.80, 10.50, 0.20),
            new THREE.Vector3(0.60, 10.20, -1.00),
            new THREE.Vector3(-0.90, 9.80, -1.80),
            new THREE.Vector3(-2.60, 9.90, -2.00),
            new THREE.Vector3(-3.80, 10.40, -1.00)
        ]);

        const geom2 = buildMembrane(baseB, topB, {
            numU: 44,
            numV: 20,
            thickness: 0.58,
            camberAmp: -1.35, // Opposite fold to sculpt alcove pocket
            hasPortal: true,  // Framed viewing window through alcove wall
            growthFrac: 1.0
        });

        // Merge both architectural membranes
        const totalV = geom1.attributes.position.count + geom2.attributes.position.count;
        const totalI = geom1.index.count + geom2.index.count;
        const mPos = new Float32Array(totalV * 3);
        const mNorm = new Float32Array(totalV * 3);
        const mIdx = [];

        mPos.set(geom1.attributes.position.array, 0);
        mNorm.set(geom1.attributes.normal.array, 0);
        for(let i=0; i<geom1.index.array.length; i++) mIdx.push(geom1.index.array[i]);

        const offset = geom1.attributes.position.count;
        mPos.set(geom2.attributes.position.array, offset * 3);
        mNorm.set(geom2.attributes.normal.array, offset * 3);
        for(let i=0; i<geom2.index.array.length; i++) mIdx.push(geom2.index.array[i] + offset);

        const unified = new THREE.BufferGeometry();
        unified.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
        unified.setAttribute('normal', new THREE.BufferAttribute(mNorm, 3));
        unified.setIndex(mIdx);

        // Exact seed material
        const seedMat = window.originalMeshes[0].mesh.material;
        const archMesh = new THREE.Mesh(unified, seedMat.clone());
        archMesh.name = 'OrganicFlowingMembraneArchitecture';
        archMesh.castShadow = true;
        archMesh.receiveShadow = true;
        group.add(archMesh);

        return { success: true, triangles: mIdx.length / 3 };
    })()
'@

    $evalRes = Eval-JS $jsTest
    Write-Output "Generation result:"
    Write-Output $evalRes

    # View 1: Perspective wide angle
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(-7, 13, 16);
        window.threeControls.target.set(-0.5, 8.5, -0.5);
        window.threeControls.update();
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\new_membrane_persp.png"

    # View 2: Through the catenary portal (Circulation view)
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(4, 9, 7);
        window.threeControls.target.set(-1, 8.5, 0);
        window.threeControls.update();
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\new_membrane_portal.png"

    # View 3: Inside the alcove pocket room
    Eval-JS @"
    (() => {
        window.threeCamera.position.set(-6, 10, -5);
        window.threeControls.target.set(-0.5, 8, -1);
        window.threeControls.update();
    })()
"@ | Out-Null
    Start-Sleep -Milliseconds 600
    Capture-Screenshot "C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\new_membrane_alcove.png"

} finally {
    $proc.Kill()
}
