// Pembatas request per IP (bukan endpoint — diawali "_" jadi di-skip Vercel).
// Memakai Redis/KV bila KV_REST_API_URL & KV_REST_API_TOKEN ada (counter dibagi ke semua instance),
// kalau tidak ada / gagal, jatuh ke memori lokal (kurang kuat, tapi tetap membantu).
// Fail-open: kalau KV bermasalah, pelanggan asli tidak ikut terblokir.
const mem = new Map();

export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'unknown';
}

export async function rateLimit(req, name, limit, windowSec) {
  const ip = clientIp(req).replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45) || 'unknown';
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${name}:${ip}:${bucket}`;
  const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSec + 5]])
      });
      const j = await r.json();
      const count = Number(j && j[0] && j[0].result);
      if (Number.isFinite(count)) return { ok: count <= limit, retryAfter };
    } catch (_) { /* jatuh ke memori lokal */ }
  }

  // Cadangan: memori lokal per instance
  const now = Date.now();
  if (mem.size > 5000) for (const [k, v] of mem) if (v.exp < now) mem.delete(k);
  const e = mem.get(key) || { n: 0, exp: now + (windowSec + 5) * 1000 };
  e.n++; mem.set(key, e);
  return { ok: e.n <= limit, retryAfter };
}
