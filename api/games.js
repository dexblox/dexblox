// api/games.js
export default async function handler(req, res) {
  const { gameId } = req.query;

  if (!gameId) {
    return res.status(400).json({ error: "Game ID wajib diisi" });
  }

  try {
    const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${gameId}`);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal koneksi ke API Roblox" });
  }
}
