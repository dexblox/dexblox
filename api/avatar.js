export default async function handler(req, res) {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "User ID kosong!" });
  }

  // Gunakan Thumbnail API v1
  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: "Avatar tidak ditemukan!" });
    }

    const avatarUrl = data.data[0].imageUrl;
    res.status(200).json({ avatarUrl });
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil avatar", detail: err.message });
  }
}
