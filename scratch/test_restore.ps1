# test_restore.ps1
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
}

$port = 9223
$proc = Start-Process -FilePath $chromePath -ArgumentList "--headless=new", "--remote-debugging-port=$port", "--disable-gpu", "http://127.0.0.1:8080/" -PassThru

Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.type -eq "page" -and $_.url -like "*8080*" } | Select-Object -First 1
    if (-not $page) {
        $page = $pages[0]
    }
    $wsUrl = $page.webSocketDebuggerUrl
    Write-Output "Connecting to CDP WebSocket: $wsUrl"

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$wsUrl, $ct).Wait()

    $script:reqId = 1
    function Send-CDPMessage($method, $params = @{}) {
        $id = $script:reqId++
        $payload = @{
            id = $id
            method = $method
            params = $params
        } | ConvertTo-Json -Depth 10 -Compress

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $segment = [System.ArraySegment[byte]]::new($bytes)
        $ws.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()

        $buffer = [byte[]]::new(65536)
        while ($true) {
            $received = ""
            do {
                $seg = [System.ArraySegment[byte]]::new($buffer)
                $res = $ws.ReceiveAsync($seg, $ct).Result
                $received += [System.Text.Encoding]::UTF8.GetString($buffer, 0, $res.Count)
            } while (-not $res.EndOfMessage)

            $jsonObj = $received | ConvertFrom-Json
            if ($jsonObj.id -eq $id) {
                return $jsonObj
            }
        }
    }

    # Enable Page & DOM & Runtime
    Send-CDPMessage "Page.enable" | Out-Null
    Send-CDPMessage "DOM.enable" | Out-Null
    Send-CDPMessage "Runtime.enable" | Out-Null

    Start-Sleep -Seconds 2

    # Check window.restoreOriginalImportedGeometry
    $eval1 = Send-CDPMessage "Runtime.evaluate" @{ expression = "typeof window.restoreOriginalImportedGeometry" }
    Write-Output "window.restoreOriginalImportedGeometry type: $($eval1.result.result.value)"

    # Get file input node
    $doc = Send-CDPMessage "DOM.getDocument" @{}
    $node = Send-CDPMessage "DOM.querySelector" @{ nodeId = $doc.result.root.nodeId; selector = "#rhino-file-input" }
    $fileInputNodeId = $node.result.nodeId
    Write-Output "Found #rhino-file-input nodeId: $fileInputNodeId"

    $filePath = [System.IO.Path]::GetFullPath(".\compressed.3dm")
    Write-Output "Uploading file: $filePath"
    Send-CDPMessage "DOM.setFileInputFiles" @{ files = @($filePath); nodeId = $fileInputNodeId } | Out-Null

    # Wait for file to load and parse
    Write-Output "Waiting 8 seconds for Rhino .3dm file to parse..."
    Start-Sleep -Seconds 8

    # Check originalMeshes
    $evalMeshes = Send-CDPMessage "Runtime.evaluate" @{ expression = "window.originalMeshes ? window.originalMeshes.length : 0" }
    Write-Output "window.originalMeshes.length: $($evalMeshes.result.result.value)"

    $evalCheck = Send-CDPMessage "Runtime.evaluate" @{ expression = @"
        (() => {
            if (!window.originalMeshes || window.originalMeshes.length === 0) return 'NO_MESHES';
            const m0 = window.originalMeshes[0];
            const p = m0.originalPositions;
            const attr = (m0.mesh || m0.threeMesh).geometry.attributes.position;
            return {
                meshCount: window.originalMeshes.length,
                m0Verts: p ? p.length / 3 : 0,
                isSameBuffer: attr.array.buffer === p.buffer,
                p0: p[0], p1: p[1], p2: p[2],
                attr0: attr.array[0], attr1: attr.array[1], attr2: attr.array[2]
            };
        })()
"@; returnByValue = $true }

    Write-Output "Initial Mesh State: $($evalCheck.result.result.value | ConvertTo-Json -Compress)"

    # Deform by changing DNA / sliders
    Write-Output "Applying DNA deformation..."
    $evalDeform = Send-CDPMessage "Runtime.evaluate" @{ expression = @"
        (() => {
            window.domainState.dna = [0.65, 0.50, 0.80, 0.40, 0.60, 0.50];
            window.updateDnaUIAndViewport();
            const m0 = window.originalMeshes[0];
            const p = m0.originalPositions;
            const attr = (m0.mesh || m0.threeMesh).geometry.attributes.position;
            return {
                deformed: (attr.array[0] !== p[0] || attr.array[1] !== p[1] || attr.array[2] !== p[2]),
                attr0: attr.array[0], attr1: attr.array[1], attr2: attr.array[2],
                orig0: p[0], orig1: p[1], orig2: p[2]
            };
        })()
"@; returnByValue = $true }
    Write-Output "Deformed State: $($evalDeform.result.result.value | ConvertTo-Json -Compress)"

    # Now click restore button
    Write-Output "Clicking restore button (#btn-restore-original)..."
    $evalRestore = Send-CDPMessage "Runtime.evaluate" @{ expression = @"
        (() => {
            const btn = document.getElementById('btn-restore-original');
            if (btn) btn.click();
            else window.restoreOriginalImportedGeometry();

            let maxDiff = 0;
            let allMatch = true;
            window.originalMeshes.forEach(item => {
                const target = item.mesh || item.threeMesh;
                const attr = target.geometry.attributes.position;
                const orig = item.originalPositions;
                for (let i = 0; i < orig.length; i++) {
                    const diff = Math.abs(attr.array[i] - orig[i]);
                    if (diff > maxDiff) maxDiff = diff;
                    if (diff > 0.0001) allMatch = false;
                }
            });

            return {
                allMatch: allMatch,
                maxDiff: maxDiff,
                dna: window.domainState.dna,
                meshVisible: window.meshGroup ? window.meshGroup.visible : false,
                whiplashSlider: document.getElementById('slider-whiplash') ? document.getElementById('slider-whiplash').value : null,
                dnaCSlider: document.getElementById('slider-dna-c') ? document.getElementById('slider-dna-c').value : null
            };
        })()
"@; returnByValue = $true }
    Write-Output "Restored State: $($evalRestore.result.result.value | ConvertTo-Json)"

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
