#!/usr/bin/env node
// Static link checker (UX brief 1.3). Scans every committed .html file and fails on:
//   1. literal href="#" placeholders (dead affordances)
//   2. internal links that resolve to no file, using GitHub Pages semantics:
//      /foo -> foo.html or foo/index.html; /foo/ -> foo/index.html
// External links, mailto:, tel:, javascript:, and same-page #fragments are skipped
// (live-crawl verification is a manual release step; CI stays hermetic/offline).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const htmlFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (e.endsWith('.html')) htmlFiles.push(p);
  }
})(ROOT);

const HREF_RE = /href\s*=\s*"([^"]*)"/g;
const failures = [];
const seenMissing = new Map(); // target -> [first few referrers]

function resolves(target) {
  // GitHub Pages precedence: exact file, then file.html, then dir/index.html.
  if (existsSync(target) && !statSync(target).isDirectory()) return true;
  if (existsSync(target + '.html')) return true;
  if (existsSync(target) && statSync(target).isDirectory()) return existsSync(join(target, 'index.html'));
  return false;
}

for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');
  // Honor <base href="..."> - pages under generated subtrees use root-relative
  // navigation via a base tag; resolve their relative links against the root.
  const baseToRoot = /<base\s+href\s*=\s*"https?:\/\/[^"\/]+\/?"/.test(html);
  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1].trim();
    if (href === '#' || href === '') { failures.push(`${f.replace(ROOT + '/', '')}: dead placeholder href="${href}"`); continue; }
    if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) continue;
    if (href.includes('${') || href.includes('{{')) continue; // JS/email-templated href
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue; // pure query/fragment link, same page
    const target = (clean.startsWith('/') || baseToRoot) ? join(ROOT, clean.replace(/^\//, '')) : resolve(dirname(f), clean);
    if (!resolves(target)) {
      if (!seenMissing.has(clean)) seenMissing.set(clean, []);
      const refs = seenMissing.get(clean);
      if (refs.length < 3) refs.push(f.replace(ROOT + '/', ''));
    }
  }
}

for (const [target, refs] of seenMissing) {
  failures.push(`missing internal target "${target}" (e.g. ${refs.join(', ')})`);
}

if (failures.length) {
  console.error(`LINK CHECK FAILED: ${failures.length} problem(s) across ${htmlFiles.length} files\n`);
  for (const f of failures.slice(0, 50)) console.error('  ' + f);
  if (failures.length > 50) console.error(`  ... and ${failures.length - 50} more`);
  process.exit(1);
}
console.log(`link check OK: ${htmlFiles.length} html files, 0 dead placeholders, 0 missing internal targets`);
