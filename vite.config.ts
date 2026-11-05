import { defineConfig } from 'vitest/config';
import type { Plugin, Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const TEX_DIR = fileURLToPath(new URL('./tex-assets/busytex', import.meta.url));
const TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.js': 'text/javascript; charset=utf-8',
  '.data': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.cnf': 'text/plain; charset=utf-8',
  '.profile': 'text/plain; charset=utf-8',
};

/**
 * Serves the BusyTeX engine (~700 MB, fetched with `pnpm tex:assets`) at /core/busytex during
 * `vite dev` and `vite preview`, without copying it into the build output. In production the same
 * path is served from Cloudflare R2 by functions/core/busytex/[[path]].ts.
 */
function texAssets(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith('/core/busytex/')) return next();
    const rel = normalize(decodeURIComponent(url.slice('/core/busytex/'.length)));
    if (rel.startsWith('..')) return next();
    const file = join(TEX_DIR, rel);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end(`Missing TeX asset ${rel}. Run \`pnpm tex:assets\`.`);
      return;
    }
    const ext = rel.slice(rel.lastIndexOf('.'));
    res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(statSync(file).size));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'resumechef-tex-assets',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), texAssets()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
  },
});
