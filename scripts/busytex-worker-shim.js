// ResumeChef: Cloudflare Pages serves files of at most 25 MiB, so the BusyTeX engine's large files
// (.wasm, .data) are stored gzipped and split into parts (see scripts/shard-tex-assets.mjs).
// This wrapper replaces busytex_worker.js: it patches fetch() so that requests for a sharded file
// stream its parts back-to-back, gunzip them, and return the original bytes. BusyTeX itself
// (busytex_worker_impl.js and everything it loads) is unchanged.
(function () {
  var realFetch = self.fetch.bind(self);
  var manifest = realFetch(new URL('shards.json', self.location.href))
    .then(function (r) {
      return r.ok ? r.json() : {};
    })
    .catch(function () {
      return {};
    });

  function joinParts(base, parts) {
    var i = 0;
    return new ReadableStream({
      async pull(controller) {
        if (i >= parts.length) {
          controller.close();
          return;
        }
        var url = new URL(parts[i++], base);
        var res = await realFetch(url);
        if (!res.ok || !res.body) {
          controller.error(new Error('Failed to load ' + url + ' (' + res.status + ')'));
          return;
        }
        var reader = res.body.getReader();
        for (;;) {
          var chunk = await reader.read();
          if (chunk.done) break;
          controller.enqueue(chunk.value);
        }
      },
    });
  }

  self.fetch = async function (input, init) {
    var url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, self.location.href);
    var method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET';
    var entry = method === 'GET' ? (await manifest)[url.pathname.slice(url.pathname.lastIndexOf('/') + 1)] : undefined;
    if (!entry) return realFetch(input, init);
    var body = joinParts(new URL('.', url), entry.parts);
    if (entry.encoding === 'gzip') body = body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': entry.type, 'Content-Length': String(entry.size) },
    });
  };
})();

importScripts('busytex_worker_impl.js');
