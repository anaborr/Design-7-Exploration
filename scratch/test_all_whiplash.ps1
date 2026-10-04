$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9336
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
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
        $parsed = $r | ConvertFrom-Json
        return $parsed.result.result.value
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        $ready = Eval-JS "!!window.rhinoSubDMesh"
        if ($ready -eq $true) { break }
    }

    $res = Eval-JS @"
    (() => {
        const typologies = ['VERTICAL_VOID', 'COMPRESSED_EXPANDED', 'OPEN_HALL', 'TERRACED_STEPPED', 'LINEAR_DIRECTIONAL', 'FOLDED_UNDULATING'];
        const results = [];
        for (const t of typologies) {
            const grammar = (window.TYPOLOGY_SPATIAL_GRAMMARS && window.TYPOLOGY_SPATIAL_GRAMMARS[t]) || {};
            const basePos = window.rhinoSubDMesh ? window.rhinoSubDMesh.geometry.attributes.position.array.slice() : null;
            if (!basePos) continue;
            const deformed = window.applyShapeRule(basePos, 'WHIPLASH', 0.70, grammar);
            let hasNaN = false, maxD = 0;
            for (let i = 0; i < deformed.length; i += 3) {
                if (isNaN(deformed[i]) || isNaN(deformed[i+1]) || isNaN(deformed[i+2])) hasNaN = true;
                const d = Math.hypot(deformed[i] - basePos[i], deformed[i+1] - basePos[i+1], deformed[i+2] - basePos[i+2]);
                if (d > maxD) maxD = d;
            }
            results.push({ typology: t, style: grammar.whiplashStyle, hasNaN, maxDisp: Number(maxD.toFixed(2)) });
        }
        return JSON.stringify(results);
    })()
"@
    Write-Output $res
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
