$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ws.Options.KeepAliveInterval = [TimeSpan]::Zero
$uri = New-Object Uri("ws://localhost:9222/devtools/browser")
$res = Invoke-RestMethod -Uri "http://localhost:9222/json"
$page = $res | Where-Object { $_.url -match "index\.html" } | Select-Object -First 1
if (-not $page) { Write-Host "No page found"; exit }
$wsUri = New-Object Uri($page.webSocketDebuggerUrl)
$ws.ConnectAsync($wsUri, [System.Threading.CancellationToken]::None).Wait()

function Send-CDP {
    param([string]$method, [hashtable]$params = @{})
    $req = @{ id = 1; method = $method; params = $params }
    $json = (New-Object System.Web.Script.Serialization.JavaScriptSerializer).Serialize($req)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync(
        (New-Object System.ArraySegment[byte]($bytes)),
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [System.Threading.CancellationToken]::None
    ).Wait()
    
    $buffer = New-Object byte[] 8192
    $segment = New-Object System.ArraySegment[byte]($buffer)
    $result = $ws.ReceiveAsync($segment, [System.Threading.CancellationToken]::None).Result
    $respJson = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
    return (New-Object System.Web.Script.Serialization.JavaScriptSerializer).DeserializeObject($respJson)
}

$r = Send-CDP 'Runtime.evaluate' @{ expression = "try { generatePopulation(); 'SUCCESS' } catch(e) { e.message + '\n' + e.stack }"; returnByValue = $true }
Write-Host "EVAL RESULT: $($r.result.result.value)"
