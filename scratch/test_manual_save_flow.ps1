$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) { $edgePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$port = 9388
$tempProfile = Join-Path $env:TEMP ('test_profile_' + [guid]::NewGuid().ToString().Substring(0,8))
$proc = Start-Process -FilePath $edgePath -ArgumentList '--headless=new', "--remote-debugging-port=$port", "--user-data-dir=$tempProfile", '--window-size=1600,1000', 'http://127.0.0.1:8080/index.html?v=20261001_v2' -PassThru
Start-Sleep -Seconds 3

try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json"
    $page = $pages | Where-Object { $_.url -like '*8080*' } | Select-Object -First 1
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [System.Threading.CancellationToken]::None
    $ws.ConnectAsync([uri]$page.webSocketDebuggerUrl, $ct).Wait()

    $script:reqId = 100
    function Send-CDP($m, $p) {
        $script:reqId++
        $myId = $script:reqId
        $payload = @{ id = $myId; method = $m; params = $p } | ConvertTo-Json -Compress -Depth 10
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        
        while ($true) {
            $ms = New-Object System.IO.MemoryStream
            $buf = [byte[]]::new(65536)
            while ($true) {
                $seg = [System.ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, $ct).Result
                $ms.Write($buf, 0, $r.Count)
                if ($r.EndOfMessage) { break }
            }
            $str = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
            $json = $str | ConvertFrom-Json
            if ($json.id -eq $myId) {
                return $str
            }
        }
    }

    function Eval-JS($code) {
        $r = Send-CDP 'Runtime.evaluate' @{ expression = $code; returnByValue = $true; awaitPromise = $true }
        return ($r | ConvertFrom-Json).result.result.value
    }

    function Save-Screenshot($filepath) {
        $r = Send-CDP "Page.captureScreenshot" @{ format = 'png' }
        $data = ($r | ConvertFrom-Json).result.data
        if ($data) {
            $bytes = [System.Convert]::FromBase64String($data)
            [System.IO.File]::WriteAllBytes($filepath, $bytes)
            Write-Host "Wrote screenshot to: $filepath (size: $($bytes.Length))"
        }
    }

    Send-CDP 'Runtime.evaluate' @{ expression = "window.loadRhinoFromUrl('compressed.3dm')" } | Out-Null

    # Wait for model
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 400
        $c = Eval-JS "Boolean(window.originalMeshes && window.originalMeshes.length > 0 && window.originalMeshes[0]?.originalPositions)"
        if ($c -eq $true) { 
            Write-Host "Model loaded after attempt $i"
            break 
        }
    }

    # Select Typology 2
    Eval-JS @'
    (() => {
        const pills = document.querySelectorAll('.domain-a-pill');
        if (pills && pills[1]) pills[1].click();
    })()
'@ | Out-Null
    Start-Sleep -Milliseconds 500

    # Set Slider B to 100%
    Eval-JS @'
    (() => {
        const sB = document.getElementById('slider-dna-b');
        if (sB) {
            sB.value = 100;
            sB.dispatchEvent(new Event('input', { bubbles: true }));
            sB.dispatchEvent(new Event('change', { bubbles: true }));
        }
    })()
'@ | Out-Null
    Start-Sleep -Milliseconds 500

    # Click the "SAVE TO LIBRARY" subtab in Domain B
    $clickSaveTab = Eval-JS @'
    (() => {
        const btnSave = document.getElementById('tab-btn-domain-b-save');
        if (btnSave) {
            btnSave.click();
            return 'Clicked SAVE tab in Domain B';
        }
        return 'Save tab button not found';
    })()
'@
    Write-Host "Subtab click: $clickSaveTab"
    Start-Sleep -Milliseconds 500

    # Read preview values
    $previewStats = Eval-JS @'
    (() => {
        return {
            typo: document.getElementById('manual-save-typo')?.textContent,
            dna: document.getElementById('manual-save-dna')?.textContent,
            branching: document.getElementById('manual-save-branching')?.textContent,
            titleInput: document.getElementById('manual-save-name')?.value
        };
    })()
'@
    Write-Host "Manual Save Tab Preview Stats:"
    $previewStats | ConvertTo-Json

    # Capture screenshot of Domain B with SAVE tab open
    Save-Screenshot (Join-Path $PSScriptRoot "domain_b_save_tab_active.png")

    # Direct call to window.saveCurrentManualIteration inside try-catch
    $saveExec = Eval-JS @'
    (() => {
        try {
            const res = window.saveCurrentManualIteration();
            return {
                success: true,
                resId: res?.id,
                resTitle: res?.title,
                libLen: window.domainState?.savedLibrary?.length,
                alertHtml: document.getElementById('manual-save-alert')?.innerHTML
            };
        } catch(err) {
            return {
                success: false,
                errMsg: err.message,
                errStack: err.stack
            };
        }
    })()
'@
    Write-Host "Save execution:"
    $saveExec | ConvertTo-Json

    Start-Sleep -Milliseconds 600

    # Capture Domain B tab showing success confirmation
    Save-Screenshot (Join-Path $PSScriptRoot "domain_b_save_success.png")

    # Switch workspace tab to 'library'
    Eval-JS "window.switchWorkspaceTab('library')" | Out-Null
    Start-Sleep -Milliseconds 800

    # Verify iteration exists in library grid
    $libStats = Eval-JS @'
    (() => {
        const grid = document.getElementById('library-cards-grid');
        const cards = grid ? grid.querySelectorAll('.lib-card') : [];
        return {
            cardCount: cards.length,
            firstCardText: cards[0]?.innerText?.replace(/\s+/g, ' '),
            libTabBadge: document.getElementById('lib-tab-count-badge')?.textContent
        };
    })()
'@
    Write-Host "Library verification:"
    $libStats | ConvertTo-Json

    # Capture Iteration Library showing the saved manual iteration card
    Save-Screenshot (Join-Path $PSScriptRoot "iteration_library_manual_card.png")

} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    if (Test-Path $tempProfile) { Remove-Item -Path $tempProfile -Recurse -Force -ErrorAction SilentlyContinue }
}
