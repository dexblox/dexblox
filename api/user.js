// pages/api/user.js
export default async function handler(req, res) {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Username diperlukan" });
  }

  try {
    // Panggil API Roblox untuk cari user berdasarkan username
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username] })
    });

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const user = data.data[0];
      res.status(200).json({
        id: user.id,
        displayName: user.displayName,
        name: user.name
      });
    } else {
      res.status(404).json({ error: "User tidak ditemukan" });
    }
  } catch (err) {
    res.status(500).json({ error: "Gagal fetch data Roblox" });
  }
}
