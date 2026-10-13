// GET /api/gamepass?userId=123&price=715  ->  { found, name?, id? }
// Cek apakah user Roblox punya gamepass (di game publiknya) dengan harga tertentu dan sedang dijual.
async function rget(url) {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan' });
  const userId = String((req.query && req.query.userId) || '');
  const price = parseInt((req.query && req.query.price) || '', 10);
  if (!/^\d+$/.test(userId) || !(price > 0)) return res.status(400).json({ error: 'Parameter tidak valid' });

  try {
    const games = await rget(`https://games.roblox.com/v2/users/${userId}/games?limit=50&sortOrder=Asc`);
    if (!games) return res.status(502).json({ error: 'Gagal menghubungi Roblox' });

    const list = (games.data || []).slice(0, 10);
    const results = await Promise.all(list.map(async (g) => {
      let passes = [];
      const a = await rget(`https://apis.roblox.com/game-passes/v1/universes/${g.id}/game-passes?passView=Full&pageSize=100`);
      if (a) passes = a.gamePasses || [];
      else {
        const b = await rget(`https://games.roblox.com/v1/games/${g.id}/game-passes?limit=100&sortOrder=Asc`);
        passes = (b && b.data) || [];
      }
      return passes.find(p => Number(p.price) === price && p.isForSale !== false) || null;
    }));

    const hit = results.find(Boolean);
    if (hit) return res.status(200).json({ found: true, name: hit.name || '', id: hit.id || hit.gamePassId || null });
    return res.status(200).json({ found: false });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menghubungi Roblox' });
  }
};
