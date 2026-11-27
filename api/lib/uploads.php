<?php
/*
 * Private file uploads shared by AiRise (course files, learner portfolios) and AiPay (digital products
 * such as e-books). Files arrive in 4 MB pieces (fits cPanel's usual upload limits), are written to a
 * private folder that is never served directly, and are handed out only through each product's own
 * permission check. Each product keeps its own table with the same columns:
 *   id, owner_id, name, mime, size, received, stored_as, created_at
 */
declare(strict_types=1);

const UP_CHUNK = 4194304; // bytes per piece
// extension => mime. Each product passes the extensions it accepts for each use.
const UP_MIME = [
    'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime',
    'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'm4b' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg',
    'pdf' => 'application/pdf', 'epub' => 'application/epub+zip', 'mobi' => 'application/x-mobipocket-ebook', 'azw3' => 'application/vnd.amazon.ebook',
    'ppt' => 'application/vnd.ms-powerpoint', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'doc' => 'application/msword', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
];

/** The storage folder for a product: config [product]['storage_dir'], else api/storage/[product]. */
function up_dir(string $product): string
{
    $d = (string) ((config()[$product] ?? [])['storage_dir'] ?? '');
    return rtrim($d !== '' ? $d : dirname(__DIR__) . '/storage/' . $product, '/');
}

/** Starts an upload. $exts: allowed extensions. Returns ['id' => ..., 'chunk' => ...]. */
function up_start(string $table, string $dir, int $uid, array $exts, int $max, int $quota, string $kindMsg): array
{
    $name = preg_replace('/[^\p{L}\p{N} ._()-]/u', '_', str_in('name', 160)) ?: 'file';
    $size = (int) (input()['size'] ?? 0);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($ext, $exts, true) || !isset(UP_MIME[$ext])) fail(422, 'invalid', $kindMsg);
    if ($size < 1 || $size > $max) fail(422, 'invalid', 'That file is too large. The limit is ' . max(1, (int) round($max / 1048576)) . ' MB.');
    $used = (int) row("SELECT COALESCE(SUM(size), 0) n FROM $table WHERE owner_id = ?", [$uid])['n'];
    if ($used + $size > $quota) fail(422, 'invalid', 'You have used all your upload space. Remove some files or contact us for more.');
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        error_log("Uploads: cannot create storage folder $dir");
        fail(500, 'storage', 'Uploads are not set up on the server yet. Please tell us.');
    }
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    if (@file_put_contents($dir . '/' . $stored, '') === false) {
        error_log("Uploads: cannot write to $dir");
        fail(500, 'storage', 'Uploads are not set up on the server yet. Please tell us.');
    }
    q("INSERT INTO $table (owner_id, name, mime, size, stored_as) VALUES (?, ?, ?, ?, ?)", [$uid, $name, UP_MIME[$ext], $size, $stored]);
    return ['id' => (int) db()->lastInsertId(), 'chunk' => UP_CHUNK];
}

function up_file_out(?array $f): ?array
{
    return $f ? ['id' => (int) $f['id'], 'name' => $f['name'], 'mime' => $f['mime'], 'size' => (int) $f['size']] : null;
}

/** Stores one piece sent as application/octet-stream to ...?id=&offset=. Resumes if a piece is repeated. */
function up_chunk(string $table, string $dir, int $uid): array
{
    $f = row("SELECT * FROM $table WHERE id = ? AND owner_id = ?", [(int) ($_GET['id'] ?? 0), $uid]);
    if (!$f) fail(404, 'not_found', 'Upload not found.');
    $offset = (int) ($_GET['offset'] ?? -1);
    if ($offset !== (int) $f['received']) return ['received' => (int) $f['received']];
    $data = file_get_contents('php://input', false, null, 0, UP_CHUNK + 1);
    if ($data === false || $data === '' || strlen($data) > UP_CHUNK || $offset + strlen($data) > (int) $f['size']) fail(422, 'invalid', 'That piece of the file could not be read.');
    $path = $dir . '/' . basename($f['stored_as']);
    $h = @fopen($path, 'cb');
    if (!$h || !flock($h, LOCK_EX)) fail(500, 'storage', 'The file could not be saved.');
    clearstatcache(true, $path);
    if (filesize($path) !== $offset) {
        flock($h, LOCK_UN);
        fclose($h);
        return ['received' => (int) $f['received']];
    }
    fseek($h, $offset);
    fwrite($h, $data);
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    $got = $offset + strlen($data);
    q("UPDATE $table SET received = ? WHERE id = ?", [$got, (int) $f['id']]);
    $done = $got === (int) $f['size'];
    if ($done && str_starts_with($f['mime'], 'image/') && !@getimagesize($path)) {
        @unlink($path);
        q("DELETE FROM $table WHERE id = ?", [(int) $f['id']]);
        fail(422, 'invalid', 'That file is not a picture we can use.');
    }
    if ($done && $f['mime'] === 'application/pdf' && file_get_contents($path, false, null, 0, 5) !== '%PDF-') {
        @unlink($path);
        q("DELETE FROM $table WHERE id = ?", [(int) $f['id']]);
        fail(422, 'invalid', 'That file is not a PDF we can use.');
    }
    return ['received' => $got, 'done' => $done, 'file' => $done ? up_file_out($f) : null];
}

/** Sends a stored file (with byte ranges, so videos can seek). $download forces "save as". */
function up_send(string $dir, array $f, bool $download = false): never
{
    $path = $dir . '/' . basename($f['stored_as']);
    if (!is_file($path)) fail(404, 'not_found', 'File not found.');
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
    $inline = !$download && preg_match('#^(video|audio|image)/|^application/pdf$#', $f['mime']);
    header('Content-Type: ' . $f['mime']);
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('Cache-Control: private, max-age=3600');
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($f['name']));
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
