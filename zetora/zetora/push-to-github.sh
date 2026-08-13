#!/usr/bin/env bash
# Zetora push script — run this on YOUR machine (not via any AI chat).
# Usage:
#   1. Copy this file and the zetora folder to your machine.
#   2. Edit USERNAME below.
#   3. Run: bash push-to-github.sh
#   4. When prompted for password, paste your NEW token (not any leaked one).

set -e

USERNAME="YOUR_GITHUB_USERNAME"  # ← عدّل هذا
REPO_NAME="zetora"
REMOTE_URL="https://github.com/$USERNAME/$REPO_NAME.git"

echo "=== Zetora GitHub Push Script ==="
echo ""
echo "Prerequisites:"
echo "  1. Create an empty repo at https://github.com/new"
echo "     Name: $REPO_NAME"
echo "     Do NOT initialize with README/license/gitignore"
echo "  2. Have a NEW GitHub token ready (the old ones are compromised)"
echo "     Create at: https://github.com/settings/tokens/new"
echo "     Scopes needed: repo (full)"
echo ""
read -p "Press Enter once you've created the empty repo on GitHub..."

echo ""
echo "Adding remote: $REMOTE_URL"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"

echo ""
echo "Pushing to GitHub..."
echo "When prompted:"
echo "  Username: $USERNAME"
echo "  Password: <paste your NEW token — it won't show on screen>"
echo ""
git push -u origin main

echo ""
echo "✓ Done! Your repo is live at: https://github.com/$USERNAME/$REPO_NAME"
echo ""
echo "REMINDER: Revoke the two tokens that were leaked in chat:"
echo "  - ghp_PnPfVOxZn0... (classic PAT)"
echo "  - github_pat_11B7RUWYI0... (fine-grained PAT)"
