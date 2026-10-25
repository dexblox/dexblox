// Rekber / middleman — room chat ala WhatsApp (bukan endpoint: diawali "_" jadi di-skip Vercel).
// Dijangkau lewat  /api/rekber  (lihat vercel.json) yang diteruskan oleh api/user.js
// supaya jumlah Serverless Function tetap 12 (batas paket Hobby).
//
//   POST /api/rekber  { a:'create' | 'join' | 'poll' | 'send' | 'my' , ... }      -> peserta (pakai token room)
//   POST /api/rekber  { a:'admin_list' | 'admin_delete' | 'admin_close' }          -> admin (header x-admin-pass)
//   GET  /api/rekber?m=<idMedia>&c=<kodeRoom>  (header x-rk-token / x-admin-pass)  -> file foto / voice
//
// Data di Redis:
//   rk:room:<KODE>   JSON  info room + peserta (token disimpan sebagai hash SHA-256)
//   rk:msgs:<KODE>   LIST  pesan (JSON per elemen, indeks = nomor urut pesan)
//   rk:sum:<KODE>    JSON  ringkasan untuk daftar admin (jumlah pesan, pesan terakhir)
//   rk:m:<id>        JSON  {c, mime, b64}  foto / voice (kedaluwarsa otomatis, 14 hari)
//   rk:mc:<KODE>     INT   jumlah foto+suara di room (batas per room)
//   rk:index         ZSET  semua room (skor = aktivitas terakhir)
const crypto = require('crypto');
const { isAdmin } = require('./_orders');
const { rateLimit } = require('./_ratelimit');
const kv = require('./_kv');

const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const TTL_SEC = 30 * 24 * 3600;           // room & media hilang 30 hari setelah aktivitas terakhir
const MAX_MSGS = 2000;                    // batas pesan per room
const MAX_TEXT = 2000;
const MAX_MEDIA_BYTES = 450 * 1024;       // hasil kompres dari browser (batas request Upstash gratis 1 MB)
const MEDIA_TTL_SEC = 14 * 24 * 3600;     // foto & suara hilang 14 hari setelah dikirim (hemat memori Redis)
const MAX_MEDIA_PER_ROOM = 30;            // foto + suara per room
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // tanpa 0/O/1/I/L biar tidak salah baca

// ── Redis (pipeline = satu request HTTP untuk banyak perintah) ─────────────
async function pipe(cmds) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Penyimpanan Redis belum terhubung.');
  const r = await fetch(KV_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  let j; try { j = await r.json(); } catch (_) { throw new Error('Redis membalas format tidak dikenal'); }
  if (!Array.isArray(j)) throw new Error('Redis: ' + ((j && j.error) || 'gagal'));
  if (kv.kvTally) kv.kvTally(cmds.length);
  return j.map((x) => { if (x && x.error) throw new Error('Redis: ' + x.error); return x ? x.result : null; });
}
const jparse = (s) => { try { return s == null ? null : JSON.parse(s); } catch (_) { return null; } };

// ── util ───────────────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rid = (n) => crypto.randomBytes(n).toString('hex');
function newCode() { const b = crypto.randomBytes(6); let s = ''; for (let i = 0; i < 6; i++) s += ALPHA[b[i] % ALPHA.length]; return s; }
function cleanCode(c) { return String(c || '').toUpperCase().replace(/^RK-?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 8); }
function cleanName(n, def) { const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); return s || def; }
function cleanTxt(t, max) { return String(t || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max); }
function eq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function qp(req, name) {
  if (req.query && req.query[name] != null) return String(req.query[name]);
  try { return new URL(req.url, 'http://x').searchParams.get(name) || ''; } catch (_) { return ''; }
}

