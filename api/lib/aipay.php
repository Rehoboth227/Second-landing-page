<?php
/*
 * AiPay store: stores, products, orders, payments by bank transfer, notifications and images.
 * Included by api/index.php. Uses the shared Rehohub accounts: a merchant is a user with an AiPay
 * "merchant" membership, a buyer is a user with an AiPay "customer" membership.
 *
 * Money: AiPay does not hold money yet. Buyers pay the store by bank transfer to the account
 * the merchant gave, say they've sent it, and the merchant confirms it arrived. Merchants pay the
 * one-off account review fee to Rehohub the same way, and an AiPay administrator confirms it.
 * Card payments need a payment provider and are not offered yet.
 */
declare(strict_types=1);

const AIPAY_FEE = 10000; // naira, one-off account review fee for merchants
const AIPAY_FEE_ACCOUNT = ['account_name' => 'Rehohub Ltd', 'bank_name' => 'Moniepoint', 'account_number' => '810512715'];
const AIPAY_CATEGORIES = [
    'Foods & Drinks', 'Fashion', 'Electronics', 'Phones & Gadgets', 'Make-up & Beauty',
    'Home & Kitchen', 'Groceries', 'Books & Stationery', 'Health', 'Others',
];
const AIPAY_STATES = [
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
    'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
    'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
    'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];
// Delivery by AiPay: same city, same state, another state (naira). Pick-up is free.
const AIPAY_DELIVERY_FEES = ['city' => 1500, 'state' => 2500, 'country' => 5000];
const AIPAY_SETTINGS = [
    'orderNew' => true, 'orderPaid' => true, 'orderStatus' => true, 'productLow' => true,
    'productSold' => true, 'salesEmail' => false, 'dashWeekly' => false, 'screen' => true, 'email' => true,
];
const AIPAY_ORDER_STATUSES = ['awaiting_payment', 'payment_sent', 'processing', 'ready', 'shipped', 'delivered', 'cancelled'];

// ------------------------------------------------------------------ helpers
function aipay_membership(int $uid, string $role): ?array
{
    return row("SELECT id, status, details FROM memberships WHERE user_id = ? AND product = 'aipay' AND role = ?", [$uid, $role]);
}

function aipay_is_admin(int $uid): bool
{
    return in_array('aipay', admin_products($uid), true);
}

function aipay_store(int $uid): ?array
{
    return row('SELECT * FROM aipay_stores WHERE user_id = ?', [$uid]);
}

function aipay_is_live(int $uid): bool
{
    $m = aipay_membership($uid, 'merchant');
    $s = aipay_store($uid);
    return $m && $m['status'] === 'approved' && $s && $s['fee_status'] === 'confirmed';
}

/** A signed-in merchant (approved or still under review). Suspended or rejected merchants can't manage a store. */
function aipay_require_merchant(): array
{
    $u = require_user();
    $m = aipay_membership((int) $u['id'], 'merchant');
    if (!$m || !in_array($m['status'], ['pending', 'approved'], true)) {
        fail(403, 'forbidden', 'This is for AiPay merchants. Apply to sell on AiPay from My account.');
    }
    return $u;
}

/** A signed-in buyer. Shopper access is approved automatically, so it is added on first use. */
function aipay_require_buyer(): array
{
    $u = require_user();
    $uid = (int) $u['id'];
    $m = aipay_membership($uid, 'customer');
    if (!$m) {
        q("INSERT INTO memberships (user_id, product, role, status) VALUES (?, 'aipay', 'customer', 'approved')", [$uid]);
        audit($uid, 'apply', $uid, ['product' => 'aipay', 'role' => 'customer', 'auto' => true]);
    } elseif ($m['status'] !== 'approved') {
        fail(403, 'forbidden', 'Your AiPay shopper access is suspended. Contact info@rehohub.com.');
    }
    return $u;
}

function aipay_note(int $uid, string $text, string $kind = 'info'): void
{
    $prefs = aipay_prefs($uid);
    if (empty($prefs['settings']['screen'])) {
        return;
    }
    q('INSERT INTO aipay_notes (user_id, text, kind) VALUES (?, ?, ?)', [$uid, mb_substr($text, 0, 300), $kind]);
}

function aipay_prefs(int $uid): array
{
    $r = row('SELECT settings, address FROM aipay_prefs WHERE user_id = ?', [$uid]);
    $settings = AIPAY_SETTINGS;
    foreach (($r && $r['settings'] ? (json_decode($r['settings'], true) ?: []) : []) as $k => $v) {
        if (array_key_exists($k, AIPAY_SETTINGS)) {
            $settings[$k] = (bool) $v;
        }
    }
    return ['settings' => $settings, 'address' => $r && $r['address'] ? (json_decode($r['address'], true) ?: null) : null];
}

function aipay_mail(int $uid, string $subject, string $body): void
{
    $prefs = aipay_prefs($uid);
    if (empty($prefs['settings']['email'])) {
        return;
    }
    $u = row('SELECT email, full_name FROM users WHERE id = ?', [$uid]);
    if ($u) {
        send_mail($u['email'], $subject, "Hello {$u['full_name']},\n\n$body\n\nOpen AiPay: " . site_url('products/aipay.html'));
    }
}

function naira(int $n): string
{
    return 'NGN ' . number_format($n);
}

/** Reads a field from an object inside the JSON body (e.g. address.city), cleaned like str_in. */
function sub_in(array $src, string $key, int $max): string
{
    $v = $src[$key] ?? '';
    if (!is_string($v) && !is_int($v)) {
        return '';
    }
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', trim((string) $v)) ?? '';
    return mb_substr($v, 0, $max);
}

function int_in(string $key): int
{
    $v = input()[$key] ?? 0;
    return is_int($v) || (is_string($v) && ctype_digit($v)) ? (int) $v : 0;
}

function aipay_store_public(array $s): array
{
    return [
        'business_name' => $s['business_name'], 'category' => $s['category'], 'city' => $s['city'], 'state' => $s['state'],
        'about' => $s['about'], 'logo_id' => $s['logo_id'] ? (int) $s['logo_id'] : null,
    ];
}

function aipay_order_out(array $o, bool $withBank = false): array
{
    $items = q('SELECT product_id, name, price, qty, image_id FROM aipay_order_items WHERE order_id = ?', [(int) $o['id']])->fetchAll();
    $out = [
        'code' => $o['code'], 'status' => $o['status'], 'delivery' => $o['delivery'],
        'address' => $o['address'] ? (json_decode($o['address'], true) ?: null) : null,
        'subtotal' => (int) $o['subtotal'], 'delivery_fee' => (int) $o['delivery_fee'], 'total' => (int) $o['total'],
        'pay_sender' => $o['pay_sender'], 'pay_bank' => $o['pay_bank'], 'paid_at' => $o['paid_at'],
        'cancel_note' => $o['cancel_note'], 'created_at' => $o['created_at'], 'updated_at' => $o['updated_at'],
        'items' => array_map(fn ($i) => [
            'product_id' => $i['product_id'] ? (int) $i['product_id'] : null, 'name' => $i['name'],
            'price' => (int) $i['price'], 'qty' => (int) $i['qty'], 'image_id' => $i['image_id'] ? (int) $i['image_id'] : null,
        ], $items),
    ];
    if (isset($o['buyer_name'])) {
        $out['buyer_name'] = $o['buyer_name'];
        $out['buyer_phone'] = $o['buyer_phone'] ?? null;
    }
    if (isset($o['store_name'])) {
        $out['store_name'] = $o['store_name'];
    }
    if ($withBank) {
        $s = aipay_store((int) $o['merchant_id']);
        $out['pay_to'] = $s ? ['account_name' => $s['account_name'], 'bank_name' => $s['bank_name'], 'account_number' => $s['account_number']] : null;
    }
    return $out;
}

function aipay_points(int $total, int $per): int
{
    return intdiv($total, $per);
}

/** Monthly totals of paid orders for one merchant or buyer, for the dashboard chart and points. */
function aipay_monthly(string $col, int $uid, int $year): array
{
    $rows = q("SELECT MONTH(paid_at) m, SUM(total) t FROM aipay_orders
               WHERE $col = ? AND paid_at IS NOT NULL AND status <> 'cancelled' AND YEAR(paid_at) = ? GROUP BY MONTH(paid_at)", [$uid, $year])->fetchAll();
    $out = array_fill(0, 12, 0);
    foreach ($rows as $r) {
        $out[(int) $r['m'] - 1] = (int) $r['t'];
    }
    return $out;
}

function aipay_points_summary(string $col, int $uid, int $per): array
{
    $total = (int) (row("SELECT COALESCE(SUM(total), 0) t FROM aipay_orders WHERE $col = ? AND paid_at IS NOT NULL AND status <> 'cancelled'", [$uid])['t']);
    $month = fn (string $from, string $to) => (int) (row(
        "SELECT COALESCE(SUM(total), 0) t FROM aipay_orders WHERE $col = ? AND paid_at IS NOT NULL AND status <> 'cancelled' AND paid_at >= ? AND paid_at < ?",
        [$uid, $from, $to]
    )['t']);
    $thisStart = gmdate('Y-m-01 00:00:00');
    $lastStart = gmdate('Y-m-01 00:00:00', strtotime('first day of last month'));
    $nextStart = gmdate('Y-m-01 00:00:00', strtotime('first day of next month'));
    $now = aipay_points($month($thisStart, $nextStart), $per);
    $last = aipay_points($month($lastStart, $thisStart), $per);
    return ['points' => aipay_points($total, $per), 'delta' => $last ? (int) round(($now - $last) / $last * 100) : ($now ? 100 : 0), 'spent' => $total];
}

// ------------------------------------------------------------------ images
/** Upload one image (JPEG, PNG or WebP, max 1.5 MB). The page shrinks photos before sending. */
function r_aipay_image_upload(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $m = aipay_membership($uid, 'merchant');
    if (!$m || !in_array($m['status'], ['pending', 'approved'], true)) {
        fail(403, 'forbidden', 'Only AiPay merchants can upload pictures.');
    }
    rate_limit('aipay-image:' . $uid, 60, 3600);
    $raw = file_get_contents('php://input', false, null, 0, 2200000) ?: '';
    $body = json_decode($raw, true);
    $data = is_array($body) ? (string) ($body['data'] ?? '') : '';
    if (!preg_match('#^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#', $data, $mm)) {
        fail(422, 'invalid', 'Choose a JPG, PNG or WebP picture.');
    }
    $bin = base64_decode($mm[2], true);
    if ($bin === false || strlen($bin) > 1500000) {
        fail(422, 'invalid', 'That picture is too large. Use one under 1.5 MB.');
    }
    $info = @getimagesizefromstring($bin);
    $allowed = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_WEBP => 'image/webp'];
    if (!$info || !isset($allowed[$info[2]]) || $info[0] < 1 || $info[1] < 1 || $info[0] > 5000 || $info[1] > 5000) {
        fail(422, 'invalid', 'That file is not a picture we can use. Choose a JPG, PNG or WebP picture.');
    }
    if ((int) row('SELECT COUNT(*) n FROM aipay_images WHERE owner_id = ?', [$uid])['n'] >= 500) {
        fail(422, 'invalid', 'You have uploaded the maximum number of pictures. Remove some products first.');
    }
    q('INSERT INTO aipay_images (owner_id, mime, data) VALUES (?, ?, ?)', [$uid, $allowed[$info[2]], $bin]);
    ok(['id' => (int) db()->lastInsertId()]);
}

/** Pictures of products and store logos are public, like the store itself. */
function r_aipay_image(): never
{
    $id = (int) ($_GET['id'] ?? 0);
    $r = $id > 0 ? row('SELECT mime, data FROM aipay_images WHERE id = ?', [$id]) : null;
    if (!$r || !in_array($r['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) {
        fail(404, 'not_found', 'Not found.');
    }
    header('Content-Type: ' . $r['mime']);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Disposition: inline');
    header('Content-Length: ' . strlen($r['data']));
    echo $r['data'];
    exit;
}

// ------------------------------------------------------------------ me
function r_aipay_me(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $prefs = aipay_prefs($uid);
    $out = [
        'settings' => $prefs['settings'], 'address' => $prefs['address'],
        'unread' => (int) row('SELECT COUNT(*) n FROM aipay_notes WHERE user_id = ? AND read_at IS NULL', [$uid])['n'],
        'categories' => AIPAY_CATEGORIES, 'states' => AIPAY_STATES, 'delivery_fees' => AIPAY_DELIVERY_FEES,
        'fee' => ['amount' => AIPAY_FEE] + AIPAY_FEE_ACCOUNT,
        'buyer' => aipay_points_summary('buyer_id', $uid, 100),
        'store' => null,
    ];
    $m = aipay_membership($uid, 'merchant');
    if ($m) {
        $s = aipay_store($uid);
        $out['merchant'] = ['status' => $m['status'], 'details' => $m['details'] ? (json_decode($m['details'], true) ?: []) : []];
        if ($s) {
            unset($s['fee_reviewed_by']);
            $s['live'] = $m['status'] === 'approved' && $s['fee_status'] === 'confirmed';
            $s['views'] = (int) $s['views'];
            $s['logo_id'] = $s['logo_id'] ? (int) $s['logo_id'] : null;
            $out['store'] = $s;
            $out['seller'] = aipay_points_summary('merchant_id', $uid, 1000);
        }
    }
    ok($out);
}

function r_aipay_prefs(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $in = input();
    $cur = aipay_prefs($uid);
    $settings = $cur['settings'];
    if (isset($in['settings']) && is_array($in['settings'])) {
        foreach ($in['settings'] as $k => $v) {
            if (array_key_exists($k, AIPAY_SETTINGS)) {
                $settings[$k] = (bool) $v;
            }
        }
    }
    $address = $cur['address'];
    if (isset($in['address']) && is_array($in['address'])) {
        $address = aipay_clean_address($in['address']);
    }
    q('INSERT INTO aipay_prefs (user_id, settings, address) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE settings = VALUES(settings), address = VALUES(address)', [
        $uid, json_encode($settings), $address ? json_encode($address) : null,
    ]);
    ok(['settings' => $settings, 'address' => $address]);
}

function aipay_clean_address(array $a): array
{
    $out = [
        'street' => sub_in($a, 'street', 200), 'city' => sub_in($a, 'city', 80),
        'state' => sub_in($a, 'state', 40), 'phone' => sub_in($a, 'phone', 30),
    ];
    $errors = [];
    if (mb_strlen($out['street']) < 5) {
        $errors['street'] = 'Enter the street address.';
    }
    if (mb_strlen($out['city']) < 2) {
        $errors['city'] = 'Enter the city or town.';
    }
    if (!in_array($out['state'], AIPAY_STATES, true)) {
        $errors['state'] = 'Choose the state.';
    }
    if (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $out['phone'])) {
        $errors['phone'] = 'Enter a phone number the rider can call.';
    }
    if ($errors) {
        fail(422, 'invalid', 'Please check the delivery address.', $errors);
    }
    return $out;
}

// ------------------------------------------------------------------ notifications
function r_aipay_notes(): never
{
    $u = require_user();
    $rows = q('SELECT id, text, kind, read_at, created_at FROM aipay_notes WHERE user_id = ? ORDER BY id DESC LIMIT 100', [(int) $u['id']])->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
    }
    ok(['items' => $rows]);
}

function r_aipay_notes_update(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $action = str_in('action', 10);
    $id = int_in('id');
    if ($action === 'read') {
        $id ? q('UPDATE aipay_notes SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', [now_utc(), $id, $uid])
            : q('UPDATE aipay_notes SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now_utc(), $uid]);
    } elseif ($action === 'delete') {
        $id ? q('DELETE FROM aipay_notes WHERE id = ? AND user_id = ?', [$id, $uid]) : q('DELETE FROM aipay_notes WHERE user_id = ?', [$uid]);
    } else {
        fail(422, 'invalid', 'Unknown action.');
    }
    ok();
}

// ------------------------------------------------------------------ store (public)
function aipay_live_sql(): string
{
    return "JOIN aipay_stores s ON s.user_id = p.merchant_id AND s.fee_status = 'confirmed'
            JOIN memberships mm ON mm.user_id = p.merchant_id AND mm.product = 'aipay' AND mm.role = 'merchant' AND mm.status = 'approved'
            JOIN users su ON su.id = p.merchant_id AND su.status IN ('active', 'warning')";
}

function aipay_product_out(array $p): array
{
    return [
        'id' => (int) $p['id'], 'name' => $p['name'], 'category' => $p['category'], 'price' => (int) $p['price'],
        'stock' => (int) $p['stock'], 'description' => $p['description'], 'image_id' => $p['image_id'] ? (int) $p['image_id'] : null,
        'merchant_id' => (int) $p['merchant_id'], 'store' => $p['business_name'] ?? null,
        'city' => $p['city'] ?? null, 'state' => $p['state'] ?? null,
    ];
}

function r_aipay_products(): never
{
    $where = 'p.active = 1';
    $params = [];
    $cat = (string) ($_GET['category'] ?? '');
    if (in_array($cat, AIPAY_CATEGORIES, true)) {
        $where .= ' AND p.category = ?';
        $params[] = $cat;
    }
    $search = trim(mb_substr((string) ($_GET['q'] ?? ''), 0, 60));
    if ($search !== '') {
        $like = '%' . addcslashes($search, '%_\\') . '%';
        $where .= ' AND (p.name LIKE ? OR s.business_name LIKE ? OR p.category LIKE ?)';
        array_push($params, $like, $like, $like);
    }
    $store = (int) ($_GET['store'] ?? 0);
    if ($store > 0) {
        $where .= ' AND p.merchant_id = ?';
        $params[] = $store;
    }
    $city = trim(mb_substr((string) ($_GET['city'] ?? ''), 0, 80));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $rows = q("SELECT p.*, s.business_name, s.city, s.state FROM aipay_products p " . aipay_live_sql() . "
               WHERE $where ORDER BY (s.city = ?) DESC, (p.stock > 0) DESC, p.created_at DESC LIMIT 61 OFFSET " . (($page - 1) * 60),
        array_merge($params, [$city]))->fetchAll();
    $more = count($rows) > 60;
    ok(['items' => array_map('aipay_product_out', array_slice($rows, 0, 60)), 'more' => $more, 'categories' => AIPAY_CATEGORIES]);
}

function r_aipay_product(): never
{
    $id = (int) ($_GET['id'] ?? 0);
    $p = $id > 0 ? row("SELECT p.*, s.business_name, s.city, s.state FROM aipay_products p " . aipay_live_sql() . " WHERE p.id = ? AND p.active = 1", [$id]) : null;
    if (!$p) {
        fail(404, 'not_found', 'This product is no longer available.');
    }
    $seen = $_SESSION['aipay_seen'] ?? [];
    if (!in_array((int) $p['merchant_id'], $seen, true) && count($seen) < 500) {
        $seen[] = (int) $p['merchant_id'];
        $_SESSION['aipay_seen'] = $seen;
        q('UPDATE aipay_stores SET views = views + 1 WHERE user_id = ?', [(int) $p['merchant_id']]);
    }
    ok(['product' => aipay_product_out($p)]);
}

// ------------------------------------------------------------------ merchant: store profile and review fee
function r_aipay_store_save(): never
{
    $u = aipay_require_merchant();
    $uid = (int) $u['id'];
    $in = input();
    $f = [
        'business_name' => str_in('business_name', 120), 'category' => str_in('category', 60), 'email' => norm_email(str_in('email', 190)),
        'phone' => str_in('phone', 30), 'street' => str_in('street', 200), 'city' => str_in('city', 80), 'state' => str_in('state', 40),
        'about' => str_in('about', 600), 'bank_name' => str_in('bank_name', 80), 'account_name' => str_in('account_name', 120),
        'account_number' => preg_replace('/\D/', '', str_in('account_number', 20)) ?? '',
        'reg_number' => str_in('reg_number', 30), 'social' => str_in('social', 120),
    ];
    $e = [];
    if (mb_strlen($f['business_name']) < 2) $e['business_name'] = 'Enter your business name.';
    if (!in_array($f['category'], AIPAY_CATEGORIES, true)) $e['category'] = 'Choose what you sell.';
    if (!valid_email($f['email'])) $e['email'] = 'Enter a valid business email.';
    if (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $f['phone'])) $e['phone'] = 'Enter a valid phone number.';
    if (mb_strlen($f['street']) < 5) $e['street'] = 'Enter the street address.';
    if (mb_strlen($f['city']) < 2) $e['city'] = 'Enter the city or town.';
    if (!in_array($f['state'], AIPAY_STATES, true)) $e['state'] = 'Choose the state.';
    if (mb_strlen($f['bank_name']) < 2) $e['bank_name'] = 'Choose your bank.';
    if (mb_strlen($f['account_name']) < 2) $e['account_name'] = 'Enter the account name.';
    if (!preg_match('/^\d{10}$/', $f['account_number'])) $e['account_number'] = 'Account numbers have 10 digits.';
    $logo = isset($in['logo_id']) ? (int) $in['logo_id'] : 0;
    if ($logo && !row('SELECT 1 FROM aipay_images WHERE id = ? AND owner_id = ?', [$logo, $uid])) $e['logo_id'] = 'Upload the logo again.';
    if ($e) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $e);
    }
    $cols = array_keys($f);
    $vals = array_values($f);
    $cols[] = 'logo_id';
    $vals[] = $logo ?: null;
    $set = implode(', ', array_map(fn ($c) => "$c = VALUES($c)", $cols));
    q('INSERT INTO aipay_stores (user_id, ' . implode(', ', $cols) . ') VALUES (?' . str_repeat(', ?', count($cols)) . ") ON DUPLICATE KEY UPDATE $set",
        array_merge([$uid], $vals));
    audit($uid, 'aipay_store_saved', $uid);
    ok(['message' => 'Saved.']);
}

