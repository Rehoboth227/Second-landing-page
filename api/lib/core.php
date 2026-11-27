<?php
/*
 * Rehohub account system: shared helpers (database, sessions, security, email).
 * Plain PHP 8.1+, no third-party code. Every database query uses prepared statements.
 */
declare(strict_types=1);

// ------------------------------------------------------------------ products and roles
// Which roles can exist in each product, and which need an administrator's approval.
const PRODUCTS = [
    'aipay'    => ['name' => 'AiPay',    'roles' => ['customer', 'merchant']],
    'aimove'   => ['name' => 'AiMove',   'roles' => ['customer', 'rider']],
    'greenfed' => ['name' => 'GreenFed', 'roles' => ['customer', 'employee']],
    'airise'   => ['name' => 'AiRise',   'roles' => ['customer', 'trainer', 'employer']],
];
const NEEDS_APPROVAL = ['rider', 'merchant', 'employee', 'trainer', 'employer'];
const ROLE_NAMES = [
    'customer' => 'Customer', 'rider' => 'Rider', 'merchant' => 'Merchant',
    'employee' => 'Employee', 'trainer' => 'Trainer', 'employer' => 'Employer', 'admin' => 'Administrator',
];
const EMPLOYEE_TYPES = [
    'nutritionist' => 'Nutritionist', 'supply_manager' => 'Supply manager',
    'quality_assurance' => 'Quality assurance', 'packaging_delivery' => 'Packaging & delivery',
    'health_specialist' => 'Health specialist', 'supplier' => 'Supplier',
];
const VEHICLE_TYPES = ['motorcycle', 'bicycle', 'car', 'van', 'truck'];
const ACCOUNT_STATUSES = ['active', 'warning', 'suspended', 'banned', 'deactivated'];
const CAN_LOG_IN = ['active', 'warning'];

const SESSION_IDLE_SECONDS = 8 * 3600;
const VERIFY_HOURS = 48;
const RESET_MINUTES = 60;
const INVITE_DAYS = 7;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// ------------------------------------------------------------------ config
function config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $candidates = [];
    $env = getenv('REHOHUB_CONFIG');
    if ($env) {
        $candidates[] = $env;
    }
    if (!empty($_SERVER['DOCUMENT_ROOT'])) {
        $candidates[] = dirname(rtrim($_SERVER['DOCUMENT_ROOT'], '/')) . '/rehohub-config.php';
    }
    $candidates[] = dirname(__DIR__, 3) . '/rehohub-config.php'; // above public_html
    $candidates[] = dirname(__DIR__) . '/config.php';            // public_html/api/config.php
    foreach ($candidates as $file) {
        if (is_file($file)) {
            $loaded = require $file;
            if (is_array($loaded)) {
                return $cfg = $loaded;
            }
        }
    }
    fail(503, 'not_configured', 'The account service is not set up yet.');
}

