// pages/api/avatar.js
export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "UserId diperlukan" });
  }

  try {
    // Panggil API Roblox untuk ambil avatar headshot
    const response = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      res.status(200).json({ imageUrl: data.data[0].imageUrl });
    } else {
      res.status(404).json({ error: "Avatar tidak ditemukan" });
    }
  } catch (err) {
    res.status(500).json({ error: "Gagal fetch avatar Roblox" });
  }
}
