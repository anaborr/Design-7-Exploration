$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9272
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
        $obj = $r | ConvertFrom-Json
        if ($obj.result.result.value) { return $obj.result.result.value }
        if ($obj.result.result.description) { return $obj.result.result.description }
        return $r
    }

    Start-Sleep -Seconds 2
    Write-Output "--- Load Model ---"
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    Write-Output "--- Check initial state ---"
    $initRes = Eval-JS @"
    (() => {
        const mesh = window.originalMeshes && window.originalMeshes[0]?.mesh;
        const pos = mesh ? Array.from(mesh.geometry.attributes.position.array.slice(0, 6)) : null;
        return {
            dna: window.domainState.dna,
            selectedTypology: window.domainState.selectedTypology,
            meshSlice: pos
        };
    })()
"@
    Write-Output "Initial: $initRes"

    Write-Output "--- Call selectDomainATypology('LINEAR_GALLERY') ---"
    $afterSelect = Eval-JS @"
    (() => {
        window.selectDomainATypology('LINEAR_GALLERY');
        const mesh = window.originalMeshes && window.originalMeshes[0]?.mesh;
        const pos = mesh ? Array.from(mesh.geometry.attributes.position.array.slice(0, 6)) : null;
        return {
            dna: window.domainState.dna,
            selectedTypology: window.domainState.selectedTypology,
            meshSlice: pos,
            sliderC: document.getElementById('slider-dna-c')?.value,
            sliderW: document.getElementById('slider-dna-w')?.value,
            sliderB: document.getElementById('slider-dna-b')?.value
        };
    })()
"@
    Write-Output "After Select Linear Gallery: $afterSelect"

    Write-Output "--- Now Modify Domain B Slider (Whiplash = 50%) ---"
    $afterTweak = Eval-JS @"
    (() => {
        const sW = document.getElementById('slider-dna-w');
        sW.value = '50';
        sW.dispatchEvent(new Event('input', { bubbles: true }));
        const mesh = window.originalMeshes && window.originalMeshes[0]?.mesh;
        const pos = mesh ? Array.from(mesh.geometry.attributes.position.array.slice(0, 6)) : null;
        return {
            dna: window.domainState.dna,
            selectedTypology: window.domainState.selectedTypology,
            meshSlice: pos,
            stats: window.lastEngineStats
        };
    })()
"@
    Write-Output "After Tweak: $afterTweak"

    Write-Output "--- Now Change Typology to VERTICAL_VOID while Whiplash is 50% ---"
    $changeTypoWhileTweak = Eval-JS @"
    (() => {
        const meshBefore = window.originalMeshes && window.originalMeshes[0]?.mesh;
        const posBefore = meshBefore ? Array.from(meshBefore.geometry.attributes.position.array.slice(0, 6)) : null;
        
        window.selectDomainATypology('VERTICAL_VOID');
        
        const meshAfter = window.originalMeshes && window.originalMeshes[0]?.mesh;
        const posAfter = meshAfter ? Array.from(meshAfter.geometry.attributes.position.array.slice(0, 6)) : null;
        
        return {
            posBefore: posBefore,
            posAfter: posAfter,
            isSame: JSON.stringify(posBefore) === JSON.stringify(posAfter)
        };
    })()
"@
    Write-Output "Change Typo While Sliders Active: $changeTypoWhileTweak"

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force
    }
    if (Test-Path $tempProfile) {
        Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
}
