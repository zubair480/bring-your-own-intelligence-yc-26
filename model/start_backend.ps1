$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Install model/.venv dependencies before starting the backend.'
}
$listeners = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    $backendProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($backendProcess.CommandLine -notmatch 'uvicorn\s+server\.app:app') {
        throw "Port 8000 belongs to a different application (PID $($listener.OwningProcess))."
    }
}
foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess
}
$logPath = Join-Path $PSScriptRoot 'runs'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$started = Start-Process -FilePath $pythonPath -ArgumentList @(
    '-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', '8000'
) -WorkingDirectory $repoPath -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logPath 'backend.stdout.log') `
    -RedirectStandardError (Join-Path $logPath 'backend.stderr.log')
Write-Output "Started Faceplate backend using model/.venv (PID $($started.Id)), bound to 127.0.0.1:8000."
