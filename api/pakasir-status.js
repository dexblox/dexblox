// GET /api/pakasir-status?order_id=...&amount=...   ->   { transaction: { status } }
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { order_id, amount } = req.query;
    if (!order_id || !amount) return res.status(400).json({ error: 'order_id dan amount wajib diisi' });

    const slug = process.env.PAKASIR_SLUG;
    const apiKey = process.env.PAKASIR_API_KEY;
    if (!slug || !apiKey) {
      return res.status(500).json({ error: 'PAKASIR_SLUG / PAKASIR_API_KEY belum diset' });
    }

    // Panggil ulang create-transaction: API ini "find or create" (idempotent).
    // Kalau order_id + amount + method sama seperti waktu dibuat, Pakasir akan
    // mengembalikan transaksi yang SAMA lengkap dengan status terbarunya —
    // jadi kita tidak perlu menyimpan txn_id ke database sama sekali.
    const r = await fetch(
      `https://app.pakasir.com/api/v2/create-transaction/${encodeURIComponent(slug)}/${encodeURIComponent(order_id)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ method: 'qris', amount: Number(amount) })
      }
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
