#!/usr/bin/env bash
# Tell IndexNow search engines (Bing, Yandex, Seznam, Naver...) that the site's pages changed.
# Usage: scripts/indexnow.sh            (submits every URL in site/sitemap.xml)
set -euo pipefail
cd "$(dirname "$0")/.."
key_file=$(ls site/*.txt | grep -E '/[0-9a-f]{32}\.txt$' | head -1)
key=$(basename "$key_file" .txt)
base="https://sambuaneesh.github.io/chipless/"
urls=$(grep -o '<loc>[^<]*</loc>' site/sitemap.xml | sed 's/<\/*loc>//g' | sed 's/.*/"&"/' | paste -sd,)
body="{\"host\":\"sambuaneesh.github.io\",\"key\":\"$key\",\"keyLocation\":\"${base}${key}.txt\",\"urlList\":[${urls}]}"
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json; charset=utf-8' -d "$body" https://api.indexnow.org/indexnow)
echo "IndexNow: HTTP $code (200/202 = accepted)"
