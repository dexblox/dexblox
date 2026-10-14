// GET /api/media?id=<hex>  ->  file foto/GIF/video yang disimpan di Redis (upload kecil tanpa Vercel Blob).
const { kvGet } = require('./_kv');
const uploadHandler = require('./_media-upload');

module.exports = async function handler(req, res) {
  // POST (admin) = upload file; digabung ke sini agar jumlah Serverless Function <= 12 (batas Hobby).
  if (req.method === 'POST') return uploadHandler(req, res);
  if (req.method !== 'GET') return res.status(405).end();
  const id = String((req.query && req.query.id) || '');
  if (!/^[a-f0-9]{16,40}$/.test(id)) return res.status(400).end();
  try {
    const m = await kvGet('media:' + id);
    if (!m || !m.b64) return res.status(404).end();
    const buf = Buffer.from(m.b64, 'base64');
    res.setHeader('Content-Type', m.mime || 'application/octet-stream');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // id unik per upload
    return res.status(200).end(buf);
  } catch (e) {
    return res.status(500).end();
  }
};

// Body mentah dibutuhkan upload (POST); GET tidak terpengaruh.
module.exports.config = { api: { bodyParser: false } };
