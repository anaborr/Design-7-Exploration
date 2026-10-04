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

    # Trigger Branching DNA slider to 80%
    $r1 = Eval-JS @"
    (() => {
        const sliderB = document.getElementById('slider-dna-b');
        if (sliderB) {
            sliderB.value = 80;
            sliderB.dispatchEvent(new Event('input'));
        }
        const state = window.branchingSystemState;
        const group = window.branchingWallGroup;
        const wall = group ? group.getObjectByName('PrimaryArchitecturalWall') : null;
        const seed = window.originalMeshes && window.originalMeshes[0] ? window.originalMeshes[0].mesh : null;
        
        return {
            enabled: state.enabled,
            wallExists: wall !== null,
            seedColor: seed && seed.material ? '#' + seed.material.color.getHexString() : null,
            wallColor: wall && wall.material ? '#' + wall.material.color.getHexString() : null,
            seedRoughness: seed && seed.material ? seed.material.roughness : null,
            wallRoughness: wall && wall.material ? wall.material.roughness : null,
            wallTriangles: wall && wall.geometry && wall.geometry.index ? wall.geometry.index.count / 3 : 0,
            valScore: state.lastValidation ? state.lastValidation.score : 0,
            valPass: state.lastValidation ? state.lastValidation.isValid : false
        };
    })()
"@
    $res1 = ($r1 | ConvertFrom-Json).result.result.value
    Write-Output "Live System Check:"
    $res1 | ConvertTo-Json

    Start-Sleep -Seconds 1

    # 1. Perspective View
    $camPos1 = @{ x = 30; y = 20; z = 35 }
    $camTarget1 = @{ x = 3.5; y = 6.0; z = 0 }
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set($($camPos1.x), $($camPos1.y), $($camPos1.z));
            window.threeControls.target.set($($camTarget1.x), $($camTarget1.y), $($camTarget1.z));
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot1 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes1 = [Convert]::FromBase64String(($shot1 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\consistent_branching_persp.png", $bytes1)
    Write-Output "Saved consistent_branching_persp.png"

    # 2. Connection Closeup View
    $camPos2 = @{ x = 12; y = 10; z = 8 }
    $camTarget2 = @{ x = 4.0; y = 6.2; z = -0.5 }
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
    $bytes2 = [Convert]::FromBase64String(($shot2 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\consistent_branching_closeup.png", $bytes2)
    Write-Output "Saved consistent_branching_closeup.png"

    # 3. Side Profile View (Elevation looking along edge)
    $camPos3 = @{ x = 4.0; y = 7.0; z = 22 }
    $camTarget3 = @{ x = 4.0; y = 6.2; z = 0 }
    Eval-JS @"
    (() => {
        if (window.threeCamera && window.threeControls) {
            window.threeCamera.position.set($($camPos3.x), $($camPos3.y), $($camPos3.z));
            window.threeControls.target.set($($camTarget3.x), $($camTarget3.y), $($camTarget3.z));
            window.threeControls.update();
        }
    })()
"@ | Out-Null
    Start-Sleep -Seconds 1
    $shot3 = Send-CDP "Page.captureScreenshot" @{ format = "png" }
    $bytes3 = [Convert]::FromBase64String(($shot3 | ConvertFrom-Json).result.data)
    [System.IO.File]::WriteAllBytes("C:\Users\anabo\.gemini\antigravity-ide\brain\1a2bfc3a-c696-4b87-9aa1-642079b5cd84\consistent_branching_profile.png", $bytes3)
    Write-Output "Saved consistent_branching_profile.png"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}
