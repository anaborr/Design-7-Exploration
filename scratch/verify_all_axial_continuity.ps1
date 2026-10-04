$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9250
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
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Screenshot($filename) {
        $clip = @{
            format = "png"
            clip = @{
                x = 0
                y = 0
                width = 1600
                height = 1000
                scale = 1
            }
        }
        $screenshotRes = Send-CDP "Page.captureScreenshot" $clip
        $screenshotData = ($screenshotRes | ConvertFrom-Json).result.data
        if ($screenshotData) {
            $bytes = [System.Convert]::FromBase64String($screenshotData)
            [System.IO.File]::WriteAllBytes($filename, $bytes)
            Write-Output "Screenshot saved to $filename"
        }
    }

    Start-Sleep -Seconds 2
    Write-Output "Loading compressed.3dm..."
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    
    # Wait until meshes are parsed
    Write-Output "Waiting for meshes to finish loading..."
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        $meshCount = Eval-JS "window.originalMeshes ? window.originalMeshes.length : 0"
        if ($meshCount -and [int]$meshCount -ge 1) {
            Write-Output "Successfully loaded $meshCount meshes! (took $($i+1)s)"
            break
        }
    }
    Start-Sleep -Seconds 1

    # Frame camera
    Eval-JS @"
    (() => {
        if (window.camera && window.controls) {
            window.camera.position.set(45, 25, 65);
            window.controls.target.set(54, 6, 18);
            window.controls.update();
            if (window.render) window.render();
        }
    })()