// Cocokkan isi file dengan jenisnya (tolak file menyamar)
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
function sniffAudio(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (b.subarray(0, 4).toString('latin1') === 'OggS') return 'audio/ogg';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE') return 'audio/wav';
  if (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return null;
}

// Siapa yang memanggil? -> {role:'admin'} | {role:'buyer'|'seller'} | null
function whoAmI(req, room, token) {
  if (isAdmin(req)) return { role: 'admin', name: 'Admin' };
  if (!room || !token) return null;
  const h = sha(token);
  for (const r of ['buyer', 'seller']) {
    const m = room.members && room.members[r];
    if (m && m.th && eq(m.th, h)) return { role: r, name: m.name };
  }
  return null;
}

function publicRoom(room) {
  const mem = (r) => (room.members[r] ? { name: room.members[r].name } : null);
  return {
    code: room.code, title: room.title, amount: room.amount, desc: room.desc,
    status: room.status, createdAt: room.createdAt,
    members: { buyer: mem('buyer'), seller: mem('seller') }
  };
}
function preview(m) { return m.k === 'image' ? '📷 Foto' : m.k === 'voice' ? '🎤 Pesan suara' : String(m.x || '').slice(0, 60); }

// Tambah pesan + perbarui ringkasan/index/TTL. Return nomor urut pesan.
async function pushMsg(code, msg) {
  msg.t = Date.now();
  const rk = 'rk:room:' + code, mk = 'rk:msgs:' + code, sk = 'rk:sum:' + code;
  const res = await pipe([
    ['RPUSH', mk, JSON.stringify(msg)],
    ['EXPIRE', mk, TTL_SEC], ['EXPIRE', rk, TTL_SEC],
    ['ZADD', 'rk:index', String(msg.t), code]
  ]);
  const n = Number(res[0]) || 0;
  await pipe([['SET', sk, JSON.stringify({ n, t: msg.t, r: msg.r, nm: msg.n, p: preview(msg) }), 'EX', TTL_SEC]]);
  return n - 1;
}

async function notifyDiscord(text) {
  const url = process.env.REKBER_WEBHOOK || process.env.DISCORD_WEBHOOK_REKBER;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.slice(0, 1800) }), signal: AbortSignal.timeout(3000) });
  } catch (_) { /* notifikasi opsional */ }
}

// ── aksi ───────────────────────────────────────────────────────────────────
async function actCreate(req, res, b) {
  const rl = await rateLimit(req, 'rkcreate', 6, 600);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak membuat room, coba lagi beberapa menit lagi.' });
  const role = b.role === 'seller' ? 'seller' : 'buyer';
  const name = cleanName(b.name, role === 'buyer' ? 'Pembeli' : 'Penjual');
  const title = cleanTxt(b.title, 80).trim();
  if (title.length < 3) return res.status(400).json({ success: false, error: 'Isi judul transaksi (min. 3 huruf).' });
  const amount = cleanTxt(b.amount, 24).trim();
  const desc = cleanTxt(b.desc, 400).trim();
  const token = rid(16);
  let code = '';
  for (let i = 0; i < 6 && !code; i++) {
    const c = newCode();
    const room = { code: c, title, amount, desc, status: 'open', createdAt: Date.now(), creator: role, members: {} };
    room.members[role] = { name, th: sha(token), at: Date.now() };
    const [ok] = await pipe([['SET', 'rk:room:' + c, JSON.stringify(room), 'NX', 'EX', TTL_SEC]]);
    if (ok === 'OK') code = c;
  }
  if (!code) return res.status(500).json({ success: false, error: 'Gagal membuat kode room, coba lagi.' });
  await pushMsg(code, { k: 'sys', r: 'sys', x: `Room dibuat oleh ${name} (${role === 'buyer' ? 'Pembeli' : 'Penjual'}). Bagikan kode room ke ${role === 'buyer' ? 'penjual' : 'pembeli'} agar bisa masuk. Admin rekber ikut memantau room ini.` });
  const det = [`Judul: ${title}`, amount ? `Nominal: ${amount}` : '', desc ? `Detail: ${desc}` : ''].filter(Boolean).join('\n');
  await pushMsg(code, { k: 'info', r: 'sys', x: det });
  notifyDiscord(`🛡️ **Room Rekber baru** \`RK-${code}\`\nJudul: ${title}${amount ? '\nNominal: ' + amount : ''}\nDibuat oleh: ${name} (${role})`);
  return res.status(200).json({ success: true, code, token, role });
}

async function actJoin(req, res, b) {
  const rl = await rateLimit(req, 'rkjoin', 20, 300);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak percobaan, tunggu sebentar.' });
  const code = cleanCode(b.code);
  if (code.length < 6) return res.status(400).json({ success: false, error: 'Kode room tidak valid.' });
  const [raw] = await pipe([['GET', 'rk:room:' + code]]);
  const room = jparse(raw);
  if (!room) return res.status(404).json({ success: false, error: 'Room tidak ditemukan. Cek lagi kodenya.' });
  // sudah anggota (token lama)?
  const me = b.token ? whoAmI({ headers: {}, body: {}, query: {} }, room, b.token) : null;
  if (me && me.role !== 'admin') return res.status(200).json({ success: true, code, token: b.token, role: me.role });
  if (room.status === 'closed') return res.status(403).json({ success: false, error: 'Room ini sudah ditutup.' });
  const free = ['buyer', 'seller'].find((r) => !room.members[r]);
  if (!free) return res.status(403).json({ success: false, error: 'Room sudah penuh (pembeli & penjual sudah masuk).' });
  const name = cleanName(b.name, free === 'buyer' ? 'Pembeli' : 'Penjual');
  const token = rid(16);
  room.members[free] = { name, th: sha(token), at: Date.now() };
  await pipe([['SET', 'rk:room:' + code, JSON.stringify(room), 'EX', TTL_SEC]]);
  await pushMsg(code, { k: 'sys', r: 'sys', x: `${name} bergabung sebagai ${free === 'buyer' ? 'Pembeli' : 'Penjual'}.` });
  notifyDiscord(`🛡️ \`RK-${code}\` — **${name}** bergabung sebagai ${free === 'buyer' ? 'Pembeli' : 'Penjual'}.`);
  return res.status(200).json({ success: true, code, token, role: free });
}

