#!/usr/bin/env bash
# Reproduce the evidence in evidence/records.json.
# Needs: curl, 7z, npx, rea-agents 6.7.0 on Node >= 22.19.
# Downloads Notion's public installer and three public web chunks into ./.capture (git ignored).
set -euo pipefail
OUT="${1:-.capture}"
mkdir -p "$OUT/web-editor" "$OUT/rea-out"
cd "$OUT"

# 1. Desktop installer, NSIS payload, app.asar
curl -sSL -o notion-setup.exe "https://desktop-release.notion-static.com/Notion%20Setup%207.40.0.exe"
7z x -y -oexe notion-setup.exe > /dev/null
7z x -y -oapp 'exe/$PLUGINSDIR/app-64.7z' > /dev/null
npx -y @electron/asar extract app/resources/app.asar asar

# 2. Public web editor chunks (hashed names change with every Notion web release)
for f in 9073-319c74553d1d495c.js 11906-2b10cc89fc0f0830.js clipboardActions-13707130644731f1.js; do
  curl -sSf -o "web-editor/$f" "https://www.notion.so/_assets/$f"
done

# 3. REA analysis
rea analyze-javascript-application asar/.webpack/renderer/tab_browser_view --format json > rea-out/preload.json
rea analyze-javascript-application web-editor --format json > rea-out/web-editor.json

# 4. REA feature traces
trace() { # $1 evidence file, $2 seed, $3 output name
  node -e 'const fs=require("fs");const [a,s,o]=process.argv.slice(1);fs.writeFileSync(o,JSON.stringify({application:JSON.parse(fs.readFileSync(a,"utf8")),seed:{kind:"string",value:s},direction:"both"}))' "$1" "$2" "rea-out/$3-in.json"
  rea trace-application-feature "rea-out/$3-in.json" --format json > "rea-out/$3.json"
}
trace rea-out/preload.json __electronApi trace-electron-api
trace rea-out/preload.json notion:clipboard:write trace-preload-clipboard
trace rea-out/web-editor.json text/_notion-blocks-v3-production trace-blocks-mime
trace rea-out/web-editor.json notionvc trace-notionvc

sha256sum notion-setup.exe app/resources/app.asar web-editor/*.js rea-out/*.json