"@ | Out-Null

    # Switch to ITERATION comparison mode
    Eval-JS "if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');" | Out-Null
    Start-Sleep -Milliseconds 500

    function Measure-Axial-Continuity($cVal) {
        return Eval-JS @"
        (() => {
            try {
                const slider = document.getElementById('slider-dna-c');
                if (slider) {
                    slider.value = $cVal * 100;
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');

                const origPos = window.getOriginalMeshPositions ? window.getOriginalMeshPositions() : null;
                if (!origPos) return { error: 'No origPos' };
                const bounds = window.getModelBounds ? window.getModelBounds() : null;
                const dna = [ $cVal, 0, 0, 0, 0, 0 ];
                const typo = (window.domainState && window.domainState.selectedTypology) || 'VERTICAL_VOID';
                const defPos = window.applyArtNouveauDNA(origPos, dna, bounds, 75, true, typo);

                let maxDx = 0, maxDy = 0, maxDz = 0;
                let sumDx = 0, sumDy = 0, sumDz = 0;
                let activeCount = 0;

                for (let i = 0; i < origPos.length; i += 3) {
                    let dx = Math.abs(defPos[i] - origPos[i]);
                    let dy = Math.abs(defPos[i+1] - origPos[i+1]);
                    let dz = Math.abs(defPos[i+2] - origPos[i+2]);

                    if (dx > maxDx) maxDx = dx;
                    if (dy > maxDy) maxDy = dy;
                    if (dz > maxDz) maxDz = dz;

                    sumDx += dx;
                    sumDy += dy;
                    sumDz += dz;

                    if (dx > 0.001 || dy > 0.001 || dz > 0.001) activeCount++;
                }

                const badge = document.getElementById('badge-dna-c') ? document.getElementById('badge-dna-c').innerText : '';
                const disc = document.getElementById('metric-c-disconnected') ? document.getElementById('metric-c-disconnected').innerText : '';
                const conn = document.getElementById('metric-c-connected') ? document.getElementById('metric-c-connected').innerText : '';
                const valCont = document.getElementById('val-rule-cont') ? document.getElementById('val-rule-cont').innerText : '';

                return {
                    c_val: $cVal,
                    badge: badge,
                    disconnectedMetric: disc,
                    connectedMetric: conn,
                    ruleValidation: valCont,
                    axial_X_active: maxDx > 0.01,
                    axial_Y_active: maxDy > 0.01,
                    axial_Z_active: maxDz > 0.01,
                    max_delta_X_feet: Number(maxDx.toFixed(3)),
                    max_delta_Y_feet: Number(maxDy.toFixed(3)),
                    max_delta_Z_feet: Number(maxDz.toFixed(3)),
                    mean_delta_X_feet: Number((sumDx / activeCount).toFixed(3)),
                    mean_delta_Y_feet: Number((sumDy / activeCount).toFixed(3)),
                    mean_delta_Z_feet: Number((sumDz / activeCount).toFixed(3)),
                    total_vertices_affected: activeCount,
                    all_axes_transforming: (maxDx > 0.01 && maxDy > 0.01 && maxDz > 0.01)
                };
            } catch (err) {
                return { error: err.toString() };
            }
        })()
"@
    }

    Write-Output "`n=================================================================="
    Write-Output "VERIFICATION 1: LOW CONTINUITY (C = 15%) - 3-AXIAL CHECK"
    Write-Output "=================================================================="
    $v1 = Measure-Axial-Continuity 0.15
    Write-Output ($v1 | ConvertTo-Json -Depth 5)
    Start-Sleep -Milliseconds 800
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\axial_continuity_v1_low.png"

    Write-Output "`n=================================================================="
    Write-Output "VERIFICATION 2: MEDIUM CONTINUITY (C = 50%) - 3-AXIAL CHECK"
    Write-Output "=================================================================="
    $v2 = Measure-Axial-Continuity 0.50
    Write-Output ($v2 | ConvertTo-Json -Depth 5)
    Start-Sleep -Milliseconds 800
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\axial_continuity_v2_med.png"

    Write-Output "`n=================================================================="
    Write-Output "VERIFICATION 3: HIGH CONTINUITY (C = 85%) - 3-AXIAL CHECK"
    Write-Output "=================================================================="
    $v3 = Measure-Axial-Continuity 0.85
    Write-Output ($v3 | ConvertTo-Json -Depth 5)
    Start-Sleep -Milliseconds 800
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\axial_continuity_v3_high.png"

    Write-Output "`n=================================================================="
    Write-Output "ALL 6 DOMAIN A TYPOLOGIES - 3-AXIAL (X, Y, Z) TRANSFORMATION CHECK"
    Write-Output "=================================================================="
    $typoCheck = Eval-JS @"
    (() => {
        const typologies = [
            'VERTICAL_VOID',
            'COMPRESSED_EXPANDED',
            'OPEN_HALL',
            'STEPPED_TERRACES',
            'LINEAR_GALLERY',
            'FOLDED_FACETS'
        ];

        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const dna = [0.60, 0, 0, 0, 0, 0]; // 60% Continuity
        const results = {};

        for (const typo of typologies) {
            if (window.selectDomainATypology) window.selectDomainATypology(typo);
            else if (window.domainState) window.domainState.selectedTypology = typo;
            const defPos = window.applyArtNouveauDNA(origPos, dna, bounds, 75, true, typo);
            let maxDx = 0, maxDy = 0, maxDz = 0;
            for (let i = 0; i < origPos.length; i += 3) {
                let dx = Math.abs(defPos[i] - origPos[i]);
                let dy = Math.abs(defPos[i+1] - origPos[i+1]);
                let dz = Math.abs(defPos[i+2] - origPos[i+2]);
                if (dx > maxDx) maxDx = dx;
                if (dy > maxDy) maxDy = dy;
                if (dz > maxDz) maxDz = dz;
            }
            results[typo] = {
                max_dx: Number(maxDx.toFixed(3)),
                max_dy: Number(maxDy.toFixed(3)),
                max_dz: Number(maxDz.toFixed(3)),
                x_plane_active: maxDx > 0.01,
                y_plane_active: maxDy > 0.01,
                z_plane_active: maxDz > 0.01,
                all_3_planes_active: (maxDx > 0.01 && maxDy > 0.01 && maxDz > 0.01)
            };
        }
        return results;
    })()
"@
    Write-Output ($typoCheck | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
