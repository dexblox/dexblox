// POST /api/media-upload  (header x-admin-pass, Content-Type = tipe file, body = isi file mentah)
//   ->  { success, url, kind, mime, size, store }
//
// Penyimpanan:
//   1) Vercel Blob  (bila env BLOB_READ_WRITE_TOKEN ada)  -> foto, GIF & video sampai ±4 MB
//   2) Redis/KV     (cadangan, otomatis)                   -> foto & GIF kecil sampai ±700 KB
// Batas 4 MB berasal dari batas body Vercel Function (4,5 MB). Video lebih besar: tempel link di panel admin.
const crypto = require('crypto');
const { isAdmin } = require('./_orders');
const { rateLimit } = require('./_ratelimit');
const { MIME_KIND, kvPost } = require('./_catalog');

const MAX_BYTES = 4 * 1024 * 1024;       // batas upload
const MAX_KV_BYTES = 700 * 1024;         // batas cadangan Redis (limit request Upstash gratis 1 MB, base64 +33%)
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };

// Cocokkan isi file dengan tipe yang diklaim (tolak file yang menyamar).
function sniff(buf) {
  if (buf.length < 12) return null;
  const h = buf.subarray(0, 12);
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'image/png';
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (h.subarray(4, 8).toString('latin1') === 'ftyp') {
    return /avif|avis/.test(buf.subarray(8, 16).toString('latin1')) ? 'image/avif' : 'video/mp4';
  }
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'video/webm';
  return null;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(Object.assign(new Error('too_big'), { code: 'too_big' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'mupload', 20, 60);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak upload, tunggu sebentar' });
  if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Password admin salah' });

  try {
    const declared = parseInt(req.headers['content-length'] || '0', 10);
    if (declared > MAX_BYTES) return res.status(413).json({ success: false, error: 'File terlalu besar (maks 4 MB). Kompres dulu, atau tempel link untuk video besar.' });

    const buf = await readBody(req, MAX_BYTES);
    if (!buf.length) return res.status(400).json({ success: false, error: 'File kosong' });

    const mime = sniff(buf);
    if (!mime || !MIME_KIND[mime]) return res.status(415).json({ success: false, error: 'Format tidak didukung. Pakai PNG, JPG, WebP, GIF, MP4 atau WebM.' });
    const kind = MIME_KIND[mime];

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (token) {
      const rand = crypto.randomBytes(6).toString('hex');
      const path = `catalog/${Date.now()}-${rand}.${EXT[mime]}`;
      const r = await fetch('https://blob.vercel-storage.com/' + path, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token, 'x-api-version': '7', 'x-content-type': mime,
          'x-add-random-suffix': '0', 'x-cache-control-max-age': '31536000'
        },
        body: buf
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) {
        const msg = (j && j.error && j.error.message) || ('HTTP ' + r.status);
        return res.status(502).json({ success: false, error: 'Upload ke Vercel Blob gagal: ' + String(msg).slice(0, 160) });
      }
      return res.status(200).json({ success: true, url: j.url, kind, mime, size: buf.length, store: 'blob' });
    }

    // Cadangan: simpan di Redis
    if (buf.length > MAX_KV_BYTES) {
      return res.status(413).json({
        success: false,
        error: kind === 'video'
          ? 'Upload video perlu Vercel Blob. Aktifkan di Vercel → Storage → Create → Blob, hubungkan ke project, lalu Redeploy. (Atau tempel link video.)'
          : 'File ' + Math.round(buf.length / 1024) + ' KB terlalu besar untuk penyimpanan bawaan (maks 700 KB). Kecilkan file, atau aktifkan Vercel Blob (Storage → Create → Blob).'
      });
    }
    const id = crypto.randomBytes(12).toString('hex');
    await kvPost(['SET', 'media:' + id, JSON.stringify({ mime, size: buf.length, b64: buf.toString('base64'), at: Date.now() })]);
    return res.status(200).json({ success: true, url: '/api/media?id=' + id, kind, mime, size: buf.length, store: 'kv' });
  } catch (e) {
    if (e && e.code === 'too_big') return res.status(413).json({ success: false, error: 'File terlalu besar (maks 4 MB).' });
    console.error('media-upload:', e);
    return res.status(500).json({ success: false, error: 'Upload gagal: ' + String((e && e.message) || e).slice(0, 180) });
  }
};

// Body diproses manual (file mentah), bukan JSON.
module.exports.config = { api: { bodyParser: false } };
