#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Moon Code installer for macOS and Linux
# ════════════════════════════════════════════════════════════════════════════
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/qbrahym02-cmyk/mooncode/main/scripts/install/install.sh | bash
#
# Or, to install a specific version:
#   curl -fsSL https://raw.githubusercontent.com/qbrahym02-cmyk/mooncode/main/scripts/install/install.sh | bash -s -- --version 0.9.1
#
# This script:
#   1. Detects your OS and architecture
#   2. Downloads the appropriate binary from GitHub Releases
#   3. Installs it to ~/.local/bin (or /usr/local/bin if run as root)
#   4. Adds the install directory to PATH if needed
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
REPO="qbrahym02-cmyk/mooncode"
INSTALL_VERSION="${MOONCODE_VERSION:-latest}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version) INSTALL_VERSION="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: curl -fsSL ...install.sh | bash -s -- [--version X.Y.Z]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Colors ─────────────────────────────────────────────────────────────────
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
  VIOLET='\033[38;5;141m'
  MINT='\033[38;5;79m'
  AMBER='\033[38;5;215m'
  RED='\033[38;5;203m'
  DIM='\033[2m'
  RESET='\033[0m'
  BOLD='\033[1m'
else
  VIOLET=''; MINT=''; AMBER=''; RED=''; DIM=''; RESET=''; BOLD=''
fi

info()  { echo -e "${VIOLET}▸${RESET} $1"; }
ok()    { echo -e "${MINT}✓${RESET} $1"; }
warn()  { echo -e "${AMBER}⚠${RESET} $1"; }
error() { echo -e "${RED}✗${RESET} $1" >&2; }

# ─── Banner ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${VIOLET}▰ ▰${RESET}  ${BOLD}MOONCODE${RESET} ${DIM}Installer${RESET}"
echo -e "${DIM}Local-first agentic workspace for code and design${RESET}"
echo ""

# ─── Detect platform ────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *) error "Unsupported OS: $OS (only macOS and Linux are supported by this script)"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

info "Detected: ${PLATFORM}-${ARCH}"

# ─── Resolve version ────────────────────────────────────────────────────────
if [[ "$INSTALL_VERSION" == "latest" ]]; then
  info "Fetching latest version..."
  INSTALL_VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')"
  if [[ -z "$INSTALL_VERSION" ]]; then
    error "Could not determine latest version. Try: --version 0.9.1"
    exit 1
  fi
fi
ok "Installing version: ${INSTALL_VERSION}"

# ─── Determine install directory ────────────────────────────────────────────
if [[ "$(id -u)" -eq 0 ]]; then
  INSTALL_DIR="/usr/local/bin"
else
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi
info "Install directory: ${INSTALL_DIR}"

# ─── Determine asset name ───────────────────────────────────────────────────
# Asset naming convention: mooncode-{version}-{os}-{arch}.tar.gz
# For desktop: Moon Code-{version}-{os}-{arch}.{ext}
# We install the CLI by default; desktop can be downloaded separately.

if [[ "$PLATFORM" == "macos" ]]; then
  ASSET="mooncode-${INSTALL_VERSION}-macos-${ARCH}.tar.gz"
elif [[ "$PLATFORM" == "linux" ]]; then
  ASSET="mooncode-${INSTALL_VERSION}-linux-${ARCH}.tar.gz"
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${INSTALL_VERSION}/${ASSET}"

info "Downloading: ${ASSET}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/${ASSET}"; then
  warn "Pre-built binary not found: ${ASSET}"
  info "Falling back to npm installation..."
  if command -v npm &>/dev/null; then
    npm install -g "mooncode@${INSTALL_VERSION}" 2>&1 | tail -5
    ok "Installed via npm"
    echo ""
    ok "Moon Code installed! Run: mooncode help"
    exit 0
  else
    error "npm not found. Please install Node.js 20.12+ and try again."
    error "  https://nodejs.org/"
    exit 1
  fi
fi

ok "Downloaded"

# ─── Extract ────────────────────────────────────────────────────────────────
info "Extracting..."
tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"

# Find the mooncode binary
BINARY_PATH="$(find "$TMP_DIR" -name 'mooncode' -type f | head -1)"
if [[ -z "$BINARY_PATH" ]]; then
  error "Could not find mooncode binary in the archive."
  exit 1
fi

# ─── Install ────────────────────────────────────────────────────────────────
info "Installing to ${INSTALL_DIR}/mooncode..."
cp "$BINARY_PATH" "${INSTALL_DIR}/mooncode"
chmod +x "${INSTALL_DIR}/mooncode"
ok "Installed"

# ─── PATH check ─────────────────────────────────────────────────────────────
if [[ ":${PATH}:" != *":${INSTALL_DIR}:"* ]]; then
  warn "${INSTALL_DIR} is not in your PATH."
  info "Adding to shell config..."

  SHELL_NAME="$(basename "$SHELL")"
  if [[ "$SHELL_NAME" == "zsh" ]]; then
    RC_FILE="${HOME}/.zshrc"
  elif [[ "$SHELL_NAME" == "bash" ]]; then
    RC_FILE="${HOME}/.bashrc"
  else
    RC_FILE=""
  fi

  if [[ -n "$RC_FILE" ]]; then
    echo "export PATH=\"\$PATH:${INSTALL_DIR}\"" >> "$RC_FILE"
    ok "Added to ${RC_FILE}"
    warn "Run: source ${RC_FILE}  (or restart your terminal)"
  else
    info "Add this to your shell config:"
    info "  export PATH=\"\$PATH:${INSTALL_DIR}\""
  fi
fi

# ─── Verify ─────────────────────────────────────────────────────────────────
echo ""
if [[ -x "${INSTALL_DIR}/mooncode" ]]; then
  ok "Moon Code v${INSTALL_VERSION} installed successfully!"
  echo ""
  echo -e "${DIM}Quick start:${RESET}"
  echo -e "  ${VIOLET}mooncode${RESET}              ${DIM}# start TUI in current directory${RESET}"
  echo -e "  ${VIOLET}mooncode serve${RESET}        ${DIM}# start HTTP server${RESET}"
  echo -e "  ${VIOLET}mooncode open${RESET}         ${DIM}# open in browser${RESET}"
  echo -e "  ${VIOLET}mooncode help${RESET}         ${DIM}# show all commands${RESET}"
  echo ""
  echo -e "${DIM}Docs: https://github.com/${REPO}#readme${RESET}"
  echo ""
else
  error "Installation failed."
  exit 1
fi
