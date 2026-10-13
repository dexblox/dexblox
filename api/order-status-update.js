// POST /api/order-status-update  { order_id, status }  (header x-admin-pass)  ->  { success }
// status: "done" (Succeed) | "paid" (kembalikan ke Pending) | "cancel"
const { kvGet, kvSet } = require('./_kv');
const { isAdmin } = require('./_orders');
const { rateLimit } = require('./_ratelimit');

const ALLOWED = ['done', 'paid', 'cancel'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method tidak diizinkan' });

  const rl = await rateLimit(req, 'ostatus', 40, 60);
  if (!rl.ok) return res.status(429).json({ success: false, error: 'Terlalu banyak permintaan' });
  if (!isAdmin(req)) return res.status(401).json({ success: false, error: 'Password admin salah' });

  try {
    const { order_id, status } = req.body || {};
    if (!order_id || !ALLOWED.includes(status)) {
      return res.status(400).json({ success: false, error: 'order_id / status tidak valid' });
    }

    const record = await kvGet(`order:${order_id}`);
    if (!record) return res.status(404).json({ success: false, error: 'Pesanan tidak ditemukan (mungkin sudah kedaluwarsa)' });

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
