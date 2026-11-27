<?php
/*
 * AiRise: learner progress, certificates, quizzes, trainer courses and their files.
 * Included by api/index.php. Uses the shared Rehohub accounts: an AiRise "customer" learns,
 * an approved "trainer" writes courses, and AiRise administrators review them before learners
 * can see them.
 *
 * The nine-course Employability Skills Series and The Hack are fixed courses described below
 * (the same structure as assets/js/airise-app.js). Certificates are issued here, never in the
 * browser, once every lesson of a course is finished; trainer-course quizzes are marked here and
 * their answers are never sent to learners.
 *
 * Files: trainers upload cover pictures and lesson files in 4 MB pieces (so cPanel's usual
 * upload limits are fine). They are kept in a private folder (config 'airise.storage_dir',
 * default api/storage/airise, which api/storage/.htaccess blocks) and only handed out through
 * airise/file to people allowed to see them.
 */
declare(strict_types=1);

// slug => [number, title, hours, number of model steps]
const AIR_SERIES = [
    'adaptability' => [1, 'Adaptability', 13, 5],
    'initiative-and-proactivity' => [2, 'Initiative and Proactivity', 16, 5],
    'communication-skills' => [3, 'Communication Skills', 20, 5],
    'problem-solving' => [4, 'Problem-Solving', 19, 5],
    'work-ethics-and-reliability' => [5, 'Work Ethics and Reliability', 21, 4],
    'teamwork-and-collaboration' => [6, 'Teamwork and Collaboration', 22, 5],
    'continuous-learning' => [7, 'Continuous Learning', 20, 5],
    'networking-and-interpersonal-skills' => [8, 'Networking and Interpersonal Skills', 21, 6],
    'self-awareness' => [9, 'Self-Awareness', 21, 4],
    'the-hack' => [10, 'The Hack: 10 Days to Build a Business That Lasts', 10, 4],
];
const AIR_CHUNK = 4194304; // bytes per upload piece
// extension => [mime, what it may be used for]
const AIR_TYPES = [
    'mp4' => ['video/mp4', 'lesson'], 'm4v' => ['video/mp4', 'lesson'], 'webm' => ['video/webm', 'lesson'], 'mov' => ['video/quicktime', 'lesson'],
    'mp3' => ['audio/mpeg', 'lesson'], 'm4a' => ['audio/mp4', 'lesson'], 'wav' => ['audio/wav', 'lesson'], 'ogg' => ['audio/ogg', 'lesson'],
    'pdf' => ['application/pdf', 'lesson'],
    'ppt' => ['application/vnd.ms-powerpoint', 'lesson'], 'pptx' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'lesson'],
    'doc' => ['application/msword', 'lesson'], 'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'lesson'],
    'jpg' => ['image/jpeg', 'cover'], 'jpeg' => ['image/jpeg', 'cover'], 'png' => ['image/png', 'cover'], 'webp' => ['image/webp', 'cover'],
];
const AIR_LESSON_TYPES = ['Video', 'Document', 'Reading', 'Practice activity', 'Live session'];
const AIR_TRACKS = ['Employability skill', 'Career readiness', 'Technical skill', 'Entrepreneurship', 'Other'];
const AIR_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// ------------------------------------------------------------------ helpers
function air_cfg(): array
{
    $c = config()['airise'] ?? [];
    return [
        'dir' => rtrim((string) ($c['storage_dir'] ?? '') ?: dirname(__DIR__) . '/storage/airise', '/'),
        'max' => max(1, (int) ($c['max_upload_mb'] ?? 500)) * 1048576,
        'quota' => max(1, (int) ($c['trainer_quota_mb'] ?? 5000)) * 1048576,
    ];
}

/** AiRise sides this account may use: learner, trainer, admin. */
function air_access(int $uid): array
{
    $roles = [];
    foreach (q("SELECT role FROM memberships WHERE user_id = ? AND product = 'airise' AND status = 'approved'", [$uid])->fetchAll() as $m) {
        if ($m['role'] === 'customer') $roles[] = 'learner';
        if ($m['role'] === 'trainer') $roles[] = 'trainer';
    }
    if (in_array('airise', admin_products($uid), true)) $roles[] = 'admin';
    return array_values(array_unique($roles));
}

