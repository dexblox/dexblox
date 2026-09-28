// GET /api/avatar?userId=123  ->  { avatarUrl }
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId wajib diisi' });

    const r = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=false`
    );
    const data = await r.json();
    const item = data && data.data && data.data[0];
    if (!item || !item.imageUrl) return res.status(404).json({ error: 'Avatar tidak ditemukan' });

    return res.status(200).json({ avatarUrl: item.imageUrl });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menghubungi Roblox API' });
  }
};
