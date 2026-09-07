$ErrorActionPreference = 'Continue'
$taskResponse = & vercel api '/v10/projects/prj_Lo7pjU6rfjxa30mEFE6TFuU0ZTcI/env?teamId=team_hCdrlUnNBwc8vozwFwF5WkjP' --raw 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Vercel environment metadata request failed.' }
$taskData = ($taskResponse -join "`n") | ConvertFrom-Json
$taskNames = @('AI_PROVIDER', 'AI_DOCUMENT_PROVIDER', 'AI_DOCUMENT_MODEL', 'AI_QUALITY_MODEL', 'AI_OPENAI_REASONING_EFFORT')
$taskData.envs | Where-Object { $_.key -in $taskNames -and 'production' -in $_.target } | Select-Object id,key,type,target | ConvertTo-Json -Depth 4
