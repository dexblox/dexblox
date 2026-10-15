// GET /api/order-lookup?ids=DBX-AAA,DBX-BBB   (maks 20)  ->  { orders: [...] }
// GET /api/order-lookup?order_id=DBX-AAA                  ->  { found, order }
// Untuk pembeli: cek status pesanan (Menunggu Bayar / Pending / Succeed). Data sensitif disamarkan.
const { kvGet } = require('./_kv');
const { rateLimit } = require('./_ratelimit');
const { refreshOrder, publicOrder } = require('./_orders');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'olookup', 40, 60);
  if (!rl.ok) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });

  const q = req.query || {};
  const single = String(q.order_id || '').trim().toUpperCase();
  const list = String(q.ids || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const ids = [...new Set(single ? [single] : list)].filter(id => /^[A-Z0-9_-]{4,40}$/.test(id)).slice(0, 20);
  if (!ids.length) return res.status(400).json({ error: 'ID pesanan tidak valid' });

  try {
    const results = await Promise.all(ids.map(async (id) => {
      const rec = await refreshOrder(await kvGet(`order:${id}`));
      return rec && rec.status !== 'expired' ? publicOrder(rec) : null;   // riwayat "tidak jadi" hanya untuk admin
    }));
    const orders = results.filter(Boolean);
    if (single) return res.status(200).json(orders.length ? { found: true, order: orders[0] } : { found: false });
    return res.status(200).json({ orders });
  } catch (e) {
    console.error('order-lookup.js:', e);
    return res.status(500).json({ error: 'Gagal mengambil data pesanan' });
  }
};
