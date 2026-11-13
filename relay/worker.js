/* Looper for HiChord: the share relay.
   GitHub Pages is static, so sending a project from one device to another goes through this small
   Cloudflare Worker. The app uploads one file (the project plus its own sounds, gzipped) and gets a
   six-character code back; the other device downloads the file with that code and then deletes it.
   No accounts: the code is the only key. Uploads expire after TTL_HOURS (24) and are removed by
   the hourly cron at the latest; a receiver deletes the upload as soon as it has it.

     POST   /share          body: the file         -> 201 {code, expires}
     GET    /share/<code>   the file                 (404 when unknown or expired)
     DELETE /share/<code>   remove it now
   Limits: MAX_BYTES per upload (413 above it); per IP, RL_SHARE uploads and RL_GET lookups a minute
   (429), so codes can't be guessed: 31^6 ≈ 887 million codes against 30 tries a minute. */

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O, 1/I/L
const CODE_LEN = 6;
const CODE_RE = new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`);

function newCode() {
  const out = []; const buf = new Uint8Array(16);
  while (out.length < CODE_LEN) {
    crypto.getRandomValues(buf);
    for (const b of buf) { if (b < 248 && out.length < CODE_LEN) out.push(ALPHABET[b % 31]); }   // 248 = 8*31: no bias
  }
  return out.join('');
}
const cleanCode = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

function cors(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin', 'Cache-Control': 'no-store' };
  if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Expose-Headers'] = 'Content-Length, X-Expires';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json' } });

async function limited(limiter, req) {
  if (!limiter) return false;   // no rate limit binding (e.g. an older wrangler): no limit
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  try { const { success } = await limiter.limit({ key: ip }); return !success; } catch (e) { return false; }
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    const max = Number(env.MAX_BYTES || 31457280), ttl = Number(env.TTL_HOURS || 24) * 3600e3;

    if (parts.length === 0) return new Response('Looper for HiChord share relay\n', { headers: { ...h, 'Content-Type': 'text/plain' } });
    if (parts[0] !== 'share') return json({ error: 'not found' }, 404, h);

    if (parts.length === 1 && req.method === 'POST') {
      if (await limited(env.RL_SHARE, req)) return json({ error: 'too many uploads, try again in a minute' }, 429, h);
      const len = Number(req.headers.get('Content-Length') || 0);
      if (len > max) return json({ error: 'too big', max }, 413, h);
      const body = await req.arrayBuffer();
      if (body.byteLength > max) return json({ error: 'too big', max }, 413, h);
      if (body.byteLength < 8) return json({ error: 'empty' }, 400, h);
      let code = null;
      for (let i = 0; i < 8 && !code; i++) { const c = newCode(); if (!(await env.BUCKET.head(c))) code = c; }
      if (!code) return json({ error: 'try again' }, 503, h);
      const expires = Date.now() + ttl;
      await env.BUCKET.put(code, body, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { expires: String(expires) } });
      return json({ code, expires }, 201, h);
    }

    if (parts.length === 2 && (req.method === 'GET' || req.method === 'DELETE')) {
      if (await limited(env.RL_GET, req)) return json({ error: 'too many tries, wait a minute' }, 429, h);
      const code = cleanCode(parts[1]);
      if (!CODE_RE.test(code)) return json({ error: 'unknown or expired code' }, 404, h);
      if (req.method === 'DELETE') { await env.BUCKET.delete(code); return new Response(null, { status: 204, headers: h }); }
      const obj = await env.BUCKET.get(code);
      const exp = obj ? Number(obj.customMetadata?.expires || 0) : 0;
      if (!obj || exp < Date.now()) { if (obj) await env.BUCKET.delete(code); return json({ error: 'unknown or expired code' }, 404, h); }
      return new Response(obj.body, { headers: { ...h, 'Content-Type': 'application/octet-stream', 'Content-Length': String(obj.size), 'X-Expires': String(exp) } });
    }
    return json({ error: 'not found' }, 404, h);
  },

  // hourly: remove what has expired (also what nobody picked up)
  async scheduled(event, env) {
    let cursor;
    do {
      const page = await env.BUCKET.list({ cursor, include: ['customMetadata'], limit: 500 });
      const old = page.objects.filter(o => Number(o.customMetadata?.expires || 0) < Date.now()).map(o => o.key);
      if (old.length) await env.BUCKET.delete(old);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  },
};
