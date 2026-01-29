// games.js
async function cekGame(gameId) {
  const gameInfoDiv = document.getElementById('gameInfo');

  try {
    // Panggil API Roblox untuk ambil detail game
    const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${gameId}`);
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const game = data.data[0];
      gameInfoDiv.innerHTML = `
        🎮 Nama Game: <b>${game.name}</b><br>
        ID: ${game.id}<br>
        <a href="https://www.roblox.com/games/${game.id}" target="_blank">🔗 Lihat Game</a><br>
        <img src="https://www.roblox.com/asset-thumbnail/image?assetId=${game.id}&width=256&height=256&format=png"
             style="border-radius:8px;margin-top:6px;">
      `;
    } else {
      gameInfoDiv.innerHTML = "❌ Game tidak ditemukan!";
    }
  } catch (err) {
    gameInfoDiv.innerHTML = "⚠️ Error koneksi API Roblox!";
  }
}