function r_aipay_store_fee(): never
{
    $u = aipay_require_merchant();
    $uid = (int) $u['id'];
    rate_limit('aipay-fee:' . $uid, 10, 3600);
    $s = aipay_store($uid);
    if (!$s) {
        fail(409, 'no_store', 'Set up your store profile first.');
    }
    if (!in_array($s['fee_status'], ['unpaid', 'rejected'], true)) {
        fail(409, 'already', $s['fee_status'] === 'confirmed' ? 'Your review fee is already confirmed.' : 'We are already checking your payment.');
    }
    $sender = str_in('sender', 120);
    $bank = str_in('bank', 80);
    $e = [];
    if (mb_strlen($sender) < 2) $e['sender'] = 'Enter the name on the account you paid from.';
    if (mb_strlen($bank) < 2) $e['bank'] = 'Enter the bank you paid from.';
    if ($e) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $e);
    }
    q("UPDATE aipay_stores SET fee_status = 'submitted', fee_sender = ?, fee_bank = ?, fee_submitted_at = ?, fee_note = NULL WHERE user_id = ?",
        [$sender, $bank, now_utc(), $uid]);
    audit($uid, 'aipay_fee_submitted', $uid, ['sender' => $sender, 'bank' => $bank]);
    aipay_note($uid, 'We received your review fee details. We will confirm the payment and review your store.');
    $to = (string) (config()['admin_notify_email'] ?? '');
    if ($to !== '' && valid_email($to)) {
        send_mail($to, 'AiPay review fee to confirm',
            "{$s['business_name']} ({$u['email']}) says they paid the " . naira(AIPAY_FEE) . " AiPay review fee.\n\nFrom: $sender ($bank)\n\n" .
            "Check the " . AIPAY_FEE_ACCOUNT['bank_name'] . ' account ' . AIPAY_FEE_ACCOUNT['account_number'] . ", then confirm it in the admin console: " . site_url('account/admin.html'));
    }
    ok(['message' => 'Thanks. We are confirming your payment.']);
}

