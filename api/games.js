// games.js

// Ambil userId dari username Roblox
async function getUserId(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username] })
  });
  const data = await res.json();
  if (data.data && data.data.length > 0) {
    return data.data[0].id; // userId
  }
  throw new Error("Username tidak ditemukan");
}

// Ambil daftar game milik user berdasarkan userId
async function getUserGames(userId) {
  const res = await fetch(`https://games.roblox.com/v2/users/${userId}/games`);
  const data = await res.json();
  return data.data || [];
}

// Contoh penggunaan
(async () => {
  try {
    const username = "NamaUser"; // ganti dengan username Roblox
    const userId = await getUserId(username);
    const games = await getUserGames(userId);

    if (games.length > 0) {
      games.forEach(game => {
        const gameLink = `https://www.roblox.com/games/${game.rootPlaceId}`;
        console.log(`Game: ${game.name} → ${gameLink}`);
      });
    } else {
      console.log("User belum punya game.");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
})();
