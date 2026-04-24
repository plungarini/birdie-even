$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir ".env"

if (-not (Test-Path $envFile)) {
  throw ".env file not found at $envFile"
}

$envVars = @{}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()

  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $parts = $line -split "=", 2
  if ($parts.Count -ne 2) {
    return
  }

  $key = $parts[0].Trim()
  $value = $parts[1].Trim()

  $envVars[$key] = $value
}

$serverUser = $envVars["VPS_USER"]
$serverHost = $envVars["VPS_HOST"]
$remotePath = $envVars["REMOTE_PATH"]

if (-not $serverUser) { throw "Missing VPS_USER in .env" }
if (-not $serverHost) { throw "Missing VPS_HOST in .env" }
if (-not $remotePath) { throw "Missing REMOTE_PATH in .env" }

$server = "$serverUser@$serverHost"
$remoteScriptPath = "/tmp/birdnet-deploy.sh"

Write-Host "Starting deploy..."
Write-Host "Server: $server"
Write-Host "Remote path: $remotePath`n`n"

scp (Join-Path $scriptDir "server.py") "$server`:$remotePath/server.py"
scp (Join-Path $scriptDir "requirements.txt") "$server`:$remotePath/requirements.txt"
scp (Join-Path $scriptDir "birdnet.service") "$server`:/etc/systemd/system/birdnet.service"

Write-Host "`n[OK] Copied files to remote server`n`n"

$remoteCommand = @"
set -euo pipefail

$remotePath/venv/bin/pip install -r $remotePath/requirements.txt

systemctl daemon-reload
systemctl restart birdnet

echo
echo
echo '--- Immediate status ---'
systemctl status birdnet --no-pager

sleep 15

echo
echo
echo '--- Delayed status 15s ---'
systemctl status birdnet --no-pager

if ! systemctl is-active --quiet birdnet; then
  echo
  echo
  echo '--- Recent logs ---'
  journalctl -u birdnet -n 50 --no-pager
  exit 1
fi
"@

$remoteCommand = $remoteCommand -replace "`r", ""
$localTempScript = Join-Path $env:TEMP "birdnet-deploy.sh"
[System.IO.File]::WriteAllText($localTempScript, $remoteCommand, (New-Object System.Text.UTF8Encoding($false)))

scp $localTempScript "$server`:$remoteScriptPath"
ssh $server "chmod +x $remoteScriptPath && bash $remoteScriptPath"

if ($LASTEXITCODE -ne 0) {
  ssh $server "rm -f $remoteScriptPath"
  throw "`n`n[FAIL] Deploy failed during remote SSH command."
}

ssh $server "rm -f $remoteScriptPath"
Remove-Item $localTempScript -ErrorAction SilentlyContinue

Write-Host "`n`n[OK] Deploy completed successfully."