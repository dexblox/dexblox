// GET /api/pakasir-status?txn_id=...   ->   { transaction: { status } }
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { txn_id } = req.query;
    if (!txn_id) return res.status(400).json({ error: 'txn_id wajib diisi' });

    const slug = process.env.PAKASIR_SLUG;
    const apiKey = process.env.PAKASIR_API_KEY;
    if (!slug || !apiKey) {
      return res.status(500).json({ error: 'PAKASIR_SLUG / PAKASIR_API_KEY belum diset' });
    }

    const r = await fetch(
      `https://app.pakasir.com/api/v2/transaction-status/${encodeURIComponent(slug)}/${encodeURIComponent(txn_id)}`,
      { headers: { 'X-Api-Key': apiKey } }
    );
    const data = await r.json();

    return res.status(200).json({
      transaction: {
        status: data.status || 'pending',
        completed_at: data.completed_at || null
      }
    });
  } catch (e) {
    // Kalau gagal cek, jangan bikin polling di frontend error - anggap masih pending
    return res.status(200).json({ transaction: { status: 'pending' } });
  }
};
