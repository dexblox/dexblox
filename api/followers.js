// GET /api/followers?userId=123        ->  { followerCount, userId }
// GET /api/followers?username=sannzon3 ->  { followerCount, userId }   (username dicari dulu ke Roblox)
// Hanya membaca data publik Roblox (tidak memakai Redis).
async function resolveUserId(username) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [String(username)], excludeBannedUsers: false })
  });
  if (r.status === 429) return { retry: true };
  const data = await r.json().catch(() => ({}));
  const u = data && data.data && data.data[0];
  return u ? { id: u.id } : { notFound: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    let { userId, username } = req.query;
    if (!userId && !username) return res.status(400).json({ error: 'userId atau username wajib diisi' });

    if (!userId) {
      const u = await resolveUserId(String(username).slice(0, 40));
      if (u.retry) return res.status(429).json({ error: 'Rate limit dari Roblox', retry: true });
      if (u.notFound) return res.status(404).json({ error: 'Username tidak ditemukan' });
      userId = u.id;
    }

    const r = await fetch(`https://friends.roblox.com/v1/users/${encodeURIComponent(userId)}/followers/count`);
    if (r.status === 429) return res.status(429).json({ error: 'Rate limit dari Roblox', retry: true });

    const data = await r.json();
    if (typeof data.count !== 'number') {
      return res.status(502).json({ error: 'Respons Roblox tidak valid', retry: true });
    }
    return res.status(200).json({ followerCount: data.count, userId: Number(userId) });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menghubungi Roblox API', retry: true });
  }
};
