#!/usr/bin/env bash
# v3.3.0: macOS notarization script.
# Requires: APPLE_ID, APPLE_APP_PASSWORD, APPLE_TEAM_ID secrets.
set -euo pipefail

CERT_BASE64="${APPLE_DEVELOPER_ID_CERT:-}"
CERT_PASSWORD="${APPLE_CERT_PASSWORD:-}"
APPLE_ID="${APPLE_ID:-}"
APP_PASSWORD="${APPLE_APP_PASSWORD:-}"
TEAM_ID="${APPLE_TEAM_ID:-}"

if [ -z "$CERT_BASE64" ] || [ -z "$APPLE_ID" ]; then
  echo "⚠ Apple credentials not set. Skipping notarization."
  exit 0
fi

if [ "$GITHUB_ACTIONS" != "true" ]; then
  echo "⚠ Not on GitHub Actions. Skipping."
  exit 0
fi

echo "🔐 macOS notarization started..."

# Decode certificate
CERT_PATH="/tmp/mooncode-developer-id.p12"
echo "$CERT_BASE64" | base64 --decode > "$CERT_PATH"

# Import into keychain
KEYCHAIN="mooncode-signing.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$CERT_PATH" -P "$CERT_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN"
security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

# Find .app bundles
APP_PATH=$(find apps/desktop/dist -name "*.app" -maxdepth 3 | head -1)
if [ -z "$APP_PATH" ]; then
  echo "⚠ No .app found. Skipping."
  exit 0
fi

# Codesign
echo "  Signing: $APP_PATH"
codesign --force --deep --options runtime --keychain "$KEYCHAIN" --sign "Developer ID Application" "$APP_PATH"

# Notarize
echo "  Notarizing..."
xcrun notarytool submit "$APP_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APP_PASSWORD" \
  --team-id "$TEAM_ID" \
  --wait

# Staple
echo "  Stapling..."
xcrun stapler staple "$APP_PATH"

# Cleanup
security delete-keychain "$KEYCHAIN"
rm -f "$CERT_PATH"
echo "✅ macOS notarization complete."
