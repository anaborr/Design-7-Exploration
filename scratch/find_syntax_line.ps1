$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9289
$tempProfile = Join-Path $env:TEMP ('test_prof_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", 'http://127.0.0.1:8080/' -PassThru
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

    $jsCode = @'
    (async () => {
        const resp = await fetch('generator.js?v=' + Date.now());
        const text = await resp.text();
        const lines = text.split('\n');
        
        // Binary search or incremental parse to find which line breaks
        let low = 0;
        let high = lines.length;
        
        // Test parsing chunks
        for (let i = 100; i < lines.length; i += 100) {
            const chunk = lines.slice(0, i).join('\n');
            try {
                // Wrap in function to check if syntax is valid up to here
                // Note: might be incomplete syntax, but let's check parse error vs unexpected token
            } catch(e) {}
        }
        
        // Better: test inserting a script element with data URI or blob
        const blob = new Blob([text], {type: 'application/javascript'});
        const url = URL.createObjectURL(blob);
        
        return new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = url;
            s.onerror = (e) => resolve({ error: 'script onerror', e });
            window.addEventListener('error', (e) => {
                if (e.filename === url) {
                    resolve({ line: e.lineno, col: e.colno, message: e.message, lineText: lines[e.lineno - 1] });
                }
            });
            document.body.appendChild(s);
            setTimeout(() => resolve({ timeout: true }), 2000);
        });
    })()
'@

    $res = Eval-JS $jsCode
    $res | ConvertTo-Json -Depth 5
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $tempProfile -ErrorAction SilentlyContinue
}
