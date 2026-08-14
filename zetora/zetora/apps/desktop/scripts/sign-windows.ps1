#!/usr/bin/env pwsh
# v3.3.0: Windows code-signing script.
param(
    [string]$FilesPath = "apps/desktop/dist",
    [string]$CertBase64 = $env:WINDOWS_CERT_BASE64,
    [string]$CertPassword = $env:WINDOWS_CERT_PASSWORD,
    [string]$TimestampServer = "http://timestamp.digicert.com"
)
if (-not $CertBase64 -or -not $CertPassword) { Write-Host "⚠ No cert. Skipping."; exit 0 }
if ($env:GITHUB_ACTIONS -ne "true") { Write-Host "⚠ Not on CI. Skipping."; exit 0 }
Write-Host "🔐 Windows code signing..."
$certPath = "$env:TEMP\mooncode-cert.pfx"
[Convert]::FromBase64String($CertBase64) | Set-Content -Path $certPath -AsByteStream
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" | Select-Object -First 1
if (-not $signtool) { Write-Host "✗ signtool not found"; exit 1 }
$exeFiles = Get-ChildItem -Path $FilesPath -Filter "*.exe" -Recurse
foreach ($exe in $exeFiles) {
    Write-Host "  Signing: $($exe.Name)"
    & $signtool.FullName sign /f $certPath /p $CertPassword /tr $TimestampServer /td sha256 /fd sha256 $exe.FullName
    if ($LASTEXITCODE -eq 0) { Write-Host "  ✓ Signed" } else { Write-Host "  ✗ Failed" }
}
Remove-Item $certPath -Force
Write-Host "✅ Done."