async function actPoll(req, res, b) {
  const code = cleanCode(b.code);
  const after = Math.max(0, parseInt(b.after, 10) || 0);
  const [raw, list] = await pipe([['GET', 'rk:room:' + code], ['LRANGE', 'rk:msgs:' + code, String(after), '-1']]);
  const room = jparse(raw);
  if (!room) return res.status(404).json({ success: false, error: 'Room tidak ditemukan atau sudah kedaluwarsa.', gone: true });
  const me = whoAmI(req, room, b.token);
  if (!me) return res.status(403).json({ success: false, error: 'Tidak punya akses ke room ini.' });
  const msgs = (list || []).map((s, i) => { const m = jparse(s); if (m) m.i = after + i; return m; }).filter(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ success: true, me: me.role, room: publicRoom(room), msgs, next: after + (list || []).length });
}

async function actSend(req, res, b) {
  const rl = await rateLimit(req, 'rksend', 40, 60);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu cepat, tunggu sebentar.' });
  const code = cleanCode(b.code);
  const [raw, len] = await pipe([['GET', 'rk:room:' + code], ['LLEN', 'rk:msgs:' + code]]);
  const room = jparse(raw);
  if (!room) return res.status(404).json({ success: false, error: 'Room tidak ditemukan.' });
  const me = whoAmI(req, room, b.token);
  if (!me) return res.status(403).json({ success: false, error: 'Tidak punya akses ke room ini.' });
  if (room.status === 'closed' && me.role !== 'admin') return res.status(403).json({ success: false, error: 'Room sudah ditutup.' });
  if (Number(len) >= MAX_MSGS) return res.status(400).json({ success: false, error: 'Room ini sudah mencapai batas pesan.' });

  const kind = b.k === 'image' ? 'image' : b.k === 'voice' ? 'voice' : 'text';
  const msg = { k: kind, r: me.role, n: me.name };
  if (kind === 'text') {
    const x = cleanTxt(b.x, MAX_TEXT).trim();
    if (!x) return res.status(400).json({ success: false, error: 'Pesan kosong.' });
    msg.x = x;
  } else {
    const b64 = String(b.b64 || '');
    if (!b64 || b64.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 8) return res.status(413).json({ success: false, error: 'File terlalu besar (maks ±450 KB setelah dikompres).' });
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > MAX_MEDIA_BYTES) return res.status(413).json({ success: false, error: 'File terlalu besar.' });
    const mime = kind === 'image' ? sniffImage(buf) : sniffAudio(buf);
    if (!mime) return res.status(415).json({ success: false, error: kind === 'image' ? 'Format foto tidak didukung.' : 'Format suara tidak didukung.' });
    const [cnt] = await pipe([['INCR', 'rk:mc:' + code], ['EXPIRE', 'rk:mc:' + code, TTL_SEC]]);
    if (Number(cnt) > MAX_MEDIA_PER_ROOM) return res.status(400).json({ success: false, error: `Batas foto/suara per room tercapai (${MAX_MEDIA_PER_ROOM}). Lanjutkan lewat teks ya.` });
    const id = rid(12);
    await pipe([['SET', 'rk:m:' + id, JSON.stringify({ c: code, mime, b64 }), 'EX', MEDIA_TTL_SEC]]);
    msg.m = id; msg.mime = mime;
    if (kind === 'voice') msg.d = Math.max(1, Math.min(300, Math.round(Number(b.d) || 1)));
    const cap = cleanTxt(b.x, 300).trim();
    if (cap && kind === 'image') msg.x = cap;
  }
  const i = await pushMsg(code, msg);
  return res.status(200).json({ success: true, i });
}