function air_require(string ...$any): array
{
    $u = require_user();
    $roles = air_access((int) $u['id']);
    if (!array_intersect($any, $roles)) {
        fail(403, 'forbidden', 'Your account does not have that AiRise access.');
    }
    return [$u, $roles];
}

/** The lessons of a series course, the same list the course player shows. */
function air_series_lessons(string $slug): array
{
    [$n, , $hours, $steps] = AIR_SERIES[$slug];
    $per = (int) min(55, max(20, round(($hours * 60 * 0.25) / $steps / 5) * 5));
    $out = [['kind' => 'practice', 'min' => 20]];
    for ($i = 0; $i < $steps; $i++) $out[] = ['kind' => 'video', 'min' => $per];
    $out[] = ['kind' => 'practice', 'min' => 45];
    $out[] = ['kind' => 'practice', 'min' => 30];
    if ($n !== 10) $out[] = ['kind' => 'quiz', 'min' => 30];
    return $out;
}

function air_course_row(int $id): ?array
{
    return row('SELECT c.*, u.full_name trainer FROM airise_courses c JOIN users u ON u.id = c.trainer_id WHERE c.id = ?', [$id]);
}

/** A trainer course's lessons in order: every titled lesson, then the quiz if it has questions. */
function air_trainer_lessons(array $d): array
{
    $out = [];
    foreach ($d['modules'] ?? [] as $mi => $m) {
        foreach ($m['lessons'] ?? [] as $l) {
            if (($l['title'] ?? '') === '') continue;
            $type = $l['type'] ?? 'Video';
            $out[] = ['t' => $l['title'], 'type' => $type, 'module' => $m['title'] ?: 'Module ' . ($mi + 1),
                'kind' => $type === 'Practice activity' ? 'practice' : 'video', 'min' => max(1, (int) ($l['min'] ?? 0) ?: 10), 'file' => $l['file'] ?? null];
        }
    }
    if (!empty($d['questions'])) {
        $nq = count($d['questions']);
        $out[] = ['t' => "Course quiz: $nq " . ($nq === 1 ? 'question' : 'questions') . ' (' . (int) $d['pass'] . '% to pass)', 'kind' => 'quiz', 'min' => max(5, count($d['questions']) * 2), 'file' => null];
    }
    return $out;
}

/** What learners see of a published trainer course: no quiz answers. */
function air_public_course(array $c, bool $withLessons = true): array
{
    $d = json_decode($c['data'], true) ?: [];
    $out = ['id' => 't' . $c['id'], 'title' => $c['title'], 'trainer' => $c['trainer'], 'trainerId' => (int) $c['trainer_id'],
        'track' => $d['track'] ?? '', 'level' => $d['level'] ?? '', 'hours' => (int) ($d['hours'] ?? 0), 'summary' => $d['summary'] ?? '',
        'outcomes' => $d['outcomes'] ?? '', 'skills' => $d['skills'] ?? [], 'cover' => $d['cover'] ?? null, 'pass' => (int) ($d['pass'] ?? 70),
        'lessonCount' => count(air_trainer_lessons($d))];
    if ($withLessons) {
        $out['lessons'] = air_trainer_lessons($d);
        $out['questions'] = array_map(fn ($q) => ['text' => $q['text'], 'opts' => $q['opts']], $d['questions'] ?? []);
        $out['scenario'] = $d['scenario'] ?? '';
    }
    return $out;
}

/** Lesson count and title for any course key, or null if it does not exist (or is not published). */
function air_course_info(string $key, bool $publishedOnly = true): ?array
{
    if (isset(AIR_SERIES[$key])) {
        $l = air_series_lessons($key);
        return ['title' => AIR_SERIES[$key][1], 'lessons' => $l, 'prefix' => AIR_SERIES[$key][0] === 10 ? 'AIR-H' : 'AIR-C' . AIR_SERIES[$key][0]];
    }
    if (preg_match('/^t(\d{1,9})$/', $key, $m)) {
        $c = air_course_row((int) $m[1]);
        if (!$c || ($publishedOnly && $c['status'] !== 'published')) return null;
        $d = json_decode($c['data'], true) ?: [];
        return ['title' => $c['title'], 'lessons' => air_trainer_lessons($d), 'prefix' => 'AIR-T' . $c['id'], 'data' => $d, 'row' => $c];
    }
    return null;
}

