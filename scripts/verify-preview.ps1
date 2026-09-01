param([Parameter(Mandatory = $true)][string]$Deployment)
$ErrorActionPreference = 'Stop'

function Invoke-PreviewGet([string]$Path) {
  $ErrorActionPreference = 'Continue'
  $response = (& vercel.cmd curl $Path --deployment $Deployment 2>$null) -join "`n"
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) { throw "Hosted Preview request failed: $Path" }
  return $response
}

$html = Invoke-PreviewGet '/concierge.html'
if ($html -notmatch 'Start my job agent' -or $html -notmatch 'Fully remote' -or $html -notmatch 'Receipt-verified application target' -or $html -notmatch '>Sign in<') {
  throw 'Hosted Concierge HTML verification failed.'
}

$api = (Invoke-PreviewGet '/api/concierge-preview-smoke') | ConvertFrom-Json
if (-not $api.ok -or $api.durableRateLimit -ne 'passed') { throw "Hosted discovery smoke failed: $($api.error)" }
$live = (Invoke-PreviewGet '/api/health/live') | ConvertFrom-Json
if ($live.status -ne 'healthy' -or -not $live.alive) { throw 'Hosted liveness verification failed.' }
$ready = (Invoke-PreviewGet '/api/health/ready') | ConvertFrom-Json
if ($ready.ready -ne $false -or $ready.status -ne 'unavailable') { throw 'Incomplete Preview must fail readiness closed.' }
Write-Output "Preview verified: truthful first-use UI, healthy liveness, fail-closed readiness, durable limiter, $($api.sourcesChecked) live employer feeds, $($api.matches) exact smoke-test matches, submissions disabled."
