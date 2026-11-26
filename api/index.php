<?php
/*
 * Rehohub account system: API entry point.
 * Every request to /api/... comes here (see api/.htaccess). Responses are JSON.
 *
 * There are no hidden routes, master passwords or built-in accounts. Administrator
 * accounts can only be created by (a) the one-time first-admin setup, which needs the
 * setup_token you put in your private config file and stops working once an
 * administrator exists, or (b) an invitation sent by an existing super administrator.
 */
declare(strict_types=1);

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/aipay.php';

security_headers();
set_exception_handler(function (Throwable $e) {
    error_log('Rehohub API: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
    }
    echo json_encode(['ok' => false, 'error' => 'server', 'message' => 'Something went wrong. Please try again.']);
});

config();
if (!empty(config()['require_https']) && !is_https() && !is_dev()) {
    fail(403, 'https_required', 'Please use the secure (https) address.');
}

// ------------------------------------------------------------------ routing
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$pos = strrpos($path, '/api/');
$route = $pos === false ? '' : substr($path, $pos + 5);
$route = trim(preg_replace('#^index\.php/?#', '', $route) ?? '', '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
    $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($type, 'application/json')) {
        fail(415, 'json_only', 'Send JSON.');
    }
} elseif ($method !== 'GET') {
    fail(405, 'method', 'Method not allowed.');
}

start_session();
if ($method === 'POST') {
    require_csrf();
}

$routes = [
    'GET health' => 'r_health',
    'GET session' => 'r_session',
    'POST auth/register' => 'r_register',
    'POST auth/verify' => 'r_verify',
    'POST auth/resend' => 'r_resend',
    'POST auth/login' => 'r_login',
    'POST auth/logout' => 'r_logout',
    'POST auth/forgot' => 'r_forgot',
    'POST auth/reset' => 'r_reset',
    'POST me/profile' => 'r_profile',
    'POST me/password' => 'r_password',
    'POST me/memberships' => 'r_apply',
    'POST invites/check' => 'r_invite_check',
    'POST invites/accept' => 'r_invite_accept',
    'GET admin/summary' => 'r_admin_summary',
    'GET admin/memberships' => 'r_admin_memberships',
    'POST admin/memberships/decide' => 'r_admin_decide',
    'GET admin/users' => 'r_admin_users',
    'POST admin/users/status' => 'r_admin_user_status',
    'GET admin/invites' => 'r_admin_invites',
    'POST admin/invites' => 'r_admin_invite_create',
    'POST admin/invites/revoke' => 'r_admin_invite_revoke',
    'GET admin/audit' => 'r_admin_audit',
    // AiPay store (api/lib/aipay.php)
    'GET aipay/me' => 'r_aipay_me',
    'POST aipay/prefs' => 'r_aipay_prefs',
    'GET aipay/notes' => 'r_aipay_notes',
    'POST aipay/notes' => 'r_aipay_notes_update',
    'GET aipay/products' => 'r_aipay_products',
    'GET aipay/product' => 'r_aipay_product',
    'GET aipay/image' => 'r_aipay_image',
    'POST aipay/image' => 'r_aipay_image_upload',
    'POST aipay/store' => 'r_aipay_store_save',
    'POST aipay/store/fee' => 'r_aipay_store_fee',
    'POST aipay/store/seen' => 'r_aipay_store_seen',
    'GET aipay/my-products' => 'r_aipay_my_products',
    'POST aipay/my-products' => 'r_aipay_product_save',
    'POST aipay/my-products/delete' => 'r_aipay_product_delete',
    'POST aipay/orders' => 'r_aipay_order_create',
    'GET aipay/orders' => 'r_aipay_my_orders',
    'GET aipay/order' => 'r_aipay_order',
    'POST aipay/order' => 'r_aipay_order_buyer',
    'GET aipay/sales' => 'r_aipay_sales',
    'POST aipay/sales' => 'r_aipay_sale_update',
    'GET aipay/dashboard' => 'r_aipay_dashboard',
    'POST admin/aipay/fee' => 'r_aipay_admin_fee',
    'GET setup/status' => 'r_setup_status',
    'POST setup' => 'r_setup',
];
$handler = $routes["$method $route"] ?? null;
if (!$handler) {
    fail(404, 'not_found', 'Not found.');
}
$handler();

// ------------------------------------------------------------------ session payload
function session_payload(): array
{
    $u = current_user();
    $out = ['csrf' => $_SESSION['csrf'], 'user' => null];
    if ($u) {
        $uid = (int) $u['id'];
        $out['user'] = [
            'id' => $uid,
            'email' => $u['email'],
            'full_name' => $u['full_name'],
            'phone' => $u['phone'],
            'status' => $u['status'],
            'memberships' => memberships_of($uid),
            'admin_products' => admin_products($uid),
            'super_admin' => is_super_admin($uid),
        ];
    }
    return $out;
}

function r_health(): never
{
    db();
    ok(['service' => 'rehohub-accounts']);
}

function r_session(): never
{
    ok(session_payload());
}

