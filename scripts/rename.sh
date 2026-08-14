#!/usr/bin/env bash
# Bulk rename: Moon Code → Moon Code / mooncode
set -euo pipefail
cd "$(dirname "$0")/.."

# Files to process (exclude .git, node_modules, binary files)
find . -type f \
  \( -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.yml" \
     -o -name "*.yaml" -o -name "*.sh" -o -name "*.ps1" -o -name "*.cjs" \
     -o -name "*.mjs" -o -name "*.html" -o -name "*.css" -o -name "*.example" \
     -o -name "*.gitignore" -o -name "*.dockerignore" -o -name "*.plist" \
     -o -name "*.svg" -o -name "*.webmanifest" -o -name "*.txt" \) \
  -not -path "./.git/*" -not -path "*/node_modules/*" -not -path "./apps/desktop/build/*" \
  | while read -r file; do
  # Order matters: longest/most specific first
  # 1. Arabic name
  sed -i 's/مون كود/مون كود/g' "$file"
  # 2. Env var prefix (uppercase with underscore)
  sed -i 's/MOONCODE_/MOONCODE_/g' "$file"
  # 3. Standalone uppercase (remaining MOONCODE)
  sed -i 's/MOONCODE/MOONCODE/g' "$file"
  # 4. Display name (capitalized) → "Moon Code"
  sed -i 's/Moon Code/Moon Code/g' "$file"
  # 5. Lowercase (commands, paths, package names) → "mooncode"
  sed -i 's/mooncode/mooncode/g' "$file"
done

# Fix specific cases where "Moon Code" (with space) breaks technical contexts
# These need to be "mooncode" (no space)
find . -type f \
  \( -name "*.js" -o -name "*.json" -o -name "*.cjs" -o -name "*.mjs" \
     -o -name "*.yml" -o -name "*.plist" -o -name "*.gitignore" \) \
  -not -path "./.git/*" -not -path "*/node_modules/*" -not -path "./apps/desktop/build/*" \
  | while read -r file; do
  # Fix appId, package names, URLs, email addresses, etc.
  sed -i 's/studio\.Moon Code\.app/studio.mooncode.app/g' "$file"
  sed -i 's/@Moon Code\//@mooncode\//g' "$file"
  sed -i 's/Moon Code\.local/mooncode.local/g' "$file"
  sed -i 's/Moon Code-mooncode/mooncode/g' "$file"
  sed -i 's/mooncode-mooncode/mooncode/g' "$file"
  # Fix "Moon Code Agent" in git config (should be "Moon Code Agent" - this is fine as display)
  # Fix user-agent: "Moon Code/0.9.5" → "mooncode/0.9.5"
  sed -i 's/user-agent": "Moon Code\//user-agent": "mooncode\//g' "$file"
  sed -i "s/user-agent': 'Moon Code\//user-agent': 'mooncode\//g" "$file"
  # Fix productName in some contexts where space is fine
  # Fix copyright
  sed -i 's/MOONCODE_DESKTOP/MOONCODE_DESKTOP/g' "$file"
done

echo "Rename complete."
