// GET /api/pakasir-status?order_id=...&amount=...  ->  { transaction: { status } }
const { kvGet } = require('./_kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'order_id wajib diisi' });

    const slug = process.env.PAKASIR_SLUG;
    const apiKey = process.env.PAKASIR_API_KEY;
    if (!slug || !apiKey) {
      return res.status(500).json({ error: 'PAKASIR_SLUG / PAKASIR_API_KEY belum diset' });
    }

    const txnId = await kvGet(`txn:${order_id}`);
    if (!txnId) return res.status(200).json({ transaction: { status: 'pending' } });

    const r = await fetch(
      `https://app.pakasir.com/api/v2/transaction-status/${encodeURIComponent(slug)}/${encodeURIComponent(txnId)}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    const data = await r.json();

    return res.status(200).json({
      transaction: { status: data.status || 'pending', completed_at: data.completed_at || null }
    });
  } catch (e) {
    // Kalau gagal cek, jangan bikin polling di frontend error - anggap masih pending
    return res.status(200).json({ transaction: { status: 'pending' } });
  }
};
