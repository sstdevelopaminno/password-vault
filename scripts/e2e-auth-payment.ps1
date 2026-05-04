$ErrorActionPreference = "Stop"

function Get-EnvFileMap {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    $trim = $line.Trim()
    if (-not $trim -or $trim.StartsWith("#")) { continue }
    $idx = $trim.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trim.Substring(0, $idx).Trim()
    $val = $trim.Substring($idx + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $map[$key] = $val
  }
  return $map
}

function Get-EnvValue {
  param(
    [hashtable]$Map,
    [string]$Key
  )
  $fromProcess = [Environment]::GetEnvironmentVariable($Key)
  if ($fromProcess) { return $fromProcess }
  if ($Map.ContainsKey($Key)) { return [string]$Map[$Key] }
  return ""
}

function Invoke-AppJson {
  param(
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [string]$Method,
    [string]$Url,
    [string]$BodyJson,
    [string]$UserAgent
  )
  try {
    if ($Method -eq "GET") {
      $resp = Invoke-WebRequest -UseBasicParsing -WebSession $Session -Uri $Url -Method GET -UserAgent $UserAgent
    } else {
      $resp = Invoke-WebRequest -UseBasicParsing -WebSession $Session -Uri $Url -Method $Method -ContentType "application/json" -Body $BodyJson -UserAgent $UserAgent
    }
    $obj = $null
    if ($resp.Content) {
      $obj = $resp.Content | ConvertFrom-Json
    }
    return @{
      ok = $true
      status = [int]$resp.StatusCode
      json = $obj
      error = $null
    }
  } catch {
    $status = -1
    $obj = $null
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $raw = $reader.ReadToEnd()
        if ($raw) { $obj = $raw | ConvertFrom-Json }
      } catch {}
    }
    return @{
      ok = $false
      status = $status
      json = $obj
      error = $_.Exception.Message
    }
  }
}

