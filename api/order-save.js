// POST /api/order-save  { order_id, txn_id, amount, produk, username, jenis, total }  ->  { success }
// Dipanggil saat QR dibuat. Status awal "unpaid"; berubah ke "paid" otomatis setelah server memverifikasi pembayaran.
// Pesanan yang tidak dibayar dalam 30 menit dihapus otomatis.
const { kvSet, kvGet, kvZadd } = require('./_kv');
const { rateLimit } = require('./_ratelimit');
const { clean } = require('./_orders');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'osave', 15, 60);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan' });

  try {
    const b = (req.body && typeof req.body === 'object') ? req.body : {};
    const order_id = clean(b.order_id, 40).trim();
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(order_id)) return res.status(400).json({ success: false, error: 'order_id tidak valid' });

    const txn_id = clean(b.txn_id, 64).trim();
    if (txn_id && !/^[A-Za-z0-9_-]{4,64}$/.test(txn_id)) return res.status(400).json({ success: false, error: 'txn_id tidak valid' });

    // Jangan timpa pesanan yang sudah ada (cegah status dikembalikan / dipalsukan)
    const existing = await kvGet(`order:${order_id}`);
    if (existing) return res.status(200).json({ success: true, existing: true });

    let amount = Math.round(Number(b.amount)) || 0;
    let produk = clean(b.produk, 120);
    let itemId = '', totalTxt = '';
    // Nominal & nama produk diambil dari catatan server saat QR dibuat, bukan dari browser.
    if (txn_id) {
      const t = await kvGet(`txnitem:${txn_id}`);
      if (t && typeof t === 'object') { amount = Math.round(Number(t.amount)) || amount; produk = clean(t.produk, 120) || produk; itemId = clean(t.item, 60); totalTxt = 'Rp' + amount.toLocaleString('id-ID'); }
    }
    const record = {
      order_id,
      txn_id: txn_id || null,
      amount,
      item: itemId || undefined,
      produk,
      username: clean(b.username, 120) || '-',
      jenis: clean(b.jenis, 60),
      total: totalTxt || clean(b.total, 30) || String(amount),
      status: 'unpaid',
      createdAt: Date.now()
    };

    await kvSet(`order:${order_id}`, record);
    await kvZadd('orders:index', record.createdAt, order_id);
    if (txn_id) await kvSet(`txn:${txn_id}`, order_id);

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('order-save.js:', e);
    return res.status(500).json({ success: false, error: 'Gagal menyimpan pesanan' });
  }
};
