# Sets the Job Agent monetary budget in Vercel PRODUCTION.
# Why: api/ai.js requires a ready spend ledger in production and returns
# 503 MONETARY_SPEND_CONTROL_NOT_CONFIGURED without it. These vars turn hosted AI back on.
#
# EDIT THE NUMBERS FIRST. They are cents. 5000 = $50.00.
# Rule the code enforces: maxRequest <= dailyCap <= global. Break it anywhere and
# the whole config stays ready:false and nothing changes.
#
# Run from this folder:  .\set-job-agent-budget.ps1

$ErrorActionPreference = 'Stop'

$vars = [ordered]@{
  # --- gate ---
  'JOB_AGENT_MONETARY_BUDGET_ENABLED'            = 'true'
  'JOB_AGENT_MONETARY_BUDGET_APPROVED'           = 'true'
  'JOB_AGENT_MONETARY_BUDGET_APPROVAL_VERSION'   = '2026-08-31.v1'   # ^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$
  'JOB_AGENT_MONETARY_BUDGET_CURRENCY'           = 'USD'             # must be exactly USD

  # --- the real ceiling: nothing can exceed this per day ---
  'JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS'          = '5000'            # $50.00/day

  # --- per category: daily cap, then max for a single request ---
  'JOB_AGENT_AI_DAILY_BUDGET_CENTS'              = '3000'            # $30.00
  'JOB_AGENT_AI_MAX_REQUEST_CENTS'               = '50'              # $0.50
  'JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS'      = '2000'            # $20.00
  'JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS'       = '100'             # $1.00
  'JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS' = '500'             # $5.00
  'JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS'  = '10'              # $0.10
  'JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS'= '2000'            # $20.00
  'JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS' = '50'              # $0.50
  'JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS'           = '200'             # $2.00
  'JOB_AGENT_EMAIL_MAX_REQUEST_CENTS'            = '5'               # $0.05
  'JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS'  = '500'             # $5.00
  'JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS'   = '10'              # $0.10
}

# --- sanity check before touching Vercel ---
$global = [int]$vars['JOB_AGENT_GLOBAL_DAILY_BUDGET_CENTS']
$pairs = @(
  @('JOB_AGENT_AI_DAILY_BUDGET_CENTS','JOB_AGENT_AI_MAX_REQUEST_CENTS'),
  @('JOB_AGENT_PACKAGE_AI_DAILY_BUDGET_CENTS','JOB_AGENT_PACKAGE_AI_MAX_REQUEST_CENTS'),
  @('JOB_AGENT_DOCUMENT_RENDER_DAILY_BUDGET_CENTS','JOB_AGENT_DOCUMENT_RENDER_MAX_REQUEST_CENTS'),
  @('JOB_AGENT_EMPLOYER_BROWSER_DAILY_BUDGET_CENTS','JOB_AGENT_EMPLOYER_BROWSER_MAX_SESSION_CENTS'),
  @('JOB_AGENT_EMAIL_DAILY_BUDGET_CENTS','JOB_AGENT_EMAIL_MAX_REQUEST_CENTS'),
  @('JOB_AGENT_OBJECT_STORAGE_DAILY_BUDGET_CENTS','JOB_AGENT_OBJECT_STORAGE_MAX_REQUEST_CENTS')
)
foreach ($p in $pairs) {
  $daily = [int]$vars[$p[0]]; $max = [int]$vars[$p[1]]
  if ($max -gt $daily)    { throw "$($p[1]) ($max) is greater than $($p[0]) ($daily) — config would be rejected." }
  if ($daily -gt $global) { throw "$($p[0]) ($daily) is greater than the global cap ($global) — config would be rejected." }
}
Write-Host "Caps validated against the rule the code enforces." -ForegroundColor Green
Write-Host ("Global ceiling: `${0:N2}/day" -f ($global/100)) -ForegroundColor Green
Write-Host ""

foreach ($name in $vars.Keys) {
  $value = $vars[$name]
  Write-Host ("  {0,-46} {1}" -f $name, $value)
  # remove first so re-running this script updates rather than erroring on a duplicate
  cmd /c "npx vercel env rm $name production --yes" 2>$null | Out-Null
  $value | npx vercel env add $name production
}

Write-Host ""
Write-Host "Done. Environment variables only take effect on a NEW deployment:" -ForegroundColor Yellow
Write-Host "    npx vercel --prod" -ForegroundColor Yellow