function is_dev(): bool
{
    return (config()['env'] ?? 'production') === 'development';
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function utc_plus(int $seconds): string
{
    return gmdate('Y-m-d H:i:s', time() + $seconds);
}

// ------------------------------------------------------------------ responses
function send(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ok(array $data = []): never
{
    send(200, ['ok' => true] + $data);
}

function fail(int $status, string $code, string $message, array $fields = []): never
{
    $body = ['ok' => false, 'error' => $code, 'message' => $message];
    if ($fields) {
        $body['fields'] = $fields;
    }
    send($status, $body);
}

function security_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

// ------------------------------------------------------------------ database
function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $c = config()['db'] ?? [];
    try {
        $pdo = new PDO(
            'mysql:host=' . ($c['host'] ?? 'localhost') . ';dbname=' . ($c['name'] ?? '') . ';charset=utf8mb4',
            (string) ($c['user'] ?? ''),
            (string) ($c['pass'] ?? ''),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+00:00'");
    } catch (PDOException $e) {
        error_log('Rehohub API: database connection failed: ' . $e->getMessage());
        fail(503, 'db_unavailable', 'The account service is temporarily unavailable.');
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

// ------------------------------------------------------------------ request input
function input(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $raw = file_get_contents('php://input', false, null, 0, 65536) ?: '';
    $decoded = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($decoded)) {
        fail(400, 'bad_json', 'The request could not be read.');
    }
    return $data = $decoded;
}

function str_in(string $key, int $max = 200): string
{
    $v = input()[$key] ?? '';
    if (!is_string($v) && !is_int($v)) {
        return '';
    }
    $v = trim((string) $v);
    // strip control characters except normal whitespace
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max);
}

function norm_email(string $e): string
{
    return strtolower(trim($e));
}

function valid_email(string $e): bool
{
    return strlen($e) <= 190 && filter_var($e, FILTER_VALIDATE_EMAIL) !== false;
}

function password_problem(string $pw, string $email = '', string $name = ''): ?string
{
    if (strlen($pw) < 10) {
        return 'Use at least 10 characters.';
    }
    if (strlen($pw) > 200) {
        return 'Use at most 200 characters.';
    }
    if (count(array_unique(str_split($pw))) < 4) {
        return 'Use a mix of different characters.';
    }
    $lower = strtolower($pw);
    foreach (['password', '12345678', 'qwertyui', 'rehohub', 'iloveyou', 'abcdefgh'] as $weak) {
        if (str_contains($lower, $weak)) {
            return 'That password is too easy to guess.';
        }
    }
    $local = strtolower(explode('@', $email)[0] ?? '');
    if (strlen($local) >= 4 && str_contains($lower, $local)) {
        return "Don't include your email address in the password.";
    }
    return null;
}

// ------------------------------------------------------------------ sessions and CSRF
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('rh_sess');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    $last = $_SESSION['last_seen'] ?? 0;
    if ($last && time() - $last > SESSION_IDLE_SECONDS) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_seen'] = time();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function require_csrf(): void
{
    $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $sent)) {
        fail(403, 'csrf', 'Your session expired. Reload the page and try again.');
    }
}

