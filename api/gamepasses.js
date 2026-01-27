export default async function handler(req, res) {
  const { gamepassId, universeId } = req.query;

  try {
    let url;

    if (gamepassId) {
      // Ambil detail satu gamepass
      url = `https://catalog.roblox.com/v1/game-passes/${gamepassId}`;
    } else if (universeId) {
      // Ambil daftar semua gamepass dari universe
      url = `https://games.roblox.com/v1/game-passes?universeId=${universeId}`;
    } else {
      return res.status(400).json({ error: "Harus pakai gamepassId atau universeId" });
    }

    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
