<?php
/*
 * AiRise learner hub, trainer cohorts and employer opportunities. Included by api/index.php after airise.php.
 *
 * Learners: courses, assessments (and where they left off), certificates, classes (cohorts they belong to,
 * scheduled live classes and announcements), notifications, and opportunities (SIWES, internships, jobs)
 * they can apply to with their portfolio.
 * Trainers: cohorts for a course; learners join with a code or are added by email; classes are scheduled
 * with a meeting link and every member is notified in AiRise and by email.
 * Employers: post opportunities, see applicants (with their portfolio) and check certificate numbers.
 */
declare(strict_types=1);

const AIR_OPP_KINDS = ['siwes' => 'SIWES placement', 'internship' => 'Internship', 'job' => 'Job'];
const AIR_OPP_MODES = ['onsite' => 'On-site', 'remote' => 'Remote', 'hybrid' => 'Hybrid'];

function air_note(int $uid, string $title, string $body, string $link = '', bool $mail = false): void
{
    q('INSERT INTO airise_notes (user_id, title, body, link) VALUES (?, ?, ?, ?)', [$uid, mb_substr($title, 0, 140), mb_substr($body, 0, 400), $link ?: null]);
    if ($mail && ($u = row('SELECT email FROM users WHERE id = ?', [$uid]))) {
        send_mail($u['email'], $title, $body . ($link ? "\n\n" . site_url('products/airise/' . $link) : ''));
    }
}

function air_title(string $key): string
{
    $i = air_course_info($key, false);
    return $i ? $i['title'] : 'Course';
}

/** "Mon 1 Dec, 10:00" in Lagos time (sessions are stored in Lagos time). */
function air_when(string $t): string
{
    return date('D j M, H:i', strtotime($t));
}

// ------------------------------------------------------------------ learners: assessments
function r_air_assessments(): never
{
    [$u] = air_require('learner', 'trainer', 'admin');
    $uid = (int) $u['id'];
    $done = [];
    $last = [];
    foreach (q('SELECT course, lesson, done_at FROM airise_progress WHERE user_id = ?', [$uid])->fetchAll() as $p) {
        $done[$p['course']][] = (int) $p['lesson'];
        $last[$p['course']] = max($last[$p['course']] ?? '', $p['done_at']);
    }
    $att = [];
    foreach (q('SELECT course, MAX(score / total) best, COUNT(*) n, MAX(passed) passed, MAX(created_at) at FROM airise_attempts WHERE user_id = ? GROUP BY course', [$uid])->fetchAll() as $a) {
        $att[$a['course']] = ['best' => (int) round((float) $a['best'] * 100), 'tries' => (int) $a['n'], 'passed' => (bool) $a['passed']];
        $last[$a['course']] = max($last[$a['course']] ?? '', $a['at']);
    }
    $items = [];
    foreach (AIR_SERIES as $slug => [$n, $title]) {
        if ($n > 9) continue;
        $qi = count(air_series_lessons($slug)) - 1;
        $items[] = ['course' => $slug, 'title' => $title, 'n' => $n, 'lesson' => $qi, 'kind' => 'series', 'what' => 'Course quiz: Section A and B (14/20 to pass)',
            'done' => in_array($qi, $done[$slug] ?? [], true), 'started' => isset($done[$slug]), 'progress' => count($done[$slug] ?? []), 'of' => $qi + 1,
            'result' => null, 'last' => $last[$slug] ?? null];
    }
    foreach (q("SELECT c.id, c.title, c.data, u.full_name FROM airise_courses c JOIN users u ON u.id = c.trainer_id WHERE c.status = 'published'")->fetchAll() as $c) {
        $d = json_decode($c['data'], true) ?: [];
        if (empty($d['questions'])) continue;
        $key = 't' . $c['id'];
        $ls = air_trainer_lessons($d);
        $qi = count($ls) - 1;
        if (!isset($done[$key]) && !isset($att[$key])) continue; // only trainer courses the learner has started
        $items[] = ['course' => $key, 'title' => $c['title'], 'n' => null, 'lesson' => $qi, 'kind' => 'trainer', 'what' => $ls[$qi]['t'] . ' · by ' . $c['full_name'],
            'done' => in_array($qi, $done[$key] ?? [], true), 'started' => true, 'progress' => count($done[$key] ?? []), 'of' => $qi + 1,
            'result' => $att[$key] ?? null, 'last' => $last[$key] ?? null];
    }
    // Where they left off: the most recently active course whose assessment is not done yet.
    $open = array_values(array_filter($items, fn ($i) => $i['started'] && !$i['done']));
    usort($open, fn ($a, $b) => strcmp((string) $b['last'], (string) $a['last']));
    ok(['items' => $items, 'current' => $open[0] ?? null]);
}

