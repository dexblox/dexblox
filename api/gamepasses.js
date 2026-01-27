export default async function handler(req, res) {
  const { gameId } = req.query;
  try {
    const response = await fetch(`https://games.roblox.com/v1/games/${gameId}/game-passes`);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
