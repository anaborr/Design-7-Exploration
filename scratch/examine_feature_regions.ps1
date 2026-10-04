$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9265
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

    # Let's inspect the SubD control cage or guide curves in fidelityData or in Rhino objects!
    $res = Eval-JS @"
    (() => {
        const docObjs = window.fidelityData;
        const cageGrp = window.cageGroup;
        const curveGrp = window.curvesGroup;
        const meshGrp = window.meshGroup;

        // Check cage lines or points
        let cageCount = cageGrp ? cageGrp.children.length : 0;
        let curvesCount = curveGrp ? curveGrp.children.length : 0;
        let meshCount = meshGrp ? meshGrp.children.length : 0;

        // Check if there are edges with high curvature or ridge edges
        const mesh = window.originalMeshes && window.originalMeshes[0] ? (window.originalMeshes[0].mesh || window.originalMeshes[0].threeMesh) : null;
        if (!mesh) return JSON.stringify({ error: "no mesh" });

        const pos = mesh.geometry.attributes.position.array;
        const norm = mesh.geometry.attributes.normal.array;
        const idx = mesh.geometry.index.array;

        // Find candidate continuous edges/ridges
        // An architectural edge/ridge is a sequence of connected vertices where normal changes or boundary turns
        // Let's examine candidate regions:
        // Region A: Front cantilever edge (around minX ~ -10, y ~ 11)
        // Region B: Front foot edge (around maxX ~ 20, y ~ 2)
        // Region C: Side waist edge
        // Region D: Upper backrest ridge (around maxY ~ 20)

        function getRegionStats(filterFn) {
            let pts = [];
            for (let i = 0; i < pos.length; i += 3) {
                let x = pos[i], y = pos[i+1], z = pos[i+2];
                let nx = norm[i], ny = norm[i+1], nz = norm[i+2];
                if (filterFn(x, y, z, nx, ny, nz)) {
                    pts.push({ i, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), nx: +nx.toFixed(2), ny: +ny.toFixed(2), nz: +nz.toFixed(2) });
                }
            }
            return { count: pts.length, sample: pts.slice(0, 5) };
        }

        return JSON.stringify({
            cageCount, curvesCount, meshCount,
            cantilever_minX: getRegionStats((x, y, z) => x < -8.5),
            foot_maxX: getRegionStats((x, y, z) => x > 18.0),
            upper_crest: getRegionStats((x, y, z) => y > 18.0),
            seat_front: getRegionStats((x, y, z) => y >= 4.0 && y <= 7.0 && z > -1.0)
        });
    })()
"@
    Write-Output "REGIONS: $res"

} finally {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
}