// ------------------------------------------------------------------ learners: classes and notifications
function air_cohort_out(array $c, bool $trainer): array
{
    $cid = (int) $c['id'];
    $out = ['id' => $cid, 'name' => $c['name'], 'course' => $c['course'], 'courseTitle' => air_title($c['course']), 'code' => $c['code'],
        'startsOn' => $c['starts_on'], 'about' => (string) $c['about'], 'trainer' => $c['trainer'] ?? '', 'archived' => (bool) $c['archived'],
        'sessions' => array_map(fn ($s) => ['id' => (int) $s['id'], 'title' => $s['title'], 'at' => $s['starts_at'], 'minutes' => (int) $s['minutes'],
            'link' => (string) $s['link'], 'notes' => (string) $s['notes'], 'cancelled' => (bool) $s['cancelled'],
            'past' => (new DateTime($s['starts_at'], new DateTimeZone('Africa/Lagos')))->getTimestamp() + (int) $s['minutes'] * 60 < time()],
            q('SELECT * FROM airise_sessions WHERE cohort_id = ? ORDER BY starts_at', [$cid])->fetchAll()),
        'announcements' => array_map(fn ($a) => ['id' => (int) $a['id'], 'body' => $a['body'], 'at' => $a['created_at']],
            q('SELECT * FROM airise_announcements WHERE cohort_id = ? ORDER BY id DESC LIMIT 30', [$cid])->fetchAll()),
        'size' => (int) row('SELECT COUNT(*) n FROM airise_cohort_members WHERE cohort_id = ?', [$cid])['n']];
    if ($trainer) {
        $lessons = count((air_course_info($c['course'], false) ?? ['lessons' => [1]])['lessons']) ?: 1;
        $out['members'] = array_map(fn ($m) => ['id' => (int) $m['id'], 'name' => $m['full_name'], 'email' => $m['email'], 'joined' => $m['joined_at'],
            'progress' => (int) round((int) row('SELECT COUNT(*) n FROM airise_progress WHERE user_id = ? AND course = ?', [(int) $m['id'], $c['course']])['n'] / $lessons * 100)],
            q('SELECT u.id, u.full_name, u.email, m.joined_at FROM airise_cohort_members m JOIN users u ON u.id = m.user_id WHERE m.cohort_id = ? ORDER BY u.full_name', [$cid])->fetchAll());
    }
    return $out;
}

