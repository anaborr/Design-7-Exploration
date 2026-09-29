# test_live.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9226
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
            if ($json.id -eq $id) { return $json }
        }
    }

    Send-CDP "Runtime.enable" | Out-Null
    Start-Sleep -Seconds 2

    # Wait for rhino3dm
    Write-Output "Checking Rhino ready..."
    $rhinoCheck = Send-CDP "Runtime.evaluate" @{ expression = "typeof rhino !== 'undefined' && rhino !== null" }
    Write-Output "Rhino ready: $($rhinoCheck.result.result.value)"

    # Load compressed.3dm via URL
    Write-Output "Calling window.loadRhinoFromUrl()..."
    Send-CDP "Runtime.evaluate" @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null

    # Wait 8s for file to be parsed
    Write-Output "Waiting for parsing..."
    Start-Sleep -Seconds 8

    $stats = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            return {
                meshCount: window.originalMeshes.length,
                subdCount: window.originalMeshes.filter(m => m.mesh && m.mesh.name && m.mesh.name.startsWith('SubD')).length,
                cageCount: window.originalCages.length,
                curveCount: window.originalCurves.length,
                meshes: window.originalMeshes.map((m, idx) => ({
                    idx: idx,
                    name: (m.mesh || m.threeMesh).name,
                    vertCount: m.originalPositions.length / 3,
                    p0_3: Array.from(m.originalPositions.slice(0, 3)),
                    attr0_3: Array.from((m.mesh || m.threeMesh).geometry.attributes.position.array.slice(0, 3))
                }))
            };
        })()
"@; returnByValue = $true }

    Write-Output "INITIAL IMPORT STATS:"
    Write-Output ($stats.result.result.value | ConvertTo-Json -Depth 5)

    # Now simulate user moving sliders or generating iterations
    Write-Output "`n--> Applying Art Nouveau deformation (Continuity=0.8, Whiplash=0.8, Branching=0.6)..."
    $deformResult = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            window.domainState.dna = [0.8, 0.6, 0.8, 0.3, 0.4, 0.5];
            window.updateDnaUIAndViewport();

            return window.originalMeshes.map((m, idx) => {
                const target = m.mesh || m.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = m.originalPositions;
                let maxDiff = 0;
                for (let i = 0; i < orig.length; i++) {
                    const d = Math.abs(attr.array[i] - orig[i]);
                    if (d > maxDiff) maxDiff = d;
                }
                return {
                    name: target.name,
                    maxDisplacementFromOriginal: maxDiff,
                    attr0_3: Array.from(attr.array.slice(0, 3)),
                    orig0_3: Array.from(orig.slice(0, 3))
                };
            });
        })()
"@; returnByValue = $true }

    Write-Output "DEFORMATION STATS:"
    Write-Output ($deformResult.result.result.value | ConvertTo-Json -Depth 5)

    # Now click RESTORE ORIGINAL GEOMETRY
    Write-Output "`n--> Clicking restoreOriginalImportedGeometry()..."
    $restoreResult = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const btn = document.getElementById('btn-restore-original');
            if (btn) btn.click();
            else window.restoreOriginalImportedGeometry();

            return {
                dnaAfterRestore: window.domainState.dna,
                activeVisualCompMode: window.activeVisualCompMode || 'N/A',
                meshGroupVisible: window.meshGroup ? window.meshGroup.visible : false,
                cageGroupVisible: window.cageGroup ? window.cageGroup.visible : false,
                curveGroupVisible: window.curveGroup ? window.curveGroup.visible : false,
                meshes: window.originalMeshes.map((m, idx) => {
                    const target = m.mesh || m.threeMesh;
                    const attr = target.geometry.attributes.position;
                    const orig = m.originalPositions;
                    let maxDiff = 0;
                    for (let i = 0; i < orig.length; i++) {
                        const d = Math.abs(attr.array[i] - orig[i]);
                        if (d > maxDiff) maxDiff = d;
                    }
                    return {
                        name: target.name,
                        maxDiffFromOriginal: maxDiff,
                        isExactMatch: maxDiff < 0.0001,
                        wireframe: target.material ? target.material.wireframe : null,
                        visible: target.visible,
                        attr0_3: Array.from(attr.array.slice(0, 3)),
                        orig0_3: Array.from(orig.slice(0, 3))
                    };
                })
            };
        })()
"@; returnByValue = $true }

    Write-Output "RESTORE RESULTS:"
    Write-Output ($restoreResult.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
