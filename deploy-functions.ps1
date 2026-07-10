# ============================================================
#  deploy-functions.ps1  (ASCII-only for Windows PowerShell 5.1)
#  Deploys all Supabase Edge Functions for the OSO system:
#    - register            (public signup -> needs --no-verify-jwt)
#    - admin-users         (manage users + approve + notify email)
#    - send-report         (email reports, login required)
#    - send-public-report  (public form -> email PDF to OSO officer, --no-verify-jwt)
#
#  *** PREPRODUCTION COPY — deploys to the PREPROD Supabase project ***
#
#  HOW TO RUN:
#    cd "D:\Ai Tools\Claude\OSO TDAC Report\Github-Preprod"
#    powershell -ExecutionPolicy Bypass -File .\deploy-functions.ps1
#  Then paste your Supabase Access Token when it asks (input is hidden).
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectRef = "hxjdaueduibkasokawqx"   # <- project preprod ([Preprod] OSO-TDAC Operational Report) — ห้ามใช้ lmoqbnztmwjwzowqeorz ซึ่งเป็น production

Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path ".\supabase\functions\register\index.ts")) {
  Write-Host "ERROR: supabase\functions\register\index.ts not found. Run this from the Github folder." -ForegroundColor Red
  exit 1
}

# ---- Get Access Token ----
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
  Write-Host ""
  Write-Host "Need a Supabase Access Token (starts with sbp_)" -ForegroundColor Cyan
  Write-Host "Create/copy one at: https://supabase.com/dashboard/account/tokens" -ForegroundColor Cyan
  Write-Host "Paste it at the prompt below and press Enter (characters are hidden)." -ForegroundColor DarkGray
  $sec = Read-Host "Paste Access Token here" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $env:SUPABASE_ACCESS_TOKEN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$tok = $env:SUPABASE_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($tok) -or (-not $tok.StartsWith("sbp_"))) {
  Write-Host "ERROR: token looks invalid (must start with sbp_). Length got: $($tok.Length)" -ForegroundColor Red
  Write-Host "Make sure you copied the REAL token from Account > Access Tokens (not a placeholder)." -ForegroundColor Yellow
  exit 1
}
Write-Host "Token OK (length $($tok.Length))" -ForegroundColor Green

Write-Host ""
Write-Host "[1/3] deploy register (--no-verify-jwt) ..." -ForegroundColor Cyan
npx --yes supabase functions deploy register --project-ref $ProjectRef --use-api --no-verify-jwt

Write-Host ""
Write-Host "[2/3] deploy admin-users ..." -ForegroundColor Cyan
npx --yes supabase functions deploy admin-users --project-ref $ProjectRef --use-api

Write-Host ""
Write-Host "[3/4] deploy send-report ..." -ForegroundColor Cyan
npx --yes supabase functions deploy send-report --project-ref $ProjectRef --use-api

Write-Host ""
Write-Host "[4/4] deploy send-public-report (--no-verify-jwt) ..." -ForegroundColor Cyan
npx --yes supabase functions deploy send-public-report --project-ref $ProjectRef --use-api --no-verify-jwt

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " DONE. Check Dashboard > Edge Functions:" -ForegroundColor Green
Write-Host "   register, admin-users, send-report" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