function Run-Scenario {
  param(
    [string]$Name,
    [string]$BaseUrl,
    [string]$Email,
    [string]$Password,
    [string]$UserAgent,
    [string]$WalletPlanId = "business"
  )
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $steps = @()

  $loginBody = @{
    email = $Email
    password = $Password
  } | ConvertTo-Json
  $login = Invoke-AppJson -Session $session -Method "POST" -Url "$BaseUrl/api/auth/login" -BodyJson $loginBody -UserAgent $UserAgent
  $steps += @{
    step = "login"
    status = $login.status
    ok = ($login.status -eq 200 -and $login.json.ok -eq $true)
  }
  if ($steps[-1].ok -ne $true) {
    return @{
      name = $Name
      passed = $false
      steps = $steps
      error = "login_failed"
    }
  }

  $current = Invoke-AppJson -Session $session -Method "GET" -Url "$BaseUrl/api/packages/current" -BodyJson "" -UserAgent $UserAgent
  $steps += @{
    step = "get_current_package"
    status = $current.status
    ok = ($current.status -eq 200)
  }

  $walletBefore = Invoke-AppJson -Session $session -Method "GET" -Url "$BaseUrl/api/packages/wallet" -BodyJson "" -UserAgent $UserAgent
  $steps += @{
    step = "wallet_before"
    status = $walletBefore.status
    ok = ($walletBefore.status -eq 200)
    balance = if ($walletBefore.json) { [double]$walletBefore.json.balanceThb } else { $null }
  }

  $checkoutWalletBody = @{
    planId = $WalletPlanId
    cycle = "monthly"
    paymentMethod = "wallet"
    locale = "th"
  } | ConvertTo-Json
  $checkoutWallet = Invoke-AppJson -Session $session -Method "POST" -Url "$BaseUrl/api/packages/checkout" -BodyJson $checkoutWalletBody -UserAgent $UserAgent
  $steps += @{
    step = "checkout_wallet_${WalletPlanId}_monthly"
    status = $checkoutWallet.status
    ok = ($checkoutWallet.status -eq 200 -and $checkoutWallet.json.mode -eq "activated")
  }

  $walletAfter = Invoke-AppJson -Session $session -Method "GET" -Url "$BaseUrl/api/packages/wallet" -BodyJson "" -UserAgent $UserAgent
  $steps += @{
    step = "wallet_after"
    status = $walletAfter.status
    ok = ($walletAfter.status -eq 200)
    balance = if ($walletAfter.json) { [double]$walletAfter.json.balanceThb } else { $null }
  }

  $checkoutQrBody = @{
    planId = "pro"
    cycle = "monthly"
    paymentMethod = "promptpay"
    locale = "th"
  } | ConvertTo-Json
  $checkoutQr = Invoke-AppJson -Session $session -Method "POST" -Url "$BaseUrl/api/packages/checkout" -BodyJson $checkoutQrBody -UserAgent $UserAgent
  $orderId = $null
  if ($checkoutQr.json -and $checkoutQr.json.order) { $orderId = [string]$checkoutQr.json.order.id }
  $steps += @{
    step = "checkout_promptpay_create_order"
    status = $checkoutQr.status
    ok = ($checkoutQr.status -eq 200 -and $checkoutQr.json.mode -eq "payment_required" -and $orderId)
    orderId = $orderId
  }

  $negativeSlipOk = $false
  if ($orderId) {
    $slipVerifyBody = @{
      orderId = $orderId
      provider = "manual"
      amountThb = 1
      receiverAccount = "0000000000"
      transferredAt = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json
    $slipVerify = Invoke-AppJson -Session $session -Method "POST" -Url "$BaseUrl/api/packages/slip/verify" -BodyJson $slipVerifyBody -UserAgent $UserAgent
    $negativeSlipOk = ($slipVerify.status -eq 200 -and $slipVerify.json.verified -eq $false)
    $steps += @{
      step = "negative_slip_verify_should_fail"
      status = $slipVerify.status
      ok = $negativeSlipOk
      reason = if ($slipVerify.json -and $slipVerify.json.reason) { [string]::Join(",", $slipVerify.json.reason) } else { $null }
    }
  } else {
    $steps += @{
      step = "negative_slip_verify_should_fail"
      status = -1
      ok = $false
      reason = "no_order_created"
    }
  }

  $scenarioPass = ($steps | Where-Object { $_.ok -ne $true }).Count -eq 0
  return @{
    name = $Name
    passed = $scenarioPass
    steps = $steps
  }
}

$root = Split-Path -Parent $PSScriptRoot
$envMap = Get-EnvFileMap -Path (Join-Path $root ".env.local")
$baseUrl = if ($env:SMOKE_BASE_URL) { $env:SMOKE_BASE_URL } else { "http://127.0.0.1:3013" }

$email = if ($env:E2E_EMAIL) { [string]$env:E2E_EMAIL } else { "" }
$password = if ($env:E2E_PASSWORD) { [string]$env:E2E_PASSWORD } else { "" }
$userId = if ($env:E2E_USER_ID) { [string]$env:E2E_USER_ID } else { "" }
if (-not $email) { throw "Missing E2E_EMAIL" }
if (-not $password) { throw "Missing E2E_PASSWORD" }

$pwaUa = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
$apkUa = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/136.0.0.0 Mobile Safari/537.36"

$scenarioPwa = Run-Scenario -Name "pwa_authenticated_e2e" -BaseUrl $baseUrl -Email $email -Password $password -UserAgent $pwaUa -WalletPlanId "business"
$scenarioApk = Run-Scenario -Name "apk_authenticated_e2e_simulated_webview" -BaseUrl $baseUrl -Email $email -Password $password -UserAgent $apkUa -WalletPlanId "lite"

$report = @{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseUrl = $baseUrl
  userId = $userId
  email = $email
  passed = ($scenarioPwa.passed -and $scenarioApk.passed)
  scenarios = @($scenarioPwa, $scenarioApk)
}

$report | ConvertTo-Json -Depth 8
if (-not $report.passed) {
  exit 1
}