function r_air_classes(): never
{
    [$u] = air_require('learner', 'trainer', 'admin');
    $uid = (int) $u['id'];
    $cohorts = q('SELECT c.*, u.full_name trainer FROM airise_cohort_members m JOIN airise_cohorts c ON c.id = m.cohort_id JOIN users u ON u.id = c.trainer_id
                  WHERE m.user_id = ? AND c.archived = 0 ORDER BY c.id DESC', [$uid])->fetchAll();
    ok(['cohorts' => array_map(fn ($c) => air_cohort_out($c, false), $cohorts),
        'notes' => array_map(fn ($n) => ['id' => (int) $n['id'], 'title' => $n['title'], 'body' => $n['body'], 'link' => (string) $n['link'], 'read' => (bool) $n['read_at'], 'at' => $n['created_at']],
            q('SELECT * FROM airise_notes WHERE user_id = ? ORDER BY id DESC LIMIT 60', [$uid])->fetchAll())]);
}

function r_air_classes_act(): never
{
    [$u] = air_require('learner', 'trainer', 'admin');
    $uid = (int) $u['id'];
    rate_limit('air-cls:' . $uid, 60, 3600);
    $action = str_in('action', 10);
    if ($action === 'read') {
        q('UPDATE airise_notes SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now_utc(), $uid]);
        ok();
    }
    if ($action === 'join') {
        $c = row('SELECT * FROM airise_cohorts WHERE code = ? AND archived = 0', [strtoupper(preg_replace('/[^A-Za-z0-9]/', '', str_in('code', 12)))]);
        if (!$c) fail(404, 'not_found', 'No class with that code. Check it with your trainer.');
        if ((int) $c['trainer_id'] === $uid) fail(422, 'invalid', 'This is your own cohort.');
        q('INSERT IGNORE INTO airise_cohort_members (cohort_id, user_id) VALUES (?, ?)', [(int) $c['id'], $uid]);
        ok(['message' => "You joined {$c['name']}."]);
    }
    if ($action === 'leave') {
        q('DELETE FROM airise_cohort_members WHERE cohort_id = ? AND user_id = ?', [int_in('id'), $uid]);
        ok(['message' => 'You left the class.']);
    }
    fail(422, 'invalid', 'Unknown action.');
}

// ------------------------------------------------------------------ trainers: cohorts
function air_my_cohort(int $uid, int $id): array
{
    $c = row('SELECT * FROM airise_cohorts WHERE id = ? AND trainer_id = ?', [$id, $uid]);
    if (!$c) fail(404, 'not_found', 'Cohort not found.');
    return $c;
}

function air_members(int $cid): array
{
    return array_map('intval', array_column(q('SELECT user_id FROM airise_cohort_members WHERE cohort_id = ?', [$cid])->fetchAll(), 'user_id'));
}

function r_air_cohorts(): never
{
    [$u] = air_require('trainer');
    $uid = (int) $u['id'];
    $courses = [];
    foreach (AIR_SERIES as $slug => [$n, $title]) $courses[] = ['key' => $slug, 'title' => ($n <= 9 ? "Course $n: " : '') . $title];
    foreach (q("SELECT id, title FROM airise_courses WHERE trainer_id = ? AND status = 'published'", [$uid])->fetchAll() as $c) $courses[] = ['key' => 't' . $c['id'], 'title' => $c['title'] . ' (your course)'];
    ok(['cohorts' => array_map(fn ($c) => air_cohort_out($c + ['trainer' => $u['full_name']], true), q('SELECT * FROM airise_cohorts WHERE trainer_id = ? ORDER BY archived, id DESC', [$uid])->fetchAll()),
        'courses' => $courses]);
}

function r_air_cohorts_act(): never
{
    [$u] = air_require('trainer');
    $uid = (int) $u['id'];
    rate_limit('air-coh:' . $uid, 200, 3600);
    $in = input();
    $action = str_in('action', 14);
    if ($action === 'create') {
        $course = str_in('course', 40);
        $info = air_course_info($course, false);
        if (!$info || (isset($info['row']) && ((int) $info['row']['trainer_id'] !== $uid || $info['row']['status'] !== 'published'))) fail(422, 'invalid', 'Choose a course.');
        $name = str_in('name', 100);
        if (mb_strlen($name) < 3) fail(422, 'invalid', 'Give the cohort a name, e.g. "Lagos Saturday class, January".', ['name' => 'Give the cohort a name.']);
        $starts = str_in('starts_on', 10);
        if ($starts !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $starts)) $starts = '';
        if ((int) row('SELECT COUNT(*) n FROM airise_cohorts WHERE trainer_id = ? AND archived = 0', [$uid])['n'] >= 50) fail(422, 'invalid', 'Archive some cohorts first.');
        do {
            $code = strtoupper(substr(str_replace(['0', 'O', '1', 'I'], '', bin2hex(random_bytes(8))), 0, 6));
        } while (strlen($code) < 6 || row('SELECT 1 FROM airise_cohorts WHERE code = ?', [$code]));
        q('INSERT INTO airise_cohorts (trainer_id, course, name, code, starts_on, about) VALUES (?, ?, ?, ?, ?, ?)', [$uid, $course, $name, $code, $starts ?: null, str_in('about', 600) ?: null]);
        ok(['id' => (int) db()->lastInsertId(), 'code' => $code, 'message' => "Cohort created. Learners join with the code $code."]);
    }
    $c = air_my_cohort($uid, int_in('id'));
    $cid = (int) $c['id'];
    switch ($action) {
        case 'invite':
            $email = strtolower(str_in('email', 190));
            $who = $email !== '' ? row("SELECT u.id, u.full_name FROM users u JOIN memberships m ON m.user_id = u.id AND m.product = 'airise' AND m.role = 'customer' AND m.status = 'approved'
                                        WHERE u.email = ?", [$email]) : null;
            if (!$who) fail(404, 'not_found', 'No AiRise learner has that email. Ask them to create a free AiRise learner account, then add them, or share the class code.');
            q('INSERT IGNORE INTO airise_cohort_members (cohort_id, user_id) VALUES (?, ?)', [$cid, (int) $who['id']]);
            air_note((int) $who['id'], "You were added to {$c['name']}", "{$u['full_name']} added you to their AiRise class for " . air_title($c['course']) . '. Your classes and schedule are in My classes.', 'classes.html', true);
            ok(['message' => "{$who['full_name']} was added and notified."]);
        case 'remove':
            q('DELETE FROM airise_cohort_members WHERE cohort_id = ? AND user_id = ?', [$cid, int_in('user_id')]);
            ok(['message' => 'Removed from the cohort.']);
        case 'session':
            $title = str_in('title', 120);
            $at = str_replace('T', ' ', str_in('starts_at', 16));
            $min = max(15, min(480, int_in('minutes') ?: 60));
            $link = str_in('link', 300);
            if (mb_strlen($title) < 3) fail(422, 'invalid', 'Give the class a title.', ['title' => 'Give the class a title.']);
            if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $at) || strtotime($at) === false) fail(422, 'invalid', 'Choose the date and time.', ['starts_at' => 'Choose the date and time.']);
            if ($link === 'jitsi') {
                $link = 'https://meet.jit.si/AiRise-' . preg_replace('/[^A-Za-z0-9]/', '', ucwords($c['name'])) . '-' . bin2hex(random_bytes(4));
            } elseif ($link !== '' && (!preg_match('#^https://#i', $link) || filter_var($link, FILTER_VALIDATE_URL) === false)) {
                fail(422, 'invalid', 'Paste the full meeting link, starting with https://', ['link' => 'Use a full https:// link.']);
            }
            q('INSERT INTO airise_sessions (cohort_id, title, starts_at, minutes, link, notes) VALUES (?, ?, ?, ?, ?, ?)', [$cid, $title, $at . ':00', $min, $link ?: null, str_in('notes', 600) ?: null]);
            $members = air_members($cid);
            foreach (array_slice($members, 0, 500) as $m) {
                air_note($m, "Class scheduled: $title", "{$c['name']} · " . air_when($at) . " (Lagos time), $min minutes" . ($link ? ". Join from My classes when it starts." : '.'), 'classes.html', true);
            }
            ok(['message' => 'Class scheduled. ' . count($members) . ' learner' . (count($members) === 1 ? ' was' : 's were') . ' notified.']);
        case 'cancel':
            $s = row('SELECT * FROM airise_sessions WHERE id = ? AND cohort_id = ?', [int_in('session_id'), $cid]);
            if (!$s) fail(404, 'not_found', 'Class not found.');
            q('UPDATE airise_sessions SET cancelled = 1 WHERE id = ?', [(int) $s['id']]);
            foreach (air_members($cid) as $m) air_note($m, "Class cancelled: {$s['title']}", "{$c['name']} · " . air_when($s['starts_at']) . ' is cancelled.', 'classes.html', true);
            ok(['message' => 'Class cancelled. Learners were notified.']);
        case 'announce':
            $body = str_in('body', 1500);
            if (mb_strlen($body) < 3) fail(422, 'invalid', 'Write your message.');
            q('INSERT INTO airise_announcements (cohort_id, body) VALUES (?, ?)', [$cid, $body]);
            foreach (array_slice(air_members($cid), 0, 500) as $m) air_note($m, "Message from {$u['full_name']} ({$c['name']})", $body, 'classes.html', true);
            ok(['message' => 'Sent to everyone in the cohort.']);
        case 'archive':
            q('UPDATE airise_cohorts SET archived = 1 - archived WHERE id = ?', [$cid]);
            ok(['message' => $c['archived'] ? 'Cohort restored.' : 'Cohort archived. Learners no longer see it.']);
    }
    fail(422, 'invalid', 'Unknown action.');
}

