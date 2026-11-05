/**
 * Cloudflare Pages Function: serves the BusyTeX engine from an R2 bucket at /core/busytex/*.
 *
 * The engine must be same-origin (it starts with `new Worker('/core/busytex/busytex_worker.js')`),
 * and several files exceed Cloudflare Pages' 25 MiB static-file limit, so they live in R2 and are
 * streamed through this function. Bind the bucket as TEX_ASSETS (see wrangler.toml / README).
 */

interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  get(key: string, options?: { onlyIf?: Headers }): Promise<R2ObjectBody | null>;
}

interface Env {
  TEX_ASSETS: R2Bucket;
}

const TYPES: Record<string, string> = {
  wasm: 'application/wasm',
  js: 'text/javascript; charset=utf-8',
  data: 'application/octet-stream',
  txt: 'text/plain; charset=utf-8',
  cnf: 'text/plain; charset=utf-8',
  profile: 'text/plain; charset=utf-8',
};

export const onRequestGet = async ({ params, env, request }: { params: { path?: string[] }; env: Env; request: Request }) => {
  const key = (params.path ?? []).join('/');
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });
  const object = await env.TEX_ASSETS.get(`busytex/${key}`);
  if (!object) return new Response(`Missing TeX asset ${key}`, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream');
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  // Assets are versioned with the texlyre-busytex release; bump the bucket path when upgrading.
  headers.set('Cache-Control', 'public, max-age=604800, immutable');
  if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
};
