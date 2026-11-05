#!/usr/bin/env node
// Makes sure dist/ holds a complete deployable site: the app build plus the sharded TeX engine.
// Runs as wrangler's custom build step, so `npx wrangler deploy` works whatever build command the
// Cloudflare dashboard is set to. Steps that are already done are skipped, so with the
// recommended build command (`pnpm cf:build`) this is a no-op.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args, label) => {
  console.log(`[ensure-site] ${label}`);
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const appBuilt = existsSync(join(root, 'dist/index.html'));
const engineBuilt = existsSync(join(root, 'dist/core/busytex/shards.json'));

if (!appBuilt) {
  run([join(root, 'node_modules/typescript/bin/tsc'), '-b'], 'type-checking');
  run([join(root, 'node_modules/vite/bin/vite.js'), 'build'], 'building the app');
}
if (!engineBuilt) {
  if (!existsSync(join(root, 'tex-assets/busytex/busytex_worker.js'))) {
    run([join(root, 'node_modules/texlyre-busytex/scripts/cli.cjs'), 'download-assets', 'tex-assets'], 'downloading the TeX engine (~520 MB)');
  }
  run([join(root, 'scripts/shard-tex-assets.mjs'), 'tex-assets/busytex', 'dist/core/busytex'], 'sharding the TeX engine for 25 MiB file limit');
}
if (appBuilt && engineBuilt) console.log('[ensure-site] dist/ is complete');
