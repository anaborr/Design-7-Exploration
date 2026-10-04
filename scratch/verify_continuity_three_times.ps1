$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9248
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
    Start-Sleep -Seconds 4

    # Frame camera closer to geometry for high visual detail
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

    # Switch to ITERATION comparison mode explicitly
    Eval-JS "if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');" | Out-Null
    Start-Sleep -Milliseconds 500

    Write-Output "`n=================================================================="
    Write-Output "VERIFICATION 1: LOW CONTINUITY (C = 15%)"
    Write-Output "Rule: Elements remain mostly separate with gaps and breaks, minimal connections."
    Write-Output "=================================================================="
    $v1 = Eval-JS @"
    (() => {
        const slider = document.getElementById('slider-dna-c');
        if (slider) {
            slider.value = 15;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');

        const badge = document.getElementById('badge-dna-c') ? document.getElementById('badge-dna-c').innerText : '';
        const disc = document.getElementById('metric-c-disconnected') ? document.getElementById('metric-c-disconnected').innerText : '';
        const conn = document.getElementById('metric-c-connected') ? document.getElementById('metric-c-connected').innerText : '';
        const valCont = document.getElementById('val-rule-cont') ? document.getElementById('val-rule-cont').innerText : '';
        const stats = window.lastEngineStats || {};

        return {
            c_val: 0.15,
            badge: badge,
            disconnectedMetric: disc,
            connectedMetric: conn,
            ruleValidation: valCont,
            affectedVertices: stats.affectedVertexCount,
            affectedPct: stats.affectedPct,
            maxDisplacement: stats.maxDisplacement,
            meanDisplacement: stats.meanDisplacement,
            seedIdentityPct: stats.seedIdentityPct
        };
    })()
"@
    Write-Output ($v1 | ConvertTo-Json -Depth 5)
    Start-Sleep -Milliseconds 800
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\continuity_v1_low.png"

    Write-Output "`n=================================================================="
    Write-Output "VERIFICATION 2: MEDIUM CONTINUITY (C = 50%)"
    Write-Output "Rule: Elements begin to connect, connections frequent and intentional, geometry reads as unified system."
    Write-Output "=================================================================="
    $v2 = Eval-JS @"
    (() => {
        const slider = document.getElementById('slider-dna-c');
        if (slider) {
            slider.value = 50;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');

        const badge = document.getElementById('badge-dna-c') ? document.getElementById('badge-dna-c').innerText : '';
        const disc = document.getElementById('metric-c-disconnected') ? document.getElementById('metric-c-disconnected').innerText : '';
        const conn = document.getElementById('metric-c-connected') ? document.getElementById('metric-c-connected').innerText : '';
        const valCont = document.getElementById('val-rule-cont') ? document.getElementById('val-rule-cont').innerText : '';
        const stats = window.lastEngineStats || {};

        return {
            c_val: 0.50,
            badge: badge,
            disconnectedMetric: disc,
            connectedMetric: conn,
            ruleValidation: valCont,
            affectedVertices: stats.affectedVertexCount,
            affectedPct: stats.affectedPct,
            maxDisplacement: stats.maxDisplacement,
            meanDisplacement: stats.meanDisplacement,
            seedIdentityPct: stats.seedIdentityPct
        };
    })()
"@
    Write-Output ($v2 | ConvertTo-Json -Depth 5)
    Start-Sleep -Milliseconds 800
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\continuity_v2_med.png"

    Write-Output "`n=================================================================="
    Write-Output "VERIFICATION 3: HIGH CONTINUITY (C = 85%)"
    Write-Output "Rule: Most elements connected, gaps minimized, elements flow into one continuous cohesive form."
    Write-Output "=================================================================="
    $v3 = Eval-JS @"
    (() => {
        const slider = document.getElementById('slider-dna-c');
        if (slider) {
            slider.value = 85;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (window.switchVisualComparisonMode) window.switchVisualComparisonMode('ITERATION');

        const badge = document.getElementById('badge-dna-c') ? document.getElementById('badge-dna-c').innerText : '';
        const disc = document.getElementById('metric-c-disconnected') ? document.getElementById('metric-c-disconnected').innerText : '';
        const conn = document.getElementById('metric-c-connected') ? document.getElementById('metric-c-connected').innerText : '';
        const valCont = document.getElementById('val-rule-cont') ? document.getElementById('val-rule-cont').innerText : '';
        const stats = window.lastEngineStats || {};

        return {
            c_val: 0.85,
            badge: badge,
            disconnectedMetric: disc,
            connectedMetric: conn,
            ruleValidation: valCont,
            affectedVertices: stats.affectedVertexCount,
            affectedPct: stats.affectedPct,
            maxDisplacement: stats.maxDisplacement,
            meanDisplacement: stats.meanDisplacement,
            seedIdentityPct: stats.seedIdentityPct
        };
    })()
"@
    Write-Output ($v3 | ConvertTo-Json -Depth 5)
    Start-Sleep -Milliseconds 800
    Save-Screenshot "c:\Users\anabo\OneDrive\Desktop\Vibecoding\Design 7 Exploration\scratch\continuity_v3_high.png"

    Write-Output "`n=================================================================="
    Write-Output "CROSS-TYPOLOGY CHECK: COMPRESSED_EXPANDED, OPEN_HALL, VERTICAL_VOID"
    Write-Output "Verifying Domain A Typology influence is completely preserved"
    Write-Output "=================================================================="
    $crossCheck = Eval-JS @"
    (() => {
        const results = {};

        // 1. VERTICAL_VOID (C = 0.60)
        window.selectTypology('VERTICAL_VOID');
        window.domainState.dna[0] = 0.60;
        window.updateDnaUIAndViewport();
        results.vertical_void = {
            mode: 'VERTICAL_CONNECTIONS',
            maxDisplacement: window.lastEngineStats.maxDisplacement,
            affectedPct: window.lastEngineStats.affectedPct,
            ruleMsg: window.lastEngineStats.ruleValidation.continuity.msg
        };

        // 2. COMPRESSED_EXPANDED (C = 0.60)
        window.selectTypology('COMPRESSED_EXPANDED');
        window.domainState.dna[0] = 0.60;
        window.updateDnaUIAndViewport();
        results.compressed_expanded = {
            mode: 'ZONE_TRANSITIONS',
            maxDisplacement: window.lastEngineStats.maxDisplacement,
            affectedPct: window.lastEngineStats.affectedPct,
            ruleMsg: window.lastEngineStats.ruleValidation.continuity.msg
        };

        // 3. OPEN_HALL (C = 0.60)
        window.selectTypology('OPEN_HALL');
        window.domainState.dna[0] = 0.60;
        window.updateDnaUIAndViewport();
        results.open_hall = {
            mode: 'CONTINUOUS_SHELL',
            maxDisplacement: window.lastEngineStats.maxDisplacement,
            affectedPct: window.lastEngineStats.affectedPct,
            ruleMsg: window.lastEngineStats.ruleValidation.continuity.msg
        };

        return results;
    })()
"@
    Write-Output ($crossCheck | ConvertTo-Json -Depth 5)

} finally {
    if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "Done", $ct).Wait()
    }
    if ($proc -and -not $proc.HasExited) {
        $proc.Kill()
    }
}
