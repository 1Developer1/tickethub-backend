#!/usr/bin/env node
/**
 * build-pages.js — Prepares docs/ for GitHub Pages deployment.
 *
 * Copies docs/ to pages-build/, then removes Step 8 (DDD Building Blocks)
 * from event-storming-workshop.html. The original docs/ stays untouched.
 *
 * Run locally:   node scripts/build-pages.js
 * Output:        pages-build/
 */

const fs = require('node:fs');
const path = require('node:path');

const SRC_DIR = 'docs';
const DST_DIR = 'pages-build';
const WORKSHOP = 'event-storming-workshop.html';

// ── 1. Recreate pages-build/ from scratch ──
if (fs.existsSync(DST_DIR)) {
  fs.rmSync(DST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DST_DIR, { recursive: true });

// Recursive copy (Node >= 16.7 has fs.cp, but we use a manual fallback)
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(SRC_DIR, DST_DIR);
console.log(`[build-pages] Copied ${SRC_DIR}/ to ${DST_DIR}/`);

// ── 2. Strip Step 8 from the workshop HTML ──
const workshopPath = path.join(DST_DIR, WORKSHOP);
let html = fs.readFileSync(workshopPath, 'utf8');
const originalLength = html.length;

// 2a. Remove the nav link: <a href="#step8" ...>8. DDD Yapi Taslari</a>
const navLinkRegex = /\s*<a\s+href="#step8"[^>]*>[^<]*<\/a>/;
html = html.replace(navLinkRegex, '');

// 2b. Remove the entire section div: <div class="section" id="step8">...</div>
//     We match the opening tag, then consume characters until we find
//     the closing </div> that matches. Since the section is self-contained
//     and the next sibling is an HTML comment, we use a safer strategy:
//     find the start index, then find the next top-level comment that begins
//     the INTERACTIVE CODE PANEL (which follows Step 8 in the file).
const startTag = '<div class="section" id="step8"';
const startIdx = html.indexOf(startTag);
if (startIdx === -1) {
  console.error('[build-pages] ERROR: <div class="section" id="step8"> not found');
  process.exit(1);
}

// Search for the marker that starts the NEXT section.
// The INTERACTIVE CODE PANEL comment immediately follows Step 8's closing.
const endMarker = '<!-- ';
let endIdx = -1;

// Step through all HTML comments after startIdx and find the one that
// mentions "INTERACTIVE CODE PANEL" or "CODE PANEL".
let searchFrom = startIdx + startTag.length;
while (searchFrom < html.length) {
  const commentIdx = html.indexOf(endMarker, searchFrom);
  if (commentIdx === -1) break;

  // Extract a window to inspect what this comment is about
  const window = html.slice(commentIdx, commentIdx + 300);
  if (window.includes('INTERACTIVE CODE PANEL') || window.includes('CODE PANEL')) {
    endIdx = commentIdx;
    break;
  }
  searchFrom = commentIdx + endMarker.length;
}

if (endIdx === -1) {
  console.error('[build-pages] ERROR: Could not find end of Step 8 section');
  console.error(
    `[build-pages] Looking for "INTERACTIVE CODE PANEL" or "CODE PANEL" comment after startIdx=${startIdx}`,
  );
  process.exit(1);
}

html = html.slice(0, startIdx) + html.slice(endIdx);
const bytesRemoved = originalLength - html.length;

fs.writeFileSync(workshopPath, html);
console.log(
  `[build-pages] Removed Step 8 from ${WORKSHOP} (${bytesRemoved.toLocaleString()} bytes stripped)`,
);
console.log('[build-pages] Done.');
