// POST /api/order-status-update  { pass, order_id, status }  ->  { success }
const { kvGet, kvSet } = require('./_kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });
  try {
    const { pass, order_id, status } = req.body || {};
    if (pass !== process.env.ADMIN_PASS) {
      return res.status(401).json({ success: false, error: 'Password admin salah' });
    }
    if (!order_id || !status) {
      return res.status(400).json({ success: false, error: 'order_id dan status wajib diisi' });
    }

    const record = await kvGet(`order:${order_id}`);
    if (!record) return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan' });

    record.status = status;
    await kvSet(`order:${order_id}`, record);

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Gagal update pesanan' });
  }
};
