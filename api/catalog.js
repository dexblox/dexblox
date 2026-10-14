// POST /api/catalog (admin) -> lihat _catalog-save.js (juga dijangkau lewat /api/catalog-save, lihat vercel.json)
// GET /api/catalog  (publik)  ->  { prices, media, updatedAt }
// Dibaca oleh halaman toko setiap dibuka, supaya harga & gambar/video terbaru dari admin langsung tampil.
const { loadCatalog } = require('./_catalog');
const saveHandler = require('./_catalog-save');

module.exports = async function handler(req, res) {
  // POST (admin) = simpan perubahan; digabung ke sini agar jumlah Serverless Function <= 12 (batas Hobby).
  if (req.method === 'POST') return saveHandler(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const c = await loadCatalog();
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    return res.status(200).json(c);
  } catch (e) {
    // KV belum siap -> toko tetap jalan dengan harga bawaan
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ prices: {}, media: {}, updatedAt: 0, degraded: true });
  }
};