function r_aipay_store_seen(): never
{
    $u = aipay_require_merchant();
    q('UPDATE aipay_stores SET live_seen = 1 WHERE user_id = ?', [(int) $u['id']]);
    ok();
}

// ------------------------------------------------------------------ merchant: products
function r_aipay_my_products(): never
{
    $u = aipay_require_merchant();
    $rows = q('SELECT * FROM aipay_products WHERE merchant_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 500', [(int) $u['id']])->fetchAll();
    ok(['items' => array_map(fn ($p) => aipay_product_out($p) + ['sold' => (int) $p['sold']], $rows), 'categories' => AIPAY_CATEGORIES]);
}

function r_aipay_product_save(): never
{
    $u = aipay_require_merchant();
    $uid = (int) $u['id'];
    rate_limit('aipay-product:' . $uid, 120, 3600);
    $id = int_in('id');
    $name = str_in('name', 80);
    $cat = str_in('category', 40);
    $price = int_in('price');
    $stock = int_in('stock');
    $desc = str_in('description', 600);
    $img = int_in('image_id');
    $e = [];
    if (mb_strlen($name) < 2) $e['name'] = 'Enter the product name.';
    if (!in_array($cat, AIPAY_CATEGORIES, true)) $e['category'] = 'Choose a category.';
    if ($price < 50 || $price > 50000000) $e['price'] = 'Enter a price between NGN 50 and NGN 50,000,000.';
    if ($stock > 100000) $e['stock'] = 'Enter a quantity up to 100,000.';
    if ($img && !row('SELECT 1 FROM aipay_images WHERE id = ? AND owner_id = ?', [$img, $uid])) $e['image_id'] = 'Upload the picture again.';
    if ($e) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $e);
    }
    if ($id) {
        if (!row('SELECT 1 FROM aipay_products WHERE id = ? AND merchant_id = ? AND active = 1', [$id, $uid])) {
            fail(404, 'not_found', 'Product not found.');
        }
        q('UPDATE aipay_products SET name = ?, category = ?, price = ?, stock = ?, description = ?, image_id = ? WHERE id = ? AND merchant_id = ?',
            [$name, $cat, $price, $stock, $desc ?: null, $img ?: null, $id, $uid]);
    } else {
        if ((int) row('SELECT COUNT(*) n FROM aipay_products WHERE merchant_id = ? AND active = 1', [$uid])['n'] >= 500) {
            fail(422, 'invalid', 'You can list up to 500 products.');
        }
        q('INSERT INTO aipay_products (merchant_id, name, category, price, stock, description, image_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$uid, $name, $cat, $price, $stock, $desc ?: null, $img ?: null]);
        $id = (int) db()->lastInsertId();
    }
    ok(['id' => $id]);
}

