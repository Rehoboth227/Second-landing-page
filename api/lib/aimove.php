<?php
/*
 * AiMove: deliveries, escrow, wallet, rider earnings, messages, notifications and maps.
 * Included by api/index.php. Uses the shared Rehohub accounts: an AiMove "customer" sends
 * packages, an approved "rider" delivers them, and AiMove administrators run operations.
 *
 * Money rules (all enforced here, never in the browser):
 * - Prices are worked out by the server (am_quote, the same rules as assets/js/aimove-pricing.js).
 * - Paying for a delivery moves the price from the customer's wallet into escrow.
 * - The rider's share is released to their earnings only when they enter the recipient's PIN.
 * - Cancelling before pickup refunds the escrow to the customer's wallet.
 * - Wallet top-ups (bank transfer to Rehohub) and rider withdrawals wait for an AiMove
 *   administrator to confirm them.
 *
 * Maps: with Google Maps keys in the private config file ('google_maps' => ['server_key' =>
 * ..., 'browser_key' => ...]), distances are real road distances (Routes API) and the app shows
 * live maps. Without keys, the distance is estimated from the addresses, as before.
 */
declare(strict_types=1);

const AM_COLLECT = ['account_name' => 'Rehohub Ltd', 'bank_name' => 'Moniepoint', 'account_number' => '810512715'];
const AM_STATES = ['Lagos', 'FCT Abuja', 'Ogun', 'Oyo', 'Rivers', 'Abia', 'Enugu', 'Kano', 'Kaduna', 'Edo', 'Delta', 'Anambra'];
const AM_SLOTS = ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00'];
const AM_ACTIVE = ['REQUESTED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'];
const AM_PREFS = ['orders' => true, 'messages' => true, 'location' => true, 'dark' => false];

// ------------------------------------------------------------------ pricing (mirror of aimove-pricing.js)
const AM_PRICING = [
    'vehicles' => [
        'bike' => ['name' => 'Motorcycle', 'maxKg' => 10, 'base' => 500, 'perKm' => 120, 'perMin' => 15, 'minFare' => 1200, 'speedKmh' => 24],
        'car' => ['name' => 'Car', 'maxKg' => 50, 'base' => 1000, 'perKm' => 200, 'perMin' => 25, 'minFare' => 2500, 'speedKmh' => 20],
        'van' => ['name' => 'Van', 'maxKg' => 1000, 'base' => 3000, 'perKm' => 400, 'perMin' => 40, 'minFare' => 6000, 'speedKmh' => 18],
    ],
    'longDistance' => ['afterKm' => 30, 'rateFactor' => 0.5, 'speedKmh' => 60],
    'weight' => ['brackets' => [[5, 0], [10, 300], [20, 700], [50, 1500]], 'perKgAbove' => 30],
    'services' => [
        'SAME_DAY' => ['name' => 'Standard', 'markup' => 0],
        'EXPRESS' => ['name' => 'Express', 'markup' => 800],
        'INSTANT' => ['name' => 'Instant', 'markup' => 1500],
        'SCHEDULED' => ['name' => 'Scheduled', 'markup' => 0],
    ],
    'peak' => [[7, 10], [17, 20]], 'peakMultiplier' => 1.25,
    'bookingFee' => 200, 'protection' => ['freeUpTo' => 50000, 'rate' => 0.005, 'max' => 5000],
    'roundTo' => 50, 'riderShare' => 0.85,
];

function am_pick_vehicle(float $kg): string
{
    foreach (['bike', 'car', 'van'] as $v) {
        if ($kg <= AM_PRICING['vehicles'][$v]['maxKg']) {
            return $v;
        }
    }
    return 'van';
}

function am_weight_fee(float $kg): int
{
    $w = AM_PRICING['weight'];
    foreach ($w['brackets'] as [$max, $fee]) {
        if ($kg <= $max) {
            return $fee;
        }
    }
    [$lastMax, $lastFee] = $w['brackets'][count($w['brackets']) - 1];
    return $lastFee + (int) ceil($kg - $lastMax) * $w['perKgAbove'];
}

/** JavaScript Math.round (halves round up), so server and browser prices match exactly. */
function js_round(float $x): int
{
    return (int) floor($x + 0.5);
}

function am_quote(float $km, float $kg, string $service, string $vehicle, int $hour, int $worth): array
{
    $P = AM_PRICING;
    $km = max(0.5, $km);
    $kg = max(0.1, $kg);
    $service = isset($P['services'][$service]) ? $service : 'SAME_DAY';
    $need = am_pick_vehicle($kg);
    $rank = ['bike' => 0, 'car' => 1, 'van' => 2];
    $veh = isset($P['vehicles'][$vehicle]) ? $vehicle : $need;
    $upgraded = $rank[$veh] < $rank[$need];
    if ($upgraded) {
        $veh = $need;
    }
    $v = $P['vehicles'][$veh];
    $L = $P['longDistance'];
    $near = min($km, $L['afterKm']);
    $far = max(0, $km - $L['afterKm']);
    $minutes = js_round($near / $v['speedKmh'] * 60 + $far / $L['speedKmh'] * 60);
    $distance = js_round($near * $v['perKm'] + $far * $v['perKm'] * $L['rateFactor']);
    $time = js_round($minutes * $v['perMin']);
    $peak = false;
    foreach ($P['peak'] as [$a, $b]) {
        $peak = $peak || ($hour >= $a && $hour < $b);
    }
    $surge = $peak ? js_round(($distance + $time) * ($P['peakMultiplier'] - 1)) : 0;
    $fare = $v['base'] + $distance + $time + $surge + am_weight_fee($kg) + $P['services'][$service]['markup'];
    $fare += max(0, $v['minFare'] - $fare);
    $protection = $worth > $P['protection']['freeUpTo'] ? min($P['protection']['max'], js_round($worth * $P['protection']['rate'])) : 0;
    $raw = $fare + $P['bookingFee'] + $protection;
    $total = (int) (ceil($raw / $P['roundTo']) * $P['roundTo']);
    $fare += $total - $raw;
    $riderShare = js_round($fare * $P['riderShare']);
    return [
        'km' => $km, 'kg' => $kg, 'minutes' => $minutes, 'service' => $service, 'serviceName' => $P['services'][$service]['name'],
        'vehicle' => $veh, 'vehicleName' => $v['name'], 'upgraded' => $upgraded, 'peak' => $peak,
        'deliveryFare' => $fare, 'bookingFee' => $P['bookingFee'], 'protection' => $protection,
        'total' => $total, 'riderShare' => $riderShare, 'platformFee' => $total - $riderShare,
    ];
}

