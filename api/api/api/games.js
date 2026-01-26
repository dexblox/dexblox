export default async function handler(req, res) {
  const { userId } = req.query;
  try {
    const response = await fetch(`https://games.roblox.com/v2/users/${userId}/games`);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
