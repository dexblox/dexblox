// api/user.js (serverless di Vercel)
export default async function handler(req, res) {
  const { username } = req.query;
  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username] })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Gagal koneksi ke API Roblox" });
  }
}