/** Same as estKm() in aimove-app.js: a stable estimate when no map service is set up. */
function am_est_km(array $o, array $d): float
{
    $s = mb_strtolower($o['addr'] . $o['state'] . $d['addr'] . $d['state']);
    $h = 7;
    foreach (mb_str_split($s) as $ch) {
        $h = ($h * 31 + mb_ord($ch)) & 0xFFFFFFFF;
    }
    return $o['state'] === $d['state'] ? round(3 + ($h % 260) / 10, 1) : (float) (120 + ($h % 680));
}

function am_lagos_now(): DateTime
{
    return new DateTime('now', new DateTimeZone('Africa/Lagos'));
}

// ------------------------------------------------------------------ Google Maps (optional)
function am_maps_cfg(): array
{
    $m = config()['google_maps'] ?? [];
    return ['server' => (string) ($m['server_key'] ?? ''), 'browser' => (string) ($m['browser_key'] ?? '')];
}

/** Real road distance with the Google Routes API. Returns null if maps aren't set up or the call fails. */
function am_route(array $o, array $d): ?array
{
    $key = am_maps_cfg()['server'];
    if ($key === '') {
        return null;
    }
    $place = fn (array $x) => isset($x['lat'], $x['lng']) && is_numeric($x['lat']) && is_numeric($x['lng'])
        ? ['location' => ['latLng' => ['latitude' => (float) $x['lat'], 'longitude' => (float) $x['lng']]]]
        : ['address' => $x['addr'] . ', ' . $x['state'] . ', Nigeria'];
    $body = json_encode(['origin' => $place($o), 'destination' => $place($d), 'travelMode' => 'DRIVE', 'regionCode' => 'NG', 'units' => 'METRIC']);
    $res = am_http_post('https://routes.googleapis.com/directions/v2:computeRoutes', $body, [
        'Content-Type: application/json',
        'X-Goog-Api-Key: ' . $key,
        'X-Goog-FieldMask: routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.startLocation,routes.legs.endLocation',
    ]);
    $r = $res ? (json_decode($res, true)['routes'][0] ?? null) : null;
    if (!$r || empty($r['distanceMeters'])) {
        return null;
    }
    $ll = fn ($loc) => isset($loc['latLng']) ? [round((float) $loc['latLng']['latitude'], 6), round((float) $loc['latLng']['longitude'], 6)] : null;
    return [
        'km' => round($r['distanceMeters'] / 1000, 1),
        'from' => $ll($r['legs'][0]['startLocation'] ?? []),
        'to' => $ll($r['legs'][0]['endLocation'] ?? []),
        'polyline' => mb_substr((string) ($r['polyline']['encodedPolyline'] ?? ''), 0, 20000),
    ];
}

function am_http_post(string $url, string $body, array $headers): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4]);
        $out = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($out === false || $code !== 200) {
            error_log('AiMove maps: routes request failed (HTTP ' . $code . ')');
            return null;
        }
        return (string) $out;
    }
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => $body, 'timeout' => 8, 'ignore_errors' => true]]);
    $out = @file_get_contents($url, false, $ctx);
    return $out === false ? null : $out;
}

// ------------------------------------------------------------------ people and roles
function am_roles(int $uid): array
{
    $roles = [];
    foreach (q("SELECT role FROM memberships WHERE user_id = ? AND product = 'aimove' AND status = 'approved'", [$uid])->fetchAll() as $r) {
        $roles[] = $r['role'];
    }
    if (in_array('aimove', admin_products($uid), true) && !in_array('admin', $roles, true)) {
        $roles[] = 'admin';
    }
    return $roles;
}

function am_require(string $role): array
{
    $u = require_user();
    if (!in_array($role, am_roles((int) $u['id']), true)) {
        fail(403, 'forbidden', $role === 'admin' ? 'Only AiMove operations can do that.' : 'Your account does not have AiMove ' . $role . ' access.');
    }
    return $u;
}

