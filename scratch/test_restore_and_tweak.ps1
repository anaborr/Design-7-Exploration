# test_restore_and_tweak.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9229
$tempProfile = Join-Path $env:TEMP ("chrome_test_" + [guid]::NewGuid().ToString().Substring(0, 8))
$proc = Start-Process -FilePath $chromePath -ArgumentList "--headless=new", "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", "--disable-gpu", "http://127.0.0.1:8080/" -PassThru

Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.type -eq "page" -and $_.url -like "*8080*" } | Select-Object -First 1
    if (-not $page) { $page = $pages[0] }
    $wsUrl = $page.webSocketDebuggerUrl

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$wsUrl, $ct).Wait()

    $script:reqId = 1
    function Send-CDP($method, $params = @{}) {
        $id = $script:reqId++
        $payload = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()

        $buf = [byte[]]::new(65536)
        while ($true) {
            $msg = ""
            do {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, $ct).Result
                $msg += [System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
            } while (-not $r.EndOfMessage)

            $json = $msg | ConvertFrom-Json
            if ($json.method -eq "Page.javascriptDialogOpening") {
                # Dismiss any alert
                $dismissPayload = @{ id = ($script:reqId++); method = "Page.handleJavaScriptDialog"; params = @{ accept = $true } } | ConvertTo-Json -Depth 5 -Compress
                $dBytes = [System.Text.Encoding]::UTF8.GetBytes($dismissPayload)
                $ws.SendAsync([System.ArraySegment[byte]]::new($dBytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
            }
            if ($json.id -eq $id) { return $json }
        }
    }

    Send-CDP "Page.enable" | Out-Null
    Send-CDP "Runtime.enable" | Out-Null
    Start-Sleep -Seconds 2

    # Load compressed.3dm
    Write-Output "1. Loading compressed.3dm..."
    Send-CDP "Runtime.evaluate" @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    Start-Sleep -Seconds 3

    # Check meshes loaded
    $initStats = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            return {
                meshCount: (window.originalMeshes || []).length,
                subdMeshes: (window.originalMeshes || []).filter(m => (m.mesh || m.threeMesh).name.startsWith('SubD')).length
            };
        })()
"@; returnByValue = $true }
    Write-Output "Initial Meshes: $($initStats.result.result.value | ConvertTo-Json)"

    # STEP 2: Tweak sliders for the first time
    Write-Output "`n2. Tweaking sliders: Continuity = 60%, Whiplash = 70%..."
    $tweak1 = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const sC = document.getElementById('slider-dna-c');
            const sW = document.getElementById('slider-dna-w');
            if (sC) { sC.value = 60; sC.dispatchEvent(new Event('input')); }
            if (sW) { sW.value = 70; sW.dispatchEvent(new Event('input')); }

            return (window.originalMeshes || []).map(m => {
                const target = m.mesh || m.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = m.originalPositions;
                let maxDiff = 0;
                for (let i = 0; i < orig.length; i++) {
                    const d = Math.abs(attr.array[i] - orig[i]);
                    if (d > maxDiff) maxDiff = d;
                }
                return { name: target.name, maxDisplacement: maxDiff };
            });
        })()
"@; returnByValue = $true }
    Write-Output "Tweak 1 Displacements:"
    Write-Output ($tweak1.result.result.value | ConvertTo-Json)

    # STEP 3: Click Restore Original Geometry
    Write-Output "`n3. Clicking RESTORE ORIGINAL GEOMETRY..."
    $restore1 = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const btn = document.getElementById('btn-restore-original');
            if (btn) btn.click();
            else window.restoreOriginalImportedGeometry();

            return {
                dna: window.domainState?.dna,
                sliderC: document.getElementById('slider-dna-c')?.value,
                sliderW: document.getElementById('slider-dna-w')?.value,
                activeMode: window.activeVisualCompMode,
                vpTag: document.getElementById('vp-gen-tag')?.textContent,
                meshes: (window.originalMeshes || []).map(m => {
                    const target = m.mesh || m.threeMesh;
                    const attr = target.geometry.attributes.position;
                    const orig = m.originalPositions;
                    let maxDiff = 0;
                    for (let i = 0; i < orig.length; i++) {
                        const d = Math.abs(attr.array[i] - orig[i]);
                        if (d > maxDiff) maxDiff = d;
                    }
                    return { name: target.name, maxDiffFromOriginal: maxDiff, isExactMatch: (maxDiff === 0) };
                })
            };
        })()
