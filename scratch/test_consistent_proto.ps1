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

    # Run prototype consistent geometry generator
    $jsProto = @'
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        if (!mesh) return { error: 'no seed mesh' };
        
        const group = window.branchingWallGroup;
        while(group.children.length > 0) {
            group.remove(group.children[0]);
        }
        
        const src = window.extractSourceFromRhinoGeometry ? window.extractSourceFromRhinoGeometry('TERRACE') : null;
        if (!src) return { error: 'no source' };
        
        const P0 = src.position.clone();
        const T0 = src.tangent.clone().normalize();
        const N0 = src.normal.clone().normalize();
        
        // Characteristic seed plate dimensions
        const plateThickness = 1.15; // ft (matches seed cantilever thickness ~1.1-1.2 ft)
        const wallHeight = 4.2;      // ft (proportional balustrade/wing height below roof)
        const primaryLength = 16.0;  // ft
        const transLen = 4.5;        // ft transition zone
        
        // Lateral vector
        const latVec = new THREE.Vector3(-T0.z, 0, T0.x).normalize();
        
        // Gentle curvature following the terrace perimeter
        const cp0 = P0.clone();
        const cp1 = P0.clone().add(T0.clone().multiplyScalar(transLen));
        const cp2 = cp1.clone().add(T0.clone().multiplyScalar(5.0)).add(latVec.clone().multiplyScalar(1.5));
        const cp3 = cp1.clone().add(T0.clone().multiplyScalar(primaryLength - transLen)).add(latVec.clone().multiplyScalar(2.2));
        
        const spine = new THREE.CubicBezierCurve3(cp0, cp1, cp2, cp3);
        const numSamples = 60;
        const positions = [];
        const indices = [];
        const numPerRing = 12; // 12-point rounded SubD shell cross section
        
        // Profile offsets matching the seed cantilever rounded bullnose
        const subDProfile = [
            // Inner cove / fillet meeting the terrace floor
            { r: -1.0, v: 0.05 },
            { r: -0.85, v: 0.25 },
            { r: -0.70, v: 0.55 },
            // Inner top fillet
            { r: -0.45, v: 0.88 },
            { r: -0.20, v: 0.98 },
            // Rounded bullnose apex crown
            { r:  0.00, v: 1.00 },
            { r: +0.20, v: 0.98 },
            { r: +0.45, v: 0.88 },
            // Outer aerodynamic flank (subtle convex entasis)
            { r: +0.70, v: 0.55 },
            { r: +0.85, v: 0.25 },
            { r: +1.00, v: 0.05 },
            // Base center (sealed)
            { r:  0.00, v: 0.00 }
        ];
        
        for (let i = 0; i <= numSamples; i++) {
            const u = i / numSamples;
            const s = u * primaryLength;
            const pt = spine.getPoint(u);
            
            // Tangent along spine
            const prevPt = spine.getPoint(Math.max(0, u - 0.02));
            const nextPt = spine.getPoint(Math.min(1.0, u + 0.02));
            let tan = nextPt.clone().sub(prevPt).normalize();
            
            // Up vector smoothly transitions from parent normal N0 to world UP (0,1,0)
            let up = new THREE.Vector3(0, 1, 0);
            let h = wallHeight;
            let halfThick = plateThickness / 2.0;
            
            if (s <= transLen) {
                const w = s / transLen;
                const smoothW = w * w * (3 - 2 * w);
                up = N0.clone().multiplyScalar(1 - smoothW).add(new THREE.Vector3(0,1,0).multiplyScalar(smoothW)).normalize();
                // Height rises smoothly from flush edge slab thickness to full wall height
                h = plateThickness * (1 - smoothW) + wallHeight * smoothW;
                // Flared cove root at the parent surface
                halfThick = (plateThickness / 2.0) * (1.35 - 0.35 * smoothW);
            } else {
                const uPost = (s - transLen) / (primaryLength - transLen);
                // Aerodynamic crest dip towards tip
                const tipTaper = uPost > 0.75 ? (1.0 - 0.3 * (uPost - 0.75) / 0.25) : 1.0;
                h = wallHeight * tipTaper;
                halfThick = (plateThickness / 2.0) * (uPost > 0.8 ? (1.0 - 0.4 * (uPost - 0.8) / 0.2) : 1.0);
            }
            
            // Lateral normal R = Tan x Up
            const rVec = new THREE.Vector3().crossVectors(tan, up).normalize();
            
            // Base stays grounded on terrace elevation P0.y!
            const basePos = new THREE.Vector3(pt.x, P0.y, pt.z);
            
            for (let p = 0; p < numPerRing; p++) {
                const pr = subDProfile[p];
                const latDist = halfThick * pr.r;
                const vertDist = h * pr.v;
                
                const vx = basePos.x + rVec.x * latDist + up.x * vertDist;
                const vy = basePos.y + rVec.y * latDist + up.y * vertDist;
                const vz = basePos.z + rVec.z * latDist + up.z * vertDist;
                positions.push(vx, vy, vz);
            }
        }
        
        // Quads connecting rings
        for (let i = 0; i < numSamples; i++) {
            const r0 = i * numPerRing;
            const r1 = (i + 1) * numPerRing;
            for (let p = 0; p < numPerRing; p++) {
                const nextP = (p + 1) % numPerRing;
                indices.push(r0 + p, r1 + p, r1 + nextP);
                indices.push(r0 + p, r1 + nextP, r0 + nextP);
            }
        }
        // Start cap
        for (let p = 1; p < numPerRing - 1; p++) {
            indices.push(0, p + 1, p);
        }
        // End cap
        const lastBase = numSamples * numPerRing;
        for (let p = 1; p < numPerRing - 1; p++) {
            indices.push(lastBase, lastBase + p, lastBase + p + 1);
        }
        
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();
        
        // Clone exact material from seed mesh
        const wallMat = mesh.material ? mesh.material.clone() : new THREE.MeshStandardMaterial({
            color: 0xdcdcdc,
            roughness: 0.82,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const wallMesh = new THREE.Mesh(geom, wallMat);
        wallMesh.name = 'PrimaryArchitecturalWall';
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        group.add(wallMesh);
        
        return { success: true, vertexCount: positions.length / 3 };
    })()
'@

    $rTest = Eval-JS $jsProto
    Write-Output "Proto result: $rTest"
    Start-Sleep -Seconds 1

    # Capture Perspective view
    $camPos = @{ x = 30; y = 20; z = 35 }
    $camTarget = @{ x = 3.5; y = 6.0; z = 0 }
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set($($camPos.x), $($camPos.y), $($camPos.z));
            window.threeControls.target.set($($camTarget.x), $($camTarget.y), $($camTarget.z));
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    $shot = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $shotObj = $shot | ConvertFrom-Json
    $bytes = [Convert]::FromBase64String($shotObj.result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\seed_consistency_proto_persp.png", $bytes)
    Write-Output "Captured perspective to seed_consistency_proto_persp.png"

    # Capture Close-up view
    $camPos2 = @{ x = 16; y = 12; z = 12 }
    $camTarget2 = @{ x = 3.5; y = 6.14; z = -0.6 }
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set($($camPos2.x), $($camPos2.y), $($camPos2.z));
            window.threeControls.target.set($($camTarget2.x), $($camTarget2.y), $($camTarget2.z));
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1

    $shot2 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $shotObj2 = $shot2 | ConvertFrom-Json
    $bytes2 = [Convert]::FromBase64String($shotObj2.result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\seed_consistency_proto_closeup.png", $bytes2)
    Write-Output "Captured closeup to seed_consistency_proto_closeup.png"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
