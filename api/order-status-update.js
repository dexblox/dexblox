// POST /api/order-status-update  { order_id, status }  (header x-admin-pass)  ->  { success }
// status: "done" (Succeed) | "paid" (kembalikan ke Pending) | "cancel"
//         "delete" -> hapus satu riwayat (hanya yang berstatus expired / cancel)
//         "purge"  -> hapus semua riwayat "tidak jadi" (expired) sekaligus (tanpa order_id)
const { kvGet, kvSet, kvZrangeRev } = require('./_kv');
const { isAdmin, removeOrder } = require('./_orders');
const { rateLimit } = require('./_ratelimit');

const ALLOWED = ['done', 'paid', 'cancel'];
const DELETABLE = ['expired', 'cancel'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'ostatus', 40, 60);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan' });
  if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Password admin salah' });

  try {
    const { order_id, status } = req.body || {};

    if (status === 'purge') {
      const ids = (await kvZrangeRev('orders:index', 0, 199)) || [];
      let removed = 0;
      for (const id of ids) {
        const rec = await kvGet(`order:${id}`);
        if (rec && rec.status === 'expired') { await removeOrder(rec); removed++; }
      }
      return res.status(200).json({ success: true, removed });
    }

    if (!order_id || ![...ALLOWED, 'delete'].includes(status)) {
      return res.status(400).json({ success: false, error: 'order_id / status tidak valid' });
    }

    const record = await kvGet(`order:${order_id}`);
    if (!record) return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan (mungkin sudah dihapus)' });

    if (status === 'delete') {
      if (!DELETABLE.includes(record.status)) {
        return res.status(400).json({ success: false, error: 'Hanya riwayat "Tidak Jadi" atau "Batal" yang bisa dihapus' });
      }
      await removeOrder(record);
      return res.status(200).json({ success: true, deleted: true });
    }
    if (record.status === 'expired') {
      return res.status(400).json({ success: false, error: 'Transaksi ini sudah kedaluwarsa (tidak dibayar)' });
    }

    record.status = status;
    const now = Date.now();
    if (status === 'done') { record.doneAt = now; if (!record.paidAt) record.paidAt = now; }
    if (status === 'paid') { record.doneAt = null; if (!record.paidAt) record.paidAt = now; }
    if (status === 'cancel') record.cancelAt = now;
    await kvSet(`order:${order_id}`, record);

    return res.status(200).json({ success: true, order: record });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Gagal update pesanan' });
  }
};
