export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username kosong!" });
  }

  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username] })
    });

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: "Username tidak ditemukan!" });
    }

    const user = data.data[0];
    const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;

    res.status(200).json({
      userId: user.id,
      name: user.name,
      displayName: user.displayName,
      profileUrl
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal ambil data dari Roblox", detail: err.message });
  }
}