// ------------------------------------------------------------------ opportunities
function air_opp_out(array $o, ?int $viewer = null): array
{
    $out = ['id' => (int) $o['id'], 'kind' => $o['kind'], 'kindLabel' => AIR_OPP_KINDS[$o['kind']], 'title' => $o['title'], 'company' => $o['company'],
        'location' => $o['location'], 'mode' => $o['mode'], 'modeLabel' => AIR_OPP_MODES[$o['mode']], 'description' => $o['description'],
        'requirements' => (string) $o['requirements'], 'pay' => (string) $o['pay'], 'career' => (string) $o['career'],
        'careerLabel' => AIR_CAREERS[$o['career']][0] ?? '', 'applyUrl' => (string) $o['apply_url'], 'deadline' => $o['deadline'],
        'status' => $o['status'], 'at' => $o['created_at']];
    if ($viewer) {
        $a = row('SELECT status, created_at FROM airise_applications WHERE opportunity_id = ? AND user_id = ?', [(int) $o['id'], $viewer]);
        $out['applied'] = $a ? $a['status'] : null;
    }
    return $out;
}

function r_air_opportunities(): never
{
    [$u] = air_require('learner', 'trainer', 'admin', 'employer');
    $uid = (int) $u['id'];
    $kind = (string) ($_GET['kind'] ?? '');
    $qs = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 60);
    $where = ["o.status = 'open'", '(o.deadline IS NULL OR o.deadline >= CURDATE())'];
    $args = [];
    if (isset(AIR_OPP_KINDS[$kind])) {
        $where[] = 'o.kind = ?';
        $args[] = $kind;
    }
    if ($qs !== '') {
        $where[] = '(o.title LIKE ? OR o.company LIKE ? OR o.location LIKE ?)';
        array_push($args, "%$qs%", "%$qs%", "%$qs%");
    }
    $p = air_profile($uid);
    $rows = q('SELECT o.* FROM airise_opportunities o WHERE ' . implode(' AND ', $where) . ' ORDER BY (o.career = ?) DESC, o.created_at DESC LIMIT 300', array_merge($args, [$p['career']]))->fetchAll();
    ok(['items' => array_map(fn ($o) => air_opp_out($o, $uid), $rows), 'kinds' => AIR_OPP_KINDS, 'visible' => $p['visible'], 'career' => $p['career']]);
}

