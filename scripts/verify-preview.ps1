param([Parameter(Mandatory = $true)][string]$Deployment)
$ErrorActionPreference = 'Stop'

$ErrorActionPreference = 'Continue'
$html = (& vercel.cmd curl '/concierge.html' --deployment $Deployment 2>$null) -join "`n"
$htmlExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($htmlExitCode -ne 0 -or $html -notmatch 'Start my job agent' -or $html -notmatch 'hybrid or remote') {
  throw 'Hosted Concierge HTML verification failed.'
}

$ErrorActionPreference = 'Continue'
$apiRaw = (& vercel.cmd curl '/api/concierge-preview-smoke' --deployment $Deployment 2>$null) -join "`n"
$apiExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($apiExitCode -ne 0) { throw 'Hosted discovery request failed.' }
$api = $apiRaw | ConvertFrom-Json
if (-not $api.ok -or $api.durableRateLimit -ne 'passed') { throw "Hosted discovery smoke failed: $($api.error)" }
Write-Output "Preview verified: hosted one-prompt UI, durable limiter, $($api.sourcesChecked) live employer feeds, $($api.matches) exact smoke-test matches, submissions disabled."
