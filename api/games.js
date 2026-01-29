// pages/api/games.js
export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "UserId diperlukan" });
  }

  try {
    const response = await fetch(`https://games.roblox.com/v2/users/${userId}/games`);
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      // Ambil game pertama user
      const firstGame = data.data[0];
      res.status(200).json({
        id: firstGame.id,
        name: firstGame.name,
        link: `https://www.roblox.com/games/${firstGame.id}/${firstGame.name.replace(/\s+/g,'-')}`
      });
    } else {
      res.status(404).json({ error: "User belum punya game" });
    }
  } catch (err) {
    res.status(500).json({ error: "Gagal fetch game Roblox" });
  }
}
