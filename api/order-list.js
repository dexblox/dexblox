// GET /api/order-list?pass=...  ->  { orders: [...] }
const { kvGet, kvZrangeRev } = require('./_kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { pass } = req.query;
    if (pass !== process.env.ADMIN_PASS) {
      return res.status(401).json({ error: 'Password admin salah' });
    }

    const ids = (await kvZrangeRev('orders:index', 0, 199)) || []; // 200 pesanan terbaru
    const orders = [];
    for (const id of ids) {
      const record = await kvGet(`order:${id}`);
      if (record) orders.push(record);
    }

    return res.status(200).json({ orders });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal mengambil daftar pesanan' });
  }
};