function am_profile(int $uid, bool $lock = false): array
{
    q('INSERT IGNORE INTO aimove_profiles (user_id) VALUES (?)', [$uid]);
    return row('SELECT * FROM aimove_profiles WHERE user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$uid]);
}

function am_prefs(array $p): array
{
    $out = AM_PREFS;
    foreach (($p['prefs'] ? (json_decode($p['prefs'], true) ?: []) : []) as $k => $v) {
        if (array_key_exists($k, AM_PREFS)) {
            $out[$k] = (bool) $v;
        }
    }
    return $out;
}

/** Money available: confirmed entries, minus withdrawals still waiting to be paid. */
function am_balance(int $uid, string $account): int
{
    return (int) row("SELECT COALESCE(SUM(amount), 0) n FROM aimove_ledger WHERE user_id = ? AND account = ?
                       AND (status = 'done' OR (status = 'pending' AND amount < 0))", [$uid, $account])['n'];
}

function am_note(int $uid, string $title, string $body, string $link = ''): void
{
    q('INSERT INTO aimove_notes (user_id, title, body, link) VALUES (?, ?, ?, ?)', [$uid, mb_substr($title, 0, 120), mb_substr($body, 0, 300), $link ?: null]);
}

function am_event(int $id, string $status): void
{
    q('INSERT INTO aimove_events (delivery_id, status) VALUES (?, ?)', [$id, $status]);
}

function am_rider_card(int $rid, bool $private): array
{
    $u = row("SELECT u.id, u.full_name, u.phone, m.details, p.vehicle, p.plate, p.online, p.lat, p.lng, p.loc_at, p.last_seen
              FROM users u JOIN memberships m ON m.user_id = u.id AND m.product = 'aimove' AND m.role = 'rider'
              LEFT JOIN aimove_profiles p ON p.user_id = u.id WHERE u.id = ?", [$rid]);
    if (!$u) {
        $u = row('SELECT id, full_name, phone FROM users WHERE id = ?', [$rid]) ?: ['id' => $rid, 'full_name' => 'Rider'];
    }
    $d = !empty($u['details']) ? (json_decode($u['details'], true) ?: []) : [];
    $st = row("SELECT COUNT(*) trips, AVG(rating) r FROM aimove_deliveries WHERE rider_id = ? AND status = 'DELIVERED'", [$rid]);
    $vehicle = $u['vehicle'] ?? '' ?: ucfirst((string) ($d['vehicle_type'] ?? ''));
    $out = [
        'id' => (string) $rid, 'name' => $u['full_name'], 'vehicle' => $vehicle ?: 'Rider',
        'kind' => in_array(strtolower($vehicle), ['motorcycle', 'bicycle'], true) ? 'Motorcycle' : (strtolower($vehicle) === 'van' || strtolower($vehicle) === 'truck' ? 'Van' : 'Car'),
        'plate' => ($u['plate'] ?? '') ?: (string) ($d['plate_number'] ?? ''),
        'rating' => $st['r'] ? round((float) $st['r'], 1) : 5.0, 'trips' => (int) $st['trips'],
        'online' => !empty($u['online']) && !empty($u['last_seen']) && strtotime($u['last_seen'] . ' UTC') > time() - 1800,
    ];
    if ($private) {
        $out['phone'] = $u['phone'] ?? '';
        if (!empty($u['loc_at']) && strtotime($u['loc_at'] . ' UTC') > time() - 900) {
            $out['loc'] = [(float) $u['lat'], (float) $u['lng'], strtotime($u['loc_at'] . ' UTC') * 1000];
        }
    }
    return $out;
}

/** One delivery, showing only what this person may see. */
function am_out(array $d, int $viewer, bool $ops): array
{
    $isCustomer = (int) $d['customer_id'] === $viewer;
    $isRider = $d['rider_id'] !== null && (int) $d['rider_id'] === $viewer;
    $involved = $isCustomer || $isRider || $ops;
    $origin = json_decode($d['origin'], true) ?: [];
    $dest = json_decode($d['dest'], true) ?: [];
    if (!$involved) { // an open job a rider is looking at: no phone numbers or names yet
        unset($origin['phone'], $origin['note'], $dest['phone'], $dest['name']);
    }
    $fare = json_decode($d['fare'], true) ?: [];
    $cust = row('SELECT u.full_name, p.business FROM users u LEFT JOIN aimove_profiles p ON p.user_id = u.id WHERE u.id = ?', [(int) $d['customer_id']]);
    $events = q('SELECT status, created_at FROM aimove_events WHERE delivery_id = ? ORDER BY id', [(int) $d['id']])->fetchAll();
    $ms = fn ($t) => strtotime($t . ' UTC') * 1000;
    $out = [
        'id' => (string) $d['id'], 'tracking' => $d['tracking'], 'items' => $d['items'], 'kg' => (float) $d['kg'], 'worth' => (int) $d['worth'],
        'km' => (float) $d['km'], 'kmSource' => $fare['kmSource'] ?? 'estimate', 'type' => $d['service'], 'slot' => (string) $d['sched_slot'],
        'when' => $d['sched_date'], 'origin' => $origin, 'dest' => $dest, 'status' => $d['status'],
        'fare' => ['total' => (int) $d['total'], 'riderShare' => (int) $d['rider_share'], 'serviceName' => $fare['serviceName'] ?? '', 'vehicleName' => $fare['vehicleName'] ?? '', 'lines' => true],
        'by' => $isCustomer ? 'me' : 'other', 'byName' => ($cust['business'] ?? '') ?: ($cust['full_name'] ?? 'Customer'),
        'rider' => $d['rider_id'] === null ? null : ($isRider ? 'me' : (string) $d['rider_id']),
        'preferred' => $d['preferred_rider_id'] !== null && (int) $d['preferred_rider_id'] === $viewer,
        'history' => array_map(fn ($e) => [$e['status'], $ms($e['created_at'])], $events),
        'created' => $ms($d['created_at']),
        'escrow' => ['state' => $d['escrow'], 'amount' => (int) $d['total'], 'riderShare' => (int) $d['rider_share'],
            'releasedAt' => $d['escrow'] === 'RELEASED' ? $ms($d['updated_at']) : null],
        'rating' => $d['rating'] ? ['stars' => (int) $d['rating'], 'tags' => $d['rating_tags'] ? explode('|', $d['rating_tags']) : [], 'note' => (string) $d['rating_note']] : null,
        'geo' => ['from' => $fare['from'] ?? null, 'to' => $fare['to'] ?? null, 'polyline' => $fare['polyline'] ?? ''],
    ];
    if ($isCustomer) {
        $out['pin'] = $d['pin'];
    }
    if ($d['rider_id'] !== null && !$isRider) {
        $out['riderInfo'] = am_rider_card((int) $d['rider_id'], ($isCustomer || $ops) && in_array($d['status'], AM_ACTIVE, true));
    }
    if ($ops) {
        $out['customer'] = $cust['full_name'] ?? '';
    }
    return $out;
}

/** Scheduled pickups become open requests on their day (Lagos time). */
function am_promote_scheduled(): void
{
    $today = am_lagos_now()->format('Y-m-d');
    $due = q("SELECT id FROM aimove_deliveries WHERE status = 'SCHEDULED' AND sched_date <= ?", [$today])->fetchAll();
    foreach ($due as $r) {
        q("UPDATE aimove_deliveries SET status = 'REQUESTED' WHERE id = ? AND status = 'SCHEDULED'", [(int) $r['id']]);
        am_event((int) $r['id'], 'REQUESTED');
    }
}

function am_ledger_out(array $t): array
{
    $meta = $t['meta'] ? (json_decode($t['meta'], true) ?: []) : [];
    return ['id' => 't' . $t['id'], 'title' => $t['title'], 'sub' => (string) ($t['ref'] ?? ''), 'amt' => (int) $t['amount'],
        'status' => $t['status'], 'kind' => $t['kind'], 'at' => strtotime($t['created_at'] . ' UTC') * 1000, 'meta' => $meta];
}

// ------------------------------------------------------------------ public
function r_am_config(): never
{
    ok(['maps_key' => am_maps_cfg()['browser'], 'collect' => AM_COLLECT, 'states' => AM_STATES, 'slots' => AM_SLOTS]);
}

// ------------------------------------------------------------------ everything a screen needs
function r_am_state(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $roles = am_roles($uid);
    $role = (string) ($_GET['role'] ?? '');
    if (!in_array($role, $roles, true)) {
        fail(403, 'forbidden', 'Your account does not have that AiMove access.');
    }
    am_promote_scheduled();
    $p = am_profile($uid);
    q('UPDATE aimove_profiles SET last_seen = ? WHERE user_id = ?', [now_utc(), $uid]);
    $ops = $role === 'admin';
    $out = [
        'role' => $role, 'roles' => $roles,
        'profile' => ['business' => (string) $p['business'], 'rc' => (string) $p['rc'], 'address' => (string) $p['address'],
            'vehicle' => (string) $p['vehicle'], 'plate' => (string) $p['plate'], 'licence' => (string) $p['licence']],
        'bank' => $p['bank_acct'] ? ['bank' => $p['bank_name'], 'acct' => $p['bank_acct'], 'name' => $p['bank_holder']] : null,
        'prefs' => am_prefs($p),
        'notes' => array_map(fn ($n) => ['id' => 'n' . $n['id'], 't' => $n['title'], 's' => $n['body'], 'link' => $n['link'] ?: '#/home',
            'read' => (bool) $n['read_at'], 'at' => strtotime($n['created_at'] . ' UTC') * 1000],
            q('SELECT * FROM aimove_notes WHERE user_id = ? ORDER BY id DESC LIMIT 60', [$uid])->fetchAll()),
        'collect' => AM_COLLECT,
    ];
    if ($role === 'customer') {
        $rows = q('SELECT * FROM aimove_deliveries WHERE customer_id = ? ORDER BY id DESC LIMIT 300', [$uid])->fetchAll();
        $out['packages'] = array_map(fn ($d) => am_out($d, $uid, false), $rows);
        $out['wallet'] = am_balance($uid, 'wallet');
        $out['tx'] = array_map('am_ledger_out', q("SELECT * FROM aimove_ledger WHERE user_id = ? AND account = 'wallet' ORDER BY id DESC LIMIT 200", [$uid])->fetchAll());
        $out['riders'] = array_map(fn ($r) => am_rider_card((int) $r['user_id'], false),
            q("SELECT m.user_id FROM memberships m JOIN users u ON u.id = m.user_id AND u.status IN ('active','warning')
               WHERE m.product = 'aimove' AND m.role = 'rider' AND m.status = 'approved' AND m.user_id <> ? LIMIT 200", [$uid])->fetchAll());
    } elseif ($role === 'rider') {
        $mine = q('SELECT * FROM aimove_deliveries WHERE rider_id = ? ORDER BY id DESC LIMIT 200', [$uid])->fetchAll();
        $open = q("SELECT * FROM aimove_deliveries WHERE status = 'REQUESTED' AND rider_id IS NULL AND customer_id <> ? ORDER BY (preferred_rider_id = ?) DESC, id DESC LIMIT 60", [$uid, $uid])->fetchAll();
        $out['packages'] = array_map(fn ($d) => am_out($d, $uid, false), array_merge($mine, $open));
        $today = am_lagos_now()->setTime(0, 0)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $offered = (int) row('SELECT COUNT(*) n FROM aimove_deliveries WHERE preferred_rider_id = ?', [$uid])['n'];
        $took = (int) row('SELECT COUNT(*) n FROM aimove_deliveries WHERE preferred_rider_id = ? AND rider_id = ?', [$uid, $uid])['n'];
        $out['rider'] = [
            'online' => (bool) $p['online'], 'balance' => am_balance($uid, 'earnings'),
            'today' => (int) row("SELECT COUNT(*) n FROM aimove_deliveries d JOIN aimove_events e ON e.delivery_id = d.id AND e.status = 'DELIVERED'
                                  WHERE d.rider_id = ? AND e.created_at >= ?", [$uid, $today])['n'],
            'acceptance' => $offered ? (int) round($took / $offered * 100) : 100,
            'payouts' => array_map('am_ledger_out', q("SELECT * FROM aimove_ledger WHERE user_id = ? AND account = 'earnings' AND kind = 'payout' ORDER BY id DESC LIMIT 100", [$uid])->fetchAll()),
            'card' => am_rider_card($uid, false),
        ];
    } else {
        $rows = q('SELECT * FROM aimove_deliveries ORDER BY id DESC LIMIT 300')->fetchAll();
        $out['packages'] = array_map(fn ($d) => am_out($d, $uid, true), $rows);
        $out['riders'] = array_map(fn ($r) => am_rider_card((int) $r['user_id'], true),
            q("SELECT m.user_id FROM memberships m JOIN users u ON u.id = m.user_id AND u.status IN ('active','warning')
               WHERE m.product = 'aimove' AND m.role = 'rider' AND m.status = 'approved' LIMIT 300")->fetchAll());
        $out['pending'] = array_map(function ($t) {
            $o = am_ledger_out($t);
            $o['who'] = $t['full_name'];
            $o['email'] = $t['email'];
            return $o;
        }, q("SELECT l.*, u.full_name, u.email FROM aimove_ledger l JOIN users u ON u.id = l.user_id WHERE l.status = 'pending' ORDER BY l.id")->fetchAll());
        $k = row("SELECT COALESCE(SUM(CASE WHEN escrow = 'HELD' AND status <> 'CANCELLED' THEN total END), 0) held,
                         COALESCE(SUM(CASE WHEN escrow = 'RELEASED' THEN total - rider_share END), 0) earned FROM aimove_deliveries");
        $out['kpi'] = ['held' => (int) $k['held'], 'earned' => (int) $k['earned']];
    }
    $out['unreadMsgs'] = 0;
    ok($out);
}

// ------------------------------------------------------------------ booking
function am_clean_place(mixed $raw, bool $dest): array
{
    $a = is_array($raw) ? $raw : [];
    $p = ['addr' => sub_in($a, 'addr', 200), 'state' => sub_in($a, 'state', 30), 'phone' => sub_in($a, 'phone', 30), 'note' => sub_in($a, 'note', 120)];
    if ($dest) {
        $p['name'] = sub_in($a, 'name', 80);
    }
    if (isset($a['lat'], $a['lng']) && is_numeric($a['lat']) && is_numeric($a['lng']) && abs((float) $a['lat']) <= 90 && abs((float) $a['lng']) <= 180) {
        $p['lat'] = round((float) $a['lat'], 6);
        $p['lng'] = round((float) $a['lng'], 6);
    }
    return $p;
}

/** Works out the price for a delivery (with real road distance when maps are set up) and remembers it for 20 minutes. */
function r_am_quote(): never
{
    $u = am_require('customer');
    rate_limit('am-quote:' . $u['id'], 120, 3600);
    $in = input();
    $o = am_clean_place($in['origin'] ?? [], false);
    $d = am_clean_place($in['dest'] ?? [], true);
    $items = str_in('items', 160);
    $kg = (float) ($in['kg'] ?? 0);
    $worth = (int) ($in['worth'] ?? 0);
    $type = str_in('type', 12);
    $veh = str_in('vehicle', 8);
    $when = str_in('when', 10);
    $slot = str_in('slot', 20);
    $e = [];
    if (mb_strlen($o['addr']) < 5) $e['oAddr'] = 'Enter the pickup address.';
    if (mb_strlen($d['addr']) < 5) $e['dAddr'] = 'Enter the drop-off address.';
    if (!in_array($o['state'], AM_STATES, true)) $e['oState'] = 'Choose the pickup state.';
    if (!in_array($d['state'], AM_STATES, true)) $e['dState'] = 'Choose the drop-off state.';
    if (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $o['phone'])) $e['oPhone'] = 'Enter a valid phone number.';
    if (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $d['phone'])) $e['dPhone'] = 'Enter the recipient\'s phone number.';
    if (mb_strlen($d['name']) < 2) $e['dName'] = 'Enter the recipient\'s name.';
    if (mb_strlen($items) < 2) $e['items'] = 'Say what you are sending.';
    if (!($kg > 0 && $kg <= 2000)) $e['kg'] = 'Enter a weight between 0.1 and 2,000 kg.';
    if ($worth < 0 || $worth > 100000000) $e['worth'] = 'Enter what the items are worth.';
    if (!isset(AM_PRICING['services'][$type])) $e['type'] = 'Choose a delivery type.';
    $hour = (int) am_lagos_now()->format('G');
    if ($type === 'SCHEDULED') {
        $today = am_lagos_now()->format('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $when) || $when <= $today || $when > am_lagos_now()->modify('+60 days')->format('Y-m-d')) $e['when'] = 'Choose a date from tomorrow, up to 60 days ahead.';
        if (!in_array($slot, AM_SLOTS, true)) $e['slot'] = 'Choose a time slot.';
        $hour = (int) substr($slot, 0, 2);
    } else {
        $when = '';
        $slot = '';
    }
    $rider = (int) ($in['rider'] ?? 0);
    if ($rider && !row("SELECT 1 FROM memberships WHERE user_id = ? AND product = 'aimove' AND role = 'rider' AND status = 'approved'", [$rider])) {
        $rider = 0;
    }
    if ($e) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $e);
    }
    $route = am_route($o, $d);
    $km = $route ? $route['km'] : am_est_km($o, $d);
    $f = am_quote($km, $kg, $type, $veh ?: 'auto', $hour, $worth);
    $f['kmSource'] = $route ? 'road' : 'estimate';
    if ($route) {
        $f['from'] = $route['from'];
        $f['to'] = $route['to'];
        $f['polyline'] = $route['polyline'];
    }
    $qid = bin2hex(random_bytes(8));
    $all = $_SESSION['am_quotes'] ?? [];
    $all = array_filter($all, fn ($x) => $x['exp'] > time());
    $all[$qid] = ['exp' => time() + 1200, 'uid' => (int) $u['id'], 'origin' => $o, 'dest' => $d, 'items' => $items, 'kg' => $kg, 'worth' => $worth,
        'type' => $type, 'when' => $when, 'slot' => $slot, 'rider' => $rider, 'fare' => $f];
    $_SESSION['am_quotes'] = array_slice($all, -10, null, true);
    ok(['qid' => $qid, 'fare' => $f, 'km' => $km, 'kmSource' => $f['kmSource'], 'riderOk' => (bool) $rider]);
}

/** Books the delivery at the quoted price and pays it from the wallet into escrow. */
function r_am_book(): never
{
    $u = am_require('customer');
    $uid = (int) $u['id'];
    rate_limit('am-book:' . $uid, 40, 3600);
    $qid = str_in('qid', 20);
    $q = $_SESSION['am_quotes'][$qid] ?? null;
    if (!$q || $q['exp'] < time() || $q['uid'] !== $uid) {
        fail(409, 'quote_expired', 'This price has expired. Go back and review the delivery again.');
    }
    $f = $q['fare'];
    $pdo = db();
    $pdo->beginTransaction();
    am_profile($uid, true); // locks this customer's wallet while we check and spend it
    if (am_balance($uid, 'wallet') < $f['total']) {
        $pdo->rollBack();
        fail(402, 'low_balance', 'Your wallet balance is too low for this delivery. Top up first.');
    }
    do {
        $tracking = 'R-' . implode('-', array_map(fn () => (string) random_int(1000, 9999), range(1, 4)));
    } while (row('SELECT 1 FROM aimove_deliveries WHERE tracking = ?', [$tracking]));
    $status = $q['type'] === 'SCHEDULED' ? 'SCHEDULED' : 'REQUESTED';
    q('INSERT INTO aimove_deliveries (tracking, customer_id, preferred_rider_id, status, service, vehicle, items, kg, worth, km, sched_date, sched_slot,
       origin, dest, fare, total, rider_share, pin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        $tracking, $uid, $q['rider'] ?: null, $status, $q['type'], $f['vehicle'], $q['items'], $q['kg'], $q['worth'], $f['km'],
        $q['when'] ?: null, $q['slot'] ?: null, json_encode($q['origin']), json_encode($q['dest']), json_encode($f), $f['total'], $f['riderShare'],
        str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT),
    ]);
    $id = (int) $pdo->lastInsertId();
    am_event($id, $status);
    q("INSERT INTO aimove_ledger (user_id, account, kind, amount, title, ref) VALUES (?, 'wallet', 'payment', ?, 'Paid into escrow', ?)", [$uid, -$f['total'], $tracking]);
    $pdo->commit();
    unset($_SESSION['am_quotes'][$qid]);
    am_note($uid, 'Transaction successful', $q['items'] . ' · ' . $tracking, '#/track/' . $id);
    if ($q['rider']) {
        am_note($q['rider'], 'A customer booked you', $q['items'] . ' · ' . $tracking . '. Accept it from Rider home.', '#/rider');
    }
    ok(['id' => (string) $id, 'tracking' => $tracking]);
}

// ------------------------------------------------------------------ delivery actions
function r_am_delivery(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    rate_limit('am-act:' . $uid, 400, 3600);
    $roles = am_roles($uid);
    $id = int_in('id');
    $action = str_in('action', 12);
    $pdo = db();
    $pdo->beginTransaction();
    $d = $id ? row('SELECT * FROM aimove_deliveries WHERE id = ? FOR UPDATE', [$id]) : null;
    if (!$d) {
        $pdo->rollBack();
        fail(404, 'not_found', 'Delivery not found.');
    }
    $isCustomer = (int) $d['customer_id'] === $uid && in_array('customer', $roles, true);
    $isRider = $d['rider_id'] !== null && (int) $d['rider_id'] === $uid;
    $ops = in_array('admin', $roles, true);
    $st = $d['status'];
    $cust = (int) $d['customer_id'];
    $ref = $d['tracking'];
    $bad = function (string $msg) use ($pdo) {
        $pdo->rollBack();
        fail(409, 'state', $msg);
    };
    $set = function (string $to) use ($id) {
        q('UPDATE aimove_deliveries SET status = ? WHERE id = ?', [$to, $id]);
        am_event($id, $to);
    };
    $msg = 'Updated.';
    switch ($action) {
        case 'cancel':
            if (!$isCustomer && !$ops) $bad('You cannot cancel this delivery.');
            if (!in_array($st, ['SCHEDULED', 'REQUESTED', 'ASSIGNED'], true)) $bad('This package has been picked up and can no longer be cancelled.');
            $set('CANCELLED');
            q("UPDATE aimove_deliveries SET escrow = 'REFUNDED' WHERE id = ?", [$id]);
            q("INSERT INTO aimove_ledger (user_id, account, kind, amount, title, ref) VALUES (?, 'wallet', 'refund', ?, 'Refund from escrow', ?)", [$cust, (int) $d['total'], $ref]);
            am_note($cust, 'Delivery cancelled', $ref . ': ' . 'NGN ' . number_format((int) $d['total']) . ' refunded to your wallet.', '#/wallet');
            if ($d['rider_id']) am_note((int) $d['rider_id'], 'Delivery cancelled', $ref . ' was cancelled.', '#/rider');
            $msg = 'Delivery cancelled. Escrow refunded to the wallet.';
            break;
        case 'accept':
            if (!in_array('rider', $roles, true)) $bad('Only approved riders can accept deliveries.');
            if ($st !== 'REQUESTED' || $d['rider_id'] !== null) $bad('Another rider has already taken this delivery.');
            if ($cust === $uid) $bad("You can't deliver your own package.");
            $p = am_profile($uid);
            if (!$p['online']) $bad('Go online to accept deliveries.');
            if (row("SELECT 1 FROM aimove_deliveries WHERE rider_id = ? AND status IN ('ASSIGNED','PICKED_UP','IN_TRANSIT')", [$uid])) $bad('Finish your active delivery first.');
            q('UPDATE aimove_deliveries SET rider_id = ? WHERE id = ?', [$uid, $id]);
            $set('ASSIGNED');
            am_note($cust, 'Rider assigned', $u['full_name'] . ' is heading to your pickup · ' . $ref, '#/track/' . $id);
            $msg = 'Order accepted. Head to the pickup.';
            break;
        case 'pickup':
        case 'transit':
            if (!$isRider) $bad('Only the assigned rider can update this delivery.');
            [$from, $to, $title] = $action === 'pickup' ? ['ASSIGNED', 'PICKED_UP', 'Package picked up'] : ['PICKED_UP', 'IN_TRANSIT', 'Package in transit'];
            if ($st !== $from) $bad('This delivery has moved on. Reload to see its latest status.');
            $set($to);
            am_note($cust, $title, $d['items'] . ' · ' . $ref, '#/track/' . $id);
            break;
        case 'deliver':
            if (!$isRider) $bad('Only the assigned rider can complete this delivery.');
            if ($st !== 'IN_TRANSIT') $bad('Start the trip before completing the delivery.');
            if ((int) $d['pin_tries'] >= 5) $bad('Too many wrong PINs. Contact AiMove support to complete this delivery.');
            $pin = preg_replace('/\D/', '', str_in('pin', 8)) ?? '';
            if (!hash_equals($d['pin'], $pin)) {
                q('UPDATE aimove_deliveries SET pin_tries = pin_tries + 1 WHERE id = ?', [$id]);
                $pdo->commit();
                $left = 4 - (int) $d['pin_tries'];
                fail(422, 'bad_pin', "That PIN doesn't match. Ask the recipient again ($left tries left).");
            }
            $set('DELIVERED');
            q("UPDATE aimove_deliveries SET escrow = 'RELEASED' WHERE id = ? AND escrow = 'HELD'", [$id]);
            q("INSERT INTO aimove_ledger (user_id, account, kind, amount, title, ref) VALUES (?, 'earnings', 'earning', ?, 'Delivery earnings', ?)", [$uid, (int) $d['rider_share'], $ref]);
            am_note($cust, 'Package delivered', $d['items'] . ' · ' . $ref . '. Payment released to your rider.', '#/track/' . $id);
            $msg = 'Delivered. NGN ' . number_format((int) $d['rider_share']) . ' released from escrow to your earnings.';
            break;
        case 'assign':
            if (!$ops) $bad('Only AiMove operations can assign riders.');
            if (!in_array($st, ['SCHEDULED', 'REQUESTED', 'ASSIGNED'], true)) $bad('This delivery can no longer be reassigned.');
            $rid = int_in('rider_id');
            if ($rid) {
                if (!row("SELECT 1 FROM memberships WHERE user_id = ? AND product = 'aimove' AND role = 'rider' AND status = 'approved'", [$rid])) $bad('Choose an approved rider.');
                if ($rid === $cust) $bad("A rider can't deliver their own package.");
                q('UPDATE aimove_deliveries SET rider_id = ? WHERE id = ?', [$rid, $id]);
                if ($st !== 'ASSIGNED') $set('ASSIGNED');
                am_note($rid, 'New delivery assigned to you', $d['items'] . ' · ' . $ref, '#/rider');
                am_note($cust, 'Rider assigned', 'A rider is heading to your pickup · ' . $ref, '#/track/' . $id);
            } else {
                q('UPDATE aimove_deliveries SET rider_id = NULL WHERE id = ?', [$id]);
                if ($st === 'ASSIGNED') $set('REQUESTED');
            }
            $msg = 'Rider assignment updated.';
            break;
        case 'release':
            if (!$ops) $bad('Only AiMove operations can do that.');
            if ($st !== 'SCHEDULED') $bad('Only scheduled deliveries can be released early.');
            $set('REQUESTED');
            $msg = 'Released to riders.';
            break;
        case 'rate':
            if (!$isCustomer) $bad('Only the customer can rate this delivery.');
            if ($st !== 'DELIVERED' || $d['rating']) $bad('This delivery has already been rated.');
            $stars = max(1, min(5, int_in('stars')));
            $tags = array_slice(array_filter(array_map(fn ($t) => is_string($t) ? mb_substr(trim($t), 0, 40) : '', (array) (input()['tags'] ?? []))), 0, 5);
            q('UPDATE aimove_deliveries SET rating = ?, rating_tags = ?, rating_note = ? WHERE id = ?', [$stars, implode('|', $tags) ?: null, str_in('note', 500) ?: null, $id]);
            if ($d['rider_id']) am_note((int) $d['rider_id'], 'New rating', "You were rated $stars/5 for $ref.", '#/rider/earnings');
            $msg = 'Rating submitted. Thank you!';
            break;
        default:
            $bad('Unknown action.');
    }
    $pdo->commit();
    $d = row('SELECT * FROM aimove_deliveries WHERE id = ?', [$id]);
    ok(['message' => $msg, 'package' => am_out($d, $uid, $ops)]);
}

function r_am_track(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $d = row('SELECT * FROM aimove_deliveries WHERE id = ?', [(int) ($_GET['id'] ?? 0)]);
    $ops = in_array('admin', am_roles($uid), true);
    if (!$d || ((int) $d['customer_id'] !== $uid && (int) ($d['rider_id'] ?? 0) !== $uid && !$ops)) {
        fail(404, 'not_found', 'Delivery not found.');
    }
    ok(['package' => am_out($d, $uid, $ops)]);
}

// ------------------------------------------------------------------ wallet, earnings, operations
function r_am_topup(): never
{
    $u = am_require('customer');
    $uid = (int) $u['id'];
    rate_limit('am-topup:' . $uid, 20, 3600);
    $amt = int_in('amount');
    $sender = str_in('sender', 120);
    $bank = str_in('bank', 80);
    $e = [];
    if ($amt < 100 || $amt > 5000000) $e['amt'] = 'Enter between NGN 100 and NGN 5,000,000.';
    if (mb_strlen($sender) < 2) $e['sender'] = 'Enter the name on the account you paid from.';
    if (mb_strlen($bank) < 2) $e['bank'] = 'Choose the bank you paid from.';
    if ($e) fail(422, 'invalid', 'Please check the highlighted fields.', $e);
    if ((int) row("SELECT COUNT(*) n FROM aimove_ledger WHERE user_id = ? AND kind = 'topup' AND status = 'pending'", [$uid])['n'] >= 5) {
        fail(429, 'too_many', 'You already have top-ups waiting to be confirmed. Please wait for them first.');
    }
    q("INSERT INTO aimove_ledger (user_id, account, kind, amount, status, title, ref, meta) VALUES (?, 'wallet', 'topup', ?, 'pending', 'Top up (bank transfer)', ?, ?)",
        [$uid, $amt, "$sender · $bank", json_encode(['sender' => $sender, 'bank' => $bank])]);
    am_note($uid, 'Top-up received', 'NGN ' . number_format($amt) . ' will be added once we confirm your transfer.', '#/wallet');
    $to = (string) (config()['admin_notify_email'] ?? '');
    if ($to !== '' && valid_email($to)) {
        send_mail($to, 'AiMove top-up to confirm', "{$u['full_name']} ({$u['email']}) says they transferred NGN " . number_format($amt) .
            " to " . AM_COLLECT['bank_name'] . ' ' . AM_COLLECT['account_number'] . ".\nFrom: $sender ($bank)\n\nConfirm it in AiMove → Operations: " . site_url('products/aimove.html#/ops'));
    }
    ok(['message' => 'Thanks. Your wallet is topped up once we confirm the transfer.']);
}

function r_am_payout(): never
{
    $u = am_require('rider');
    $uid = (int) $u['id'];
    rate_limit('am-payout:' . $uid, 10, 3600);
    $amt = int_in('amount');
    $pdo = db();
    $pdo->beginTransaction();
    $p = am_profile($uid, true);
    if (!$p['bank_acct']) {
        $pdo->rollBack();
        fail(409, 'no_bank', 'Add your payout bank account first.');
    }
    $bal = am_balance($uid, 'earnings');
    if ($amt < 100 || $amt > $bal) {
        $pdo->rollBack();
        fail(422, 'invalid', 'Enter an amount between NGN 100 and NGN ' . number_format($bal) . '.', ['amt' => 'Enter a smaller amount.']);
    }
    $to = "{$p['bank_name']} •••• " . substr((string) $p['bank_acct'], -4);
    q("INSERT INTO aimove_ledger (user_id, account, kind, amount, status, title, ref, meta) VALUES (?, 'earnings', 'payout', ?, 'pending', 'Withdrawal', ?, ?)",
        [$uid, -$amt, $to, json_encode(['bank' => $p['bank_name'], 'acct' => $p['bank_acct'], 'name' => $p['bank_holder']])]);
    $pdo->commit();
    $mail = (string) (config()['admin_notify_email'] ?? '');
    if ($mail !== '' && valid_email($mail)) {
        send_mail($mail, 'AiMove rider payout to send', "{$u['full_name']} asked to withdraw NGN " . number_format($amt) . " to {$p['bank_name']} {$p['bank_acct']} ({$p['bank_holder']}).\n\nPay it, then mark it paid in AiMove → Operations: " . site_url('products/aimove.html#/ops'));
    }
    ok(['message' => 'NGN ' . number_format($amt) . ' requested. It is paid to your bank once operations sends it.']);
}

function r_am_review(): never
{
    $admin = am_require('admin');
    $aid = (int) $admin['id'];
    $tid = (int) preg_replace('/\D/', '', str_in('id', 20));
    $decision = str_in('decision', 10);
    $pdo = db();
    $pdo->beginTransaction();
    $t = $tid ? row("SELECT * FROM aimove_ledger WHERE id = ? AND status = 'pending' FOR UPDATE", [$tid]) : null;
    if (!$t) {
        $pdo->rollBack();
        fail(404, 'not_found', 'Nothing waiting with that reference.');
    }
    if ((int) $t['user_id'] === $aid) {
        $pdo->rollBack();
        fail(403, 'forbidden', 'Another administrator must confirm your own money.');
    }
    if (!in_array($decision, ['confirm', 'reject'], true)) {
        $pdo->rollBack();
        fail(422, 'invalid', 'Choose confirm or reject.');
    }
    q('UPDATE aimove_ledger SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?', [$decision === 'confirm' ? 'done' : 'rejected', $aid, now_utc(), $tid]);
    $pdo->commit();
    $amt = 'NGN ' . number_format(abs((int) $t['amount']));
    $who = (int) $t['user_id'];
    if ($t['kind'] === 'topup') {
        $decision === 'confirm' ? am_note($who, 'Top-up successful', "$amt was added to your wallet.", '#/wallet')
            : am_note($who, 'Top-up not received', "We couldn't find your $amt transfer. Contact AiMove support with your receipt.", '#/wallet');
    } else {
        $decision === 'confirm' ? am_note($who, 'Payout sent', "$amt was paid to your bank.", '#/rider/earnings')
            : am_note($who, 'Payout not sent', "Your $amt withdrawal was returned to your earnings. Contact AiMove support.", '#/rider/earnings');
    }
    audit($aid, 'aimove_' . $t['kind'] . '_' . $decision, $who, ['amount' => (int) $t['amount']]);
    ok(['message' => 'Saved.']);
}

// ------------------------------------------------------------------ profile, presence, location
function r_am_profile(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    if (!am_roles($uid)) {
        fail(403, 'forbidden', 'Your account does not have AiMove access.');
    }
    $in = input();
    $p = am_profile($uid);
    $sets = [];
    $vals = [];
    foreach (['business' => 120, 'rc' => 30, 'address' => 200, 'vehicle' => 40, 'plate' => 20, 'licence' => 30] as $k => $max) {
        if (array_key_exists($k, $in)) {
            $sets[] = "$k = ?";
            $vals[] = str_in($k, $max) ?: null;
        }
    }
    if (array_key_exists('bank_acct', $in)) {
        $acct = preg_replace('/\D/', '', str_in('bank_acct', 20)) ?? '';
        if (!preg_match('/^\d{10}$/', $acct)) fail(422, 'invalid', 'Account numbers have 10 digits.', ['acct' => 'Account numbers have 10 digits.']);
        if (mb_strlen(str_in('bank_holder', 120)) < 2) fail(422, 'invalid', "Enter the account holder's name.", ['name' => "Enter the account holder's name."]);
        array_push($sets, 'bank_name = ?', 'bank_acct = ?', 'bank_holder = ?');
        array_push($vals, str_in('bank_name', 80), $acct, str_in('bank_holder', 120));
    }
    if (isset($in['prefs']) && is_array($in['prefs'])) {
        $prefs = am_prefs($p);
        foreach ($in['prefs'] as $k => $v) {
            if (array_key_exists($k, AM_PREFS)) $prefs[$k] = (bool) $v;
        }
        $sets[] = 'prefs = ?';
        $vals[] = json_encode($prefs);
    }
    if ($sets) {
        $vals[] = $uid;
        q('UPDATE aimove_profiles SET ' . implode(', ', $sets) . ' WHERE user_id = ?', $vals);
    }
    ok(['message' => 'Saved.']);
}

function r_am_online(): never
{
    $u = am_require('rider');
    $on = !empty(input()['online']);
    am_profile((int) $u['id']);
    q('UPDATE aimove_profiles SET online = ?, last_seen = ?' . ($on ? '' : ', lat = NULL, lng = NULL, loc_at = NULL') . ' WHERE user_id = ?', [$on ? 1 : 0, now_utc(), (int) $u['id']]);
    ok(['online' => $on]);
}

/** The rider's phone shares its location while they are online, so customers can follow the delivery. */
function r_am_location(): never
{
    $u = am_require('rider');
    rate_limit('am-loc:' . $u['id'], 400, 3600);
    $lat = input()['lat'] ?? null;
    $lng = input()['lng'] ?? null;
    if (!is_numeric($lat) || !is_numeric($lng) || abs((float) $lat) > 90 || abs((float) $lng) > 180) {
        fail(422, 'invalid', 'Bad location.');
    }
    $p = am_profile((int) $u['id']);
    if (!$p['online']) {
        ok(['saved' => false]);
    }
    q('UPDATE aimove_profiles SET lat = ?, lng = ?, loc_at = ?, last_seen = ? WHERE user_id = ?', [round((float) $lat, 6), round((float) $lng, 6), now_utc(), now_utc(), (int) $u['id']]);
    ok(['saved' => true]);
}

// ------------------------------------------------------------------ messages and notifications
function am_thread_delivery(int $uid, int $id): array
{
    $d = row('SELECT * FROM aimove_deliveries WHERE id = ?', [$id]);
    $ops = in_array('admin', am_roles($uid), true);
    if (!$d || ($d['rider_id'] === null && !$ops) || ((int) $d['customer_id'] !== $uid && (int) ($d['rider_id'] ?? 0) !== $uid && !$ops)) {
        fail(404, 'not_found', 'Conversation not found.');
    }
    return $d;
}

function r_am_messages(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    if (isset($_GET['id'])) {
        $d = am_thread_delivery($uid, (int) $_GET['id']);
        $rows = q('SELECT sender_id, text, created_at FROM aimove_messages WHERE delivery_id = ? ORDER BY id LIMIT 500', [(int) $d['id']])->fetchAll();
        ok(['items' => array_map(fn ($m) => [(int) $m['sender_id'] === $uid ? 'out' : 'in', $m['text'], strtotime($m['created_at'] . ' UTC') * 1000], $rows)]);
    }
    // Thread list: deliveries with a rider where this person is the customer or the rider.
    $rows = q("SELECT d.id, d.tracking, d.items, d.customer_id, d.rider_id, cu.full_name cname, ri.full_name rname,
                      (SELECT text FROM aimove_messages m WHERE m.delivery_id = d.id ORDER BY m.id DESC LIMIT 1) last,
                      (SELECT created_at FROM aimove_messages m WHERE m.delivery_id = d.id ORDER BY m.id DESC LIMIT 1) last_at
               FROM aimove_deliveries d JOIN users cu ON cu.id = d.customer_id LEFT JOIN users ri ON ri.id = d.rider_id
               WHERE d.rider_id IS NOT NULL AND (d.customer_id = ? OR d.rider_id = ?) ORDER BY COALESCE(last_at, d.updated_at) DESC LIMIT 50", [$uid, $uid])->fetchAll();
    ok(['items' => array_map(fn ($r) => ['id' => (string) $r['id'], 'tracking' => $r['tracking'], 'items' => $r['items'],
        'name' => (int) $r['customer_id'] === $uid ? $r['rname'] : $r['cname'], 'with' => (int) $r['customer_id'] === $uid ? 'rider' : 'customer',
        'last' => $r['last'], 'at' => $r['last_at'] ? strtotime($r['last_at'] . ' UTC') * 1000 : null], $rows)]);
}

function r_am_send(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    rate_limit('am-msg:' . $uid, 240, 3600);
    $d = am_thread_delivery($uid, int_in('id'));
    $text = str_in('text', 1000);
    if ($text === '') {
        fail(422, 'invalid', 'Write a message.');
    }
    q('INSERT INTO aimove_messages (delivery_id, sender_id, text) VALUES (?, ?, ?)', [(int) $d['id'], $uid, $text]);
    $to = (int) $d['customer_id'] === $uid ? (int) ($d['rider_id'] ?? 0) : (int) $d['customer_id'];
    if ($to && $to !== $uid) {
        $p = am_prefs(am_profile($to));
        if ($p['messages']) {
            am_note($to, 'New message from ' . $u['full_name'], mb_substr($text, 0, 140), '#/chat/' . $d['id']);
        }
    }
    ok();
}

function r_am_notes(): never
{
    $u = require_user();
    q('UPDATE aimove_notes SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now_utc(), (int) $u['id']]);
    ok();
}
