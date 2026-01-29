export default function handler(req, res) {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "User ID kosong!" });
  }

  const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`;
  res.status(200).json({ avatarUrl });
}
