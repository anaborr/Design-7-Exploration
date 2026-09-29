# test_verify_fix.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9227
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
    $script:dialogs = [System.Collections.Generic.List[string]]::new()

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
                $script:dialogs.Add($json.params.message)
                Write-Output "ALERT DIALOG INTERCEPTED: $($json.params.message)"
                # Dismiss it
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

    # Check for syntax errors on page
    $errCheck = Send-CDP "Runtime.evaluate" @{ expression = "window.loadRhinoFromUrl ? 'DEFINED' : 'UNDEFINED'" }
    Write-Output "window.loadRhinoFromUrl: $($errCheck.result.result.value)"

    # Check rhino3dm ready
    Write-Output "Waiting for Rhino to be ready..."
    for ($i = 0; $i -lt 10; $i++) {
        $rCheck = Send-CDP "Runtime.evaluate" @{ expression = "typeof rhino !== 'undefined' && rhino !== null" }
        if ($rCheck.result.result.value -eq $true) {
            Write-Output "Rhino ready!"
            break
        }
        Start-Sleep -Seconds 1
    }

    # Trigger loading compressed.3dm
    Write-Output "Calling window.loadRhinoFromUrl('compressed.3dm')..."
    Send-CDP "Runtime.evaluate" @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null

    # Poll until originalMeshes is populated
    Write-Output "Waiting for parsing..."
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $countCheck = Send-CDP "Runtime.evaluate" @{ expression = "window.originalMeshes ? window.originalMeshes.length : 0" }
        $c = $countCheck.result.result.value
        Write-Output "Loaded meshes so far: $c (elapsed: $($i+1)s)"
        if ($c -ge 4) { break }
    }

    # Check any dialogs that were intercepted
    Write-Output "`nDialogs intercepted count: $($script:dialogs.Count)"
    foreach ($d in $script:dialogs) {
        Write-Output "  -> $d"
    }

    # Check detailed import stats
    $importReport = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            const meshes = window.originalMeshes || [];
            const subds = meshes.filter(m => (m.mesh || m.threeMesh).name.startsWith('SubD'));
            return {
                totalMeshes: meshes.length,
                subdMeshes: subds.length,
                curves: (window.originalCurves || []).length,
                cages: (window.originalCages || []).length,
                subdDetails: subds.map(s => {
                    const m = s.mesh || s.threeMesh;
                    return {
                        name: m.name,
                        vertCount: s.originalPositions.length / 3,
                        triCount: m.geometry.index ? (m.geometry.index.count / 3) : 0,
                        wireframe: m.material.wireframe,
                        visible: m.visible,
                        firstPos: Array.from(s.originalPositions.slice(0, 3))
                    };
                }),
                infoCards: {
                    infoFilename: document.getElementById('info-filename')?.textContent,
                    infoMeshes: document.getElementById('info-meshes')?.textContent,
                    infoSubds: document.getElementById('info-subds')?.textContent,
                    infoRendered: document.getElementById('info-rendered')?.textContent
                }
            };
        })()
"@; returnByValue = $true }

    Write-Output "`n=== IMPORT REPORT ==="
    Write-Output ($importReport.result.result.value | ConvertTo-Json -Depth 6)

    # Now test DEFORMATION
    Write-Output "`n--> Testing Deformation (Continuity=0.85, Whiplash=0.75, Branching=0.6)..."
    $deformReport = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            window.domainState.dna = [0.85, 0.6, 0.75, 0.3, 0.4, 0.5];
            window.updateDnaUIAndViewport();

            return (window.originalMeshes || []).map(m => {
                const target = m.mesh || m.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = m.originalPositions;
                let maxDiff = 0;
                for (let i = 0; i < orig.length; i++) {
                    const diff = Math.abs(attr.array[i] - orig[i]);
                    if (diff > maxDiff) maxDiff = diff;
                }
                return {
                    name: target.name,
                    maxDisplacement: maxDiff
                };
            });
        })()
"@; returnByValue = $true }
    Write-Output ($deformReport.result.result.value | ConvertTo-Json -Depth 3)

    # Now test RESTORING ORIGINAL GEOMETRY
    Write-Output "`n--> Testing RESTORE ORIGINAL GEOMETRY..."
    $restoreReport = Send-CDP "Runtime.evaluate" @{ expression = @"
        (() => {
            window.restoreOriginalImportedGeometry();

            const meshesRestored = (window.originalMeshes || []).map(m => {
                const target = m.mesh || m.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = m.originalPositions;
                let maxDiff = 0;
                for (let i = 0; i < orig.length; i++) {
                    const diff = Math.abs(attr.array[i] - orig[i]);
                    if (diff > maxDiff) maxDiff = diff;
                }
                return {
                    name: target.name,
                    maxDiffFromOriginal: maxDiff,
                    isExactMatch: (maxDiff === 0),
                    visible: target.visible,
                    wireframe: target.material.wireframe
                };
            });

            return {
                compMode: window.activeVisualCompMode,
                dna: window.domainState?.dna,
                meshesRestored
            };
        })()
"@; returnByValue = $true }
    Write-Output ($restoreReport.result.result.value | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", $ct).Wait()
    }
    if ($proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $tempProfile) {
        Start-Sleep -Seconds 1
        Remove-Item -Recurse -Force $tempProfile -ErrorAction SilentlyContinue
    }
}
