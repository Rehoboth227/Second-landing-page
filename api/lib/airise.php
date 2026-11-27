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
 * Files: trainers upload cover pictures and lesson files, and learners upload portfolio documents,
 * in 4 MB pieces (api/lib/uploads.php). They are kept in a private folder (config 'airise.storage_dir',
 * default api/storage/airise, which api/storage/.htaccess blocks) and only handed out through
 * airise/file to people allowed to see them.
 *
 * Portfolios: a learner records their course of study, grades and preferred career path, and files
 * documents into four folders. AiRise administrators verify documents. A score out of 100 (AiRise
 * certificates, grades, verified documents and a complete profile) ranks learners within their career
 * path, and approved employers can search learners who chose to show their portfolio.
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
// What each upload may be: extensions accepted (see UP_MIME in uploads.php).
const AIR_USES = [
    'lesson' => ['mp4', 'm4v', 'webm', 'mov', 'mp3', 'm4a', 'wav', 'ogg', 'pdf', 'ppt', 'pptx', 'doc', 'docx'],
    'cover' => ['jpg', 'jpeg', 'png', 'webp'],
    'portfolio' => ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'],
];
const AIR_FOLDERS = [
    'results' => 'Academic results', 'certificates' => 'Certificates and awards',
    'projects' => 'Projects and work samples', 'references' => 'References and recommendations',
];
// Career paths: label, the series courses that matter most (in order), and words that match trainer courses.
const AIR_CAREERS = [
    'data' => ['Data and business analysis', ['problem-solving', 'continuous-learning', 'communication-skills'], ['data', 'excel', 'analys', 'sql', 'statistic', 'power bi']],
    'software' => ['Software and IT', ['problem-solving', 'continuous-learning', 'teamwork-and-collaboration'], ['software', 'coding', 'program', 'developer', 'web', 'it support', 'computer']],
    'customer' => ['Customer service', ['communication-skills', 'adaptability', 'work-ethics-and-reliability'], ['customer', 'service', 'call centre', 'support']],
    'sales' => ['Sales and marketing', ['networking-and-interpersonal-skills', 'communication-skills', 'initiative-and-proactivity'], ['sales', 'marketing', 'brand', 'social media', 'digital']],
    'operations' => ['Project and operations management', ['teamwork-and-collaboration', 'work-ethics-and-reliability', 'problem-solving'], ['project', 'operations', 'management', 'logistics', 'supply']],
    'finance' => ['Finance and accounting', ['work-ethics-and-reliability', 'problem-solving', 'continuous-learning'], ['finance', 'account', 'bank', 'audit', 'excel']],
    'hr' => ['Human resources', ['communication-skills', 'self-awareness', 'teamwork-and-collaboration'], ['human resource', 'hr', 'recruit', 'people']],
    'teaching' => ['Teaching and training', ['communication-skills', 'self-awareness', 'adaptability'], ['teach', 'training', 'education', 'facilitat']],
    'health' => ['Healthcare', ['work-ethics-and-reliability', 'communication-skills', 'teamwork-and-collaboration'], ['health', 'nurs', 'care', 'medical', 'pharma']],
    'business' => ['Entrepreneurship', ['the-hack', 'initiative-and-proactivity', 'networking-and-interpersonal-skills'], ['business', 'entrepreneur', 'startup', 'small business']],
    'other' => ['Other', ['communication-skills', 'problem-solving', 'adaptability'], []],
];
const AIR_LESSON_TYPES = ['Video', 'Document', 'Reading', 'Practice activity', 'Live session'];
const AIR_TRACKS = ['Employability skill', 'Career readiness', 'Technical skill', 'Entrepreneurship', 'Other'];
const AIR_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// ------------------------------------------------------------------ helpers
function air_cfg(): array
{
    $c = config()['airise'] ?? [];
    return [
        'dir' => up_dir('airise'),
        'max' => max(1, (int) ($c['max_upload_mb'] ?? 500)) * 1048576,
        'quota' => max(1, (int) ($c['trainer_quota_mb'] ?? 5000)) * 1048576,
        'learner_quota' => max(1, (int) ($c['learner_quota_mb'] ?? 200)) * 1048576,
    ];
}

