#!/usr/bin/env node
/**
 * Copies the Vite production build (frontend/dist) into backend/public so the
 * Express backend can serve the React SPA as static files.
 *
 * Run automatically as part of `npm run build` from the repo root.
 */

const fs   = require('fs');
const path = require('path');

const root   = path.resolve(__dirname, '..');
const src    = path.join(root, 'frontend', 'dist');
const dest   = path.join(root, 'backend', 'public');

if (!fs.existsSync(src)) {
  console.error(`[copy-frontend] Source not found: ${src}`);
  console.error('[copy-frontend] Run the frontend build first (npm run build --workspace=frontend)');
  process.exit(1);
}

// Wipe the old public/ directory so stale assets don't accumulate
if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}

copyDir(src, dest);
console.log(`[copy-frontend] Copied ${src} → ${dest}`);

// ─── helpers ─────────────────────────────────────────────────────────────────

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath  = path.join(from, entry.name);
    const destPath = path.join(to,   entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