function r_air_apply(): never
{
    [$u] = air_require('learner');
    $uid = (int) $u['id'];
    rate_limit('air-apply:' . $uid, 30, 3600);
    $o = row("SELECT o.*, u.email emp_email FROM airise_opportunities o JOIN users u ON u.id = o.employer_id WHERE o.id = ? AND o.status = 'open' AND (o.deadline IS NULL OR o.deadline >= CURDATE())", [int_in('id')]);
    if (!$o) fail(404, 'not_found', 'This opportunity is closed.');
    if (!air_profile($uid)['visible']) fail(409, 'portfolio', 'Turn on "Show my portfolio to employers" in My portfolio first, so the employer can see it.');
    if (row('SELECT 1 FROM airise_applications WHERE opportunity_id = ? AND user_id = ?', [(int) $o['id'], $uid])) fail(409, 'state', 'You have already applied.');
    q('INSERT INTO airise_applications (opportunity_id, user_id, note) VALUES (?, ?, ?)', [(int) $o['id'], $uid, str_in('note', 1000) ?: null]);
    send_mail($o['emp_email'], "New applicant: {$o['title']}", "{$u['full_name']} applied for {$o['title']} with their AiRise portfolio.\n\nSee applicants: " . site_url('products/airise/jobs.html'));
    ok(['message' => 'Application sent with your portfolio. You will be notified when the employer responds.']);
}

