// POST /api/user  { username }  ->  { userId, name }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan' });
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });

    const r = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const data = await r.json();
    const user = data && data.data && data.data[0];
    if (!user) return res.status(404).json({ error: 'Username tidak ditemukan' });

    return res.status(200).json({ userId: user.id, name: user.name });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menghubungi Roblox API' });
  }
};
