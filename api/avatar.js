// avatar.js
function tampilkanAvatar(userId) {
  const avatarDiv = document.getElementById('avatarInfo');
  if (!userId) {
    avatarDiv.innerHTML = "❌ User ID kosong!";
    return;
  }

  // Thumbnail headshot Roblox
  const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;

  avatarDiv.innerHTML = `
    <img src="${avatarUrl}" alt="Avatar Roblox" style="border-radius:50%;margin-top:6px;">
  `;
}
