// Helper kecil untuk baca/tulis ke Vercel KV (Upstash Redis REST API).
// Env yang dibutuhkan: KV_REST_API_URL, KV_REST_API_TOKEN
// (otomatis terisi kalau kamu attach Storage > KV/Redis dari dashboard Vercel).

// Nama env bisa berbeda tergantung integrasi: Vercel KV (KV_REST_API_*) atau Upstash langsung (UPSTASH_REDIS_REST_*).
const KV_URL   = (process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || '').replace(/\/$/, '');
const KV_TOKEN =  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

async function kvCommand(parts) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('Penyimpanan KV belum terhubung (env KV_REST_API_URL / KV_REST_API_TOKEN kosong). Buka Vercel > Storage > hubungkan KV ke project ini, lalu Redeploy.');
  }
  const url = KV_URL + '/' + parts.map(encodeURIComponent).join('/');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + KV_TOKEN } });
  let data;
  try { data = await r.json(); } catch (_) { throw new Error('KV membalas format tidak dikenal (HTTP ' + r.status + ')'); }
  if (data.error) throw new Error('KV: ' + data.error);
  return data.result;
}

async function kvSet(key, value) {
  return kvCommand(['set', key, JSON.stringify(value)]);
}

async function kvGet(key) {
  const raw = await kvCommand(['get', key]);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function kvZadd(key, score, member) {
  return kvCommand(['zadd', key, String(score), member]);
}

async function kvZrangeRev(key, start, stop) {
  // Urutan terbaru -> terlama
  return kvCommand(['zrevrange', key, String(start), String(stop)]);
}

async function kvDel(key) {
  return kvCommand(['del', key]);
}

async function kvZrem(key, member) {
  return kvCommand(['zrem', key, member]);
}

module.exports = { kvSet, kvGet, kvDel, kvZadd, kvZrem, kvZrangeRev };
