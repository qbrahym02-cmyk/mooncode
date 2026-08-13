# ════════════════════════════════════════════════════════════════════════════
# Zetora installer for Windows (PowerShell)
# ════════════════════════════════════════════════════════════════════════════
# Usage:
#   iwr -useb https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.ps1 | iex
#
# Or, to install a specific version:
#   $v="0.9.1"; iwr -useb https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.ps1 | iex
# ════════════════════════════════════════════════════════════════════════════
param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

$Repo = "qbrahym02-cmyk/zetora"

# ─── Banner ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "▰ ▰  ZETORA Installer" -ForegroundColor Magenta
Write-Host "Local-first agentic workspace for code and design" -ForegroundColor DarkGray
Write-Host ""

# ─── Helper functions ───────────────────────────────────────────────────────
function Info($msg)  { Write-Host "▸ $msg" -ForegroundColor Magenta }
function Ok($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Error($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ─── Detect architecture ────────────────────────────────────────────────────
$Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
Info "Detected: windows-$Arch"

# ─── Resolve version ────────────────────────────────────────────────────────
if ($Version -eq "latest") {
    Info "Fetching latest version..."
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -UseBasicParsing
        $Version = $release.tag_name -replace "^v", ""
    } catch {
        Error "Could not determine latest version. Try: -Version 0.9.1"
    }
}
Ok "Installing version: $Version"

# ─── Determine install directory ────────────────────────────────────────────
$InstallDir = "$env:LOCALAPPDATA\Programs\zetora"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Info "Install directory: $InstallDir"

# ─── Determine asset name ───────────────────────────────────────────────────
$Asset = "zetora-$Version-windows-$Arch.zip"
$DownloadUrl = "https://github.com/$Repo/releases/download/v$Version/$Asset"

Info "Downloading: $Asset"
$TmpDir = New-Item -ItemType Directory -Path ([System.IO.Path]::GetTempPath() + "zetora-install-$(Get-Random)") -Force
$ZipPath = "$($TmpDir.FullName)\$Asset"

try {
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing
} catch {
    Warn "Pre-built binary not found: $Asset"
    Info "Falling back to npm installation..."
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install -g "zetora@$Version"
        Ok "Installed via npm"
        Write-Host ""
        Ok "Zetora installed! Run: zetora help"
        exit 0
    } else {
        Error "npm not found. Please install Node.js 20.12+ from https://nodejs.org/"
    }
}
Ok "Downloaded"

# ─── Extract ────────────────────────────────────────────────────────────────
Info "Extracting..."
Expand-Archive -Path $ZipPath -DestinationPath $TmpDir.FullName -Force

# Find the zetora executable
$Binary = Get-ChildItem -Path $TmpDir.FullName -Recurse -Filter "zetora*" | Where-Object { $_.Extension -eq ".exe" -or $_.Extension -eq ".cmd" -or $_.Name -eq "zetora" } | Select-Object -First 1
if (-not $Binary) {
    Error "Could not find zetora executable in the archive."
}

# ─── Install ────────────────────────────────────────────────────────────────
Info "Installing to $InstallDir..."
Copy-Item $Binary.FullName "$InstallDir\zetora" -Force
Ok "Installed"

# ─── Add to PATH ────────────────────────────────────────────────────────────
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$InstallDir*") {
    Info "Adding $InstallDir to user PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$UserPath;$InstallDir", "User")
    $env:PATH += ";$InstallDir"
    Ok "Added to PATH"
    Warn "Restart your terminal for PATH changes to take effect."
}

# ─── Verify ─────────────────────────────────────────────────────────────────
Write-Host ""
Ok "Zetora v$Version installed successfully!"
Write-Host ""
Write-Host "Quick start:" -ForegroundColor DarkGray
Write-Host "  zetora              # start TUI in current directory" -ForegroundColor Gray
Write-Host "  zetora serve        # start HTTP server" -ForegroundColor Gray
Write-Host "  zetora open         # open in browser" -ForegroundColor Gray
Write-Host "  zetora help         # show all commands" -ForegroundColor Gray
Write-Host ""
Write-Host "Docs: https://github.com/$Repo#readme" -ForegroundColor DarkGray
Write-Host ""

# Cleanup
Remove-Item -Path $TmpDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