// Daftar room yang pernah dibuat/diikuti browser ini (token milik sendiri)
async function actMy(req, res, b) {
  const items = Array.isArray(b.rooms) ? b.rooms.slice(0, 20) : [];
  const codes = items.map((x) => ({ c: cleanCode(x && x.c), t: String((x && x.t) || '') })).filter((x) => x.c.length >= 6);
  if (!codes.length) return res.status(200).json({ success: true, rooms: [] });
  const raws = await pipe(codes.map((x) => ['GET', 'rk:room:' + x.c]).concat(codes.map((x) => ['GET', 'rk:sum:' + x.c])));
  const out = [];
  codes.forEach((x, i) => {
    const room = jparse(raws[i]); if (!room) return;
    const me = whoAmI({ headers: {}, body: {}, query: {} }, room, x.t); if (!me) return;
    const s = jparse(raws[codes.length + i]) || {};
    out.push({ code: room.code, title: room.title, status: room.status, role: me.role, n: s.n || 0, t: s.t || room.createdAt, p: s.p || '', r: s.r || '' });
  });
  return res.status(200).json({ success: true, rooms: out });
}

async function actAdminList(req, res) {
  const [codes] = await pipe([['ZREVRANGE', 'rk:index', '0', '79']]);
  const list = codes || [];
  if (!list.length) return res.status(200).json({ success: true, rooms: [] });
  const raws = await pipe(list.map((c) => ['GET', 'rk:room:' + c]).concat(list.map((c) => ['GET', 'rk:sum:' + c])));
  const rooms = [], dead = [];
  list.forEach((c, i) => {
    const room = jparse(raws[i]);
    if (!room) { dead.push(c); return; }
    const s = jparse(raws[list.length + i]) || {};
    rooms.push({
      code: room.code, title: room.title, amount: room.amount, status: room.status, createdAt: room.createdAt,
      buyer: room.members.buyer ? room.members.buyer.name : null, seller: room.members.seller ? room.members.seller.name : null,
      n: s.n || 0, t: s.t || room.createdAt, p: s.p || '', r: s.r || '', nm: s.nm || ''
    });
  });
  if (dead.length) pipe(dead.map((c) => ['ZREM', 'rk:index', c])).catch(() => {});
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ success: true, rooms });
}

async function actAdminDelete(req, res, b) {
  const code = cleanCode(b.code);
  const [list] = await pipe([['LRANGE', 'rk:msgs:' + code, '0', '-1']]);
  const media = (list || []).map(jparse).filter((m) => m && m.m).map((m) => ['DEL', 'rk:m:' + m.m]);
  await pipe([['DEL', 'rk:room:' + code], ['DEL', 'rk:msgs:' + code], ['DEL', 'rk:sum:' + code], ['DEL', 'rk:mc:' + code], ['ZREM', 'rk:index', code]].concat(media));
  return res.status(200).json({ success: true });
}

async function actAdminClose(req, res, b) {
  const code = cleanCode(b.code);
  const [raw] = await pipe([['GET', 'rk:room:' + code]]);
  const room = jparse(raw);
  if (!room) return res.status(404).json({ success: false, error: 'Room tidak ditemukan.' });
  room.status = b.open ? 'open' : 'closed';
  await pipe([['SET', 'rk:room:' + code, JSON.stringify(room), 'EX', TTL_SEC]]);
  await pushMsg(code, { k: 'sys', r: 'sys', x: b.open ? 'Room dibuka kembali oleh Admin.' : 'Room ditutup oleh Admin. Transaksi selesai.' });
  return res.status(200).json({ success: true, status: room.status });
}

// GET media (foto / voice) — hanya anggota room atau admin
async function getMedia(req, res) {
  const id = qp(req, 'm'), code = cleanCode(qp(req, 'c'));
  if (!/^[a-f0-9]{24}$/.test(id) || code.length < 6) return res.status(400).end();
  const [rawRoom, rawM] = await pipe([['GET', 'rk:room:' + code], ['GET', 'rk:m:' + id]]);
  const room = jparse(rawRoom), m = jparse(rawM);
  if (!room || !m || m.c !== code) return res.status(404).end();
  if (!whoAmI(req, room, String(req.headers['x-rk-token'] || ''))) return res.status(403).end();
  const buf = Buffer.from(m.b64, 'base64');
  res.setHeader('Content-Type', m.mime || 'application/octet-stream');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=86400');
  return res.status(200).end(buf);
}

module.exports = async function rekberHandler(req, res) {
  try {
    if (req.method === 'GET') return await getMedia(req, res);
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    switch (b.a) {
      case 'create': return await actCreate(req, res, b);
      case 'join':   return await actJoin(req, res, b);
      case 'poll':   return await actPoll(req, res, b);
      case 'send':   return await actSend(req, res, b);
      case 'my':     return await actMy(req, res, b);
      case 'admin_list': case 'admin_delete': case 'admin_close':
        if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Password admin salah' });
        if (b.a === 'admin_list') return await actAdminList(req, res);
        if (b.a === 'admin_delete') return await actAdminDelete(req, res, b);
        return await actAdminClose(req, res, b);
      default: return res.status(400).json({ success: false, error: 'Aksi tidak dikenal' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: String((e && e.message) || e).slice(0, 200) });
  }
};
