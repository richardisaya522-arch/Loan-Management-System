# Endesha ZABURI YA 23 MICROFINANCE (Flask) kwa production kwenye Windows.
# Tumia: powershell -ExecutionPolicy Bypass -File .\run_production.ps1
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

# 1) Pakia production.env (kama ipo)
$envFile = Join-Path $PSScriptRoot "production.env"
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        $line = $line.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $k, $v = $line.Split("=", 2)
            [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), "Process")
        }
    }
    Write-Host "production.env imepakiwa."
} else {
    Write-Host "ONYO: production.env haipo. Nakili production.env.example kuwa production.env." -ForegroundColor Yellow
}

# 2) Tengeneza SECRET_KEY ya kudumu kama haijawekwa
if (-not $env:SECRET_KEY) {
    $keyFile = Join-Path $PSScriptRoot ".prod_secret_key"
    if (Test-Path -LiteralPath $keyFile) {
        $env:SECRET_KEY = (Get-Content -LiteralPath $keyFile -Raw).Trim()
    } else {
        $py0 = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
        if (-not (Test-Path -LiteralPath $py0)) { $py0 = "python" }
        $env:SECRET_KEY = & $py0 -c "import secrets; print(secrets.token_hex(32))"
        Set-Content -LiteralPath $keyFile -Value $env:SECRET_KEY -NoNewline
        Write-Host "SECRET_KEY mpya imetengenezwa na kuhifadhiwa kwenye .prod_secret_key."
    }
}

# 3) Tahadhari
if (-not $env:TRUSTED_HOSTS) {
    Write-Host "ONYO: TRUSTED_HOSTS haijawekwa. Weka domain yako kwenye production.env." -ForegroundColor Yellow
}
if ($env:COOKIE_SECURE -ne "1") {
    Write-Host "ONYO: COOKIE_SECURE si 1. Tumia HTTPS kabla ya kuruhusu watumiaji halisi." -ForegroundColor Yellow
}

# 4) Anzisha app
$py = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $py)) { $py = "python" }
Write-Host "Inaanza kwenye http://$($env:HOST):$($env:PORT) ..."
& $py "$PSScriptRoot\app.py"
