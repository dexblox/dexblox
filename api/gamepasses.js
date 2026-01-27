export default async function handler(req, res) {
  const { gamepassId } = req.query;
  try {
    const response = await fetch(`https://catalog.roblox.com/v1/game-passes/${gamepassId}`);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
