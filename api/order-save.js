// POST /api/order-save  { order_id, amount, produk, username, jenis, total }  ->  { success }
const { kvSet, kvZadd } = require('./_kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });
  try {
    const { order_id, amount, produk, username, jenis, total } = req.body || {};
    if (!order_id) return res.status(400).json({ success: false, error: 'order_id wajib diisi' });

    const record = {
      order_id,
      amount,
      produk: produk || '',
      username: username || '-',
      jenis: jenis || '',
      total: total || amount,
      status: 'pending',
      createdAt: Date.now()
    };

    await kvSet(`order:${order_id}`, record);
    await kvZadd('orders:index', record.createdAt, order_id);

    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Gagal menyimpan pesanan' });
  }
};
