$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9290
$tempProfile = Join-Path $env:TEMP ('test_prof_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()
    
    $msgId = 0
    function Send-CDP($method, $params) {
        $script:msgId++
        $payload = @{ id = $script:msgId; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 10
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
    Eval-JS "window.loadRhinoFromUrl('compressed.3dm')" | Out-Null
    Start-Sleep -Seconds 4

    $jsCode = @'
    (() => {
        const mesh = window.originalMeshes[1]?.mesh || window.originalMeshes[0]?.mesh;
        
        const testSliderAcrossTypologies = (sliderId, val) => {
            const typologies = ['VERTICAL_VOID', 'LINEAR_GALLERY', 'CONTINUOUS_HALL', 'TOPOGRAPHIC_GROUND'];
            const data = {};
            
            typologies.forEach(tKey => {
                document.querySelector(`[data-key="${tKey}"]`).click();
                const s = document.getElementById(sliderId);
                s.value = val.toString();
                s.dispatchEvent(new Event('input', { bubbles: true }));
                
                data[tKey] = {
                    posSample: Array.from(mesh.geometry.attributes.position.array.slice(0, 10)),
                    fullPos: Array.from(mesh.geometry.attributes.position.array),
                    sliderVal: s.value
                };
                
                // reset
                s.value = '0';
                s.dispatchEvent(new Event('input', { bubbles: true }));
            });
            
            const diffVoidGallery = data.VERTICAL_VOID.fullPos.reduce((acc, v, i) => acc + Math.abs(v - data.LINEAR_GALLERY.fullPos[i]), 0);
            const diffVoidHall = data.VERTICAL_VOID.fullPos.reduce((acc, v, i) => acc + Math.abs(v - data.CONTINUOUS_HALL.fullPos[i]), 0);
            
            return {
                diffVoidGallery: Math.round(diffVoidGallery),
                diffVoidHall: Math.round(diffVoidHall),
                isDistinct: diffVoidGallery > 1000 && diffVoidHall > 1000
            };
        };

        return {
            continuityTest: testSliderAcrossTypologies('slider-dna-c', 70),
            whiplashTest: testSliderAcrossTypologies('slider-dna-w', 70),
            branchingTest: testSliderAcrossTypologies('slider-dna-b', 70)
        };
    })()
'@

    $res = Eval-JS $jsCode
    $res | ConvertTo-Json -Depth 5
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $tempProfile -ErrorAction SilentlyContinue
}