/** Issues the certificate once every lesson is done. Returns the number, or null. */
function air_maybe_certify(int $uid, string $key, array $info): ?string
{
    $have = row('SELECT number FROM airise_certs WHERE user_id = ? AND course = ?', [$uid, $key]);
    if ($have) return $have['number'];
    $done = (int) row('SELECT COUNT(*) n FROM airise_progress WHERE user_id = ? AND course = ? AND lesson < ?', [$uid, $key, count($info['lessons'])])['n'];
    if (!$info['lessons'] || $done < count($info['lessons'])) return null;
    $year = gmdate('Y');
    for ($try = 0; $try < 5; $try++) {
        $serial = 1 + (int) row('SELECT COUNT(*) n FROM airise_certs WHERE number LIKE ?', [$info['prefix'] . '-' . $year . '-%'])['n'] + $try;
        $number = $info['prefix'] . '-' . $year . '-' . str_pad((string) $serial, 3, '0', STR_PAD_LEFT);
        try {
            q('INSERT INTO airise_certs (user_id, course, title, number) VALUES (?, ?, ?, ?)', [$uid, $key, mb_substr($info['title'], 0, 160), $number]);
            return $number;
        } catch (PDOException $e) {
            if (row('SELECT number FROM airise_certs WHERE user_id = ? AND course = ?', [$uid, $key])) return null;
        }
    }
    return null;
}

function air_file_out(?array $f): ?array
{
    return $f ? ['id' => (int) $f['id'], 'name' => $f['name'], 'mime' => $f['mime'], 'size' => (int) $f['size']] : null;
}

