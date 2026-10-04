$port = 9285
$cdpWs = (Invoke-RestMethod -Uri "http://127.0.0.1:$port/json")[0].webSocketDebuggerUrl
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = New-Object System.Threading.CancellationToken
$ws.ConnectAsync([uri]$cdpWs, $ct).Wait()

function Eval-JS($js) {
    $id = [System.Threading.Interlocked]::Increment([ref]1)
    $payload = @{ id = $id; method = 'Runtime.evaluate'; params = @{ expression = $js; returnByValue = $true; awaitPromise = $true } } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $seg = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
    $buf = New-Object byte[] 65536
    $rcv = New-Object System.ArraySegment[byte] -ArgumentList @(,$buf)
    $res = $ws.ReceiveAsync($rcv, $ct).Result
    $str = [System.Text.Encoding]::UTF8.GetString($buf, 0, $res.Count)
    return $str | ConvertFrom-Json
}

$r = Eval-JS @"
(() => {
  const curves = window.originalCurves || [];
  const meshes = window.originalMeshes || [];
  const cages = window.originalCages || [];
  const m0 = meshes[0] ? (meshes[0].mesh || meshes[0].threeMesh) : null;
  const geom = m0 ? m0.geometry : null;
  let box = null;
  if (geom) {
    geom.computeBoundingBox();
    box = geom.boundingBox;
  }
  return {
    curveCount: curves.length,
    meshCount: meshes.length,
    bounds: box ? {
      min: [box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2)],
      max: [box.max.x.toFixed(2), box.max.y.toFixed(2), box.max.z.toFixed(2)]
    } : null,
    material: m0 && m0.material ? {
      color: '#' + m0.material.color.getHexString(),
      roughness: m0.material.roughness,
      metalness: m0.material.metalness
    } : null
  };
})()
"@

$r.result.result.value | ConvertTo-Json
$ws.Dispose()
