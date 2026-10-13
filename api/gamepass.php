<?php
// GET /api/gamepass.php?userId=123&price=715
// Cek apakah user Roblox punya gamepass (di game publiknya) dengan harga tertentu dan sedang dijual.
header('Content-Type: application/json; charset=utf-8');

$userId = $_GET['userId'] ?? '';
$price  = $_GET['price'] ?? '';
if (!ctype_digit($userId) || !ctype_digit($price) || (int)$price < 1) {
    http_response_code(400);
    echo json_encode(['error' => 'parameter tidak valid']);
    exit;
}
$price = (int)$price;

function rbx_get($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; MengStore/1.0)',
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $code < 200 || $code >= 300) return null;
    return json_decode($body, true);
}

$games = rbx_get("https://games.roblox.com/v2/users/$userId/games?limit=50&sortOrder=Asc");
if ($games === null) {
    http_response_code(502);
    echo json_encode(['error' => 'gagal menghubungi Roblox']);
    exit;
}

foreach (array_slice($games['data'] ?? [], 0, 10) as $g) {
    $uid = $g['id'] ?? null;
    if (!$uid) continue;
    $passes = [];
    $res = rbx_get("https://apis.roblox.com/game-passes/v1/universes/$uid/game-passes?passView=Full&pageSize=100");
    if ($res !== null) {
        $passes = $res['gamePasses'] ?? [];
    } else {
        $res = rbx_get("https://games.roblox.com/v1/games/$uid/game-passes?limit=100&sortOrder=Asc");
        $passes = $res['data'] ?? [];
    }
    foreach ($passes as $p) {
        $pp = $p['price'] ?? null;
        $forSale = $p['isForSale'] ?? true;
        if ($pp !== null && (int)$pp === $price && $forSale) {
            echo json_encode(['found' => true, 'name' => $p['name'] ?? '', 'id' => $p['id'] ?? $p['gamePassId'] ?? null]);
            exit;
        }
    }
}
echo json_encode(['found' => false]);