function r_aipay_product_delete(): never
{
    $u = aipay_require_merchant();
    q('UPDATE aipay_products SET active = 0 WHERE id = ? AND merchant_id = ?', [int_in('id'), (int) $u['id']]);
    ok();
}

// ------------------------------------------------------------------ buyer: orders
function r_aipay_order_create(): never
{
    $u = aipay_require_buyer();
    $uid = (int) $u['id'];
    rate_limit('aipay-order:' . $uid, 30, 3600);
    $in = input();
    $items = is_array($in['items'] ?? null) ? array_slice($in['items'], 0, 30) : [];
    $want = [];
    foreach ($items as $it) {
        $pid = is_array($it) ? (int) ($it['product_id'] ?? 0) : 0;
        $qty = is_array($it) ? (int) ($it['qty'] ?? 0) : 0;
        if ($pid > 0 && $qty > 0) {
            $want[$pid] = min(99, ($want[$pid] ?? 0) + $qty);
        }
    }
    if (!$want) {
        fail(422, 'invalid', 'Your cart is empty.');
    }
    $delivery = str_in('delivery', 10) === 'delivery' ? 'delivery' : 'pickup';
    $address = null;
    if ($delivery === 'delivery') {
        $address = aipay_clean_address(is_array($in['address'] ?? null) ? $in['address'] : []);
    } else {
        $phone = str_in('phone', 30);
        if (!preg_match('/^\+?[0-9 ()-]{7,20}$/', $phone)) {
            fail(422, 'invalid', 'Enter a phone number the store can call.', ['phone' => 'Enter a phone number the store can call.']);
        }
        $address = ['phone' => $phone];
    }
    $pdo = db();
    $pdo->beginTransaction();
    $ids = array_keys($want);
    $rows = q('SELECT p.*, s.business_name, s.city, s.state FROM aipay_products p ' . aipay_live_sql() . ' WHERE p.active = 1 AND p.id IN (' .
        implode(',', array_fill(0, count($ids), '?')) . ') FOR UPDATE', $ids)->fetchAll();
    if (count($rows) !== count($ids)) {
        $pdo->rollBack();
        fail(409, 'unavailable', 'Some items are no longer available. Please check your cart.');
    }
    $merchant = (int) $rows[0]['merchant_id'];
    $subtotal = 0;
    foreach ($rows as $p) {
        if ((int) $p['merchant_id'] !== $merchant) {
            $pdo->rollBack();
            fail(422, 'invalid', 'Order from one store at a time.');
        }
        if ((int) $p['stock'] < $want[(int) $p['id']]) {
            $pdo->rollBack();
            fail(409, 'stock', "Only {$p['stock']} of {$p['name']} left. Please change the quantity.");
        }
        $subtotal += (int) $p['price'] * $want[(int) $p['id']];
    }
    if ($merchant === $uid) {
        $pdo->rollBack();
        fail(422, 'invalid', "You can't buy from your own store.");
    }
    $fee = 0;
    if ($delivery === 'delivery') {
        $store = $rows[0];
        $fee = strcasecmp(trim((string) $store['city']), $address['city']) === 0 && $store['state'] === $address['state'] ? AIPAY_DELIVERY_FEES['city']
            : ($store['state'] === $address['state'] ? AIPAY_DELIVERY_FEES['state'] : AIPAY_DELIVERY_FEES['country']);
    }
    do {
        $code = strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
    } while (row('SELECT 1 FROM aipay_orders WHERE code = ?', [$code]));
    q('INSERT INTO aipay_orders (code, buyer_id, merchant_id, delivery, address, subtotal, delivery_fee, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$code, $uid, $merchant, $delivery, json_encode($address), $subtotal, $fee, $subtotal + $fee]);
    $oid = (int) $pdo->lastInsertId();
    foreach ($rows as $p) {
        $qty = $want[(int) $p['id']];
        q('INSERT INTO aipay_order_items (order_id, product_id, name, price, qty, image_id) VALUES (?, ?, ?, ?, ?, ?)',
            [$oid, (int) $p['id'], $p['name'], (int) $p['price'], $qty, $p['image_id']]);
        q('UPDATE aipay_products SET stock = stock - ? WHERE id = ?', [$qty, (int) $p['id']]);
    }
    $pdo->commit();
    if (aipay_prefs($merchant)['settings']['orderNew']) {
        aipay_note($merchant, "New order #$code from {$u['full_name']}: " . naira($subtotal + $fee) . '. Waiting for payment.', 'order');
    }
    $o = row('SELECT o.*, s.business_name store_name FROM aipay_orders o LEFT JOIN aipay_stores s ON s.user_id = o.merchant_id WHERE o.id = ?', [$oid]);
    ok(['order' => aipay_order_out($o, true)]);
}

function aipay_find_order(string $col, int $uid): array
{
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', str_in('code', 20)) ?? '');
    if ($code === '' && isset($_GET['code'])) {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', mb_substr((string) $_GET['code'], 0, 20)) ?? '');
    }
    $o = $code ? row("SELECT o.*, u.full_name buyer_name, u.phone buyer_phone, s.business_name store_name FROM aipay_orders o
                      JOIN users u ON u.id = o.buyer_id LEFT JOIN aipay_stores s ON s.user_id = o.merchant_id
                      WHERE o.code = ? AND o.$col = ?", [$code, $uid]) : null;
    if (!$o) {
        fail(404, 'not_found', 'Order not found.');
    }
    return $o;
}

function r_aipay_my_orders(): never
{
    $u = require_user();
    $rows = q('SELECT o.*, s.business_name store_name FROM aipay_orders o LEFT JOIN aipay_stores s ON s.user_id = o.merchant_id
               WHERE o.buyer_id = ? ORDER BY o.created_at DESC LIMIT 200', [(int) $u['id']])->fetchAll();
    ok(['items' => array_map(fn ($o) => aipay_order_out($o, in_array($o['status'], ['awaiting_payment', 'payment_sent'], true)), $rows)]);
}

function r_aipay_order(): never
{
    $u = require_user();
    $o = aipay_find_order('buyer_id', (int) $u['id']);
    ok(['order' => aipay_order_out($o, true)]);
}

function aipay_restock(int $orderId): void
{
    foreach (q('SELECT product_id, qty FROM aipay_order_items WHERE order_id = ? AND product_id IS NOT NULL', [$orderId])->fetchAll() as $i) {
        q('UPDATE aipay_products SET stock = stock + ? WHERE id = ?', [(int) $i['qty'], (int) $i['product_id']]);
    }
}

/** What the buyer can do: say they've paid, cancel before the store confirms payment, or confirm delivery. */
function r_aipay_order_buyer(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    rate_limit('aipay-order-act:' . $uid, 60, 3600);
    $o = aipay_find_order('buyer_id', $uid);
    $action = str_in('action', 20);
    $merchant = (int) $o['merchant_id'];
    $ref = '#' . $o['code'];
    if ($action === 'paid') {
        if ($o['status'] !== 'awaiting_payment') fail(409, 'state', 'This order is not waiting for payment.');
        $sender = str_in('sender', 120);
        $bank = str_in('bank', 80);
        $e = [];
        if (mb_strlen($sender) < 2) $e['sender'] = 'Enter the name on the account you paid from.';
        if (mb_strlen($bank) < 2) $e['bank'] = 'Enter the bank you paid from.';
        if ($e) fail(422, 'invalid', 'Please check the highlighted fields.', $e);
        q("UPDATE aipay_orders SET status = 'payment_sent', pay_sender = ?, pay_bank = ? WHERE id = ?", [$sender, $bank, (int) $o['id']]);
        if (aipay_prefs($merchant)['settings']['orderPaid']) {
            aipay_note($merchant, "{$u['full_name']} says they paid " . naira((int) $o['total']) . " for order $ref from $sender ($bank). Check your account and confirm.", 'pay');
        }
        aipay_mail($merchant, "Payment sent for AiPay order $ref",
            "{$u['full_name']} says they transferred " . naira((int) $o['total']) . " for order $ref.\nFrom: $sender ($bank)\n\nCheck your bank account, then confirm the payment in AiPay so the order can go ahead.");
    } elseif ($action === 'cancel') {
        if (!in_array($o['status'], ['awaiting_payment', 'payment_sent'], true)) fail(409, 'state', 'The store has already confirmed payment. Contact the store to cancel.');
        db()->beginTransaction();
        q("UPDATE aipay_orders SET status = 'cancelled', cancel_note = 'Cancelled by the buyer' WHERE id = ?", [(int) $o['id']]);
        aipay_restock((int) $o['id']);
        db()->commit();
        aipay_note($merchant, "Order $ref was cancelled by the buyer.", 'order');
    } elseif ($action === 'received') {
        if (!in_array($o['status'], ['ready', 'shipped'], true)) fail(409, 'state', 'This order has not been sent yet.');
        q("UPDATE aipay_orders SET status = 'delivered' WHERE id = ?", [(int) $o['id']]);
        if (aipay_prefs($merchant)['settings']['orderStatus']) {
            aipay_note($merchant, "{$u['full_name']} received order $ref.", 'order');
        }
    } else {
        fail(422, 'invalid', 'Unknown action.');
    }
    $o = aipay_find_order('buyer_id', $uid);
    ok(['order' => aipay_order_out($o, true)]);
}

// ------------------------------------------------------------------ merchant: orders and dashboard
function r_aipay_sales(): never
{
    $u = aipay_require_merchant();
    $rows = q('SELECT o.*, u.full_name buyer_name, u.phone buyer_phone FROM aipay_orders o JOIN users u ON u.id = o.buyer_id
               WHERE o.merchant_id = ? ORDER BY o.created_at DESC LIMIT 500', [(int) $u['id']])->fetchAll();
    ok(['items' => array_map(fn ($o) => aipay_order_out($o), $rows)]);
}

function r_aipay_sale_update(): never
{
    $u = aipay_require_merchant();
    $uid = (int) $u['id'];
    rate_limit('aipay-sale-act:' . $uid, 300, 3600);
    $o = aipay_find_order('merchant_id', $uid);
    $action = str_in('action', 20);
    $buyer = (int) $o['buyer_id'];
    $ref = '#' . $o['code'];
    $moves = [
        'confirm_payment' => [['awaiting_payment', 'payment_sent'], 'processing'],
        'not_received' => [['payment_sent'], 'awaiting_payment'],
        'ready' => [['processing'], 'ready'],
        'shipped' => [['processing', 'ready'], 'shipped'],
        'delivered' => [['ready', 'shipped'], 'delivered'],
        'cancel' => [['awaiting_payment', 'payment_sent'], 'cancelled'],
    ];
    if (!isset($moves[$action])) {
        fail(422, 'invalid', 'Unknown action.');
    }
    [$from, $to] = $moves[$action];
    if (!in_array($o['status'], $from, true)) {
        fail(409, 'state', 'This order has moved on. Reload to see its latest status.');
    }
    $note = str_in('note', 300);
    db()->beginTransaction();
    if ($action === 'confirm_payment') {
        q("UPDATE aipay_orders SET status = 'processing', paid_at = ? WHERE id = ?", [now_utc(), (int) $o['id']]);
        q('UPDATE aipay_products p JOIN aipay_order_items i ON i.product_id = p.id SET p.sold = p.sold + i.qty WHERE i.order_id = ?', [(int) $o['id']]);
    } elseif ($action === 'cancel') {
        q("UPDATE aipay_orders SET status = 'cancelled', cancel_note = ? WHERE id = ?", [$note ?: 'Cancelled by the store', (int) $o['id']]);
        aipay_restock((int) $o['id']);
    } elseif ($action === 'not_received') {
        q("UPDATE aipay_orders SET status = 'awaiting_payment', pay_sender = NULL, pay_bank = NULL WHERE id = ?", [(int) $o['id']]);
    } else {
        q('UPDATE aipay_orders SET status = ? WHERE id = ?', [$to, (int) $o['id']]);
    }
    db()->commit();
    $store = $o['store_name'] ?: 'The store';
    $msg = [
        'confirm_payment' => "Your payment of " . naira((int) $o['total']) . " for order $ref is confirmed. $store is preparing it.",
        'not_received' => "$store has not received your payment for order $ref yet. Check the transfer and tell them again when it's sent.",
        'ready' => $o['delivery'] === 'pickup' ? "Order $ref is ready for pick-up at $store." : "Order $ref is packed and ready to ship.",
        'shipped' => "Order $ref is on its way.",
        'delivered' => "Order $ref has been delivered. Enjoy!",
        'cancel' => "Order $ref was cancelled by $store." . ($note ? " Reason: $note" : ''),
    ][$action];
    aipay_note($buyer, $msg, $action === 'confirm_payment' ? 'pay' : 'order');
    if (in_array($action, ['confirm_payment', 'not_received', 'cancel'], true)) {
        aipay_mail($buyer, "AiPay order $ref", $msg);
    }
    $o = aipay_find_order('merchant_id', $uid);
    ok(['order' => aipay_order_out($o)]);
}

function r_aipay_dashboard(): never
{
    $u = aipay_require_merchant();
    $uid = (int) $u['id'];
    $year = (int) ($_GET['year'] ?? gmdate('Y'));
    if ($year < 2020 || $year > 2100) {
        $year = (int) gmdate('Y');
    }
    $counts = [];
    foreach (q('SELECT status, COUNT(*) n FROM aipay_orders WHERE merchant_id = ? GROUP BY status', [$uid])->fetchAll() as $r) {
        $counts[$r['status']] = (int) $r['n'];
    }
    $lists = [];
    foreach (['processing', 'ready', 'shipped'] as $st) {
        $rows = q('SELECT o.*, u.full_name buyer_name FROM aipay_orders o JOIN users u ON u.id = o.buyer_id WHERE o.merchant_id = ? AND o.status = ? ORDER BY o.updated_at DESC LIMIT 3', [$uid, $st])->fetchAll();
        $lists[$st] = array_map(fn ($o) => aipay_order_out($o), $rows);
    }
    $recent = q('SELECT o.*, u.full_name buyer_name FROM aipay_orders o JOIN users u ON u.id = o.buyer_id WHERE o.merchant_id = ? ORDER BY o.created_at DESC LIMIT 6', [$uid])->fetchAll();
    $years = array_map('intval', array_column(q('SELECT DISTINCT YEAR(paid_at) y FROM aipay_orders WHERE merchant_id = ? AND paid_at IS NOT NULL', [$uid])->fetchAll(), 'y'));
    $s = aipay_store($uid);
    ok([
        'counts' => $counts, 'lists' => $lists, 'recent' => array_map(fn ($o) => aipay_order_out($o), $recent),
        'monthly' => aipay_monthly('merchant_id', $uid, $year), 'year' => $year, 'years' => $years,
        'seller' => aipay_points_summary('merchant_id', $uid, 1000), 'views' => $s ? (int) $s['views'] : 0,
        'products' => (int) row('SELECT COUNT(*) n FROM aipay_products WHERE merchant_id = ? AND active = 1', [$uid])['n'],
        'low_stock' => (int) row('SELECT COUNT(*) n FROM aipay_products WHERE merchant_id = ? AND active = 1 AND stock < 5', [$uid])['n'],
    ]);
}

// ------------------------------------------------------------------ admin: review fee
function aipay_tables_ready(): bool
{
    static $ready = null;
    if ($ready === null) {
        $ready = (bool) row("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'aipay_stores'");
    }
    return $ready;
}

/** Store and fee details for the admin console's application cards. */
function aipay_admin_store_info(int $uid): ?array
{
    if (!aipay_tables_ready()) {
        return null;
    }
    $s = aipay_store($uid);
    if (!$s) {
        return ['fee_status' => 'no_store'];
    }
    return [
        'fee_status' => $s['fee_status'], 'fee_sender' => $s['fee_sender'], 'fee_bank' => $s['fee_bank'],
        'fee_submitted_at' => $s['fee_submitted_at'], 'fee_reviewed_at' => $s['fee_reviewed_at'], 'fee_note' => $s['fee_note'],
        'business_name' => $s['business_name'], 'category' => $s['category'], 'city' => $s['city'], 'state' => $s['state'],
        'phone' => $s['phone'], 'email' => $s['email'], 'reg_number' => $s['reg_number'], 'social' => $s['social'], 'bank' => trim("{$s['bank_name']} · {$s['account_name']} · {$s['account_number']}", ' ·'),
    ];
}

function r_aipay_admin_fee(): never
{
    $admin = require_admin();
    $aid = (int) $admin['id'];
    if (!aipay_is_admin($aid)) {
        fail(403, 'forbidden', 'You do not have permission to do that.');
    }
    $uid = int_in('user_id');
    if ($uid === $aid) {
        fail(403, 'forbidden', 'Another administrator must confirm your own payment.');
    }
    $decision = str_in('decision', 10);
    $note = str_in('note', 300);
    $s = $uid ? aipay_store($uid) : null;
    if (!$s || $s['fee_status'] !== 'submitted' && !($decision === 'confirm' && $s['fee_status'] === 'rejected')) {
        fail(409, 'state', 'There is no payment waiting to be confirmed for this store.');
    }
    if (!in_array($decision, ['confirm', 'reject'], true)) {
        fail(422, 'invalid', 'Choose confirm or reject.');
    }
    if ($decision === 'reject' && $note === '') {
        fail(422, 'invalid', 'Say why, so the merchant can fix it.', ['note' => 'Say why, so the merchant can fix it.']);
    }
    q('UPDATE aipay_stores SET fee_status = ?, fee_reviewed_by = ?, fee_reviewed_at = ?, fee_note = ? WHERE user_id = ?',
        [$decision === 'confirm' ? 'confirmed' : 'rejected', $aid, now_utc(), $note ?: null, $uid]);
    audit($aid, 'aipay_fee_' . $decision, $uid, $note ? ['note' => $note] : []);
    $msg = $decision === 'confirm'
        ? 'Your ' . naira(AIPAY_FEE) . ' review fee has been confirmed.'
        : "We could not confirm your review fee payment. Reason: $note. Please check and send the payment details again.";
    aipay_note($uid, $msg, 'pay');
    $m = row('SELECT email, full_name FROM users WHERE id = ?', [$uid]);
    if ($m) {
        send_mail($m['email'], 'Your AiPay review fee', "Hello {$m['full_name']},\n\n$msg\n\nOpen AiPay: " . site_url('products/aipay.html'));
    }
    ok(['message' => $decision === 'confirm' ? 'Payment confirmed. The merchant has been emailed.' : 'The merchant has been emailed.']);
}
