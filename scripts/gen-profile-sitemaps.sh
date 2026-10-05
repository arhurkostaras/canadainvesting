#!/usr/bin/env bash
# Regenerate the profile sitemap shards from the backend's gated sitemap route and keep
# robots.txt + sitemap_index.xml in step with the number of shards produced. The route lists
# only rows that pass the public-profile gate (canadainvesting-backend server.js,
# /api/sitemap-profiles.xml). Run from the repo root; commit shards, robots and index together.
#   API=https://<backend host> scripts/gen-profile-sitemaps.sh
set -euo pipefail
API="${API:-https://canadainvesting-backend-production.up.railway.app}"
SITE="https://canadainvesting.app"
PER_PAGE=45000
page=1; total=0
while :; do
  f="sitemap-profiles-${page}.xml"
  curl -fsS "${API}/api/sitemap-profiles.xml?page=${page}" -o "${f}.tmp"
  n=$(grep -c '<loc>' "${f}.tmp" || true)
  if [ "$n" -eq 0 ]; then rm -f "${f}.tmp"; page=$((page - 1)); break; fi
  mv "${f}.tmp" "$f"; total=$((total + n)); echo "$f: $n urls"
  [ "$n" -lt "$PER_PAGE" ] && break
  page=$((page + 1))
done
shards=$page
[ "$total" -gt 0 ] || { echo "no profile urls returned; refusing to publish empty shards" >&2; exit 1; }
for i in $(seq $((shards + 1)) 20); do rm -f "sitemap-profiles-${i}.xml"; done
grep -v 'sitemap-profiles-[0-9]*\.xml' robots.txt > robots.txt.tmp
for i in $(seq 1 "$shards"); do echo "Sitemap: ${SITE}/sitemap-profiles-${i}.xml" >> robots.txt.tmp; done
mv robots.txt.tmp robots.txt
today=$(date +%F)
python3 - "$shards" "$today" <<'PY'
import re, sys
shards, today = int(sys.argv[1]), sys.argv[2]
s = open('sitemap_index.xml').read()
s = re.sub(r'\s*<sitemap>\s*<loc>[^<]*sitemap-profiles-\d+\.xml</loc>\s*(<lastmod>[^<]*</lastmod>\s*)?</sitemap>', '', s)
entries = ''.join(f'  <sitemap>\n    <loc>https://canadainvesting.app/sitemap-profiles-{i}.xml</loc>\n    <lastmod>{today}</lastmod>\n  </sitemap>\n' for i in range(1, shards + 1))
s = re.sub(r'\s*</sitemapindex>', '\n' + entries + '</sitemapindex>', s)
open('sitemap_index.xml', 'w').write(s)
PY
echo "done: $total profile urls in $shards shard(s); robots.txt and sitemap_index.xml rewired"