// ------------------------------------------------------------------ sign-up and email verification
function r_register(): never
{
    rate_limit('register:' . client_ip(), 8, 3600);
    $name = str_in('full_name', 120);
    $email = norm_email(str_in('email', 190));
    $phone = str_in('phone', 30);
    $pw = (string) (input()['password'] ?? '');
    $product = str_in('product', 20);
    $role = str_in('role', 20);
    $errors = [];
    if (mb_strlen($name) < 2) {
        $errors['full_name'] = 'Enter your full name.';
    }
    if (!valid_email($email)) {
        $errors['email'] = 'Enter a valid email address.';
    }
    if ($phone !== '' && !preg_match('/^\+?[0-9 ()-]{7,20}$/', $phone)) {
        $errors['phone'] = 'Enter a valid phone number, or leave it empty.';
    }
    if ($problem = password_problem($pw, $email, $name)) {
        $errors['password'] = $problem;
    }
    if (!isset(PRODUCTS[$product]) || !in_array($role, PRODUCTS[$product]['roles'], true)) {
        $errors['role'] = 'Choose what you are signing up for.';
    }
    if (empty(input()['accept_terms'])) {
        $errors['accept_terms'] = 'Please accept the terms and privacy policy.';
    }
    if ($errors) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $errors);
    }
    $details = clean_details($role, input()['details'] ?? []);
    rate_limit('register-email:' . $email, 3, 3600);

    $existing = row('SELECT id, status FROM users WHERE email = ?', [$email]);
    if ($existing) {
        // Do not reveal that the address is registered; tell the owner by email instead.
        send_mail($email, 'Someone tried to sign up with your email',
            "Hello,\n\nSomeone tried to create a Rehohub account with this email address, but you already have one.\n\n" .
            "Sign in: " . site_url('account/login.html') . "\nForgot your password? " . site_url('account/forgot.html') .
            "\n\nOnce signed in, you can add " . PRODUCTS[$product]['name'] . ' to your account from "My account".');
        audit(null, 'register_duplicate', (int) $existing['id'], ['product' => $product, 'role' => $role]);
        ok(['message' => 'Check your email to continue.']);
    }

    $pdo = db();
    $pdo->beginTransaction();
    q('INSERT INTO users (email, full_name, phone, password_hash) VALUES (?, ?, ?, ?)', [
        $email, $name, $phone ?: null, password_hash($pw, PASSWORD_DEFAULT),
    ]);
    $uid = (int) $pdo->lastInsertId();
    q('INSERT INTO memberships (user_id, product, role, status, details) VALUES (?, ?, ?, ?, ?)', [
        $uid, $product, $role, in_array($role, NEEDS_APPROVAL, true) ? 'pending' : 'approved', $details ? json_encode($details) : null,
    ]);
    $token = make_token('verify_email', $email, $uid, VERIFY_HOURS * 3600);
    audit($uid, 'register', $uid, ['product' => $product, 'role' => $role]);
    $pdo->commit();

    send_verification($email, $name, $token);
    ok(['message' => 'Check your email to continue.']);
}

function send_verification(string $email, string $name, string $token): void
{
    send_mail($email, 'Confirm your Rehohub email address',
        "Hello $name,\n\nPlease confirm your email address to finish creating your Rehohub account:\n\n" .
        site_url('account/verify.html#token=' . $token) . "\n\nThis link works once and expires in " . VERIFY_HOURS . ' hours.');
}

function r_verify(): never
{
    rate_limit('verify:' . client_ip(), 20, 3600);
    $t = find_token('verify_email', str_in('token', 100));
    if (!$t) {
        fail(400, 'bad_token', 'This link is invalid or has expired. Request a new one.');
    }
    $u = row('SELECT * FROM users WHERE id = ?', [(int) $t['user_id']]);
    if (!$u || norm_email($u['email']) !== norm_email($t['email'])) {
        fail(400, 'bad_token', 'This link is invalid or has expired. Request a new one.');
    }
    $uid = (int) $u['id'];
    q('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), status = IF(status = \'pending_verification\', \'active\', status) WHERE id = ?', [now_utc(), $uid]);
    use_token((int) $t['id']);
    audit($uid, 'email_verified', $uid);
    notify_admins_of_pending($uid);
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    if (in_array($u['status'], CAN_LOG_IN, true)) {
        sign_in($u);
    }
    ok(session_payload());
}

function notify_admins_of_pending(int $uid): void
{
    $to = (string) (config()['admin_notify_email'] ?? '');
    if ($to === '' || !valid_email($to)) {
        return;
    }
    $pending = q("SELECT product, role FROM memberships WHERE user_id = ? AND status = 'pending'", [$uid])->fetchAll();
    if (!$pending) {
        return;
    }
    $u = row('SELECT full_name, email FROM users WHERE id = ?', [$uid]);
    $list = implode("\n", array_map(fn ($m) => '- ' . (PRODUCTS[$m['product']]['name'] ?? $m['product']) . ' ' . ROLE_NAMES[$m['role']], $pending));
    send_mail($to, 'New application waiting for approval',
        "{$u['full_name']} ({$u['email']}) has applied for:\n$list\n\nReview it in the admin console: " . site_url('account/admin.html'));
}