/** AiRise sides this account may use: learner, trainer, admin. */
function air_access(int $uid): array
{
    $roles = [];
    foreach (q("SELECT role FROM memberships WHERE user_id = ? AND product = 'airise' AND status = 'approved'", [$uid])->fetchAll() as $m) {
        if ($m['role'] === 'customer') $roles[] = 'learner';
        if ($m['role'] === 'trainer') $roles[] = 'trainer';
        if ($m['role'] === 'employer') $roles[] = 'employer';
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
    return up_file_out($f);
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
    if (in_array('learner', $roles, true)) {
        $out['rank'] = air_rank($uid);
        $out['suggest'] = air_suggest($uid);
    }
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
        if (!in_array($ext, AIR_USES[$use], true)) return null;
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

// ------------------------------------------------------------------ files (trainers and learners)
function r_air_upload_start(): never
{
    [$u, $roles] = air_require('trainer', 'learner');
    $uid = (int) $u['id'];
    rate_limit('air-up:' . $uid, 200, 3600);
    $cfg = air_cfg();
    $use = str_in('use', 10);
    if (!isset(AIR_USES[$use])) $use = 'lesson';
    if ($use !== 'portfolio' && !in_array('trainer', $roles, true)) fail(403, 'forbidden', 'Only trainers upload course files.');
    $msg = ['cover' => 'Use a JPG, PNG or WebP picture for the cover.', 'portfolio' => 'Use a PDF, a picture (JPG, PNG) or a Word document.',
        'lesson' => 'Use a video (MP4, WebM, MOV), audio (MP3, M4A, WAV), PDF, slides or a Word document.'][$use];
    $max = ['cover' => min($cfg['max'], 5 * 1048576), 'portfolio' => min($cfg['max'], 20 * 1048576), 'lesson' => $cfg['max']][$use];
    $quota = $use === 'portfolio' && !in_array('trainer', $roles, true) ? $cfg['learner_quota'] : $cfg['quota'];
    ok(up_start('airise_files', $cfg['dir'], $uid, AIR_USES[$use], $max, $quota, $msg));
}

function r_air_upload_chunk(): never
{
    [$u] = air_require('trainer', 'learner');
    ok(up_chunk('airise_files', air_cfg()['dir'], (int) $u['id']));
}

/**
 * Hands out a file to: its owner; AiRise administrators; anyone on AiRise if it belongs to a published
 * course; approved employers if it is in a portfolio its owner chose to show (and was not rejected).
 */
function r_air_file(): never
{
    [$u, $roles] = air_require('learner', 'trainer', 'admin', 'employer');
    $f = row('SELECT * FROM airise_files WHERE id = ? AND received = size', [(int) ($_GET['id'] ?? 0)]);
    $allowed = $f && ((int) $f['owner_id'] === (int) $u['id'] || in_array('admin', $roles, true));
    if ($f && !$allowed && array_intersect(['learner', 'trainer'], $roles)) {
        $needle = '"id":' . (int) $f['id'] . ',';
        foreach (q("SELECT data FROM airise_courses WHERE trainer_id = ? AND status = 'published'", [(int) $f['owner_id']])->fetchAll() as $c) {
            if (str_contains($c['data'], $needle)) {
                $allowed = true;
                break;
            }
        }
    }
    if ($f && !$allowed && in_array('employer', $roles, true)) {
        $allowed = (bool) row("SELECT 1 FROM airise_docs d JOIN airise_profiles p ON p.user_id = d.user_id AND p.visible = 1
                               WHERE d.file_id = ? AND d.status <> 'rejected'", [(int) $f['id']]);
    }
    if (!$allowed) fail(404, 'not_found', 'File not found.');
    up_send(air_cfg()['dir'], $f, isset($_GET['download']));
}

// ------------------------------------------------------------------ learner portfolios
function air_profile(int $uid): array
{
    $p = row('SELECT * FROM airise_profiles WHERE user_id = ?', [$uid]) ?: [];
    return [
        'course' => (string) ($p['course_of_study'] ?? ''), 'institution' => (string) ($p['institution'] ?? ''),
        'level' => (string) ($p['level'] ?? ''), 'grade' => (string) ($p['grade'] ?? ''),
        'cgpa' => isset($p['cgpa']) ? (float) $p['cgpa'] : null, 'scale' => (int) ($p['cgpa_scale'] ?? 5),
        'career' => (string) ($p['career'] ?? ''), 'about' => (string) ($p['about'] ?? ''), 'visible' => (bool) ($p['visible'] ?? false),
    ];
}

function air_docs(int $uid, bool $forEmployer = false): array
{
    $rows = q('SELECT d.*, f.name fname, f.mime, f.size FROM airise_docs d JOIN airise_files f ON f.id = d.file_id WHERE d.user_id = ?'
        . ($forEmployer ? " AND d.status <> 'rejected'" : '') . ' ORDER BY d.id DESC', [$uid])->fetchAll();
    return array_map(fn ($d) => ['id' => (int) $d['id'], 'folder' => $d['folder'], 'title' => $d['title'], 'status' => $d['status'],
        'note' => $forEmployer ? '' : (string) $d['note'], 'at' => $d['created_at'],
        'file' => ['id' => (int) $d['file_id'], 'name' => $d['fname'], 'mime' => $d['mime'], 'size' => (int) $d['size']]], $rows);
}

/**
 * The portfolio score out of 100, with each part explained so learners know how to raise it.
 * Certificates 35 · Grades 25 · Portfolio documents 30 · Complete profile 10.
 */
function air_score(int $uid, ?array $p = null): array
{
    $p ??= air_profile($uid);
    $certs = q('SELECT course FROM airise_certs WHERE user_id = ?', [$uid])->fetchAll();
    $series = count(array_filter($certs, fn ($c) => isset(AIR_SERIES[$c['course']]) && $c['course'] !== 'the-hack'));
    $hack = count(array_filter($certs, fn ($c) => $c['course'] === 'the-hack'));
    $trainer = count($certs) - $series - $hack;
    $certPts = min(35, $series * 5 + $hack * 4 + $trainer * 3);

    $docs = q('SELECT folder, status FROM airise_docs WHERE user_id = ?', [$uid])->fetchAll();
    $count = fn (string $folder, string $st) => count(array_filter($docs, fn ($d) => $d['folder'] === $folder && $d['status'] === $st));
    $resultsVerified = $count('results', 'verified') > 0;

    $academic = 0.0;
    if ($p['cgpa'] !== null && $p['scale'] > 0) {
        $academic = min(1, $p['cgpa'] / $p['scale']) * 15 * ($resultsVerified ? 1 : ($count('results', 'pending') ? 0.5 : 0.25));
    }
    $best = [];
    foreach (q('SELECT course, MAX(score / total) r FROM airise_attempts WHERE user_id = ? GROUP BY course', [$uid])->fetchAll() as $a) $best[] = (float) $a['r'];
    $quiz = $best ? array_sum($best) / count($best) * 10 : 0.0;

    $docPts = ($resultsVerified ? 10 : ($count('results', 'pending') ? 4 : 0))
        + min(8, $count('certificates', 'verified') * 4 + $count('certificates', 'pending'))
        + min(9, $count('projects', 'verified') * 3 + $count('projects', 'pending') * 1.5)
        + min(3, $count('references', 'verified') * 3 + $count('references', 'pending'));
    $profPts = 2 * count(array_filter([$p['course'], $p['institution'], $p['career'], $p['cgpa'] !== null ? 'y' : '', mb_strlen($p['about']) >= 40 ? 'y' : '']));

    $parts = [
        ['AiRise certificates', round($certPts, 1), 35, $series . ' of 9 series courses' . ($hack ? ', The Hack' : '') . ($trainer ? ", $trainer trainer course" . ($trainer > 1 ? 's' : '') : '')],
        ['Grades', round($academic + $quiz, 1), 25, ($p['cgpa'] !== null ? 'Academic grade' . ($resultsVerified ? ' (results verified)' : ' (counts fully once your results are verified)') : 'Add your grade') . ' · ' . ($best ? 'AiRise quiz average ' . round(array_sum($best) / count($best) * 100) . '%' : 'no graded quizzes yet')],
        ['Portfolio documents', round($docPts, 1), 30, 'Verified documents count fully; documents waiting for checks count partly'],
        ['Complete profile', $profPts, 10, 'Course of study, institution, career path, grade and a short summary'],
    ];
    return ['total' => round(array_sum(array_column($parts, 1)), 1), 'parts' => $parts];
}

/** This learner's place among learners on the same career path who show their portfolio (plus themselves). */
function air_rank(int $uid): ?array
{
    $p = air_profile($uid);
    $mine = air_score($uid, $p);
    if ($p['career'] === '' || !isset(AIR_CAREERS[$p['career']])) return ['career' => '', 'label' => '', 'position' => null, 'of' => 0, 'score' => $mine['total']];
    $ids = array_map('intval', array_column(q('SELECT user_id FROM airise_profiles WHERE career = ? AND visible = 1 AND user_id <> ? LIMIT 2000', [$p['career'], $uid])->fetchAll(), 'user_id'));
    $better = 0;
    foreach ($ids as $id) {
        if (air_score($id)['total'] > $mine['total']) $better++;
    }
    return ['career' => $p['career'], 'label' => AIR_CAREERS[$p['career']][0], 'position' => $better + 1, 'of' => count($ids) + 1, 'score' => $mine['total']];
}

/** Courses to take next, from the career path, the course of study and what is not finished yet. */
function air_suggest(int $uid): array
{
    $p = air_profile($uid);
    $done = [];
    foreach (q('SELECT course, COUNT(*) n FROM airise_progress WHERE user_id = ? GROUP BY course', [$uid])->fetchAll() as $r) $done[$r['course']] = (int) $r['n'];
    $certified = array_column(q('SELECT course FROM airise_certs WHERE user_id = ?', [$uid])->fetchAll(), 'course');
    $career = AIR_CAREERS[$p['career']] ?? null;
    $words = $career ? $career[2] : [];
    foreach (preg_split('/[^a-z]+/', strtolower($p['course'])) as $w) {
        if (strlen($w) > 3 && !in_array($w, ['bachelor', 'science', 'studies', 'master', 'degree', 'diploma', 'with', 'and'], true)) $words[] = $w;
    }
    $out = [];
    $add = function (string $key, string $title, int $score, string $why) use (&$out, $certified) {
        if (in_array($key, $certified, true) || isset($out[$key])) return;
        $out[$key] = ['course' => $key, 'title' => $title, 'score' => $score, 'why' => $why];
    };
    if ($career) {
        foreach ($career[1] as $i => $slug) {
            $add($slug, AIR_SERIES[$slug][1], 30 - $i * 5 + (isset($done[$slug]) ? 3 : 0), 'A key skill for ' . strtolower($career[0]));
        }
    }
    foreach (q("SELECT id, title, data FROM airise_courses WHERE status = 'published' ORDER BY published_at DESC LIMIT 200")->fetchAll() as $c) {
        $d = json_decode($c['data'], true) ?: [];
        $hay = strtolower($c['title'] . ' ' . ($d['summary'] ?? '') . ' ' . ($d['track'] ?? '') . ' ' . implode(' ', $d['skills'] ?? []));
        $hit = array_values(array_filter($words, fn ($w) => $w !== '' && str_contains($hay, $w)));
        if ($hit) {
            $fromStudy = $p['course'] !== '' && str_contains(strtolower($p['course']), $hit[0]);
            $add('t' . $c['id'], $c['title'], 22 + count($hit) * 2, $fromStudy ? 'Builds on your course of study' : ($career ? 'Matches your path: ' . strtolower($career[0]) : 'Matches your interests'));
        }
    }
    // Keep going with the series in order.
    foreach (AIR_SERIES as $slug => [$n, $title]) {
        if ($n <= 9) $add($slug, $title, 10 - $n + (isset($done[$slug]) ? 8 : 0), isset($done[$slug]) ? 'You have started this course' : 'Next in the Employability Skills Series');
    }
    usort($out, fn ($a, $b) => $b['score'] <=> $a['score']);
    return array_map(fn ($x) => ['course' => $x['course'], 'title' => $x['title'], 'why' => $x['why']], array_slice(array_values($out), 0, 6));
}

/** Short tips on what would raise the score most. */
function air_tips(int $uid, array $p): array
{
    $docs = q('SELECT folder, status FROM airise_docs WHERE user_id = ?', [$uid])->fetchAll();
    $has = fn (string $f) => (bool) array_filter($docs, fn ($d) => $d['folder'] === $f && $d['status'] !== 'rejected');
    $tips = [];
    if ($p['career'] === '') $tips[] = 'Choose your preferred career path to be ranked and get course suggestions.';
    if (!$has('results')) $tips[] = 'Add your academic results (transcript or result slip) to the Academic results folder.';
    if ($p['cgpa'] === null) $tips[] = 'Enter your grade (CGPA) so it counts in your score.';
    if (!$has('projects')) $tips[] = 'Add a project or work sample that shows what you can do.';
    if (!$p['visible']) $tips[] = 'Your portfolio is hidden from employers. Turn on "Show my portfolio to employers" when you are ready.';
    return $tips;
}

function r_air_portfolio(): never
{
    [$u] = air_require('learner');
    $uid = (int) $u['id'];
    $p = air_profile($uid);
    ok(['profile' => $p, 'docs' => air_docs($uid), 'score' => air_score($uid, $p), 'rank' => air_rank($uid), 'suggest' => air_suggest($uid),
        'tips' => air_tips($uid, $p), 'careers' => array_map(fn ($k, $c) => ['key' => $k, 'label' => $c[0]], array_keys(AIR_CAREERS), AIR_CAREERS),
        'folders' => AIR_FOLDERS]);
}

function r_air_portfolio_save(): never
{
    [$u] = air_require('learner');
    $uid = (int) $u['id'];
    rate_limit('air-pf:' . $uid, 120, 3600);
    $in = input();
    $career = str_in('career', 20);
    if ($career !== '' && !isset(AIR_CAREERS[$career])) fail(422, 'invalid', 'Choose a career path from the list.');
    $scale = (int) ($in['scale'] ?? 5) === 4 ? 4 : 5;
    $cgpa = null;
    if (($in['cgpa'] ?? '') !== '' && $in['cgpa'] !== null) {
        if (!is_numeric($in['cgpa']) || (float) $in['cgpa'] < 0 || (float) $in['cgpa'] > $scale) fail(422, 'invalid', "Enter your CGPA as a number from 0 to $scale.", ['cgpa' => "A number from 0 to $scale."]);
        $cgpa = round((float) $in['cgpa'], 2);
    }
    $vals = [$uid, str_in('course', 120) ?: null, str_in('institution', 120) ?: null, str_in('level', 40) ?: null, str_in('grade', 60) ?: null,
        $cgpa, $scale, $career ?: null, str_in('about', 600) ?: null, !empty($in['visible']) ? 1 : 0];
    q('INSERT INTO airise_profiles (user_id, course_of_study, institution, level, grade, cgpa, cgpa_scale, career, about, visible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE course_of_study = VALUES(course_of_study), institution = VALUES(institution), level = VALUES(level), grade = VALUES(grade),
       cgpa = VALUES(cgpa), cgpa_scale = VALUES(cgpa_scale), career = VALUES(career), about = VALUES(about), visible = VALUES(visible)', $vals);
    ok(['message' => 'Portfolio saved']);
}

function r_air_portfolio_doc(): never
{
    [$u] = air_require('learner');
    $uid = (int) $u['id'];
    rate_limit('air-doc:' . $uid, 120, 3600);
    $in = input();
    if (($in['action'] ?? '') === 'delete') {
        q('DELETE FROM airise_docs WHERE id = ? AND user_id = ?', [int_in('id'), $uid]);
        ok(['message' => 'Document removed']);
    }
    $folder = str_in('folder', 20);
    if (!isset(AIR_FOLDERS[$folder])) fail(422, 'invalid', 'Choose a folder.');
    $title = str_in('title', 120);
    if (mb_strlen($title) < 2) fail(422, 'invalid', 'Give the document a title, e.g. "Year 3 result slip".', ['title' => 'Give the document a title.']);
    $fid = is_array($in['file'] ?? null) ? (int) ($in['file']['id'] ?? 0) : 0;
    $f = $fid ? row('SELECT * FROM airise_files WHERE id = ? AND owner_id = ? AND received = size', [$fid, $uid]) : null;
    if (!$f || !in_array(strtolower(pathinfo($f['name'], PATHINFO_EXTENSION)), AIR_USES['portfolio'], true)) fail(422, 'invalid', 'Upload the file first.');
    if ((int) row('SELECT COUNT(*) n FROM airise_docs WHERE user_id = ?', [$uid])['n'] >= 60) fail(422, 'invalid', 'A portfolio can hold up to 60 documents.');
    q('INSERT INTO airise_docs (user_id, folder, title, file_id) VALUES (?, ?, ?, ?)', [$uid, $folder, $title, $fid]);
    ok(['message' => 'Added. AiRise will check it; verified documents count fully in your score.']);
}

// ------------------------------------------------------------------ employers: talent search
function air_talent_card(array $r): array
{
    $p = air_profile((int) $r['user_id']);
    $sc = air_score((int) $r['user_id'], $p);
    $docs = q("SELECT folder, status FROM airise_docs WHERE user_id = ? AND status <> 'rejected'", [(int) $r['user_id']])->fetchAll();
    $folders = [];
    foreach (AIR_FOLDERS as $k => $label) {
        $in = array_filter($docs, fn ($d) => $d['folder'] === $k);
        $folders[] = ['key' => $k, 'label' => $label, 'count' => count($in), 'verified' => count(array_filter($in, fn ($d) => $d['status'] === 'verified'))];
    }
    return ['id' => (int) $r['user_id'], 'name' => $r['full_name'], 'course' => $p['course'], 'institution' => $p['institution'], 'level' => $p['level'],
        'grade' => $p['grade'], 'cgpa' => $p['cgpa'], 'scale' => $p['scale'], 'career' => $p['career'], 'careerLabel' => AIR_CAREERS[$p['career']][0] ?? '',
        'score' => $sc['total'], 'parts' => $sc['parts'], 'folders' => $folders,
        'certs' => (int) row('SELECT COUNT(*) n FROM airise_certs WHERE user_id = ?', [(int) $r['user_id']])['n']];
}

function r_air_talent(): never
{
    air_require('employer', 'admin');
    rate_limit('air-talent:' . client_ip(), 300, 3600);
    $career = (string) ($_GET['career'] ?? '');
    $qs = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 60);
    $where = ['p.visible = 1'];
    $args = [];
    if (isset(AIR_CAREERS[$career])) {
        $where[] = 'p.career = ?';
        $args[] = $career;
    }
    if ($qs !== '') {
        $where[] = '(p.course_of_study LIKE ? OR p.institution LIKE ? OR u.full_name LIKE ?)';
        array_push($args, "%$qs%", "%$qs%", "%$qs%");
    }
    $rows = q('SELECT p.user_id, u.full_name FROM airise_profiles p JOIN users u ON u.id = p.user_id AND u.status IN (\'active\', \'warning\')
               WHERE ' . implode(' AND ', $where) . ' LIMIT 500', $args)->fetchAll();
    $cards = array_map('air_talent_card', $rows);
    usort($cards, fn ($a, $b) => $b['score'] <=> $a['score']);
    // Rank within each career path.
    $seen = [];
    foreach ($cards as &$c) {
        $c['rank'] = ($seen[$c['career']] = ($seen[$c['career']] ?? 0) + 1);
    }
    ok(['items' => $cards, 'careers' => array_map(fn ($k, $c) => ['key' => $k, 'label' => $c[0]], array_keys(AIR_CAREERS), AIR_CAREERS), 'folders' => AIR_FOLDERS]);
}

function r_air_talent_one(): never
{
    air_require('employer', 'admin');
    $r = row("SELECT p.user_id, u.full_name, u.email FROM airise_profiles p JOIN users u ON u.id = p.user_id AND u.status IN ('active', 'warning')
              WHERE p.user_id = ? AND p.visible = 1", [(int) ($_GET['id'] ?? 0)]);
    if (!$r) fail(404, 'not_found', 'This portfolio is not available.');
    $uid = (int) $r['user_id'];
    ok(['learner' => air_talent_card($r) + ['email' => $r['email'], 'about' => air_profile($uid)['about'], 'docs' => air_docs($uid, true),
        'certList' => array_map(fn ($c) => ['title' => $c['title'], 'number' => $c['number'], 'at' => substr($c['issued_at'], 0, 10)],
            q('SELECT * FROM airise_certs WHERE user_id = ? ORDER BY issued_at', [$uid])->fetchAll())]]);
}

// ------------------------------------------------------------------ administrators: portfolio documents
function r_air_admin_docs(): never
{
    air_require('admin');
    $st = (string) ($_GET['status'] ?? 'pending');
    $rows = q('SELECT d.*, u.full_name, u.email, f.name fname, f.mime, f.size FROM airise_docs d JOIN users u ON u.id = d.user_id JOIN airise_files f ON f.id = d.file_id
               WHERE d.status = ? ORDER BY d.id LIMIT 300', [in_array($st, ['pending', 'verified', 'rejected'], true) ? $st : 'pending'])->fetchAll();
    ok(['items' => array_map(fn ($d) => ['id' => (int) $d['id'], 'learner' => $d['full_name'], 'email' => $d['email'], 'folder' => AIR_FOLDERS[$d['folder']] ?? $d['folder'],
        'title' => $d['title'], 'status' => $d['status'], 'note' => (string) $d['note'], 'at' => $d['created_at'],
        'file' => ['id' => (int) $d['file_id'], 'name' => $d['fname'], 'mime' => $d['mime'], 'size' => (int) $d['size']],
        'profile' => air_profile((int) $d['user_id'])], $rows)]);
}

function r_air_admin_doc(): never
{
    [$u] = air_require('admin');
    $d = row('SELECT d.*, u.email FROM airise_docs d JOIN users u ON u.id = d.user_id WHERE d.id = ?', [int_in('id')]);
    if (!$d) fail(404, 'not_found', 'Document not found.');
    if ((int) $d['user_id'] === (int) $u['id']) fail(403, 'forbidden', 'Another administrator must check your own documents.');
    $decision = str_in('decision', 10);
    $note = str_in('note', 300);
    if (!in_array($decision, ['verify', 'reject'], true)) fail(422, 'invalid', 'Unknown decision.');
    if ($decision === 'reject' && $note === '') fail(422, 'invalid', 'Tell the learner why.');
    q('UPDATE airise_docs SET status = ?, note = NULLIF(?, \'\'), reviewed_by = ?, reviewed_at = ? WHERE id = ?',
        [$decision === 'verify' ? 'verified' : 'rejected', $note, (int) $u['id'], now_utc(), (int) $d['id']]);
    if ($decision === 'reject') {
        send_mail($d['email'], 'About a document in your AiRise portfolio', "\"{$d['title']}\" could not be verified: $note\n\nYou can upload a clearer copy from your portfolio: " . site_url('products/airise/portfolio.html'));
    }
    audit((int) $u['id'], 'airise_doc_' . $decision, (int) $d['user_id'], ['doc' => (int) $d['id']]);
    ok(['message' => $decision === 'verify' ? 'Verified.' : 'Marked as not verified. The learner has been emailed.']);
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
