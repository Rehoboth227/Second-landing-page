<?php
/*
 * GreenFed: households, health records, meal plans, grocery orders, staff work, communities.
 * Included by api/index.php. Uses the shared Rehohub accounts: a GreenFed "customer" orders,
 * an approved "employee" (nutritionist, supply manager, quality assurance, packaging & delivery,
 * health specialist or supplier) works the orders, and GreenFed administrators run the company.
 *
 * Money: prices are set by administrators (gf_settings, gf_items) and worked out here, never in
 * the browser. Customers pay by bank transfer to the GreenFed account; an administrator confirms
 * the money arrived before staff start. Nutritionists are paid per delivered meal plan (counted
 * here, paid outside the app, then marked paid); other staff are salaried or contracted outside
 * the app, so their work meter only counts tasks.
 */
declare(strict_types=1);

const GF_ALLERGENS = ['Milk', 'Egg', 'Wheat', 'Peanuts', 'Fish', 'Soy'];
const GF_MEALS = ['Breakfast', 'Brunch', 'Lunch', 'Snacks', 'Dinner'];
const GF_CATS = ['Fruits', 'Veges', 'Snacks', 'Breads', 'Drinks', 'Proteins', 'Grains'];
const GF_SLOTS = ['Monday, 10:00–12:00', 'Wednesday, 14:00–16:00', 'Friday, 14:00–16:00', 'Saturday, 10:00–12:00'];
const GF_EMP = [
    'nutritionist' => 'nutritionist', 'supply_manager' => 'supply', 'quality_assurance' => 'qa',
    'packaging_delivery' => 'delivery', 'health_specialist' => 'health', 'supplier' => 'supplier',
];
const GF_EMP_NAME = ['nutritionist' => 'Nutritionist', 'supply' => 'Supply manager', 'qa' => 'Quality assurance',
    'delivery' => 'Packaging & delivery', 'health' => 'Health specialist', 'supplier' => 'Supplier'];
const GF_PREFS = ['email' => true, 'push' => true, 'promos' => true, 'community' => true, 'dark' => false];

// ------------------------------------------------------------------ helpers
function gf_settings(): array
{
    $out = [];
    foreach (q('SELECT k, v FROM gf_settings')->fetchAll() as $r) {
        $out[$r['k']] = $r['v'];
    }
    return [
        'plan_price' => (int) ($out['plan_price'] ?? 25000), 'nutritionist_rate' => (int) ($out['nutritionist_rate'] ?? 0),
        'bank' => ['bank_name' => $out['bank_name'] ?? '', 'account_name' => $out['account_name'] ?? '', 'account_number' => $out['account_number'] ?? ''],
    ];
}

/** GreenFed sides this account may use: user (customer), employee, admin. Plus the employee type. */
function gf_access(int $uid): array
{
    $roles = [];
    $type = null;
    foreach (q("SELECT role, details FROM memberships WHERE user_id = ? AND product = 'greenfed' AND status = 'approved'", [$uid])->fetchAll() as $m) {
        if ($m['role'] === 'customer') $roles[] = 'user';
        if ($m['role'] === 'employee') {
            $d = $m['details'] ? (json_decode($m['details'], true) ?: []) : [];
            $type = GF_EMP[$d['employee_type'] ?? ''] ?? null;
            if ($type) $roles[] = 'employee';
        }
        if ($m['role'] === 'admin') $roles[] = 'admin';
    }
    if (in_array('greenfed', admin_products($uid), true) && !in_array('admin', $roles, true)) $roles[] = 'admin';
    return ['roles' => array_values(array_unique($roles)), 'type' => $type];
}

function gf_require(string $role): array
{
    $u = require_user();
    $a = gf_access((int) $u['id']);
    if (!in_array($role, $a['roles'], true)) {
        fail(403, 'forbidden', 'Your account does not have GreenFed ' . ($role === 'user' ? 'customer' : $role) . ' access.');
    }
    return [$u, $a];
}

function gf_list(mixed $v, array $allowed): array
{
    return array_values(array_intersect($allowed, array_map('strval', is_array($v) ? $v : [])));
}

function gf_csv(?string $s): array
{
    return $s ? array_values(array_filter(array_map('trim', explode(',', $s)))) : [];
}

function gf_note(int $uid, string $cat, string $title, string $body, string $link = ''): void
{
    q('INSERT INTO gf_notes (user_id, cat, title, body, link) VALUES (?, ?, ?, ?, ?)', [$uid, $cat, mb_substr($title, 0, 120), mb_substr($body, 0, 300), $link ?: null]);
}

function gf_admins(): array
{
    return array_map('intval', array_column(q("SELECT DISTINCT user_id FROM memberships WHERE status = 'approved' AND ((product = 'greenfed' AND role = 'admin') OR (product = 'rehohub' AND role = 'admin'))")->fetchAll(), 'user_id'));
}

function gf_profile(int $uid): array
{
    q('INSERT IGNORE INTO gf_profiles (user_id) VALUES (?)', [$uid]);
    return row('SELECT * FROM gf_profiles WHERE user_id = ?', [$uid]);
}

function gf_ensure_self(array $u): void
{
    if (!row("SELECT 1 FROM gf_members WHERE user_id = ? AND rel = 'You'", [(int) $u['id']])) {
        q("INSERT INTO gf_members (user_id, name, rel) VALUES (?, ?, 'You')", [(int) $u['id'], $u['full_name']]);
    } else {
        q("UPDATE gf_members SET name = ? WHERE user_id = ? AND rel = 'You'", [$u['full_name'], (int) $u['id']]);
    }
}

function gf_item_price(array $it): int
{
    return (int) round($it['price'] * (100 - (int) $it['discount']) / 100);
}

function gf_item_out(array $it): array
{
    return ['id' => $it['slug'], 'name' => $it['name'], 'cat' => $it['cat'], 'price' => (int) $it['price'], 'unit' => $it['unit'],
        'al' => gf_csv($it['allergens']), 'pop' => (bool) $it['popular'], 'off' => (int) $it['discount'] > 0, 'disc' => (int) $it['discount'],
        'neu' => (bool) $it['is_new'], 'active' => (bool) $it['active'], 'now' => gf_item_price($it)];
}

function gf_ms(?string $t): ?int
{
    return $t ? strtotime($t . ' UTC') * 1000 : null;
}

/** One order as the app shows it. $mine: the viewer is the customer. */
function gf_order_out(array $o, bool $mine, int $viewer = 0): array
{
    $staff = [];
    $staffMine = [];
    foreach (($o['staff'] ? (json_decode($o['staff'], true) ?: []) : []) as $k => $s) {
        $staff[$k] = $s['name'] ?? '';
        if ($viewer && (int) ($s['id'] ?? 0) === $viewer) $staffMine[] = $k;
    }
    $members = $o['members'] ? (json_decode($o['members'], true) ?: []) : [];
    $out = [
        'id' => (string) $o['id'], 'kind' => $o['kind'], 'status' => $o['status'], 'name' => $o['name'] ?: 'Grocery order',
        'members' => array_map(fn ($m) => 'm' . $m['id'], $members), 'memberNames' => array_column($members, 'name'),
        'persons' => (int) $o['persons'], 'weeks' => (int) $o['weeks'], 'meals' => gf_csv($o['meals']), 'allergies' => gf_csv($o['allergies']),
        'info' => (string) $o['info'], 'price' => (int) $o['total'], 'total' => (int) $o['total'],
        'items' => array_map(fn ($i) => [$i[0], (int) $i[1], (int) $i[2], $i[3]], $o['items'] ? (json_decode($o['items'], true) ?: []) : []),
        'address' => (string) $o['address'], 'slot' => (string) $o['slot'], 'weekly' => (bool) $o['weekly'],
        'staff' => $staff, 'staffMine' => $staffMine, 'gathered' => (bool) $o['gathered'], 'passed' => (bool) $o['passed'], 'supplied' => (bool) $o['supplied'],
        'days' => $o['days'] ? json_decode($o['days'], true) : null, 'review' => $o['review'] ? json_decode($o['review'], true) : null,
        'reviews' => $o['stage_rates'] ? (json_decode($o['stage_rates'], true) ?: []) : (object) [], 'fav' => (bool) $o['fav'],
        'note' => (string) $o['note'], 'paySender' => (string) $o['pay_sender'], 'payBank' => (string) $o['pay_bank'],
        'created' => gf_ms($o['created_at']),
        'history' => array_map(fn ($e) => [$e['status'], gf_ms($e['created_at'])], q('SELECT status, created_at FROM gf_events WHERE order_id = ? ORDER BY id', [(int) $o['id']])->fetchAll()),
    ];
    if (!$mine) {
        $out['owner'] = row('SELECT full_name FROM users WHERE id = ?', [(int) $o['user_id']])['full_name'] ?? 'Customer';
    }
    return $out;
}