function r_resend(): never
{
    $email = norm_email(str_in('email', 190));
    rate_limit('resend:' . client_ip(), 6, 3600);
    rate_limit('resend-email:' . $email, 3, 3600);
    $u = valid_email($email) ? row('SELECT * FROM users WHERE email = ?', [$email]) : null;
    if ($u && $u['status'] === 'pending_verification') {
        q("UPDATE tokens SET revoked_at = ? WHERE user_id = ? AND purpose = 'verify_email' AND used_at IS NULL AND revoked_at IS NULL", [now_utc(), (int) $u['id']]);
        send_verification($email, $u['full_name'], make_token('verify_email', $email, (int) $u['id'], VERIFY_HOURS * 3600));
    }
    ok(['message' => 'If that address is waiting for confirmation, we have sent a new link.']);
}

// ------------------------------------------------------------------ sign in and out
function r_login(): never
{
    rate_limit('login:' . client_ip(), 20, 900);
    $email = norm_email(str_in('email', 190));
    $pw = (string) (input()['password'] ?? '');
    $u = valid_email($email) ? row('SELECT * FROM users WHERE email = ?', [$email]) : null;
    if (!$u) {
        password_hash($pw, PASSWORD_DEFAULT); // takes as long as a real check, so timing does not reveal unknown emails
        fail(401, 'bad_login', 'That email and password do not match.');
    }
    $uid = (int) $u['id'];
    if ($u['locked_until'] && strtotime($u['locked_until'] . ' UTC') > time()) {
        fail(423, 'locked', 'Too many wrong passwords. Try again in ' . LOCK_MINUTES . ' minutes, or reset your password.');
    }
    if (!password_verify($pw, $u['password_hash'])) {
        $fails = (int) $u['failed_logins'] + 1;
        $lock = $fails >= MAX_FAILED_LOGINS ? utc_plus(LOCK_MINUTES * 60) : null;
        q('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [$lock ? 0 : $fails, $lock, $uid]);
        audit(null, $lock ? 'login_locked' : 'login_failed', $uid);
        fail(401, 'bad_login', 'That email and password do not match.');
    }
    if ($u['status'] === 'pending_verification') {
        fail(403, 'unverified', 'Please confirm your email address first. Check your inbox, or request a new link.');
    }
    if (!in_array($u['status'], CAN_LOG_IN, true)) {
        audit(null, 'login_blocked', $uid, ['status' => $u['status']]);
        fail(403, 'blocked', 'This account cannot sign in. Please contact info@rehohub.com.');
    }
    $updates = 'failed_logins = 0, locked_until = NULL, last_login_at = ?';
    $params = [now_utc()];
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        $updates .= ', password_hash = ?';
        $params[] = password_hash($pw, PASSWORD_DEFAULT);
    }
    $params[] = $uid;
    q("UPDATE users SET $updates WHERE id = ?", $params);
    sign_in($u);
    audit($uid, 'login', $uid);
    ok(session_payload());
}

function r_logout(): never
{
    $u = current_user();
    if ($u) {
        audit((int) $u['id'], 'logout', (int) $u['id']);
    }
    sign_out();
    ok(session_payload());
}

// ------------------------------------------------------------------ password reset
function r_forgot(): never
{
    $email = norm_email(str_in('email', 190));
    rate_limit('forgot:' . client_ip(), 6, 3600);
    rate_limit('forgot-email:' . $email, 3, 3600);
    $u = valid_email($email) ? row('SELECT * FROM users WHERE email = ?', [$email]) : null;
    if ($u && !in_array($u['status'], ['banned', 'deactivated'], true)) {
        q("UPDATE tokens SET revoked_at = ? WHERE user_id = ? AND purpose = 'reset_password' AND used_at IS NULL AND revoked_at IS NULL", [now_utc(), (int) $u['id']]);
        $token = make_token('reset_password', $email, (int) $u['id'], RESET_MINUTES * 60);
        send_mail($email, 'Reset your Rehohub password',
            "Hello {$u['full_name']},\n\nUse this link to choose a new password:\n\n" . site_url('account/reset.html#token=' . $token) .
            "\n\nIt works once and expires in " . RESET_MINUTES . " minutes. If you didn't ask for this, ignore this email; your password stays the same.");
        audit(null, 'reset_requested', (int) $u['id']);
    }
    ok(['message' => 'If an account uses that address, we have emailed a reset link.']);
}