// ------------------------------------------------------------------ state
function r_air_state(): never
{
    [$u, $roles] = air_require('learner', 'trainer', 'admin');
    $uid = (int) $u['id'];
    $done = [];
    foreach (q('SELECT course, lesson FROM airise_progress WHERE user_id = ? ORDER BY lesson', [$uid])->fetchAll() as $p) {
        $done[$p['course']][] = (int) $p['lesson'];
    }
    // Minutes finished per day over the last 7 days, by kind, for the study chart.
    $week = [];
    foreach (q('SELECT DATE(done_at) d, kind, SUM(minutes) m FROM airise_progress WHERE user_id = ? AND done_at >= ? GROUP BY d, kind',
        [$uid, gmdate('Y-m-d 00:00:00', time() - 6 * 86400)])->fetchAll() as $r) {
        $week[] = ['day' => $r['d'], 'kind' => $r['kind'], 'min' => (int) $r['m']];
    }
    $catalog = array_map(fn ($c) => air_public_course($c, false) + [
        'learners' => (int) row('SELECT COUNT(DISTINCT user_id) n FROM airise_progress WHERE course = ?', ['t' . $c['id']])['n'],
    ], q("SELECT c.*, u.full_name trainer FROM airise_courses c JOIN users u ON u.id = c.trainer_id WHERE c.status = 'published' ORDER BY c.published_at DESC LIMIT 200")->fetchAll());
    $out = [
        'roles' => $roles, 'done' => (object) $done, 'week' => $week, 'catalog' => $catalog,
        'certs' => array_map(fn ($c) => ['course' => $c['course'], 'title' => $c['title'], 'number' => $c['number'], 'at' => $c['issued_at']],
            q('SELECT * FROM airise_certs WHERE user_id = ? ORDER BY issued_at', [$uid])->fetchAll()),
        'quizzes' => array_map(fn ($a) => ['course' => $a['course'], 'score' => (int) $a['score'], 'total' => (int) $a['total'], 'passed' => (bool) $a['passed'], 'at' => $a['created_at']],
            q('SELECT * FROM airise_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$uid])->fetchAll()),
    ];
    if (in_array('trainer', $roles, true)) {
        $out['mine'] = array_map(function ($c) {
            $d = json_decode($c['data'], true) ?: [];
            return ['id' => (int) $c['id'], 'title' => $c['title'], 'status' => $c['status'], 'note' => (string) $c['review_note'], 'data' => $d,
                'updated' => $c['updated_at'], 'lessons' => count(array_filter(air_trainer_lessons($d), fn ($l) => $l['kind'] !== 'quiz')),
                'learners' => (int) row('SELECT COUNT(DISTINCT user_id) n FROM airise_progress WHERE course = ?', ['t' . $c['id']])['n']];
        }, q('SELECT * FROM airise_courses WHERE trainer_id = ? ORDER BY updated_at DESC', [$uid])->fetchAll());
    }
    ok($out);
}

/** One published trainer course for the course player (its trainer and admins may also preview it). */
function r_air_course(): never
{
    [$u, $roles] = air_require('learner', 'trainer', 'admin');
    $c = preg_match('/^t?(\d{1,9})$/', (string) ($_GET['id'] ?? ''), $m) ? air_course_row((int) $m[1]) : null;
    $mayPreview = $c && ((int) $c['trainer_id'] === (int) $u['id'] || in_array('admin', $roles, true));
    if (!$c || ($c['status'] !== 'published' && !$mayPreview)) fail(404, 'not_found', 'This course is not available.');
    ok(['course' => air_public_course($c) + ['status' => $c['status']]]);
}

// ------------------------------------------------------------------ learners
function r_air_progress(): never
{
    [$u] = air_require('learner', 'trainer', 'admin');
    $uid = (int) $u['id'];
    rate_limit('air-prog:' . $uid, 600, 3600);
    $key = str_in('course', 40);
    $info = air_course_info($key);
    if (!$info) fail(404, 'not_found', 'Course not found.');
    $i = int_in('lesson');
    if ($i < 0 || $i >= count($info['lessons'])) fail(422, 'invalid', 'Lesson not found.');
    $l = $info['lessons'][$i];
    if (!empty(input()['done'])) {
        // A trainer course's quiz is finished by passing it, not by ticking it.
        if ($l['kind'] === 'quiz' && str_starts_with($key, 't')) fail(409, 'state', 'Pass the quiz to finish this step.');
        q('INSERT IGNORE INTO airise_progress (user_id, course, lesson, minutes, kind) VALUES (?, ?, ?, ?, ?)', [$uid, $key, $i, $l['min'], $l['kind']]);
    } else {
        q('DELETE FROM airise_progress WHERE user_id = ? AND course = ? AND lesson = ?', [$uid, $key, $i]);
    }
    $cert = air_maybe_certify($uid, $key, $info);
    ok(['cert' => $cert]);
}

function r_air_quiz(): never
{
    [$u] = air_require('learner', 'trainer', 'admin');
    $uid = (int) $u['id'];
    rate_limit('air-quiz:' . $uid, 30, 3600);
    $key = str_in('course', 40);
    $info = air_course_info($key);
    if (!$info || empty($info['data']['questions'])) fail(404, 'not_found', 'This course has no quiz.');
    $qs = $info['data']['questions'];
    $ans = input()['answers'] ?? null;
    if (!is_array($ans) || count($ans) !== count($qs)) fail(422, 'invalid', 'Answer every question.');
    $score = 0;
    $right = [];
    foreach ($qs as $i => $q) {
        $ok = is_int($ans[$i]) && $ans[$i] === (int) $q['correct'];
        $score += $ok ? 1 : 0;
        $right[] = $ok;
    }
    $total = count($qs);
    $passed = $score * 100 >= $total * (int) ($info['data']['pass'] ?? 70);
    q('INSERT INTO airise_attempts (user_id, course, score, total, passed) VALUES (?, ?, ?, ?, ?)', [$uid, $key, $score, $total, $passed ? 1 : 0]);
    $cert = null;
    if ($passed) {
        $qi = count($info['lessons']) - 1;
        q('INSERT IGNORE INTO airise_progress (user_id, course, lesson, minutes, kind) VALUES (?, ?, ?, ?, ?)', [$uid, $key, $qi, $info['lessons'][$qi]['min'], 'quiz']);
        $cert = air_maybe_certify($uid, $key, $info);
    }
    // Which answers were right is shown; the correct option for a wrong answer is not.
    ok(['score' => $score, 'total' => $total, 'passed' => $passed, 'right' => $right, 'cert' => $cert]);
}

/** Public: anyone (an employer) can check a certificate number. */
function r_air_cert(): never
{
    rate_limit('air-cert:' . client_ip(), 60, 3600);
    $n = strtoupper(trim((string) ($_GET['number'] ?? '')));
    $c = preg_match('/^AIR-[A-Z0-9]{1,12}-\d{4}-\d{3,6}$/', $n) ? row('SELECT c.*, u.full_name FROM airise_certs c JOIN users u ON u.id = c.user_id WHERE c.number = ?', [$n]) : null;
    if (!$c) ok(['found' => false]);
    ok(['found' => true, 'number' => $c['number'], 'name' => $c['full_name'], 'title' => $c['title'], 'issued' => substr($c['issued_at'], 0, 10)]);
}

// ------------------------------------------------------------------ trainers: courses
function air_clean_course(array $in, int $uid): array
{
    $files = function ($f, string $use) use ($uid) {
        $id = is_array($f) ? (int) ($f['id'] ?? 0) : 0;
        if (!$id) return null;
        $r = row('SELECT * FROM airise_files WHERE id = ? AND owner_id = ? AND received = size', [$id, $uid]);
        if (!$r) return null;
        $ext = strtolower(pathinfo($r['name'], PATHINFO_EXTENSION));
        if ((AIR_TYPES[$ext][1] ?? '') !== $use) return null;
        return air_file_out($r);
    };
    $mods = [];
    foreach (array_slice(is_array($in['modules'] ?? null) ? $in['modules'] : [], 0, 30) as $m) {
        if (!is_array($m)) continue;
        $ls = [];
        foreach (array_slice(is_array($m['lessons'] ?? null) ? $m['lessons'] : [], 0, 40) as $l) {
            if (!is_array($l)) continue;
            $ls[] = ['title' => sub_in($l, 'title', 140), 'type' => in_array($l['type'] ?? '', AIR_LESSON_TYPES, true) ? $l['type'] : 'Video',
                'min' => max(0, min(600, (int) ($l['min'] ?? 0))), 'file' => $files($l['file'] ?? null, 'lesson')];
        }
        $mods[] = ['title' => sub_in($m, 'title', 120), 'lessons' => $ls ?: [['title' => '', 'type' => 'Video', 'min' => 0, 'file' => null]]];
    }
    $qs = [];
    foreach (array_slice(is_array($in['questions'] ?? null) ? $in['questions'] : [], 0, 50) as $q) {
        if (!is_array($q)) continue;
        $opts = array_map(fn ($o) => is_string($o) ? mb_substr(trim($o), 0, 200) : '', array_slice(array_values((array) ($q['opts'] ?? [])), 0, 4));
        $opts = array_pad($opts, 4, '');
        $qs[] = ['text' => sub_in($q, 'text', 300), 'opts' => $opts, 'correct' => max(-1, min(3, (int) ($q['correct'] ?? -1)))];
    }
    $skills = array_values(array_intersect(array_map(fn ($c) => $c[1], array_slice(AIR_SERIES, 0, 9)), array_filter((array) ($in['skills'] ?? []), 'is_string')));
    return [
        'title' => sub_in($in, 'title', 120), 'track' => in_array($in['track'] ?? '', AIR_TRACKS, true) ? $in['track'] : 'Other',
        'level' => in_array($in['level'] ?? '', AIR_LEVELS, true) ? $in['level'] : 'Beginner', 'hours' => max(0, min(500, (int) ($in['hours'] ?? 0))),
        'summary' => sub_in($in, 'summary', 2000), 'outcomes' => sub_in($in, 'outcomes', 2000), 'skills' => $skills,
        'cover' => $files($in['cover'] ?? null, 'cover'), 'modules' => $mods ?: [['title' => '', 'lessons' => [['title' => '', 'type' => 'Video', 'min' => 0, 'file' => null]]]],
        'questions' => $qs, 'scenario' => sub_in($in, 'scenario', 3000), 'pass' => max(40, min(100, (int) ($in['pass'] ?? 70))),
    ];
}

/** Why a course cannot be sent for review yet, or null. */
function air_course_problem(array $d): ?string
{
    if (mb_strlen($d['title']) < 5) return 'Give the course a title of at least 5 characters.';
    if (mb_strlen($d['summary']) < 30) return 'Write a summary of at least 30 characters.';
    if (!$d['skills']) return 'Map the course to at least one employability skill.';
    if ($d['hours'] < 1) return 'Estimate how many hours the course takes.';
    $lessons = array_filter(air_trainer_lessons($d), fn ($l) => $l['kind'] !== 'quiz');
    if (!$lessons) return 'Add at least one lesson with a title.';
    foreach ($d['questions'] as $i => $q) {
        if ($q['text'] === '' || $q['correct'] < 0 || $q['opts'][$q['correct']] === '') return 'Question ' . ($i + 1) . ' needs text and a correct answer.';
    }
    return null;
}

function r_air_course_save(): never
{
    [$u] = air_require('trainer');
    $uid = (int) $u['id'];
    rate_limit('air-course:' . $uid, 120, 3600);
    $in = input();
    $id = int_in('id');
    $cur = $id ? row('SELECT * FROM airise_courses WHERE id = ? AND trainer_id = ?', [$id, $uid]) : null;
    if ($id && !$cur) fail(404, 'not_found', 'Course not found.');
    if (($in['action'] ?? '') === 'delete') {
        if (!$cur || !in_array($cur['status'], ['draft', 'changes'], true)) fail(409, 'state', 'Only drafts can be deleted.');
        q('DELETE FROM airise_courses WHERE id = ?', [$id]);
        ok(['message' => 'Draft deleted']);
    }
    if ($cur && in_array($cur['status'], ['review', 'published'], true)) {
        fail(409, 'state', $cur['status'] === 'review' ? 'This course is being reviewed. You can edit it again if AiRise asks for changes.' : 'Published courses cannot be edited here. Contact AiRise to change one.');
    }
    $d = air_clean_course(is_array($in['data'] ?? null) ? $in['data'] : [], $uid);
    if ($d['title'] === '') fail(422, 'invalid', 'Give the course a title before saving.');
    $submit = ($in['action'] ?? '') === 'submit';
    if ($submit && ($p = air_course_problem($d))) fail(422, 'invalid', $p);
    $status = $submit ? 'review' : 'draft';
    if ($cur) {
        q('UPDATE airise_courses SET title = ?, data = ?, status = ?, submitted_at = ' . ($submit ? '?' : 'submitted_at') . ' WHERE id = ?',
            $submit ? [$d['title'], json_encode($d), $status, now_utc(), $id] : [$d['title'], json_encode($d), $status, $id]);
    } else {
        if ((int) row('SELECT COUNT(*) n FROM airise_courses WHERE trainer_id = ?', [$uid])['n'] >= 100) fail(422, 'invalid', 'You have reached the limit of 100 courses.');
        q('INSERT INTO airise_courses (trainer_id, title, data, status, submitted_at) VALUES (?, ?, ?, ?, ?)', [$uid, $d['title'], json_encode($d), $status, $submit ? now_utc() : null]);
        $id = (int) db()->lastInsertId();
    }
    if ($submit) {
        $to = (string) (config()['admin_notify_email'] ?? '');
        if ($to !== '' && valid_email($to)) {
            send_mail($to, 'AiRise course to review', "{$u['full_name']} ({$u['email']}) sent \"{$d['title']}\" for review.\n\nReview it in the Rehohub admin console → AiRise courses: " . site_url('account/admin.html'));
        }
    }
    ok(['id' => $id, 'message' => $submit ? 'Submitted for review. AiRise will reply within 5 working days.' : 'Draft saved']);
}

// ------------------------------------------------------------------ trainers: files
function r_air_upload_start(): never
{
    [$u] = air_require('trainer');
    $uid = (int) $u['id'];
    rate_limit('air-up:' . $uid, 200, 3600);
    $cfg = air_cfg();
    $name = preg_replace('/[^\p{L}\p{N} ._()-]/u', '_', str_in('name', 160)) ?: 'file';
    $size = (int) (input()['size'] ?? 0);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $use = str_in('use', 10) === 'cover' ? 'cover' : 'lesson';
    if (!isset(AIR_TYPES[$ext]) || AIR_TYPES[$ext][1] !== $use) {
        fail(422, 'invalid', $use === 'cover' ? 'Use a JPG, PNG or WebP picture for the cover.' : 'Use a video (MP4, WebM, MOV), audio (MP3, M4A, WAV), PDF, slides or a Word document.');
    }
    $max = $use === 'cover' ? min($cfg['max'], 5 * 1048576) : $cfg['max'];
    if ($size < 1 || $size > $max) fail(422, 'invalid', 'That file is too large. The limit is ' . (int) ($max / 1048576) . ' MB.');
    $used = (int) row('SELECT COALESCE(SUM(size), 0) n FROM airise_files WHERE owner_id = ?', [$uid])['n'];
    if ($used + $size > $cfg['quota']) fail(422, 'invalid', 'You have used your upload space. Contact AiRise for more.');
    if (!is_dir($cfg['dir']) && !@mkdir($cfg['dir'], 0750, true)) {
        error_log('AiRise: cannot create storage folder ' . $cfg['dir']);
        fail(500, 'storage', 'Uploads are not set up on the server yet. Please tell AiRise.');
    }
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    if (@file_put_contents($cfg['dir'] . '/' . $stored, '') === false) {
        fail(500, 'storage', 'Uploads are not set up on the server yet. Please tell AiRise.');
    }
    q('INSERT INTO airise_files (owner_id, name, mime, size, stored_as) VALUES (?, ?, ?, ?, ?)', [$uid, $name, AIR_TYPES[$ext][0], $size, $stored]);
    ok(['id' => (int) db()->lastInsertId(), 'chunk' => AIR_CHUNK]);
}

/** One piece of a file, sent as application/octet-stream to airise/upload/chunk?id=&offset=. */
function r_air_upload_chunk(): never
{
    [$u] = air_require('trainer');
    $f = row('SELECT * FROM airise_files WHERE id = ? AND owner_id = ?', [(int) ($_GET['id'] ?? 0), (int) $u['id']]);
    if (!$f) fail(404, 'not_found', 'Upload not found.');
    $offset = (int) ($_GET['offset'] ?? -1);
    if ($offset !== (int) $f['received']) ok(['received' => (int) $f['received']]); // resume from where the server is
    $data = file_get_contents('php://input', false, null, 0, AIR_CHUNK + 1);
    if ($data === false || $data === '' || strlen($data) > AIR_CHUNK || $offset + strlen($data) > (int) $f['size']) fail(422, 'invalid', 'That piece of the file could not be read.');
    $path = air_cfg()['dir'] . '/' . $f['stored_as'];
    $h = @fopen($path, 'cb');
    if (!$h || !flock($h, LOCK_EX)) fail(500, 'storage', 'The file could not be saved.');
    clearstatcache(true, $path);
    if (filesize($path) !== $offset) {
        flock($h, LOCK_UN);
        fclose($h);
        ok(['received' => (int) $f['received']]);
    }
    fseek($h, $offset);
    fwrite($h, $data);
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    $got = $offset + strlen($data);
    q('UPDATE airise_files SET received = ? WHERE id = ?', [$got, (int) $f['id']]);
    if ($got === (int) $f['size'] && str_starts_with($f['mime'], 'image/') && !@getimagesize($path)) {
        @unlink($path);
        q('DELETE FROM airise_files WHERE id = ?', [(int) $f['id']]);
        fail(422, 'invalid', 'That file is not a picture we can use.');
    }
    ok(['received' => $got, 'done' => $got === (int) $f['size'], 'file' => $got === (int) $f['size'] ? air_file_out($f) : null]);
}

/** Hands out a file to its owner, AiRise administrators, or anyone on AiRise if its course is published. */
function r_air_file(): never
{
    [$u, $roles] = air_require('learner', 'trainer', 'admin');
    $f = row('SELECT * FROM airise_files WHERE id = ? AND received = size', [(int) ($_GET['id'] ?? 0)]);
    $allowed = $f && ((int) $f['owner_id'] === (int) $u['id'] || in_array('admin', $roles, true));
    if ($f && !$allowed) {
        // In a published course by the same trainer that references this file.
        $needle = '"id":' . (int) $f['id'] . ',';
        foreach (q("SELECT data FROM airise_courses WHERE trainer_id = ? AND status = 'published'", [(int) $f['owner_id']])->fetchAll() as $c) {
            if (str_contains($c['data'], $needle)) {
                $allowed = true;
                break;
            }
        }
    }
    $path = $f ? air_cfg()['dir'] . '/' . basename($f['stored_as']) : '';
    if (!$allowed || !is_file($path)) fail(404, 'not_found', 'File not found.');
    $size = filesize($path);
    $start = 0;
    $end = $size - 1;
    if (preg_match('/^bytes=(\d*)-(\d*)$/', (string) ($_SERVER['HTTP_RANGE'] ?? ''), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int) $m[2]);
        } else {
            $start = (int) $m[1];
            $end = $m[2] === '' ? $end : min($end, (int) $m[2]);
        }
        if ($start > $end || $start >= $size) {
            header('Content-Range: bytes */' . $size);
            http_response_code(416);
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    $inline = preg_match('#^(video|audio|image)/|^application/pdf$#', $f['mime']);
    header('Content-Type: ' . $f['mime']);
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('Cache-Control: private, max-age=3600');
    header("Content-Disposition: " . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($f['name']));
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    $h = fopen($path, 'rb');
    fseek($h, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($h)) {
        $buf = fread($h, (int) min(1048576, $left));
        echo $buf;
        $left -= strlen($buf);
        flush();
    }
    fclose($h);
    exit;
}

// ------------------------------------------------------------------ administrators: review
function r_air_admin_courses(): never
{
    air_require('admin');
    $st = (string) ($_GET['status'] ?? 'review');
    $where = in_array($st, ['review', 'published', 'changes', 'draft'], true) ? 'WHERE c.status = ?' : "WHERE c.status <> 'draft'";
    $rows = q("SELECT c.*, u.full_name trainer, u.email FROM airise_courses c JOIN users u ON u.id = c.trainer_id $where ORDER BY COALESCE(c.submitted_at, c.updated_at) DESC LIMIT 200",
        $where === 'WHERE c.status = ?' ? [$st] : [])->fetchAll();
    ok(['items' => array_map(fn ($c) => ['id' => (int) $c['id'], 'title' => $c['title'], 'status' => $c['status'], 'note' => (string) $c['review_note'],
        'trainer' => $c['trainer'], 'email' => $c['email'], 'submitted' => $c['submitted_at'], 'published' => $c['published_at'],
        'data' => json_decode($c['data'], true) ?: [], 'learners' => (int) row('SELECT COUNT(DISTINCT user_id) n FROM airise_progress WHERE course = ?', ['t' . $c['id']])['n']], $rows)]);
}

function r_air_admin_review(): never
{
    [$u] = air_require('admin');
    $c = air_course_row(int_in('id'));
    if (!$c) fail(404, 'not_found', 'Course not found.');
    if ((int) $c['trainer_id'] === (int) $u['id']) fail(403, 'forbidden', 'Another administrator must review your own course.');
    $decision = str_in('decision', 12);
    $note = str_in('note', 500);
    if ($decision === 'publish') {
        if ($c['status'] !== 'review') fail(409, 'state', 'Only courses waiting for review can be published.');
        q("UPDATE airise_courses SET status = 'published', published_at = ?, review_note = NULLIF(?, ''), reviewed_by = ? WHERE id = ?", [now_utc(), $note, (int) $u['id'], (int) $c['id']]);
        $subject = 'Your AiRise course is published';
        $body = "\"{$c['title']}\" is now live for AiRise learners." . ($note !== '' ? "\n\nNote from AiRise: $note" : '');
    } elseif ($decision === 'changes' || $decision === 'unpublish') {
        if ($note === '') fail(422, 'invalid', 'Tell the trainer what to change.');
        if (!in_array($c['status'], $decision === 'changes' ? ['review'] : ['published'], true)) fail(409, 'state', 'That course is not in the right state for this.');
        q("UPDATE airise_courses SET status = 'changes', review_note = ?, reviewed_by = ? WHERE id = ?", [$note, (int) $u['id'], (int) $c['id']]);
        $subject = $decision === 'changes' ? 'Changes requested on your AiRise course' : 'Your AiRise course was taken down';
        $body = "\"{$c['title']}\": $note\n\nEdit it and send it again from the trainer studio: " . site_url('products/airise/trainer.html');
    } else {
        fail(422, 'invalid', 'Unknown decision.');
    }
    $t = row('SELECT email FROM users WHERE id = ?', [(int) $c['trainer_id']]);
    if ($t) send_mail($t['email'], $subject, $body);
    audit((int) $u['id'], 'airise_course_' . $decision, (int) $c['trainer_id'], ['course' => (int) $c['id']]);
    ok(['message' => $decision === 'publish' ? 'Published. The trainer has been emailed.' : 'Sent back to the trainer.']);
}
