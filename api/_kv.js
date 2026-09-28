// Helper kecil untuk baca/tulis ke Vercel KV (Upstash Redis REST API).
// Env yang dibutuhkan: KV_REST_API_URL, KV_REST_API_TOKEN
// (otomatis terisi kalau kamu attach Storage > KV/Redis dari dashboard Vercel).

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvCommand(parts) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV belum dikonfigurasi (KV_REST_API_URL / KV_REST_API_TOKEN kosong)');
  }
  const url = KV_URL + '/' + parts.map(encodeURIComponent).join('/');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + KV_TOKEN } });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
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
  return kvCommand(['zrange', key, String(start), String(stop), 'REV']);
}

module.exports = { kvSet, kvGet, kvZadd, kvZrangeRev };
