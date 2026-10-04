$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9268
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
    Write-Output "--- Loading Rhino Model ---"
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    Write-Output "--- Testing REQUIRED TEST: Growth = 70% Across 3 Typologies ---"
    $growthTest = Eval-JS @"
    (() => {
        const origPos = window.getOriginalMeshPositions();
        const bounds = window.getModelBounds();
        const testDna = [0, 0, 0, 0, 0, 0.70]; // Exactly Growth = 70%, all other sliders 0%
        
        const cX = (bounds.min.x + bounds.max.x) / 2;
        const cY = (bounds.min.y + bounds.max.y) / 2;
        const cZ = (bounds.min.z + bounds.max.z) / 2;
        const transSpan = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);

        function analyzeGrowth(typoKey) {
            // Apply rule through active typology
            const defPos = window.applyArtNouveauDNA(origPos, testDna, bounds, 75, true, typoKey);
            
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;
            let maxDX = 0, maxDY = 0, maxDZ = 0;
            let centerVoidDisplacements = [];
            let perimeterDisplacements = [];

            for (let i = 0; i < defPos.length; i += 3) {
                let x = defPos[i], y = defPos[i+1], z = defPos[i+2];
                let ox = origPos[i], oy = origPos[i+1], oz = origPos[i+2];

                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                if (z < minZ) minZ = z;
                if (z > maxZ) maxZ = z;

                let dx = Math.abs(x - ox);
                let dy = y - oy; // signed vertical
                let dz = Math.abs(z - oz);

                if (dx > maxDX) maxDX = dx;
                if (Math.abs(dy) > maxDY) maxDY = Math.abs(dy);
                if (dz > maxDZ) maxDZ = dz;

                let rOrig = Math.sqrt((ox - cX)*(ox - cX) + (oz - cZ)*(oz - cZ));
                let disp = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (rOrig < 0.22 * transSpan) {
                    centerVoidDisplacements.push(disp);
                } else {
                    perimeterDisplacements.push(disp);
                }
            }

            const spanX = maxX - minX;
            const spanY = maxY - minY;
            const spanZ = maxZ - minZ;
            const maxVoidDisp = centerVoidDisplacements.length > 0 ? Math.max(...centerVoidDisplacements) : 0;
            const avgPerimeterDisp = perimeterDisplacements.reduce((a,b)=>a+b,0) / Math.max(1, perimeterDisplacements.length);

            return {
                typology: typoKey,
                spanX: Number(spanX.toFixed(2)),
                spanY: Number(spanY.toFixed(2)),
                spanZ: Number(spanZ.toFixed(2)),
                maxDX: Number(maxDX.toFixed(2)),
                maxDY: Number(maxDY.toFixed(2)),
                maxDZ: Number(maxDZ.toFixed(2)),
                centerVoidPreserved: maxVoidDisp < 0.001,
                maxVoidDisp: Number(maxVoidDisp.toFixed(3)),
                avgPerimeterDisp: Number(avgPerimeterDisp.toFixed(2))
            };
        }

        const vVoid = analyzeGrowth('VERTICAL_VOID');
        const cHall = analyzeGrowth('CONTINUOUS_HALL');
        const lGallery = analyzeGrowth('LINEAR_GALLERY');

        return JSON.stringify({
            VERTICAL_VOID: vVoid,
            CONTINUOUS_HALL: cHall,
            LINEAR_GALLERY: lGallery
        }, null, 2);
    })()
"@
    Write-Output $growthTest

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
