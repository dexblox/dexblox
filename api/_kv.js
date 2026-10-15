// Helper kecil untuk baca/tulis ke Vercel KV (Upstash Redis REST API).
// Env yang dibutuhkan: KV_REST_API_URL, KV_REST_API_TOKEN
// (otomatis terisi kalau kamu attach Storage > KV/Redis dari dashboard Vercel).

// Nama env bisa berbeda tergantung integrasi: Vercel KV (KV_REST_API_*) atau Upstash langsung (UPSTASH_REDIS_REST_*).
const KV_URL   = (process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || '').replace(/\/$/, '');
const KV_TOKEN =  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

async function rawGet(parts) {
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

// Kirim perintah lewat POST (body JSON) — dipakai untuk nilai besar (mis. file media base64)
// yang tidak muat di URL. parts = ['SET', key, value, ...]
async function rawPost(parts) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('Penyimpanan KV belum terhubung (env KV_REST_API_URL / KV_REST_API_TOKEN kosong).');
  }
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(parts)
  });
  let data;
  try { data = await r.json(); } catch (_) { throw new Error('KV membalas format tidak dikenal (HTTP ' + r.status + ')'); }
  if (data.error) throw new Error('KV: ' + data.error);
  return data.result;
}

// ── Penghitung perintah (perkiraan) ──────────────────────────────────────
// Upstash tidak memberi angka "perintah bulan ini" lewat REST, jadi kita hitung sendiri:
// tiap perintah dicatat di memori, lalu digabung ke kunci stat:cmd:YYYY-MM tiap ±10 perintah / 60 detik.
// Perkiraan (bisa sedikit kurang bila server berhenti sebelum sempat menyimpan).
let _pending = 0, _lastFlush = 0;
const monthKey = () => 'stat:cmd:' + new Date().toISOString().slice(0, 7);
async function flushTally(force) {
  if (!_pending) return;
  if (!force && _pending < 10 && Date.now() - _lastFlush < 60000) return;
  const n = _pending + 1; _pending = 0; _lastFlush = Date.now();   // +1 = perintah INCRBY itu sendiri
  try { await rawGet(['incrby', monthKey(), String(n)]); } catch (_) { _pending += n - 1; }
}
async function kvCommand(parts) { const r = await rawGet(parts); _pending++; await flushTally(false); return r; }
async function kvPost(parts)    { const r = await rawPost(parts); _pending++; await flushTally(false); return r; }

// Pemakaian untuk panel admin: memori terpakai, jumlah kunci, perintah bulan ini.
async function kvUsage() {
  await flushTally(true);
  const out = { month: new Date().toISOString().slice(0, 7), memBytes: null, keys: null, cmdMonth: 0 };
  try { const info = String(await rawGet(['info'])); const m = /used_memory:(\d+)/.exec(info); if (m) out.memBytes = Number(m[1]); } catch (_) {}
  try { out.keys = Number(await rawGet(['dbsize'])); } catch (_) {}
  try { out.cmdMonth = Number(await rawGet(['get', monthKey()])) || 0; } catch (_) {}
  return out;
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

module.exports = { kvUsage, kvPost, kvSet, kvGet, kvDel, kvZadd, kvZrem, kvZrangeRev };