"@; returnByValue = $true }
    Write-Output "Restore 1 Result:"
    Write-Output ($restore1.result.result.value | ConvertTo-Json -Depth 5)

    # STEP 4: TWEAK SLIDERS AFTER RESTORING (The critical user test!)
    Write-Output "`n4. Tweaking sliders AFTER RESTORING: Branching = 75%, Growth = 80%..."
    $tweak2 = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const sB = document.getElementById('slider-dna-b');
            const sG = document.getElementById('slider-dna-g');
            if (sB) { sB.value = 75; sB.dispatchEvent(new Event('input')); }
            if (sG) { sG.value = 80; sG.dispatchEvent(new Event('input')); }

            return {
                dna: window.domainState?.dna,
                sliderB: sB?.value,
                sliderG: sG?.value,
                activeMode: window.activeVisualCompMode,
                vpTag: document.getElementById('vp-gen-tag')?.textContent,
                meshes: (window.originalMeshes || []).map(m => {
                    const target = m.mesh || m.threeMesh;
                    const attr = target.geometry.attributes.position;
                    const orig = m.originalPositions;
                    let maxDiff = 0;
                    for (let i = 0; i < orig.length; i++) {
                        const d = Math.abs(attr.array[i] - orig[i]);
                        if (d > maxDiff) maxDiff = d;
                    }
                    return { name: target.name, maxDisplacement: maxDiff };
                })
            };
        })()
"@; returnByValue = $true }
    Write-Output "Tweak 2 After Restore Result:"
    Write-Output ($tweak2.result.result.value | ConvertTo-Json -Depth 5)

    # STEP 5: Click Restore AGAIN
    Write-Output "`n5. Clicking RESTORE ORIGINAL GEOMETRY a second time..."
    $restore2 = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            window.restoreOriginalImportedGeometry();

            return (window.originalMeshes || []).map(m => {
                const target = m.mesh || m.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = m.originalPositions;
                let maxDiff = 0;
                for (let i = 0; i < orig.length; i++) {
                    const d = Math.abs(attr.array[i] - orig[i]);
                    if (d > maxDiff) maxDiff = d;
                }
                return { name: target.name, maxDiffFromOriginal: maxDiff, isExactMatch: (maxDiff === 0) };
            });
        })()
"@; returnByValue = $true }
    Write-Output "Restore 2 Result:"
    Write-Output ($restore2.result.result.value | ConvertTo-Json)

    # STEP 6: Tweak advanced branch controls
    Write-Output "`n6. Tweaking Advanced Branch Controls (Position=80%, HorizAngle=45°)..."
    $tweakBranch = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const sPos = document.getElementById('slider-branch-pos');
            const sAngle = document.getElementById('slider-branch-h-angle');
            if (sPos) { sPos.value = 80; sPos.dispatchEvent(new Event('input')); }
            if (sAngle) { sAngle.value = 45; sAngle.dispatchEvent(new Event('input')); }

            return {
                branchSettings: window.domainState?.branchSettings,
                dna: window.domainState?.dna,
                meshes: (window.originalMeshes || []).map(m => {
                    const target = m.mesh || m.threeMesh;
                    const attr = target.geometry.attributes.position;
                    const orig = m.originalPositions;
                    let maxDiff = 0;
                    for (let i = 0; i < orig.length; i++) {
                        const d = Math.abs(attr.array[i] - orig[i]);
                        if (d > maxDiff) maxDiff = d;
                    }
                    return { name: target.name, maxDisplacement: maxDiff };
                })
            };
        })()
"@; returnByValue = $true }
    Write-Output "Branch Tweak Result:"
    Write-Output ($tweakBranch.result.result.value | ConvertTo-Json -Depth 5)

    # STEP 7: Final Restore
    Write-Output "`n7. Final RESTORE..."
    $restore3 = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            window.restoreOriginalImportedGeometry();

            return (window.originalMeshes || []).map(m => {
                const target = m.mesh || m.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = m.originalPositions;
                let maxDiff = 0;
                for (let i = 0; i < orig.length; i++) {
                    const d = Math.abs(attr.array[i] - orig[i]);
                    if (d > maxDiff) maxDiff = d;
                }
                return { name: target.name, maxDiffFromOriginal: maxDiff, isExactMatch: (maxDiff === 0) };
            });
        })()
"@; returnByValue = $true }
    Write-Output "Final Restore Result:"
    Write-Output ($restore3.result.result.value | ConvertTo-Json)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", $ct).Wait()
    }
    if ($proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $tempProfile) {
        Remove-Item -Recurse -Force $tempProfile -ErrorAction SilentlyContinue
    }
}