function r_reset(): never
{
    rate_limit('reset:' . client_ip(), 10, 3600);
    $t = find_token('reset_password', str_in('token', 100));
    if (!$t) {
        fail(400, 'bad_token', 'This link is invalid or has expired. Request a new one.');
    }
    $u = row('SELECT * FROM users WHERE id = ?', [(int) $t['user_id']]);
    if (!$u) {
        fail(400, 'bad_token', 'This link is invalid or has expired. Request a new one.');
    }
    $pw = (string) (input()['password'] ?? '');
    if ($problem = password_problem($pw, $u['email'], $u['full_name'])) {
        fail(422, 'invalid', $problem, ['password' => $problem]);
    }
    // Reaching the reset link proves the person controls the email address.
    q("UPDATE users SET password_hash = ?, session_version = session_version + 1, failed_logins = 0, locked_until = NULL,
         email_verified_at = COALESCE(email_verified_at, ?), status = IF(status = 'pending_verification', 'active', status) WHERE id = ?",
        [password_hash($pw, PASSWORD_DEFAULT), now_utc(), (int) $u['id']]);
    use_token((int) $t['id']);
    audit((int) $u['id'], 'password_reset', (int) $u['id']);
    send_mail($u['email'], 'Your Rehohub password was changed',
        "Hello {$u['full_name']},\n\nYour password was just changed and you were signed out on all devices.\nIf this wasn't you, reset it again now: " . site_url('account/forgot.html') . ' and contact info@rehohub.com.');
    ok(['message' => 'Password updated. You can sign in now.']);
}

// ------------------------------------------------------------------ my account
function r_profile(): never
{
    $u = require_user();
    $name = str_in('full_name', 120);
    $phone = str_in('phone', 30);
    $errors = [];
    if (mb_strlen($name) < 2) {
        $errors['full_name'] = 'Enter your full name.';
    }
    if ($phone !== '' && !preg_match('/^\+?[0-9 ()-]{7,20}$/', $phone)) {
        $errors['phone'] = 'Enter a valid phone number, or leave it empty.';
    }
    if ($errors) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $errors);
    }
    q('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [$name, $phone ?: null, (int) $u['id']]);
    audit((int) $u['id'], 'profile_updated', (int) $u['id']);
    ok(['message' => 'Saved.']);
}

