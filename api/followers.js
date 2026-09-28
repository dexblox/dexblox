// GET /api/followers?userId=123  ->  { followerCount }
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId wajib diisi' });

    const r = await fetch(`https://friends.roblox.com/v1/users/${encodeURIComponent(userId)}/followers/count`);
    if (r.status === 429) return res.status(429).json({ error: 'Rate limit dari Roblox', retry: true });

    const data = await r.json();
    if (typeof data.count !== 'number') {
      return res.status(502).json({ error: 'Respons Roblox tidak valid', retry: true });
    }
    return res.status(200).json({ followerCount: data.count });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menghubungi Roblox API', retry: true });
  }
};