function sign_in(array $user): void
{
    current_user(true);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $user['id'];
    $_SESSION['sv'] = (int) $user['session_version'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function sign_out(): void
{
    current_user(true);
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

/** The signed-in user, or null. Ends the session if the account was blocked or signed out elsewhere. */
function current_user(bool $forget = false): ?array
{
    static $cached = false;
    if ($forget) {
        $cached = false;
        return null;
    }
    if ($cached !== false) {
        return $cached;
    }
    $uid = (int) ($_SESSION['uid'] ?? 0);
    if (!$uid) {
        return $cached = null;
    }
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    if (!$u || (int) $u['session_version'] !== (int) ($_SESSION['sv'] ?? 0) || !in_array($u['status'], CAN_LOG_IN, true)) {
        sign_out();
        return $cached = null;
    }
    return $cached = $u;
}

function require_user(): array
{
    $u = current_user();
    if (!$u) {
        fail(401, 'not_signed_in', 'Please sign in.');
    }
    return $u;
}

// ------------------------------------------------------------------ roles
function memberships_of(int $uid): array
{
    $rows = q('SELECT id, product, role, status, details, review_note, created_at, reviewed_at
               FROM memberships WHERE user_id = ? ORDER BY created_at', [$uid])->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['details'] = $r['details'] ? (json_decode($r['details'], true) ?: []) : [];
    }
    return $rows;
}

function is_super_admin(int $uid): bool
{
    return (bool) row("SELECT 1 FROM memberships WHERE user_id = ? AND product = 'rehohub' AND role = 'admin' AND status = 'approved'", [$uid]);
}

/** Products this user administers: all of them for a super admin. */
function admin_products(int $uid): array
{
    if (is_super_admin($uid)) {
        return array_keys(PRODUCTS);
    }
    $rows = q("SELECT product FROM memberships WHERE user_id = ? AND role = 'admin' AND status = 'approved'", [$uid])->fetchAll();
    return array_values(array_intersect(array_keys(PRODUCTS), array_column($rows, 'product')));
}

function require_admin(): array
{
    $u = require_user();
    if (!admin_products((int) $u['id'])) {
        fail(403, 'forbidden', 'You do not have permission to do that.');
    }
    return $u;
}

function require_super_admin(): array
{
    $u = require_user();
    if (!is_super_admin((int) $u['id'])) {
        fail(403, 'forbidden', 'Only a super administrator can do that.');
    }
    return $u;
}

/** Checks the application details for a role and returns only the allowed fields. */
function clean_details(string $role, mixed $raw): array
{
    $d = is_array($raw) ? $raw : [];
    $get = function (string $k, int $max) use ($d): string {
        $v = $d[$k] ?? '';
        if (!is_string($v) && !is_int($v)) {
            return '';
        }
        $v = preg_replace('/[\x00-\x1F\x7F]/u', ' ', trim((string) $v)) ?? '';
        return mb_substr($v, 0, $max);
    };
    $errors = [];
    $out = [];
    $need = function (string $k, int $min, int $max, string $label) use (&$out, &$errors, $get) {
        $v = $get($k, $max);
        if (mb_strlen($v) < $min) {
            $errors[$k] = "Enter $label.";
        }
        $out[$k] = $v;
    };
    $opt = function (string $k, int $max) use (&$out, $get) {
        $v = $get($k, $max);
        if ($v !== '') {
            $out[$k] = $v;
        }
    };
    switch ($role) {
        case 'merchant':
            $need('business_name', 2, 120, 'your business name');
            $need('business_address', 5, 200, 'your business address');
            $opt('cac_number', 30);
            $opt('business_category', 60);
            break;
        case 'rider':
            $v = $get('vehicle_type', 20);
            if (!in_array($v, VEHICLE_TYPES, true)) {
                $errors['vehicle_type'] = 'Choose your vehicle type.';
            }
            $out['vehicle_type'] = $v;
            $need('plate_number', 3, 20, 'the plate number');
            $need('licence_number', 3, 30, "your driver's licence number");
            $need('city', 2, 60, 'the city you ride in');
            break;
        case 'employee':
            $v = $get('employee_type', 40);
            if (!isset(EMPLOYEE_TYPES[$v])) {
                $errors['employee_type'] = 'Choose your employee type.';
            }
            $out['employee_type'] = $v;
            $opt('city', 60);
            break;
        case 'trainer':
            $need('expertise', 3, 120, 'what you teach');
            $years = $get('experience_years', 3);
            if (!ctype_digit($years) || (int) $years > 60) {
                $errors['experience_years'] = 'Enter your years of experience as a number.';
            }
            $out['experience_years'] = (int) $years;
            $url = $get('profile_url', 200);
            if ($url !== '') {
                if (!preg_match('#^https://#i', $url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
                    $errors['profile_url'] = 'Use a full https:// link, or leave it empty.';
                }
                $out['profile_url'] = $url;
            }
            $opt('bio', 600);
            break;
        case 'employer':
            $need('company_name', 2, 120, 'your company name');
            $need('job_title', 2, 80, 'your job title');
            $url = $get('company_website', 200);
            if ($url !== '') {
                if (!preg_match('#^https://#i', $url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
                    $errors['company_website'] = 'Use a full https:// link, or leave it empty.';
                }
                $out['company_website'] = $url;
            }
            $opt('hiring_for', 200);
            break;
    }
    if ($errors) {
        fail(422, 'invalid', 'Please check the highlighted fields.', $errors);
    }
    return $out;
}

// ------------------------------------------------------------------ rate limiting
function rate_limit(string $bucket, int $max, int $windowSeconds): void
{
    $key = substr(hash('sha256', $bucket), 0, 64);
    $r = row('SELECT hits, window_start FROM rate_limits WHERE bucket = ?', [$key]);
    $now = time();
    if (!$r || strtotime($r['window_start'] . ' UTC') + $windowSeconds <= $now) {
        q('REPLACE INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, ?)', [$key, now_utc()]);
        return;
    }
    if ((int) $r['hits'] >= $max) {
        fail(429, 'too_many', 'Too many attempts. Please wait a few minutes and try again.');
    }
    q('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$key]);
}

// ------------------------------------------------------------------ audit log
function audit(?int $actor, string $action, ?int $target = null, array $details = []): void
{
    q('INSERT INTO audit_log (actor_id, action, target_user_id, details, ip) VALUES (?, ?, ?, ?, ?)', [
        $actor, $action, $target, $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null, client_ip(),
    ]);
}

// ------------------------------------------------------------------ single-use tokens
/** Creates a token and returns the secret (only its hash is stored). */
function make_token(string $purpose, string $email, ?int $uid, int $ttlSeconds, array $data = [], ?int $createdBy = null): string
{
    $secret = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    q('INSERT INTO tokens (purpose, token_hash, user_id, email, data, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        $purpose, hash('sha256', $secret), $uid, $email, $data ? json_encode($data) : null, $createdBy, utc_plus($ttlSeconds),
    ]);
    return $secret;
}

/** Finds a valid (unused, unexpired, not revoked) token, or null. */
function find_token(string $purpose, string $secret): ?array
{
    if ($secret === '' || strlen($secret) > 100) {
        return null;
    }
    $t = row('SELECT * FROM tokens WHERE token_hash = ? AND purpose = ?', [hash('sha256', $secret), $purpose]);
    if (!$t || $t['used_at'] || $t['revoked_at'] || strtotime($t['expires_at'] . ' UTC') < time()) {
        return null;
    }
    $t['data'] = $t['data'] ? (json_decode($t['data'], true) ?: []) : [];
    return $t;
}

function use_token(int $id): void
{
    q('UPDATE tokens SET used_at = ? WHERE id = ?', [now_utc(), $id]);
}

// ------------------------------------------------------------------ email
function site_url(string $path = ''): string
{
    return rtrim((string) (config()['site_url'] ?? ''), '/') . '/' . ltrim($path, '/');
}

function send_mail(string $to, string $subject, string $body): bool
{
    $m = config()['mail'] ?? [];
    $fromEmail = (string) ($m['from_email'] ?? 'no-reply@localhost');
    $fromName = (string) ($m['from_name'] ?? 'Rehohub');
    $body .= "\n\n--\nRehohub · " . site_url() . "\nYou received this email because of activity on your Rehohub account. If this wasn't you, you can ignore it.";
    $transport = $m['transport'] ?? 'mail';
    try {
        if ($transport === 'log' && is_dev()) {
            // Development only: write the email to a file instead of sending it.
            $file = (string) ($m['log_file'] ?? sys_get_temp_dir() . '/rehohub-mail.log');
            file_put_contents($file, json_encode(['to' => $to, 'subject' => $subject, 'body' => $body]) . "\n", FILE_APPEND | LOCK_EX);
            return true;
        }
        if ($transport === 'smtp') {
            return smtp_send($m, $fromEmail, $fromName, $to, $subject, $body);
        }
        $headers = [
            'From: ' . mime_name($fromName) . " <$fromEmail>",
            'Reply-To: ' . $fromEmail,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
        ];
        return mail($to, mime_name($subject), $body, implode("\r\n", $headers), '-f' . $fromEmail);
    } catch (Throwable $e) {
        error_log('Rehohub API: email failed: ' . $e->getMessage());
        return false;
    }
}

function mime_name(string $s): string
{
    return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/** Minimal SMTP client (SSL on 465, or STARTTLS on 587) with AUTH LOGIN. */
function smtp_send(array $m, string $fromEmail, string $fromName, string $to, string $subject, string $body): bool
{
    $host = (string) ($m['smtp_host'] ?? '');
    $port = (int) ($m['smtp_port'] ?? 465);
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $remote = ($port === 465 ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        throw new RuntimeException("SMTP connect failed: $errstr ($errno)");
    }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $out;
    };
    $cmd = function (string $c, array $okCodes) use ($fp, $read): string {
        if ($c !== '') {
            fwrite($fp, $c . "\r\n");
        }
        $resp = $read();
        if (!in_array((int) substr($resp, 0, 3), $okCodes, true)) {
            throw new RuntimeException('SMTP error after ' . explode(' ', $c)[0] . ': ' . trim($resp));
        }
        return $resp;
    };
    $ehloHost = parse_url(site_url(), PHP_URL_HOST) ?: 'localhost';
    $cmd('', [220]);
    $cmd("EHLO $ehloHost", [250]);
    if ($port !== 465) {
        $cmd('STARTTLS', [220]);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('SMTP STARTTLS failed');
        }
        $cmd("EHLO $ehloHost", [250]);
    }
    $cmd('AUTH LOGIN', [334]);
    $cmd(base64_encode((string) ($m['smtp_user'] ?? '')), [334]);
    $cmd(base64_encode((string) ($m['smtp_pass'] ?? '')), [235]);
    $cmd("MAIL FROM:<$fromEmail>", [250]);
    $cmd("RCPT TO:<$to>", [250, 251]);
    $cmd('DATA', [354]);
    $headers = implode("\r\n", [
        'Date: ' . date('r'),
        'From: ' . mime_name($fromName) . " <$fromEmail>",
        "To: <$to>",
        'Subject: ' . mime_name($subject),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $ehloHost . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ]);
    $data = $headers . "\r\n\r\n" . rtrim(chunk_split(base64_encode($body), 76, "\r\n")) . "\r\n.";
    $cmd($data, [250]);
    $cmd('QUIT', [221]);
    fclose($fp);
    return true;
}
