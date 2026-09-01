$ErrorActionPreference = 'Stop'

$temporaryResponse = (& curl.exe -sS -X POST -H 'User-Agent: codex' 'https://upstash.com/start-redis') -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Could not create the temporary Upstash Redis database.' }
$urlMatch = [regex]::Match($temporaryResponse, '\*\*Endpoint:\*\*\s*(https://\S+)')
$tokenMatch = [regex]::Match($temporaryResponse, '\*\*Token:\*\*\s*(\S+)')
if (-not $urlMatch.Success -or -not $tokenMatch.Success) {
  throw 'Upstash did not return the expected temporary Redis credentials.'
}

$secretBytes = New-Object byte[] 48
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($secretBytes)
$randomGenerator.Dispose()
$hashSecret = [Convert]::ToBase64String($secretBytes)

$deployArguments = @(
  'deploy', '--yes',
  '-e', "UPSTASH_REDIS_REST_URL=$($urlMatch.Groups[1].Value)",
  '-e', "UPSTASH_REDIS_REST_TOKEN=$($tokenMatch.Groups[1].Value)",
  '-e', "RATE_LIMIT_HASH_SECRET=$hashSecret",
  '-e', 'AI_GLOBAL_DAILY_UNITS=5000',
  '-e', 'CLAUDE_GLOBAL_DAILY_UNITS=5000',
  '-e', 'JOB_SEARCH_GLOBAL_DAILY_CALLS=10000',
  '-e', 'DISCOVERY_GLOBAL_DAILY_CALLS=5000'
)

& vercel.cmd @deployArguments
if ($LASTEXITCODE -ne 0) { throw 'Temporary preview deployment failed.' }
Write-Output 'The preview uses a no-cost Redis database that expires after 72 hours. It is for synthetic verification only, not production.'
