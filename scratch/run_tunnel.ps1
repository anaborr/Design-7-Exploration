$bin = Join-Path $env:TEMP "cloudflared.exe"
$log = Join-Path $PSScriptRoot "tunnel.log"
if (Test-Path $log) { Remove-Item $log -Force }
& $bin tunnel --url http://127.0.0.1:8080 *>&1 | Tee-Object -FilePath $log