// ------------------------------------------------------------------ employers: their opportunities and applicants
function r_air_jobs(): never
{
    [$u] = air_require('employer');
    $uid = (int) $u['id'];
    $m = row("SELECT details FROM memberships WHERE user_id = ? AND product = 'airise' AND role = 'employer'", [$uid]);
    $d = $m && $m['details'] ? (json_decode($m['details'], true) ?: []) : [];
    $items = [];
    foreach (q("SELECT * FROM airise_opportunities WHERE employer_id = ? AND status <> 'removed' ORDER BY id DESC", [$uid])->fetchAll() as $o) {
        $x = air_opp_out($o);
        $x['applicants'] = array_map(function ($a) {
            $p = air_profile((int) $a['user_id']);
            return ['id' => (int) $a['id'], 'learner' => (int) $a['user_id'], 'name' => $a['full_name'], 'email' => $a['email'], 'note' => (string) $a['note'],
                'status' => $a['status'], 'at' => $a['created_at'], 'course' => $p['course'], 'institution' => $p['institution'],
                'career' => AIR_CAREERS[$p['career']][0] ?? '', 'visible' => $p['visible'], 'score' => air_score((int) $a['user_id'], $p)['total']];
        }, q('SELECT a.*, u.full_name, u.email FROM airise_applications a JOIN users u ON u.id = a.user_id WHERE a.opportunity_id = ? ORDER BY a.id', [(int) $o['id']])->fetchAll());
        $items[] = $x;
    }
    ok(['items' => $items, 'company' => $d['company_name'] ?? '', 'kinds' => AIR_OPP_KINDS, 'modes' => AIR_OPP_MODES,
        'careers' => array_map(fn ($k, $c) => ['key' => $k, 'label' => $c[0]], array_keys(AIR_CAREERS), AIR_CAREERS)]);
}

