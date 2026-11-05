#!/usr/bin/env node
// Prepare the BusyTeX engine for Cloudflare static hosting (free plan: max 25 MiB per file, 20,000 files).
//
//   node scripts/shard-tex-assets.mjs [src=tex-assets/busytex] [out=dist/core/busytex]
//
// - .wasm and .data files are gzipped and split into parts of at most 24 MiB, named after a hash
//   of their content (e.g. texlive-basic.data → ../busytex-parts/texlive-basic.data.<hash>.gz.000)
//   and listed in shards.json. Content-addressed parts can be cached forever (see public/_headers);
//   shards.json and the small loader files are revalidated, so an engine upgrade never mixes parts.
// - Every other file is copied unchanged (Cloudflare compresses text files on the fly).
// - busytex_worker.js is replaced by scripts/busytex-worker-shim.js, which reassembles the parts
//   in the browser; the original worker is kept as busytex_worker_impl.js.
// Output is deterministic, so unchanged parts are not re-uploaded on later deploys.
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] ?? 'tex-assets/busytex';
const out = process.argv[3] ?? 'dist/core/busytex';
const PART = 24 * 1024 * 1024;
const LIMIT = 25 * 1024 * 1024;
const TYPES = { '.wasm': 'application/wasm', '.data': 'application/octet-stream' };

if (!existsSync(join(src, 'busytex_worker.js'))) {
  console.error(`No BusyTeX assets in ${src}. Run \`pnpm tex:assets\` first.`);
  process.exit(1);
}
const partsDir = `${out}-parts`;
const partsRel = `../${partsDir.slice(partsDir.lastIndexOf('/') + 1)}/`;
rmSync(out, { recursive: true, force: true });
rmSync(partsDir, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(partsDir, { recursive: true });

async function hashFile(file) {
  const h = createHash('sha256');
  await pipeline(createReadStream(file), h);
  return h.digest('hex').slice(0, 12);
}

/** Writable that rolls over to a new part file every PART bytes. */
function partWriter(base) {
  const parts = [];
  let current = null;
  let written = 0;
  const open = () => {
    const name = `${base}.gz.${String(parts.length).padStart(3, '0')}`;
    parts.push(name);
    current = createWriteStream(join(partsDir, name));
    written = 0;
  };
  const stream = new Transform({
    transform(chunk, _enc, done) {
      let offset = 0;
      const step = () => {
        if (offset >= chunk.length) return done();
        if (!current || written >= PART) {
          if (current) current.end();
          open();
        }
        const n = Math.min(PART - written, chunk.length - offset);
        const ok = current.write(chunk.subarray(offset, offset + n));
        written += n;
        offset += n;
        if (ok) step();
        else current.once('drain', step);
      };
      step();
    },
    flush(done) {
      if (!current) open();
      current.end(done);
    },
  });
  return { stream, parts };
}

const manifest = {};
let total = 0;
for (const name of readdirSync(src).sort()) {
  const file = join(src, name);
  if (!statSync(file).isFile()) continue;
  const ext = name.slice(name.lastIndexOf('.'));
  if (name === 'busytex_worker.js') {
    copyFileSync(file, join(out, 'busytex_worker_impl.js'));
    copyFileSync(join(here, 'busytex-worker-shim.js'), join(out, 'busytex_worker.js'));
    continue;
  }
  if (!TYPES[ext]) {
    if (statSync(file).size > LIMIT) throw new Error(`${name} is over 25 MiB and is not a .wasm/.data file`);
    copyFileSync(file, join(out, name));
    continue;
  }
  const size = statSync(file).size;
  const { stream, parts } = partWriter(`${name}.${await hashFile(file)}`);
  await pipeline(createReadStream(file), createGzip({ level: 6 }), stream);
  const packed = parts.reduce((n, p) => n + statSync(join(partsDir, p)).size, 0);
  total += packed;
  manifest[name] = { size, type: TYPES[ext], encoding: 'gzip', parts: parts.map((p) => partsRel + p) };
  console.log(`${name.padEnd(28)} ${(size / 1e6).toFixed(1).padStart(6)} MB → ${(packed / 1e6).toFixed(1).padStart(6)} MB in ${parts.length} part(s)`);
}
writeFileSync(join(out, 'shards.json'), JSON.stringify(manifest, null, 1));
const files = [...readdirSync(out).map((f) => join(out, f)), ...readdirSync(partsDir).map((f) => join(partsDir, f))];
const biggest = Math.max(...files.map((f) => statSync(f).size));
console.log(`\n${files.length} files, ${(total / 1e6).toFixed(0)} MB of compressed parts, largest file ${(biggest / 1048576).toFixed(1)} MiB → ${out}, ${partsDir}`);
if (biggest > LIMIT) throw new Error('A file exceeds the 25 MiB per-file limit');
