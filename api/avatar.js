// avatar.js
async function cekUsername() {
  const username = document.getElementById('username').value.trim();
  const userInfoDiv = document.getElementById('userInfo');

  if (!username) {
    userInfoDiv.innerHTML = "❌ Masukkan username dulu!";
    return;
  }

  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({usernames:[username]})
    });
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      const user = data.data[0];
      userInfoDiv.innerHTML = `
        ✅ Username ditemukan: <b>${user.name}</b><br>
        ID: ${user.id}<br>
        <a href="https://www.roblox.com/users/${user.id}/profile" target="_blank">🔗 Lihat Profil</a><br>
        <img src="https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=100&height=100&format=png" 
             style="border-radius:50%;margin-top:6px;">
      `;
    } else {
      userInfoDiv.innerHTML = "❌ Username tidak ditemukan!";
    }
  } catch (err) {
    userInfoDiv.innerHTML = "⚠️ Error koneksi API Roblox!";
  }
}