function gf_event(int $id, string $st): void
{
    q('INSERT INTO gf_events (order_id, status) VALUES (?, ?)', [$id, $st]);
}

function gf_task(int $uid, string $type, ?int $order, string $what): void
{
    q('INSERT INTO gf_tasks (user_id, emp_type, order_id, what) VALUES (?, ?, ?, ?)', [$uid, $type, $order, $what]);
}

// ------------------------------------------------------------------ communities
function gf_can_moderate(int $uid, array $c): bool
{
    return ($c['created_by'] !== null && (int) $c['created_by'] === $uid) || in_array('admin', gf_access($uid)['roles'], true);
}

function gf_communities_out(int $uid, bool $admin): array
{
    $rows = q("SELECT c.*, (SELECT COUNT(*) FROM gf_comm_members m WHERE m.community_id = c.id AND m.status = 'member') members,
                      (SELECT status FROM gf_comm_members m WHERE m.community_id = c.id AND m.user_id = ?) mine,
                      u.full_name creator,
                      (SELECT title FROM gf_posts p WHERE p.community_id = c.id ORDER BY p.id DESC LIMIT 1) last,
                      (SELECT created_at FROM gf_posts p WHERE p.community_id = c.id ORDER BY p.id DESC LIMIT 1) last_at
               FROM gf_communities c LEFT JOIN users u ON u.id = c.created_by ORDER BY c.id", [$uid])->fetchAll();
    return array_map(function ($c) use ($uid, $admin) {
        $mod = ($c['created_by'] !== null && (int) $c['created_by'] === $uid) || $admin;
        $out = ['id' => 'c' . $c['id'], 'name' => $c['name'], 'cat' => $c['cat'], 'desc' => $c['descr'], 'members' => (int) $c['members'],
            'pub' => (bool) $c['pub'], 'perms' => $c['perms'], 'joined' => $c['mine'] === 'member', 'pending' => $c['mine'] === 'pending',
            'by' => $c['creator'] ?: 'GreenFed', 'mod' => $mod,
            'last' => $c['last'] ?: ((bool) $c['pub'] || $c['mine'] === 'member' ? 'No posts yet' : 'Members only'), 'lastAt' => gf_ms($c['last_at'] ?? $c['created_at'])];
        if ($mod && !$c['pub']) {
            $out['requests'] = array_map(fn ($r) => ['id' => (int) $r['user_id'], 'name' => $r['full_name']],
                q("SELECT m.user_id, u.full_name FROM gf_comm_members m JOIN users u ON u.id = m.user_id WHERE m.community_id = ? AND m.status = 'pending'", [(int) $c['id']])->fetchAll());
        }
        return $out;
    }, $rows);
}

/** Posts the viewer may read: public communities, and private ones they belong to. */
function gf_posts_out(int $uid, bool $all): array
{
    $posts = q("SELECT p.*, u.full_name FROM gf_posts p JOIN users u ON u.id = p.user_id JOIN gf_communities c ON c.id = p.community_id
                WHERE ? OR c.pub = 1 OR EXISTS (SELECT 1 FROM gf_comm_members m WHERE m.community_id = c.id AND m.user_id = ? AND m.status = 'member')
                ORDER BY p.id DESC LIMIT 300", [$all ? 1 : 0, $uid])->fetchAll();
    $out = [];
    foreach ($posts as $p) {
        $reps = q('SELECT r.*, u.full_name FROM gf_replies r JOIN users u ON u.id = r.user_id WHERE r.post_id = ? ORDER BY r.id', [(int) $p['id']])->fetchAll();
        $by = [];
        foreach ($reps as $r) {
            $by[(int) ($r['parent_id'] ?? 0)][] = $r;
        }
        $tree = function (int $parent) use (&$tree, $by) {
            return array_map(fn ($r) => ['id' => 'r' . $r['id'], 'by' => $r['full_name'], 'role' => $r['specialist'] ? 'Health specialist' : '',
                'at' => gf_ms($r['created_at']), 'body' => $r['body'], 'replies' => $tree((int) $r['id'])], $by[$parent] ?? []);
        };
        $out[] = ['id' => 'p' . $p['id'], 'c' => 'c' . $p['community_id'], 'by' => $p['full_name'], 'mine' => (int) $p['user_id'] === $uid,
            'at' => gf_ms($p['created_at']), 'title' => $p['title'], 'body' => $p['body'],
            'likes' => (int) row('SELECT COUNT(*) n FROM gf_likes WHERE post_id = ?', [(int) $p['id']])['n'],
            'liked' => (bool) row('SELECT 1 FROM gf_likes WHERE post_id = ? AND user_id = ?', [(int) $p['id'], $uid]),
            'replies' => $tree(0)];
    }
    return $out;
}

// ------------------------------------------------------------------ state for each side
function r_gf_state(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $a = gf_access($uid);
    $role = (string) ($_GET['role'] ?? '');
    if (!in_array($role, $a['roles'], true)) {
        fail(403, 'forbidden', 'Your account does not have that GreenFed access.');
    }
    $p = gf_profile($uid);
    $prefs = GF_PREFS;
    foreach (($p['prefs'] ? (json_decode($p['prefs'], true) ?: []) : []) as $k => $v) {
        if (array_key_exists($k, GF_PREFS)) $prefs[$k] = (bool) $v;
    }
    $admin = in_array('admin', $a['roles'], true);
    $set = gf_settings();
    $out = [
        'roles' => $a['roles'], 'empType' => $a['type'], 'settings' => $set + ['slots' => GF_SLOTS],
        'user' => ['address' => (string) $p['address'], 'occupation' => (string) $p['occupation'], 'marital' => (string) $p['marital'],
            'height' => (int) $p['height'], 'weight' => (int) $p['weight'], 'goal' => (string) $p['goal'], 'goalNote' => (string) $p['goal_note'], 'setupDone' => (bool) $p['setup_done']],
        'prefs' => $prefs, 'leader' => $p['leader_at'] ? ['at' => gf_ms($p['leader_at'])] : null,
        'notes' => array_map(fn ($n) => ['id' => 'n' . $n['id'], 'cat' => $n['cat'], 't' => $n['title'], 's' => $n['body'], 'link' => $n['link'] ?: '#/home',
            'read' => (bool) $n['read_at'], 'at' => gf_ms($n['created_at'])], q('SELECT * FROM gf_notes WHERE user_id = ? ORDER BY id DESC LIMIT 80', [$uid])->fetchAll()),
        'items' => array_map('gf_item_out', q('SELECT * FROM gf_items' . ($role === 'admin' ? '' : ' WHERE active = 1') . ' ORDER BY sort, name')->fetchAll()),
        'communities' => gf_communities_out($uid, $admin),
    ];
    $out['posts'] = gf_posts_out($uid, $admin);
    if ($role === 'user') {
        gf_ensure_self($u);
        $out['members'] = array_map(fn ($m) => ['id' => 'm' . $m['id'], 'name' => $m['name'], 'rel' => $m['rel'], 'age' => (int) $m['age'], 'sex' => (string) $m['sex'],
            'allergies' => gf_csv($m['allergies']), 'conditions' => gf_csv($m['conditions'])],
            q("SELECT * FROM gf_members WHERE user_id = ? ORDER BY rel = 'You' DESC, id", [$uid])->fetchAll());
        $out['records'] = array_map(fn ($r) => ['id' => 'h' . $r['id'], 'type' => $r['type'], 'name' => $r['name'], 'member' => $r['member_id'] ? 'm' . $r['member_id'] : '',
            'date' => gf_ms($r['created_at']), 'sev' => $r['sev'], 'by' => $r['recorded_by']], q('SELECT * FROM gf_records WHERE user_id = ? ORDER BY id DESC', [$uid])->fetchAll());
        $out['orders'] = array_map(fn ($o) => gf_order_out($o, true), q('SELECT * FROM gf_orders WHERE user_id = ? ORDER BY id DESC LIMIT 200', [$uid])->fetchAll());
        $out['favs'] = array_column(q('SELECT slug FROM gf_favs WHERE user_id = ?', [$uid])->fetchAll(), 'slug');
        $out['conflicts'] = array_map(fn ($c) => ['id' => (int) $c['id'], 'order' => (string) $c['order_id'], 'type' => $c['type'], 'status' => $c['status'],
            'resolution' => (string) $c['resolution'], 'at' => gf_ms($c['created_at'])], q('SELECT * FROM gf_conflicts WHERE user_id = ? ORDER BY id DESC', [$uid])->fetchAll());
    } elseif ($role === 'employee') {
        $t = $a['type'];
        $where = [
            'nutritionist' => "kind = 'plan' AND status IN ('PAID','PICKED','IN_PROGRESS','DELIVERED')",
            'supply' => "kind = 'grocery' AND status IN ('PAID','GATHERING','QA','PACKAGED','EN_ROUTE','DELIVERED')",
            'supplier' => "kind = 'grocery' AND status IN ('PAID','GATHERING')",
            'qa' => "kind = 'grocery' AND status IN ('GATHERING','QA','PACKAGED','EN_ROUTE','DELIVERED')",
            'delivery' => "kind = 'grocery' AND status IN ('QA','PACKAGED','EN_ROUTE','DELIVERED')",
            'health' => '0',
        ][$t] ?? '0';
        $out['orders'] = array_map(fn ($o) => gf_order_out($o, false, $uid), q("SELECT * FROM gf_orders WHERE $where ORDER BY id DESC LIMIT 200")->fetchAll());
        $out['emp'] = [
            'type' => $t, 'name' => GF_EMP_NAME[$t] ?? '', 'me' => $u['full_name'],
            'tasks' => (int) row('SELECT COUNT(*) n FROM gf_tasks WHERE user_id = ? AND payout_id IS NULL', [$uid])['n'],
            'allTasks' => (int) row('SELECT COUNT(*) n FROM gf_tasks WHERE user_id = ?', [$uid])['n'],
            'paid' => array_map(fn ($x) => ['amt' => (int) $x['amount'], 'tasks' => (int) $x['tasks'], 'at' => gf_ms($x['created_at'])],
                q('SELECT * FROM gf_payouts WHERE user_id = ? ORDER BY id DESC', [$uid])->fetchAll()),
            'bank' => $p['bank_acct'] ? ['bank' => $p['bank_name'], 'acct' => $p['bank_acct'], 'name' => $p['bank_holder']] : null,
            'complaints' => array_map(fn ($c) => ['id' => (int) $c['id'], 'type' => $c['type'], 'body' => $c['body'], 'status' => $c['status'], 'at' => gf_ms($c['created_at'])],
                q('SELECT * FROM gf_complaints WHERE user_id = ? ORDER BY id DESC', [$uid])->fetchAll()),
        ];
    } else {
        $out['orders'] = array_map(fn ($o) => gf_order_out($o, false), q('SELECT * FROM gf_orders ORDER BY id DESC LIMIT 300')->fetchAll());
        $staff = [];
        foreach (q("SELECT u.id, u.full_name, u.email, m.details, p.bank_name, p.bank_acct, p.bank_holder FROM memberships m JOIN users u ON u.id = m.user_id
                    LEFT JOIN gf_profiles p ON p.user_id = u.id WHERE m.product = 'greenfed' AND m.role = 'employee' AND m.status = 'approved' ORDER BY u.full_name")->fetchAll() as $s) {
            $d = $s['details'] ? (json_decode($s['details'], true) ?: []) : [];
            $type = GF_EMP[$d['employee_type'] ?? ''] ?? '';
            $tasks = (int) row('SELECT COUNT(*) n FROM gf_tasks WHERE user_id = ? AND payout_id IS NULL', [(int) $s['id']])['n'];
            $staff[] = ['id' => (int) $s['id'], 'name' => $s['full_name'], 'email' => $s['email'], 'type' => $type, 'typeName' => GF_EMP_NAME[$type] ?? '',
                'tasks' => $tasks, 'due' => $type === 'nutritionist' ? $tasks * $set['nutritionist_rate'] : null,
                'bank' => $s['bank_acct'] ? "{$s['bank_name']} {$s['bank_acct']} · {$s['bank_holder']}" : ''];
        }
        $out['staff'] = $staff;
        $out['complaints'] = array_map(fn ($c) => ['id' => (int) $c['id'], 'type' => $c['type'], 'body' => $c['body'], 'status' => $c['status'], 'by' => $c['full_name'], 'at' => gf_ms($c['created_at'])],
            q('SELECT c.*, u.full_name FROM gf_complaints c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT 200')->fetchAll());
        $out['conflicts'] = array_map(fn ($c) => ['id' => (int) $c['id'], 'order' => (string) $c['order_id'], 'type' => $c['type'], 'status' => $c['status'],
            'resolution' => (string) $c['resolution'], 'by' => $c['full_name'], 'at' => gf_ms($c['created_at'])],
            q('SELECT c.*, u.full_name FROM gf_conflicts c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC LIMIT 200')->fetchAll());
        $out['leaders'] = array_map(fn ($l) => ['name' => $l['full_name'], 'email' => $l['email'], 'at' => gf_ms($l['leader_at'])],
            q('SELECT u.full_name, u.email, p.leader_at FROM gf_profiles p JOIN users u ON u.id = p.user_id WHERE p.leader_at IS NOT NULL ORDER BY p.leader_at DESC')->fetchAll());
    }
    ok($out);
}

// ------------------------------------------------------------------ customer: profile, household, records
function gf_clean_member(array $in): array
{
    $m = ['name' => sub_in($in, 'name', 80), 'rel' => sub_in($in, 'rel', 20), 'sex' => sub_in($in, 'sex', 10),
        'age' => is_numeric($in['age'] ?? null) ? max(0, min(120, (int) $in['age'])) : null,
        'allergies' => implode(',', gf_list($in['allergies'] ?? [], GF_ALLERGENS)),
        'conditions' => implode(',', array_slice(array_filter(array_map(fn ($c) => is_string($c) ? mb_substr(trim(str_replace(',', ' ', $c)), 0, 60) : '', (array) ($in['conditions'] ?? []))), 0, 5))];
    return $m;
}

function r_gf_profile(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $roles = gf_access($uid)['roles'];
    if (!$roles) fail(403, 'forbidden', 'Your account does not have GreenFed access.');
    $in = input();
    // Staff and administrators only keep notification settings here; the household belongs to customers.
    if (!in_array('user', $roles, true)) $in = array_intersect_key($in, ['prefs' => 1]);
    gf_profile($uid);
    if (in_array('user', $roles, true)) gf_ensure_self($u);
    $sets = [];
    $vals = [];
    foreach (['address' => 200, 'occupation' => 80, 'marital' => 30, 'goal' => 120, 'goal_note' => 300] as $k => $max) {
        $key = $k === 'goal_note' ? 'goalNote' : $k;
        if (array_key_exists($key, $in)) {
            $sets[] = "$k = ?";
            $vals[] = sub_in($in, $key, $max) ?: null;
        }
    }
    foreach (['height' => 260, 'weight' => 400] as $k => $max) {
        if (array_key_exists($k, $in)) {
            $sets[] = "$k = ?";
            $vals[] = is_numeric($in[$k]) && (int) $in[$k] > 0 ? min($max, (int) $in[$k]) : null;
        }
    }
    if (!empty($in['setup'])) {
        $sets[] = 'setup_done = 1';
    }
    if (isset($in['prefs']) && is_array($in['prefs'])) {
        $prefs = GF_PREFS;
        $cur = row('SELECT prefs FROM gf_profiles WHERE user_id = ?', [$uid])['prefs'];
        foreach (array_merge($cur ? (json_decode($cur, true) ?: []) : [], $in['prefs']) as $k => $v) {
            if (array_key_exists($k, GF_PREFS)) $prefs[$k] = (bool) $v;
        }
        $sets[] = 'prefs = ?';
        $vals[] = json_encode($prefs);
    }
    if ($sets) {
        $vals[] = $uid;
        q('UPDATE gf_profiles SET ' . implode(', ', $sets) . ' WHERE user_id = ?', $vals);
    }
    // The account holder's own details (age, sex, allergies, conditions) live on their household member.
    $me = [];
    foreach (['age', 'sex', 'allergies', 'conditions'] as $k) {
        if (array_key_exists($k, $in)) $me[$k] = true;
    }
    if ($me) {
        $m = gf_clean_member($in + ['name' => $u['full_name'], 'rel' => 'You']);
        $cols = array_keys($me);
        q('UPDATE gf_members SET ' . implode(', ', array_map(fn ($c) => "$c = ?", $cols)) . " WHERE user_id = ? AND rel = 'You'",
            array_merge(array_map(fn ($c) => $m[$c], $cols), [$uid]));
    }
    ok(['message' => 'Saved.']);
}

function r_gf_member(): never
{
    [$u] = gf_require('user');
    $uid = (int) $u['id'];
    $in = input();
    if (!empty($in['delete'])) {
        q("DELETE FROM gf_members WHERE id = ? AND user_id = ? AND rel <> 'You'", [(int) preg_replace('/\D/', '', (string) $in['delete']), $uid]);
        ok(['message' => 'Family member removed']);
    }
    $m = gf_clean_member($in);
    if (mb_strlen($m['name']) < 2) fail(422, 'invalid', 'Enter a name.', ['name' => 'Enter a name.']);
    if ($m['age'] === null) fail(422, 'invalid', 'Enter an age.', ['age' => 'Enter an age.']);
    if (!in_array($m['rel'], ['Spouse', 'Husband', 'Wife', 'Child', 'Son', 'Daughter', 'Parent', 'Mother', 'Father', 'Sibling', 'Relative', 'Other'], true)) $m['rel'] = 'Other';
    if ((int) row('SELECT COUNT(*) n FROM gf_members WHERE user_id = ?', [$uid])['n'] >= 20) fail(422, 'invalid', 'A household can have up to 20 people.');
    q('INSERT INTO gf_members (user_id, name, rel, age, sex, allergies, conditions) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$uid, $m['name'], $m['rel'], $m['age'], $m['sex'], $m['allergies'] ?: null, $m['conditions'] ?: null]);
    ok(['message' => 'Family member added']);
}

function r_gf_record(): never
{
    [$u] = gf_require('user');
    $uid = (int) $u['id'];
    $in = input();
    if (!empty($in['delete'])) {
        q('DELETE FROM gf_records WHERE id = ? AND user_id = ?', [(int) preg_replace('/\D/', '', (string) $in['delete']), $uid]);
        ok(['message' => 'Record deleted']);
    }
    $type = str_in('type', 20);
    $name = str_in('name', 120);
    $sev = str_in('sev', 10);
    $mid = (int) preg_replace('/\D/', '', str_in('member', 12));
    if (!in_array($type, ['Allergy', 'Diagnosis', 'Family history', 'Symptom', 'Medication', 'DNA test'], true)) fail(422, 'invalid', 'Choose a record type.');
    if (mb_strlen($name) < 2) fail(422, 'invalid', 'Enter a name for the record.', ['name' => 'Enter a name for the record.']);
    if (!in_array($sev, ['Mild', 'Moderate', 'Severe'], true)) $sev = 'Mild';
    $mem = $mid ? row('SELECT * FROM gf_members WHERE id = ? AND user_id = ?', [$mid, $uid]) : null;
    if (!$mem) fail(422, 'invalid', 'Choose who the record is for.');
    q('INSERT INTO gf_records (user_id, member_id, type, name, sev, recorded_by) VALUES (?, ?, ?, ?, ?, ?)', [$uid, $mid, $type, $name, $sev, str_in('by', 80) ?: 'Self-reported']);
    if ($type === 'Allergy') {
        foreach (GF_ALLERGENS as $al) {
            if (stripos($name, rtrim($al, 's')) !== false) {
                $list = gf_csv($mem['allergies']);
                if (!in_array($al, $list, true)) {
                    $list[] = $al;
                    q('UPDATE gf_members SET allergies = ? WHERE id = ?', [implode(',', $list), $mid]);
                }
            }
        }
    }
    ok(['message' => 'Record added']);
}

function r_gf_fav(): never
{
    [$u] = gf_require('user');
    $slug = str_in('item', 30);
    if (!row('SELECT 1 FROM gf_items WHERE slug = ?', [$slug])) fail(404, 'not_found', 'Item not found.');
    if (row('SELECT 1 FROM gf_favs WHERE user_id = ? AND slug = ?', [(int) $u['id'], $slug])) {
        q('DELETE FROM gf_favs WHERE user_id = ? AND slug = ?', [(int) $u['id'], $slug]);
    } else {
        q('INSERT INTO gf_favs (user_id, slug) VALUES (?, ?)', [(int) $u['id'], $slug]);
    }
    ok();
}

// ------------------------------------------------------------------ customer: orders and payment
function r_gf_order(): never
{
    [$u] = gf_require('user');
    $uid = (int) $u['id'];
    rate_limit('gf-order:' . $uid, 30, 3600);
    $in = input();
    $kind = str_in('kind', 10);
    $set = gf_settings();
    if ($kind === 'plan') {
        $ids = array_map(fn ($x) => (int) preg_replace('/\D/', '', (string) $x), (array) ($in['members'] ?? []));
        $mem = $ids ? q('SELECT id, name FROM gf_members WHERE user_id = ? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$uid], $ids))->fetchAll() : [];
        $meals = gf_list($in['meals'] ?? [], GF_MEALS);
        $weeks = (int) ($in['weeks'] ?? 1);
        if (!$mem) fail(422, 'invalid', 'Choose who the plan is for.');
        if (!$meals) fail(422, 'invalid', 'Choose at least one meal.');
        if (!in_array($weeks, [1, 2, 4], true)) $weeks = 1;
        $total = count($mem) * $weeks * $set['plan_price'];
        q("INSERT INTO gf_orders (user_id, kind, name, members, persons, weeks, meals, allergies, info, total) VALUES (?, 'plan', ?, ?, ?, ?, ?, ?, ?, ?)", [
            $uid, str_in('name', 80) ?: 'My plan', json_encode(array_map(fn ($m) => ['id' => (int) $m['id'], 'name' => $m['name']], $mem)), count($mem), $weeks,
            implode(',', $meals), implode(',', gf_list($in['allergies'] ?? [], GF_ALLERGENS)) ?: null, str_in('info', 600) ?: null, $total,
        ]);
    } elseif ($kind === 'grocery') {
        $want = [];
        foreach (array_slice((array) ($in['items'] ?? []), 0, 60) as $it) {
            if (is_array($it) && isset($it[0], $it[1]) && (int) $it[1] > 0) $want[(string) $it[0]] = min(50, (int) $it[1]);
        }
        if (!$want) fail(422, 'invalid', 'Your cart is empty.');
        $rows = q('SELECT * FROM gf_items WHERE active = 1 AND slug IN (' . implode(',', array_fill(0, count($want), '?')) . ')', array_keys($want))->fetchAll();
        if (count($rows) !== count($want)) fail(409, 'unavailable', 'Some items are no longer available. Please check your cart.');
        $items = [];
        $total = 0;
        foreach ($rows as $it) {
            $p = gf_item_price($it);
            $items[] = [$it['slug'], $want[$it['slug']], $p, $it['name']];
            $total += $p * $want[$it['slug']];
        }
        $addr = str_in('address', 200);
        $slot = str_in('slot', 40);
        if (mb_strlen($addr) < 5) fail(422, 'invalid', 'Enter a delivery address.', ['address' => 'Enter a delivery address.']);
        if (!in_array($slot, GF_SLOTS, true)) fail(422, 'invalid', 'Choose a delivery slot.');
        q("INSERT INTO gf_orders (user_id, kind, items, total, address, slot, weekly) VALUES (?, 'grocery', ?, ?, ?, ?, ?)",
            [$uid, json_encode($items), $total, $addr, $slot, !empty($in['weekly']) ? 1 : 0]);
    } else {
        fail(422, 'invalid', 'Unknown order type.');
    }
    $id = (int) db()->lastInsertId();
    gf_event($id, 'AWAITING_PAYMENT');
    ok(['id' => (string) $id, 'order' => gf_order_out(row('SELECT * FROM gf_orders WHERE id = ?', [$id]), true)]);
}

/** What a customer can do with their own order. */
function r_gf_order_act(): never
{
    [$u] = gf_require('user');
    $uid = (int) $u['id'];
    rate_limit('gf-oact:' . $uid, 120, 3600);
    $id = (int) preg_replace('/\D/', '', str_in('id', 12));
    $o = $id ? row('SELECT * FROM gf_orders WHERE id = ? AND user_id = ?', [$id, $uid]) : null;
    if (!$o) fail(404, 'not_found', 'Order not found.');
    $action = str_in('action', 12);
    $msg = 'Saved.';
    if ($action === 'paid') {
        if ($o['status'] !== 'AWAITING_PAYMENT') fail(409, 'state', 'This order is not waiting for payment.');
        $sender = str_in('sender', 120);
        $bank = str_in('bank', 80);
        if (mb_strlen($sender) < 2 || mb_strlen($bank) < 2) fail(422, 'invalid', 'Enter the name and bank you paid from.', ['sender' => 'Enter the name on your account.']);
        q("UPDATE gf_orders SET status = 'PAYMENT_SENT', pay_sender = ?, pay_bank = ? WHERE id = ?", [$sender, $bank, $id]);
        gf_event($id, 'PAYMENT_SENT');
        foreach (gf_admins() as $a) {
            gf_note($a, 'Payment', 'Payment to confirm', "{$u['full_name']} says they paid NGN " . number_format((int) $o['total']) . " from $sender ($bank).", '#/admin');
        }
        $to = (string) (config()['admin_notify_email'] ?? '');
        if ($to !== '' && valid_email($to)) {
            $b = gf_settings()['bank'];
            send_mail($to, 'GreenFed payment to confirm', "{$u['full_name']} ({$u['email']}) says they transferred NGN " . number_format((int) $o['total']) .
                " for a GreenFed " . ($o['kind'] === 'plan' ? 'meal plan' : 'grocery order') . ".\nFrom: $sender ($bank)\nTo: {$b['bank_name']} {$b['account_number']}\n\nConfirm it in the admin console → Payments to confirm: " . site_url('account/admin.html#payments'));
        }
        $msg = 'Thanks. We are confirming your payment.';
    } elseif ($action === 'cancel') {
        if (!in_array($o['status'], ['AWAITING_PAYMENT', 'PAYMENT_SENT'], true)) fail(409, 'state', 'This order is already being prepared. Contact GreenFed to cancel.');
        q("UPDATE gf_orders SET status = 'CANCELLED' WHERE id = ?", [$id]);
        gf_event($id, 'CANCELLED');
        $msg = 'Order cancelled.';
    } elseif ($action === 'fav') {
        q('UPDATE gf_orders SET fav = 1 - fav WHERE id = ?', [$id]);
    } elseif ($action === 'review') {
        if ($o['kind'] !== 'plan' || $o['status'] !== 'DELIVERED') fail(409, 'state', 'You can review a plan once it is delivered.');
        q('UPDATE gf_orders SET review = ? WHERE id = ?', [json_encode(['stars' => max(1, min(5, int_in('stars'))), 'note' => str_in('note', 500)]), $id]);
        $msg = 'Thanks for your review';
    } elseif ($action === 'rate') {
        $stage = str_in('stage', 12);
        if (!in_array($stage, ['GATHERING', 'QA', 'PACKAGED', 'EN_ROUTE', 'DELIVERED'], true) || !row('SELECT 1 FROM gf_events WHERE order_id = ? AND status = ?', [$id, $stage])) fail(409, 'state', 'You can rate a stage once it has happened.');
        $r = $o['stage_rates'] ? (json_decode($o['stage_rates'], true) ?: []) : [];
        $r[$stage] = max(1, min(5, int_in('stars')));
        q('UPDATE gf_orders SET stage_rates = ? WHERE id = ?', [json_encode($r), $id]);
    } elseif ($action === 'conflict') {
        $type = str_in('type', 30);
        if (!in_array($type, ['Late delivery', 'Poor quality'], true)) fail(422, 'invalid', 'Choose what went wrong.');
        if (row("SELECT 1 FROM gf_conflicts WHERE order_id = ? AND type = ? AND status = 'OPEN'", [$id, $type])) fail(409, 'state', 'You have already reported this.');
        q('INSERT INTO gf_conflicts (order_id, user_id, type) VALUES (?, ?, ?)', [$id, $uid, $type]);
        foreach (gf_admins() as $a) {
            gf_note($a, 'Conflict', "$type reported", "{$u['full_name']} reported $type on order #$id.", '#/admin/conflicts');
        }
        $msg = 'Reported. Our conflict manager will follow up.';
    } else {
        fail(422, 'invalid', 'Unknown action.');
    }
    ok(['message' => $msg]);
}

// ------------------------------------------------------------------ staff work
function r_gf_work(): never
{
    [$u, $a] = gf_require('employee');
    $uid = (int) $u['id'];
    $type = $a['type'];
    rate_limit('gf-work:' . $uid, 400, 3600);
    $id = (int) preg_replace('/\D/', '', str_in('id', 12));
    $action = str_in('action', 12);
    $pdo = db();
    $pdo->beginTransaction();
    $o = $id ? row('SELECT * FROM gf_orders WHERE id = ? FOR UPDATE', [$id]) : null;
    if (!$o) {
        $pdo->rollBack();
        fail(404, 'not_found', 'Order not found.');
    }
    $staff = $o['staff'] ? (json_decode($o['staff'], true) ?: []) : [];
    $mineAs = fn (string $k) => isset($staff[$k]) && (int) $staff[$k]['id'] === $uid;
    $bad = function (string $m) use ($pdo) {
        $pdo->rollBack();
        fail(409, 'state', $m);
    };
    $cust = (int) $o['user_id'];
    $label = $o['kind'] === 'plan' ? strtoupper((string) $o['name']) . ' meal plan' : 'grocery order #' . $id;
    $set = function (string $st, ?string $staffKey = null) use ($id, &$staff, $uid, $u) {
        if ($staffKey) {
            $staff[$staffKey] = ['id' => $uid, 'name' => $u['full_name']];
            q('UPDATE gf_orders SET staff = ? WHERE id = ?', [json_encode($staff), $id]);
        }
        q('UPDATE gf_orders SET status = ? WHERE id = ?', [$st, $id]);
        gf_event($id, $st);
    };
    $active = function (string $k, array $sts) use ($uid) {
        foreach (q('SELECT staff FROM gf_orders WHERE status IN (' . implode(',', array_fill(0, count($sts), '?')) . ')', $sts)->fetchAll() as $r) {
            $s = $r['staff'] ? (json_decode($r['staff'], true) ?: []) : [];
            if (isset($s[$k]) && (int) $s[$k]['id'] === $uid) return true;
        }
        return false;
    };
    $note = '';
    switch ("$type:$action") {
        case 'nutritionist:pick':
            if ($o['kind'] !== 'plan' || $o['status'] !== 'PAID') $bad('Another nutritionist has already picked this plan.');
            if ($active('nutritionist', ['PICKED', 'IN_PROGRESS'])) $bad('Finish your current plan first.');
            $set('PICKED', 'nutritionist');
            $note = "Your $label was picked by {$u['full_name']}.";
            break;
        case 'nutritionist:start':
            if (!$mineAs('nutritionist') || $o['status'] !== 'PICKED') $bad('This plan is not yours to start.');
            $set('IN_PROGRESS');
            $note = "Your $label is being prepared by {$u['full_name']}.";
            break;
        case 'nutritionist:deliver':
            if (!$mineAs('nutritionist') || $o['status'] !== 'IN_PROGRESS') $bad('This plan is not ready to deliver.');
            $days = input()['days'] ?? null;
            $clean = [];
            if (is_array($days) && count($days) === 7) {
                foreach ($days as $day) {
                    $row = [];
                    foreach (array_slice(is_array($day) ? $day : [], 0, 5) as $m) {
                        $meal = is_array($m) ? sub_in($m, 'meal', 20) : '';
                        if (!in_array($meal, GF_MEALS, true)) continue;
                        $row[] = ['meal' => $meal, 'dish' => sub_in($m, 'dish', 300), 'items' => array_slice(array_values(array_filter((array) ($m['items'] ?? []), 'is_string')), 0, 8)];
                    }
                    $clean[] = $row;
                }
            }
            if (count($clean) !== 7 || in_array([], $clean, true)) $bad('Fill in all 7 days before delivering the plan.');
            q('UPDATE gf_orders SET days = ? WHERE id = ?', [json_encode($clean), $id]);
            $set('DELIVERED');
            gf_task($uid, 'nutritionist', $id, 'Meal plan delivered');
            $note = "Your $label is ready. Open it in GreenFed.";
            break;
        case 'supply:pick':
            if ($o['kind'] !== 'grocery' || $o['status'] !== 'PAID') $bad('This order has already been picked.');
            if ($active('supply', ['GATHERING']) && false) $bad('');
            $set('GATHERING', 'supply');
            $note = "Your $label is being gathered.";
            break;
        case 'supply:gathered':
            if (!$mineAs('supply') || $o['status'] !== 'GATHERING' || $o['gathered']) $bad('This order is not yours to update.');
            q('UPDATE gf_orders SET gathered = 1 WHERE id = ?', [$id]);
            gf_task($uid, 'supply', $id, 'Order gathered');
            break;
        case 'qa:pick':
            if ($o['status'] !== 'GATHERING' || !$o['gathered']) $bad('This order is not ready for quality check.');
            $set('QA', 'qa');
            $note = "Your $label is in quality assurance.";
            break;
        case 'qa:passed':
            if (!$mineAs('qa') || $o['status'] !== 'QA' || $o['passed']) $bad('This order is not yours to check.');
            q('UPDATE gf_orders SET passed = 1 WHERE id = ?', [$id]);
            gf_task($uid, 'qa', $id, 'Quality check passed');
            break;
        case 'delivery:pick':
            if ($o['status'] !== 'QA' || !$o['passed']) $bad('This order has not passed quality check yet.');
            $set('PACKAGED', 'delivery');
            $note = "Your $label is packaged.";
            break;
        case 'delivery:out':
            if (!$mineAs('delivery') || $o['status'] !== 'PACKAGED') $bad('This order is not yours to send.');
            $set('EN_ROUTE');
            $note = "Your $label is on the move for delivery.";
            break;
        case 'delivery:delivered':
            if (!$mineAs('delivery') || $o['status'] !== 'EN_ROUTE') $bad('This order is not on the way yet.');
            $set('DELIVERED');
            gf_task($uid, 'delivery', $id, 'Order delivered');
            $note = "Your $label was delivered. Rate each stage from your order page.";
            break;
        case 'supplier:supplied':
            if ($o['kind'] !== 'grocery' || $o['supplied'] || !in_array($o['status'], ['PAID', 'GATHERING'], true)) $bad('This order does not need supplies now.');
            $staff['supplier'] = ['id' => $uid, 'name' => $u['full_name']];
            q('UPDATE gf_orders SET supplied = 1, staff = ? WHERE id = ?', [json_encode($staff), $id]);
            gf_task($uid, 'supplier', $id, 'Items supplied');
            break;
        default:
            $bad('You cannot do that.');
    }
    $pdo->commit();
    if ($note) gf_note($cust, $o['kind'] === 'plan' ? 'Meal Plan' : 'Grocery', $note, "Hi, $note", '#/orders/' . $id);
    ok(['message' => 'Updated.']);
}

function r_gf_salary(): never
{
    [$u] = gf_require('employee');
    $acct = preg_replace('/\D/', '', str_in('acct', 20)) ?? '';
    if (!preg_match('/^\d{10}$/', $acct)) fail(422, 'invalid', 'Account numbers have 10 digits.');
    if (mb_strlen(str_in('name', 120)) < 2) fail(422, 'invalid', "Enter the account holder's name.");
    gf_profile((int) $u['id']);
    q('UPDATE gf_profiles SET bank_name = ?, bank_acct = ?, bank_holder = ? WHERE user_id = ?', [str_in('bank', 80), $acct, str_in('name', 120), (int) $u['id']]);
    ok(['message' => 'Payment details saved']);
}

function r_gf_complaint(): never
{
    [$u] = gf_require('employee');
    rate_limit('gf-comp:' . $u['id'], 20, 3600);
    $type = str_in('type', 40);
    $body = str_in('body', 1000);
    if (mb_strlen($body) < 5) fail(422, 'invalid', 'Add some details.');
    q('INSERT INTO gf_complaints (user_id, type, body) VALUES (?, ?, ?)', [(int) $u['id'], $type ?: 'Other', $body]);
    foreach (gf_admins() as $a) {
        gf_note($a, 'Staff', 'New staff complaint', "{$u['full_name']}: $type", '#/admin');
    }
    ok(['message' => 'Complaint logged']);
}

// ------------------------------------------------------------------ administrators
function r_gf_admin(): never
{
    [$u] = gf_require('admin');
    $aid = (int) $u['id'];
    $in = input();
    $action = str_in('action', 20);
    $msg = 'Saved.';
    switch ($action) {
        case 'confirm_payment':
        case 'reject_payment':
            $id = (int) preg_replace('/\D/', '', str_in('id', 12));
            $o = row("SELECT * FROM gf_orders WHERE id = ? AND status IN ('AWAITING_PAYMENT','PAYMENT_SENT')", [$id]);
            if (!$o) fail(404, 'not_found', 'No payment waiting for that order.');
            if ((int) $o['user_id'] === $aid) fail(403, 'forbidden', 'Another administrator must confirm your own payment.');
            $kind = $o['kind'] === 'plan' ? 'meal plan' : 'grocery order';
            if ($action === 'confirm_payment') {
                q("UPDATE gf_orders SET status = 'PAID', paid_at = ?, note = NULL WHERE id = ?", [now_utc(), $id]);
                gf_event($id, 'PAID');
                gf_note((int) $o['user_id'], $o['kind'] === 'plan' ? 'Meal Plan' : 'Grocery', "Your payment for $kind confirmed", 'Your payment of NGN ' . number_format((int) $o['total']) . ' has been confirmed. Our team is on it.', '#/orders/' . $id);
                $msg = 'Payment confirmed. The order is now with staff.';
            } else {
                $note = str_in('note', 300) ?: "We couldn't find your transfer.";
                q("UPDATE gf_orders SET status = 'AWAITING_PAYMENT', note = ?, pay_sender = NULL, pay_bank = NULL WHERE id = ?", [$note, $id]);
                gf_event($id, 'AWAITING_PAYMENT');
                gf_note((int) $o['user_id'], 'Payment', 'Payment not received yet', $note . ' Please check and tell us again.', '#/orders/' . $id);
                $msg = 'The customer has been told.';
            }
            audit($aid, 'greenfed_' . $action, (int) $o['user_id'], ['order' => $id]);
            break;
        case 'settings':
            $vals = [];
            foreach (['plan_price', 'nutritionist_rate'] as $k) {
                if (isset($in[$k])) {
                    $n = (int) $in[$k];
                    if ($n < 0 || $n > 10000000) fail(422, 'invalid', 'Enter a sensible naira amount.');
                    $vals[$k] = (string) $n;
                }
            }
            foreach (['bank_name' => 80, 'account_name' => 120] as $k => $max) {
                if (isset($in[$k])) $vals[$k] = str_in($k, $max);
            }
            if (isset($in['account_number'])) {
                $acct = preg_replace('/\D/', '', str_in('account_number', 20)) ?? '';
                if (!preg_match('/^\d{10}$/', $acct)) fail(422, 'invalid', 'Account numbers have 10 digits.');
                $vals['account_number'] = $acct;
            }
            foreach ($vals as $k => $v) {
                q('REPLACE INTO gf_settings (k, v) VALUES (?, ?)', [$k, $v]);
            }
            audit($aid, 'greenfed_settings', null, $vals);
            break;
        case 'item':
            $slug = preg_replace('/[^a-z0-9]/', '', strtolower(str_in('slug', 30))) ?: preg_replace('/[^a-z0-9]/', '', strtolower(str_in('name', 30)));
            $name = str_in('name', 80);
            $cat = str_in('cat', 20);
            $price = int_in('price');
            if ($slug === '' || mb_strlen($name) < 2) fail(422, 'invalid', 'Enter the item name.');
            if (!in_array($cat, GF_CATS, true)) fail(422, 'invalid', 'Choose a category.');
            if ($price < 1 || $price > 10000000) fail(422, 'invalid', 'Enter the price in naira.');
            q('INSERT INTO gf_items (slug, name, cat, price, unit, allergens, discount, popular, is_new, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 999)
               ON DUPLICATE KEY UPDATE name = VALUES(name), cat = VALUES(cat), price = VALUES(price), unit = VALUES(unit), allergens = VALUES(allergens),
               discount = VALUES(discount), popular = VALUES(popular), is_new = VALUES(is_new), active = VALUES(active)', [
                $slug, $name, $cat, $price, str_in('unit', 30) ?: '1 pc', implode(',', gf_list($in['allergens'] ?? [], GF_ALLERGENS)) ?: null,
                max(0, min(90, int_in('discount'))), !empty($in['popular']) ? 1 : 0, !empty($in['new']) ? 1 : 0, array_key_exists('active', $in) && !$in['active'] ? 0 : 1,
            ]);
            break;
        case 'pay_staff':
            $sid = int_in('user_id');
            $pdo = db();
            $pdo->beginTransaction();
            $tasks = q("SELECT id FROM gf_tasks WHERE user_id = ? AND emp_type = 'nutritionist' AND payout_id IS NULL FOR UPDATE", [$sid])->fetchAll();
            if (!$tasks) {
                $pdo->rollBack();
                fail(409, 'state', 'Nothing due for this staff member.');
            }
            $amt = count($tasks) * gf_settings()['nutritionist_rate'];
            q('INSERT INTO gf_payouts (user_id, tasks, amount, paid_by) VALUES (?, ?, ?, ?)', [$sid, count($tasks), $amt, $aid]);
            $pid = (int) $pdo->lastInsertId();
            q('UPDATE gf_tasks SET payout_id = ? WHERE id IN (' . implode(',', array_map(fn ($t) => (int) $t['id'], $tasks)) . ')', [$pid]);
            $pdo->commit();
            gf_note($sid, 'Payment', 'Payment recorded', 'NGN ' . number_format($amt) . ' for ' . count($tasks) . ' meal plans was marked paid.', '#/work/earnings');
            audit($aid, 'greenfed_staff_paid', $sid, ['amount' => $amt]);
            $msg = 'Marked paid. The counter is reset.';
            break;
        case 'reset_meter':
            $sid = int_in('user_id');
            $n = (int) row("SELECT COUNT(*) n FROM gf_tasks WHERE user_id = ? AND emp_type <> 'nutritionist' AND payout_id IS NULL", [$sid])['n'];
            if ($n) {
                q('INSERT INTO gf_payouts (user_id, tasks, amount, paid_by) VALUES (?, ?, 0, ?)', [$sid, $n, $aid]);
                $pid = (int) db()->lastInsertId();
                q("UPDATE gf_tasks SET payout_id = ? WHERE user_id = ? AND emp_type <> 'nutritionist' AND payout_id IS NULL", [$pid, $sid]);
            }
            $msg = 'Counter reset.';
            break;
        case 'resolve_conflict':
            $c = row("SELECT * FROM gf_conflicts WHERE id = ? AND status = 'OPEN'", [int_in('id')]);
            if (!$c) fail(404, 'not_found', 'Conflict not found.');
            $res = $c['type'] === 'Late delivery' ? 'Next delivery waived for the customer.' : 'Items recalled and resupplied.';
            q("UPDATE gf_conflicts SET status = 'RESOLVED', resolution = ? WHERE id = ?", [str_in('note', 300) ?: $res, (int) $c['id']]);
            gf_note((int) $c['user_id'], 'Grocery', 'We resolved your report', str_in('note', 300) ?: $res, '#/orders/' . $c['order_id']);
            break;
        case 'resolve_complaint':
            q("UPDATE gf_complaints SET status = 'RESOLVED' WHERE id = ?", [int_in('id')]);
            break;
        default:
            fail(422, 'invalid', 'Unknown action.');
    }
    ok(['message' => $msg]);
}

// ------------------------------------------------------------------ communities
function r_gf_community(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $a = gf_access($uid);
    $in = input();
    $action = str_in('action', 12);
    if ($action === 'create') {
        // Customers, health specialists and administrators can start a community.
        if (!in_array('user', $a['roles'], true) && !in_array('admin', $a['roles'], true) && $a['type'] !== 'health') {
            fail(403, 'forbidden', 'Only customers and health specialists can start a community.');
        }
        rate_limit('gf-comm:' . $uid, 5, 86400);
        $name = str_in('name', 60);
        $desc = str_in('desc', 300);
        if (mb_strlen($name) < 3) fail(422, 'invalid', 'Give your community a name.', ['name' => 'Give your community a name.']);
        if (mb_strlen($desc) < 5) fail(422, 'invalid', 'Describe what the community is about.', ['desc' => 'Describe what it is about.']);
        if (row('SELECT 1 FROM gf_communities WHERE name = ?', [$name])) fail(409, 'exists', 'A community with that name already exists.');
        $cat = str_in('cat', 30);
        q('INSERT INTO gf_communities (name, cat, descr, pub, perms, created_by) VALUES (?, ?, ?, ?, ?, ?)', [
            $name, in_array($cat, ['Allergies', 'Nutrition', 'Health issues', 'Food & craft', 'Rehabilitation', 'Other'], true) ? $cat : 'Other',
            $desc, !empty($in['pub']) ? 1 : 0, ($in['perms'] ?? '') === 'admins' ? 'admins' : 'anyone', $uid,
        ]);
        $cid = (int) db()->lastInsertId();
        q("INSERT INTO gf_comm_members (community_id, user_id, status) VALUES (?, ?, 'member')", [$cid, $uid]);
        ok(['id' => 'c' . $cid, 'message' => 'Community created']);
    }
    $c = row('SELECT * FROM gf_communities WHERE id = ?', [(int) preg_replace('/\D/', '', str_in('id', 12))]);
    if (!$c) fail(404, 'not_found', 'Community not found.');
    $cid = (int) $c['id'];
    if ($action === 'join') {
        q('INSERT IGNORE INTO gf_comm_members (community_id, user_id, status) VALUES (?, ?, ?)', [$cid, $uid, $c['pub'] ? 'member' : 'pending']);
        if (!$c['pub'] && $c['created_by']) gf_note((int) $c['created_by'], 'Community', 'Request to join', "{$u['full_name']} asked to join {$c['name']}.", '#/community/c' . $cid);
        ok(['message' => $c['pub'] ? "Welcome to {$c['name']}" : 'Request sent']);
    }
    if ($action === 'leave') {
        q('DELETE FROM gf_comm_members WHERE community_id = ? AND user_id = ?', [$cid, $uid]);
        ok(['message' => "You left {$c['name']}"]);
    }
    if ($action === 'approve' || $action === 'decline') {
        if (!gf_can_moderate($uid, $c)) fail(403, 'forbidden', 'Only the community creator or an administrator can do that.');
        $who = int_in('user_id');
        $action === 'approve' ? q("UPDATE gf_comm_members SET status = 'member' WHERE community_id = ? AND user_id = ?", [$cid, $who])
            : q("DELETE FROM gf_comm_members WHERE community_id = ? AND user_id = ? AND status = 'pending'", [$cid, $who]);
        if ($action === 'approve') gf_note($who, 'Community', "You're in", "Your request to join {$c['name']} was approved.", '#/community/c' . $cid);
        ok();
    }
    fail(422, 'invalid', 'Unknown action.');
}

function gf_member_of(int $uid, int $cid): bool
{
    return (bool) row("SELECT 1 FROM gf_comm_members WHERE community_id = ? AND user_id = ? AND status = 'member'", [$cid, $uid]);
}

function r_gf_post(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    $a = gf_access($uid);
    if (!$a['roles']) fail(403, 'forbidden', 'Your account does not have GreenFed access.');
    rate_limit('gf-post:' . $uid, 30, 3600);
    $in = input();
    $kind = str_in('kind', 10);
    $isSpec = $a['type'] === 'health' || in_array('admin', $a['roles'], true);
    if ($kind === 'delete') {
        $p = row('SELECT p.*, c.created_by FROM gf_posts p JOIN gf_communities c ON c.id = p.community_id WHERE p.id = ?', [(int) preg_replace('/\D/', '', str_in('id', 12))]);
        if (!$p || ((int) $p['user_id'] !== $uid && !gf_can_moderate($uid, ['created_by' => $p['created_by']]))) fail(403, 'forbidden', 'You cannot remove this post.');
        q('DELETE FROM gf_posts WHERE id = ?', [(int) $p['id']]);
        ok(['message' => 'Post removed']);
    }
    if ($kind === 'like') {
        $pid = (int) preg_replace('/\D/', '', str_in('id', 12));
        if (!row('SELECT 1 FROM gf_posts WHERE id = ?', [$pid])) fail(404, 'not_found', 'Post not found.');
        row('SELECT 1 FROM gf_likes WHERE post_id = ? AND user_id = ?', [$pid, $uid]) ? q('DELETE FROM gf_likes WHERE post_id = ? AND user_id = ?', [$pid, $uid])
            : q('INSERT INTO gf_likes (post_id, user_id) VALUES (?, ?)', [$pid, $uid]);
        ok();
    }
    if ($kind === 'reply') {
        $pid = (int) preg_replace('/\D/', '', str_in('post', 12));
        $p = row('SELECT p.*, c.pub FROM gf_posts p JOIN gf_communities c ON c.id = p.community_id WHERE p.id = ?', [$pid]);
        if (!$p) fail(404, 'not_found', 'Post not found.');
        if (!$p['pub'] && !gf_member_of($uid, (int) $p['community_id']) && !$isSpec) fail(403, 'forbidden', 'Join this community to reply.');
        $body = str_in('body', 2000);
        if (mb_strlen($body) < 1) fail(422, 'invalid', 'Write your comment.');
        $parent = (int) preg_replace('/\D/', '', str_in('parent', 12));
        if ($parent && !row('SELECT 1 FROM gf_replies WHERE id = ? AND post_id = ?', [$parent, $pid])) $parent = 0;
        $spec = !empty($in['specialist']) && $a['type'] === 'health';
        q('INSERT INTO gf_replies (post_id, parent_id, user_id, specialist, body) VALUES (?, ?, ?, ?, ?)', [$pid, $parent ?: null, $uid, $spec ? 1 : 0, $body]);
        if ($spec) gf_task($uid, 'health', null, 'Community reply');
        if ((int) $p['user_id'] !== $uid) gf_note((int) $p['user_id'], 'Community', ($spec ? 'A health specialist' : $u['full_name']) . ' replied', mb_substr($p['title'], 0, 100), '#/community/c' . $p['community_id']);
        ok(['message' => 'Reply posted']);
    }
    // a new post
    $c = row('SELECT * FROM gf_communities WHERE id = ?', [(int) preg_replace('/\D/', '', str_in('community', 12))]);
    if (!$c) fail(404, 'not_found', 'Community not found.');
    if (!gf_member_of($uid, (int) $c['id'])) fail(403, 'forbidden', 'Join this community to post.');
    if ($c['perms'] === 'admins' && !$isSpec && !gf_can_moderate($uid, $c)) fail(403, 'forbidden', 'Only the community leaders and health specialists post here. You can reply to posts.');
    $title = str_in('title', 140);
    $body = str_in('body', 3000);
    if ($title === '' || $body === '') fail(422, 'invalid', 'Add a topic and your post.');
    q('INSERT INTO gf_posts (community_id, user_id, title, body) VALUES (?, ?, ?, ?)', [(int) $c['id'], $uid, $title, $body]);
    ok(['message' => 'Posted']);
}

function r_gf_misc(): never
{
    $u = require_user();
    $uid = (int) $u['id'];
    if (!gf_access($uid)['roles']) fail(403, 'forbidden', 'Your account does not have GreenFed access.');
    $action = str_in('action', 12);
    if ($action === 'read') {
        $id = (int) preg_replace('/\D/', '', str_in('id', 12));
        $id ? q('UPDATE gf_notes SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', [now_utc(), $id, $uid])
            : q('UPDATE gf_notes SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now_utc(), $uid]);
        ok();
    }
    if ($action === 'leader') {
        gf_profile($uid);
        q('UPDATE gf_profiles SET leader_at = COALESCE(leader_at, ?) WHERE user_id = ?', [now_utc(), $uid]);
        foreach (gf_admins() as $a) {
            gf_note($a, 'Community', 'Community leader application', "{$u['full_name']} applied to lead communities. Check their licence.", '#/admin');
        }
        ok(['message' => "Application sent. We'll verify your licence."]);
    }
    fail(422, 'invalid', 'Unknown action.');
}
