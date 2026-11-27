<?php
/*
 * Rehohub account system: settings.
 *
 * 1. Copy this file to  /home/YOUR_CPANEL_USERNAME/rehohub-config.php
 *    (one level ABOVE public_html, so it can never be opened in a browser).
 * 2. Fill in the values below.
 * 3. Keep the copy private. Do not commit it to GitHub.
 *
 * If you cannot place it above public_html, save it as public_html/api/config.php instead;
 * api/.htaccess blocks it from being downloaded, but outside public_html is safer.
 */
return [
    // 'production' on the live site. 'development' only on a test computer.
    'env' => 'production',

    // Full address of the site, without a trailing slash. Used in email links.
    'site_url' => 'https://www.rehohub.com',

    // cPanel > MySQL Databases: the database, user and password you created.
    'db' => [
        'host' => 'localhost',
        'name' => 'cpaneluser_rehohub',
        'user' => 'cpaneluser_rehoapi',
        'pass' => 'PUT-THE-DATABASE-PASSWORD-HERE',
    ],

    // Refuse to work over plain http (keep true once SSL is on).
    'require_https' => true,

    // How emails are sent.
    // 'mail'  = cPanel's built-in mailer (simplest; uses the From address below).
    // 'smtp'  = log in to your cPanel mailbox and send through it (better delivery).
    'mail' => [
        'transport'  => 'smtp',
        'from_email' => 'no-reply@rehohub.com',
        'from_name'  => 'Rehohub',
        // Only for 'smtp' (cPanel > Email Accounts > Connect Devices shows these):
        'smtp_host'  => 'mail.rehohub.com',
        'smtp_port'  => 465,            // 465 = SSL
        'smtp_user'  => 'no-reply@rehohub.com',
        'smtp_pass'  => 'PUT-THE-MAILBOX-PASSWORD-HERE',
    ],

    // Google Maps for AiMove (optional). Leave both '' to use estimated distances and the
    // illustrated map. See DEPLOY.md, "Google Maps for AiMove", for how to create the two keys.
    // server_key: used only by this server to measure road distances (Routes API).
    // browser_key: used by visitors' browsers for the maps and address suggestions;
    //              restrict it to your website address in Google Cloud.
    'google_maps' => [
        'server_key'  => '',
        'browser_key' => '',
    ],

    // AiRise course files (lesson videos, PDFs, slides, cover pictures) uploaded by trainers.
    // storage_dir: a folder the website can write to. Best OUTSIDE public_html, e.g.
    //              '/home/YOUR_CPANEL_USERNAME/airise-files'. Leave '' to use public_html/api/storage/airise
    //              (blocked from direct download by api/storage/.htaccess).
    // max_upload_mb: largest single file. trainer_quota_mb: total space for each trainer.
    'airise' => [
        'storage_dir'      => '',
        'max_upload_mb'    => 500,
        'trainer_quota_mb' => 5000,
        'learner_quota_mb' => 200,      // space for each learner's portfolio documents
    ],

    // AiPay digital products (e-books, audiobooks) uploaded by sellers. Same idea as AiRise:
    // best outside public_html, e.g. '/home/YOUR_CPANEL_USERNAME/aipay-files'.
    // Leave '' to use public_html/api/storage/aipay.
    'aipay' => [
        'storage_dir'       => '',
        'max_upload_mb'     => 100,
        'merchant_quota_mb' => 2000,
    ],

    // Where to send "new application waiting for approval" alerts. Leave '' to skip.
    'admin_notify_email' => 'info@rehohub.com',

    // FIRST ADMIN ONLY. Make up a long random phrase (at least 24 characters), open
    // https://www.rehohub.com/account/setup.html, enter it there and create your own
    // administrator account. That page stops working as soon as one administrator
    // exists. Afterwards, set this back to '' (empty).
    'setup_token' => '',
];