function r_password(): never
{
    $u = require_user();
    rate_limit('pwchange:' . $u['id'], 10, 3600);
    if (!password_verify((string) (input()['current_password'] ?? ''), $u['password_hash'])) {
        fail(422, 'invalid', 'Your current password is not right.', ['current_password' => 'Your current password is not right.']);
    }
    $pw = (string) (input()['new_password'] ?? '');
    if ($problem = password_problem($pw, $u['email'], $u['full_name'])) {
        fail(422, 'invalid', $problem, ['new_password' => $problem]);
    }
    q('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), (int) $u['id']]);
    $fresh = row('SELECT * FROM users WHERE id = ?', [(int) $u['id']]);
    sign_in($fresh); // keep this device signed in; others are signed out
    audit((int) $u['id'], 'password_changed', (int) $u['id']);
    ok(session_payload() + ['message' => 'Password changed. Other devices were signed out.']);
}

/** Add another product or role to an existing account. */
function r_apply(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    rate_limit('apply:' . $uid, 10, 3600);
    $product = str_in('product', 20);
    $role = str_in('role', 20);
    if (!isset(PRODUCTS[$product]) || !in_array($role, PRODUCTS[$product]['roles'], true)) {
        fail(422, 'invalid', 'Choose what you are applying for.', ['role' => 'Choose what you are applying for.']);
    }
    $details = clean_details($role, input()['details'] ?? []);
    $status = in_array($role, NEEDS_APPROVAL, true) ? 'pending' : 'approved';
    $m = row('SELECT * FROM memberships WHERE user_id = ? AND product = ? AND role = ?', [$uid, $product, $role]);
    if ($m && $m['status'] !== 'rejected') {
        fail(409, 'exists', $m['status'] === 'suspended' ? 'This role is suspended. Contact info@rehohub.com.' : 'You already have this on your account.');
    }
    if ($m) {
        q('UPDATE memberships SET status = ?, details = ?, review_note = NULL, reviewed_by = NULL, reviewed_at = NULL, created_at = ? WHERE id = ?',
            [$status, $details ? json_encode($details) : null, now_utc(), (int) $m['id']]);
    } else {
        q('INSERT INTO memberships (user_id, product, role, status, details) VALUES (?, ?, ?, ?, ?)', [$uid, $product, $role, $status, $details ? json_encode($details) : null]);
    }
    audit($uid, 'membership_requested', $uid, ['product' => $product, 'role' => $role]);
    if ($status === 'pending') {
        notify_admins_of_pending($uid);
    }
    ok(session_payload() + ['message' => $status === 'pending' ? 'Application sent. We will email you when it is reviewed.' : 'Added to your account.']);
}

// ------------------------------------------------------------------ invitations
function r_invite_check(): never
{
    rate_limit('invite-check:' . client_ip(), 30, 3600);
    $t = find_token('invite', str_in('token', 100));
    if (!$t) {
        fail(400, 'bad_token', 'This invitation is invalid, has expired or was already used.');
    }
    $d = $t['data'];
    $me = current_user();
    ok([
        'email' => $t['email'],
        'product' => $d['product'],
        'role' => $d['role'],
        'account_exists' => (bool) row('SELECT 1 FROM users WHERE email = ?', [$t['email']]),
        'signed_in_as_invitee' => $me && norm_email($me['email']) === norm_email($t['email']),
    ]);
}

function r_invite_accept(): never
{
    rate_limit('invite-accept:' . client_ip(), 10, 3600);
    $t = find_token('invite', str_in('token', 100));
    if (!$t) {
        fail(400, 'bad_token', 'This invitation is invalid, has expired or was already used.');
    }
    $d = $t['data'];
    $email = norm_email($t['email']);
    $existing = row('SELECT * FROM users WHERE email = ?', [$email]);
    $pdo = db();
    $pdo->beginTransaction();
    if ($existing) {
        $me = current_user();
        if (!$me || (int) $me['id'] !== (int) $existing['id']) {
            $pdo->rollBack();
            fail(409, 'sign_in_required', "You already have an account. Sign in as $email, then open this invitation link again.");
        }
        $uid = (int) $existing['id'];
    } else {
        $name = str_in('full_name', 120);
        $pw = (string) (input()['password'] ?? '');
        $errors = [];
        if (mb_strlen($name) < 2) {
            $errors['full_name'] = 'Enter your full name.';
        }
        if ($problem = password_problem($pw, $email, $name)) {
            $errors['password'] = $problem;
        }
        if ($errors) {
            $pdo->rollBack();
            fail(422, 'invalid', 'Please check the highlighted fields.', $errors);
        }
        // The invitation link was emailed to this address, so the address is confirmed.
        q("INSERT INTO users (email, full_name, password_hash, email_verified_at, status) VALUES (?, ?, ?, ?, 'active')",
            [$email, $name, password_hash($pw, PASSWORD_DEFAULT), now_utc()]);
        $uid = (int) $pdo->lastInsertId();
    }
    $details = !empty($d['details']) ? json_encode($d['details']) : null;
    q("INSERT INTO memberships (user_id, product, role, status, details, reviewed_by, reviewed_at, review_note)
       VALUES (?, ?, ?, 'approved', ?, ?, ?, 'Invited')
       ON DUPLICATE KEY UPDATE status = 'approved', details = COALESCE(VALUES(details), details),
         reviewed_by = VALUES(reviewed_by), reviewed_at = VALUES(reviewed_at), review_note = 'Invited'",
        [$uid, $d['product'], $d['role'], $details, $t['created_by'], now_utc()]);
    use_token((int) $t['id']);
    audit($uid, 'invite_accepted', $uid, ['product' => $d['product'], 'role' => $d['role'], 'invited_by' => $t['created_by']]);
    $pdo->commit();
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    if (!in_array($u['status'], CAN_LOG_IN, true)) {
        fail(403, 'blocked', 'This account cannot sign in. Please contact info@rehohub.com.');
    }
    sign_in($u);
    ok(session_payload());
}

// ------------------------------------------------------------------ administration
function scope_sql(array $products, bool $super, string $col = 'm.product'): array
{
    $list = $super ? array_merge($products, ['rehohub']) : $products;
    return ["$col IN (" . implode(',', array_fill(0, count($list), '?')) . ')', $list];
}

function r_admin_summary(): never
{
    $u = require_admin();
    $uid = (int) $u['id'];
    $products = admin_products($uid);
    $super = is_super_admin($uid);
    [$where, $params] = scope_sql($products, $super);
    $rows = q("SELECT m.product, m.role, COUNT(*) n FROM memberships m WHERE m.status = 'pending' AND $where GROUP BY m.product, m.role", $params)->fetchAll();
    $users = $super ? (int) row('SELECT COUNT(*) n FROM users')['n'] : null;
    ok(['products' => $products, 'super_admin' => $super, 'pending' => $rows, 'users' => $users]);
}

function r_admin_memberships(): never
{
    $u = require_admin();
    $uid = (int) $u['id'];
    [$where, $params] = scope_sql(admin_products($uid), is_super_admin($uid));
    $status = (string) ($_GET['status'] ?? 'pending');
    if (in_array($status, ['pending', 'approved', 'rejected', 'suspended'], true)) {
        $where .= ' AND m.status = ?';
        $params[] = $status;
    }
    $product = (string) ($_GET['product'] ?? '');
    if ($product !== '') {
        $where .= ' AND m.product = ?';
        $params[] = $product;
    }
    $search = trim((string) ($_GET['q'] ?? ''));
    if ($search !== '') {
        $where .= ' AND (u.email LIKE ? OR u.full_name LIKE ?)';
        $like = '%' . addcslashes(mb_substr($search, 0, 60), '%_\\') . '%';
        array_push($params, $like, $like);
    }
    $rows = q("SELECT m.id, m.product, m.role, m.status, m.details, m.review_note, m.created_at, m.reviewed_at,
                      u.id user_id, u.full_name, u.email, u.phone, u.status account_status, u.email_verified_at,
                      r.full_name reviewer
               FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN users r ON r.id = m.reviewed_by
               WHERE $where ORDER BY m.created_at DESC LIMIT 200", $params)->fetchAll();
    foreach ($rows as &$r) {
        $r['details'] = $r['details'] ? (json_decode($r['details'], true) ?: []) : [];
        if ($r['product'] === 'aipay' && $r['role'] === 'merchant') {
            $r['aipay_store'] = aipay_admin_store_info((int) $r['user_id']);
        }
    }
    ok(['items' => $rows]);
}

function r_admin_decide(): never
{
    $admin = require_admin();
    $aid = (int) $admin['id'];
    $m = row('SELECT m.*, u.email, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?', [(int) (input()['id'] ?? 0)]);
    if (!$m) {
        fail(404, 'not_found', 'Application not found.');
    }
    $super = is_super_admin($aid);
    $allowed = $m['role'] === 'admin' || $m['product'] === 'rehohub' ? $super : in_array($m['product'], admin_products($aid), true);
    if (!$allowed) {
        fail(403, 'forbidden', 'You do not have permission to review this.');
    }
    if ((int) $m['user_id'] === $aid) {
        fail(403, 'forbidden', 'You cannot review your own account. Ask another administrator.');
    }
    $decision = str_in('decision', 20);
    $note = str_in('note', 500);
    $next = [
        'approve' => [['pending', 'rejected'], 'approved'],
        'reject' => [['pending'], 'rejected'],
        'suspend' => [['approved'], 'suspended'],
        'reinstate' => [['suspended'], 'approved'],
    ][$decision] ?? null;
    if (!$next || !in_array($m['status'], $next[0], true)) {
        fail(409, 'bad_state', 'That action is not possible from the current status.');
    }
    if ($decision === 'reject' && $note === '') {
        fail(422, 'invalid', 'Give the applicant a short reason.', ['note' => 'Give the applicant a short reason.']);
    }
    if ($m['product'] === 'rehohub' && $m['role'] === 'admin' && $decision === 'suspend') {
        $others = (int) row("SELECT COUNT(*) n FROM memberships WHERE product = 'rehohub' AND role = 'admin' AND status = 'approved' AND id <> ?", [(int) $m['id']])['n'];
        if ($others < 1) {
            fail(409, 'last_admin', 'You cannot suspend the last super administrator.');
        }
    }
    q('UPDATE memberships SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?', [$next[1], $note ?: null, $aid, now_utc(), (int) $m['id']]);
    audit($aid, 'membership_' . $decision, (int) $m['user_id'], ['membership' => (int) $m['id'], 'product' => $m['product'], 'role' => $m['role'], 'note' => $note]);
    $what = (PRODUCTS[$m['product']]['name'] ?? 'Rehohub') . ' ' . strtolower(ROLE_NAMES[$m['role']]);
    $msg = [
        'approve' => "Good news: your $what account has been approved. Sign in to get started: " . site_url('account/login.html'),
        'reject' => "We could not approve your $what application." . ($note ? "\n\nReason: $note" : '') . "\n\nYou can update your details and apply again from My account: " . site_url('account/index.html'),
        'suspend' => "Your $what access has been suspended." . ($note ? "\n\nReason: $note" : '') . "\n\nContact info@rehohub.com if you have questions.",
        'reinstate' => "Your $what access has been restored. Sign in: " . site_url('account/login.html'),
    ][$decision];
    send_mail($m['email'], 'Update on your Rehohub account', "Hello {$m['full_name']},\n\n$msg");
    ok(['message' => 'Saved.', 'status' => $next[1]]);
}

function r_admin_users(): never
{
    require_super_admin();
    $params = [];
    $where = '1=1';
    $search = trim((string) ($_GET['q'] ?? ''));
    if ($search !== '') {
        $where .= ' AND (email LIKE ? OR full_name LIKE ? OR phone LIKE ?)';
        $like = '%' . addcslashes(mb_substr($search, 0, 60), '%_\\') . '%';
        array_push($params, $like, $like, $like);
    }
    $status = (string) ($_GET['status'] ?? '');
    if (in_array($status, array_merge(ACCOUNT_STATUSES, ['pending_verification']), true)) {
        $where .= ' AND status = ?';
        $params[] = $status;
    }
    $page = max(0, (int) ($_GET['page'] ?? 0));
    $users = q("SELECT id, email, full_name, phone, status, email_verified_at, last_login_at, created_at
                FROM users WHERE $where ORDER BY created_at DESC LIMIT 50 OFFSET " . ($page * 50), $params)->fetchAll();
    foreach ($users as &$x) {
        $x['memberships'] = q('SELECT product, role, status FROM memberships WHERE user_id = ?', [(int) $x['id']])->fetchAll();
    }
    ok(['items' => $users, 'page' => $page]);
}

function r_admin_user_status(): never
{
    $admin = require_super_admin();
    $aid = (int) $admin['id'];
    $id = (int) (input()['id'] ?? 0);
    $status = str_in('status', 20);
    $note = str_in('note', 500);
    if ($id === $aid) {
        fail(403, 'forbidden', 'You cannot change your own account status.');
    }
    if (!in_array($status, ACCOUNT_STATUSES, true)) {
        fail(422, 'invalid', 'Choose a valid status.');
    }
    $u = row('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) {
        fail(404, 'not_found', 'User not found.');
    }
    if ($u['status'] === 'pending_verification' && in_array($status, CAN_LOG_IN, true)) {
        fail(409, 'bad_state', 'This person has not confirmed their email yet. They can request a new link from the sign-in page.');
    }
    $blocking = !in_array($status, CAN_LOG_IN, true);
    if ($blocking && is_super_admin($id)) {
        $others = (int) row("SELECT COUNT(*) n FROM memberships m JOIN users u ON u.id = m.user_id
                             WHERE m.product = 'rehohub' AND m.role = 'admin' AND m.status = 'approved' AND u.status IN ('active','warning') AND u.id <> ?", [$id])['n'];
        if ($others < 1) {
            fail(409, 'last_admin', 'You cannot block the last super administrator.');
        }
    }
    q('UPDATE users SET status = ?, session_version = session_version + ? WHERE id = ?', [$status, $blocking ? 1 : 0, $id]);
    audit($aid, 'account_status', $id, ['from' => $u['status'], 'to' => $status, 'note' => $note]);
    $text = [
        'active' => 'Your Rehohub account is active.',
        'warning' => 'Your Rehohub account has received a warning.',
        'suspended' => 'Your Rehohub account has been suspended.',
        'banned' => 'Your Rehohub account has been closed for breaking our terms.',
        'deactivated' => 'Your Rehohub account has been deactivated.',
    ][$status];
    send_mail($u['email'], 'Your Rehohub account status', "Hello {$u['full_name']},\n\n$text" . ($note ? "\n\nNote: $note" : '') . "\n\nQuestions? Contact info@rehohub.com.");
    ok(['message' => 'Saved.']);
}

function r_admin_invites(): never
{
    $u = require_admin();
    $uid = (int) $u['id'];
    $super = is_super_admin($uid);
    $products = admin_products($uid);
    $rows = q("SELECT t.id, t.email, t.data, t.expires_at, t.used_at, t.revoked_at, t.created_at, c.full_name invited_by
               FROM tokens t LEFT JOIN users c ON c.id = t.created_by WHERE t.purpose = 'invite' ORDER BY t.created_at DESC LIMIT 200")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $d = json_decode((string) $r['data'], true) ?: [];
        if (!$super && !in_array($d['product'] ?? '', $products, true)) {
            continue;
        }
        $state = $r['used_at'] ? 'accepted' : ($r['revoked_at'] ? 'revoked' : (strtotime($r['expires_at'] . ' UTC') < time() ? 'expired' : 'pending'));
        $out[] = ['id' => (int) $r['id'], 'email' => $r['email'], 'product' => $d['product'] ?? '', 'role' => $d['role'] ?? '',
            'details' => $d['details'] ?? [], 'state' => $state, 'expires_at' => $r['expires_at'], 'created_at' => $r['created_at'], 'invited_by' => $r['invited_by']];
    }
    ok(['items' => $out]);
}

function r_admin_invite_create(): never
{
    $admin = require_admin();
    $aid = (int) $admin['id'];
    rate_limit('invite:' . $aid, 30, 3600);
    $email = norm_email(str_in('email', 190));
    $product = str_in('product', 20);
    $role = str_in('role', 20);
    if (!valid_email($email)) {
        fail(422, 'invalid', 'Enter a valid email address.', ['email' => 'Enter a valid email address.']);
    }
    $super = is_super_admin($aid);
    if ($role === 'admin') {
        // Only super administrators can create administrators of any kind.
        if (!$super) {
            fail(403, 'forbidden', 'Only a super administrator can invite administrators.');
        }
        if ($product !== 'rehohub' && !isset(PRODUCTS[$product])) {
            fail(422, 'invalid', 'Choose a product.');
        }
    } else {
        if (!isset(PRODUCTS[$product]) || !in_array($role, PRODUCTS[$product]['roles'], true)) {
            fail(422, 'invalid', 'Choose a product and role.', ['role' => 'Choose a product and role.']);
        }
        if (!in_array($product, admin_products($aid), true)) {
            fail(403, 'forbidden', 'You do not administer this product.');
        }
    }
    $details = $role === 'employee' ? clean_details('employee', input()['details'] ?? []) : [];
    q("UPDATE tokens SET revoked_at = ? WHERE purpose = 'invite' AND email = ? AND used_at IS NULL AND revoked_at IS NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.product')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) = ?", [now_utc(), $email, $product, $role]);
    $token = make_token('invite', $email, null, INVITE_DAYS * 86400, ['product' => $product, 'role' => $role, 'details' => $details], $aid);
    $label = ($product === 'rehohub' ? 'Rehohub super' : PRODUCTS[$product]['name']) . ' ' . strtolower(ROLE_NAMES[$role]);
    send_mail($email, "You're invited to join Rehohub",
        "Hello,\n\n{$admin['full_name']} has invited you to join Rehohub as a $label.\n\nAccept the invitation:\n" .
        site_url('account/invite.html#token=' . $token) . "\n\nThis link works once and expires in " . INVITE_DAYS . ' days.');
    audit($aid, 'invite_sent', null, ['email' => $email, 'product' => $product, 'role' => $role]);
    ok(['message' => "Invitation sent to $email."]);
}

function r_admin_invite_revoke(): never
{
    $admin = require_admin();
    $aid = (int) $admin['id'];
    $t = row("SELECT * FROM tokens WHERE id = ? AND purpose = 'invite'", [(int) (input()['id'] ?? 0)]);
    if (!$t) {
        fail(404, 'not_found', 'Invitation not found.');
    }
    $d = json_decode((string) $t['data'], true) ?: [];
    $super = is_super_admin($aid);
    if (!$super && (($d['role'] ?? '') === 'admin' || !in_array($d['product'] ?? '', admin_products($aid), true))) {
        fail(403, 'forbidden', 'You cannot revoke this invitation.');
    }
    if ($t['used_at'] || $t['revoked_at']) {
        fail(409, 'bad_state', 'This invitation can no longer be revoked.');
    }
    q('UPDATE tokens SET revoked_at = ? WHERE id = ?', [now_utc(), (int) $t['id']]);
    audit($aid, 'invite_revoked', null, ['email' => $t['email'], 'product' => $d['product'] ?? '', 'role' => $d['role'] ?? '']);
    ok(['message' => 'Invitation revoked.']);
}

function r_admin_audit(): never
{
    require_super_admin();
    $page = max(0, (int) ($_GET['page'] ?? 0));
    $rows = q('SELECT a.id, a.action, a.details, a.ip, a.created_at, ac.email actor, tu.email target
               FROM audit_log a LEFT JOIN users ac ON ac.id = a.actor_id LEFT JOIN users tu ON tu.id = a.target_user_id
               ORDER BY a.id DESC LIMIT 100 OFFSET ' . ($page * 100))->fetchAll();
    foreach ($rows as &$r) {
        $r['details'] = $r['details'] ? (json_decode($r['details'], true) ?: []) : [];
    }
    ok(['items' => $rows, 'page' => $page]);
}

// ------------------------------------------------------------------ first administrator (one time only)
function super_admin_exists(): bool
{
    return (bool) row("SELECT 1 FROM memberships WHERE product = 'rehohub' AND role = 'admin' AND status = 'approved' LIMIT 1");
}

function r_setup_status(): never
{
    $token = (string) (config()['setup_token'] ?? '');
    ok(['needed' => !super_admin_exists(), 'token_configured' => strlen($token) >= 24]);
}

function r_setup(): never
{
    rate_limit('setup:' . client_ip(), 5, 3600);
    if (super_admin_exists()) {
        fail(410, 'setup_done', 'Setup is already complete. New administrators must be invited from the admin console.');
    }
    $configured = (string) (config()['setup_token'] ?? '');
    if (strlen($configured) < 24) {
        fail(403, 'setup_disabled', 'Setup is turned off. Add a setup_token of at least 24 characters to your private config file.');
    }
    if (!hash_equals($configured, (string) (input()['setup_token'] ?? ''))) {
        audit(null, 'setup_failed');
        fail(403, 'bad_setup_token', 'That setup phrase does not match the one in your config file.');
    }
    $name = str_in('full_name', 120);
    $email = norm_email(str_in('email', 190));
    $pw = (string) (input()['password'] ?? '');
    $errors = [];
    if (mb_strlen($name) < 2) {
        $errors['full_name'] = 'Enter your full name.';
    }
    if (!valid_email($email)) {
        $errors['email'] = 'Enter a valid email address.';
    }
    if ($problem = password_problem($pw, $email, $name)) {
        $errors['password'] = $problem;
    }
    if ($errors) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $errors);
    }
    $pdo = db();
    $pdo->beginTransaction();
    $u = row('SELECT * FROM users WHERE email = ? FOR UPDATE', [$email]);
    if ($u) {
        if (!password_verify($pw, $u['password_hash'])) {
            $pdo->rollBack();
            fail(422, 'invalid', 'An account with this email exists. Enter its current password to make it the administrator.', ['password' => 'Enter the existing password for this email.']);
        }
        $uid = (int) $u['id'];
        q("UPDATE users SET status = 'active', email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [now_utc(), $uid]);
    } else {
        q("INSERT INTO users (email, full_name, password_hash, email_verified_at, status) VALUES (?, ?, ?, ?, 'active')",
            [$email, $name, password_hash($pw, PASSWORD_DEFAULT), now_utc()]);
        $uid = (int) $pdo->lastInsertId();
    }
    q("INSERT INTO memberships (user_id, product, role, status, reviewed_at, review_note) VALUES (?, 'rehohub', 'admin', 'approved', ?, 'First administrator (setup)')
       ON DUPLICATE KEY UPDATE status = 'approved'", [$uid, now_utc()]);
    audit($uid, 'setup_first_admin', $uid);
    $pdo->commit();
    sign_in(row('SELECT * FROM users WHERE id = ?', [$uid]));
    send_mail($email, 'You are the Rehohub super administrator',
        "Hello $name,\n\nYour account is now the first Rehohub super administrator. Setup is now closed.\n\n" .
        "Next: remove the setup_token from your config file. Invite other administrators from " . site_url('account/admin.html'));
    ok(session_payload());
}