function r_air_jobs_act(): never
{
    [$u] = air_require('employer');
    $uid = (int) $u['id'];
    rate_limit('air-jobs:' . $uid, 120, 3600);
    $in = input();
    $action = str_in('action', 12);
    if ($action === 'save') {
        $id = int_in('id');
        if ($id && !row("SELECT 1 FROM airise_opportunities WHERE id = ? AND employer_id = ? AND status <> 'removed'", [$id, $uid])) fail(404, 'not_found', 'Opportunity not found.');
        $kind = str_in('kind', 12);
        $mode = str_in('mode', 10);
        $e = [];
        foreach (['title' => [3, 120, 'a title'], 'company' => [2, 120, 'the company name'], 'location' => [2, 120, 'the location'], 'description' => [20, 5000, 'a description of at least 20 characters']] as $k => [$min, $max, $label]) {
            if (mb_strlen(str_in($k, $max)) < $min) $e[$k] = "Enter $label.";
        }
        if (!isset(AIR_OPP_KINDS[$kind])) $e['kind'] = 'Choose SIWES, internship or job.';
        $url = str_in('apply_url', 300);
        if ($url !== '' && (!preg_match('#^https://#i', $url) || filter_var($url, FILTER_VALIDATE_URL) === false)) $e['apply_url'] = 'Use a full https:// link, or leave it empty.';
        $deadline = str_in('deadline', 10);
        if ($deadline !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline) || $deadline < gmdate('Y-m-d'))) $e['deadline'] = 'Choose a date from today on, or leave it empty.';
        if ($e) fail(422, 'invalid', 'Please check the highlighted fields.', $e);
        $career = str_in('career', 20);
        $vals = [$kind, str_in('title', 120), str_in('company', 120), str_in('location', 120), isset(AIR_OPP_MODES[$mode]) ? $mode : 'onsite', str_in('description', 5000),
            str_in('requirements', 3000) ?: null, str_in('pay', 80) ?: null, isset(AIR_CAREERS[$career]) ? $career : null, $url ?: null, $deadline ?: null];
        if ($id) {
            q('UPDATE airise_opportunities SET kind = ?, title = ?, company = ?, location = ?, mode = ?, description = ?, requirements = ?, pay = ?, career = ?, apply_url = ?, deadline = ? WHERE id = ?', array_merge($vals, [$id]));
        } else {
            if ((int) row("SELECT COUNT(*) n FROM airise_opportunities WHERE employer_id = ? AND status = 'open'", [$uid])['n'] >= 50) fail(422, 'invalid', 'Close some opportunities first.');
            q('INSERT INTO airise_opportunities (kind, title, company, location, mode, description, requirements, pay, career, apply_url, deadline, employer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', array_merge($vals, [$uid]));
            $id = (int) db()->lastInsertId();
        }
        ok(['id' => $id, 'message' => 'Published. Learners see it on their Opportunities page.']);
    }
    if ($action === 'close' || $action === 'reopen') {
        q("UPDATE airise_opportunities SET status = ? WHERE id = ? AND employer_id = ? AND status <> 'removed'", [$action === 'close' ? 'closed' : 'open', int_in('id'), $uid]);
        ok(['message' => $action === 'close' ? 'Closed. Learners no longer see it.' : 'Open again.']);
    }
    if ($action === 'applicant') {
        $a = row('SELECT a.*, o.title, o.company FROM airise_applications a JOIN airise_opportunities o ON o.id = a.opportunity_id WHERE a.id = ? AND o.employer_id = ?', [int_in('app_id'), $uid]);
        if (!$a) fail(404, 'not_found', 'Applicant not found.');
        $st = str_in('status', 12);
        if (!in_array($st, ['shortlisted', 'declined'], true)) fail(422, 'invalid', 'Unknown status.');
        q('UPDATE airise_applications SET status = ? WHERE id = ?', [$st, (int) $a['id']]);
        air_note((int) $a['user_id'], $st === 'shortlisted' ? "Shortlisted: {$a['title']}" : "Update on {$a['title']}",
            $st === 'shortlisted' ? "{$a['company']} shortlisted you for {$a['title']}. They will contact you by email." : "{$a['company']} has decided not to go ahead with your application for {$a['title']}. Keep building your portfolio.",
            'opportunities.html', true);
        ok(['message' => $st === 'shortlisted' ? 'Shortlisted. The learner was notified.' : 'Declined. The learner was notified.']);
    }
    fail(422, 'invalid', 'Unknown action.');
}

// ------------------------------------------------------------------ administrators: opportunities
function r_air_admin_opps(): never
{
    air_require('admin');
    ok(['items' => array_map(fn ($o) => air_opp_out($o) + ['employer' => $o['full_name'], 'email' => $o['email'],
        'applicants' => (int) row('SELECT COUNT(*) n FROM airise_applications WHERE opportunity_id = ?', [(int) $o['id']])['n']],
        q("SELECT o.*, u.full_name, u.email FROM airise_opportunities o JOIN users u ON u.id = o.employer_id WHERE o.status <> 'removed' ORDER BY o.id DESC LIMIT 300")->fetchAll())]);
}

function r_air_admin_opp(): never
{
    [$u] = air_require('admin');
    $o = row('SELECT * FROM airise_opportunities WHERE id = ?', [int_in('id')]);
    if (!$o) fail(404, 'not_found', 'Not found.');
    q("UPDATE airise_opportunities SET status = 'removed' WHERE id = ?", [(int) $o['id']]);
    audit((int) $u['id'], 'airise_opportunity_removed', (int) $o['employer_id'], ['opportunity' => (int) $o['id']]);
    ok(['message' => 'Removed. Learners no longer see it.']);
}
