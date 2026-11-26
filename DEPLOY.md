# Rehohub accounts: going live on cPanel

The site now has one shared **Rehohub account system** for AiPay, AiMove, GreenFed and AiRise.
It is plain **PHP 8.1+ and MySQL**, the same as your Namecheap cPanel hosting, with no extra
services, frameworks or monthly fees. This guide lists everything **you** need to do in cPanel.
It takes about 30 minutes.

> Where things live:
> `account/` sign-in, sign-up, My account and the admin console (web pages)
> `api/` the server code that checks passwords, roles and approvals
> `database/schema.sql` the empty tables, imported once in phpMyAdmin
> `assets/js/rh-auth.js` the small browser helper every page uses to talk to `api/`

---

## Step 1: upload the new files

Upload the latest ZIP from GitHub exactly as before (File Manager → `public_html` → Upload →
Extract → move the files up out of the `Second-landing-page-main` folder, overwriting old ones).
You should now also see the folders `account`, `api` and `database` inside `public_html`.

## Step 2: check the PHP version

cPanel → **Select PHP Version** (or **MultiPHP Manager**): choose **PHP 8.1, 8.2 or 8.3** for
rehohub.com. Under **Extensions**, make sure these are ticked: `pdo_mysql`, `mbstring`, `openssl`.
They usually are already.

## Step 3: create the database

1. cPanel → **MySQL Databases**.
2. **Create New Database**: name it `rehohub` (cPanel shows it as `yourcpaneluser_rehohub`).
3. **Add New User**: name it `rehoapi`. Click **Password Generator**, copy the password somewhere
   safe, then create the user (shown as `yourcpaneluser_rehoapi`).
4. **Add User To Database**: pick that user and database, tick **ALL PRIVILEGES**, save.

## Step 4: import the tables

1. cPanel → **phpMyAdmin** → click your new database on the left.
2. **Import** tab → choose `database/schema.sql` from the ZIP on your computer → **Import**.
3. You should see 5 tables: `users`, `memberships`, `tokens`, `rate_limits`, `audit_log`.
   They are empty: there are no built-in users or passwords.

## Step 5: create the sending address (email)

1. cPanel → **Email Accounts** → **Create**: `no-reply@rehohub.com`, with a strong generated
   password (copy it).
2. Open that mailbox's **Connect Devices** page and note the **Outgoing server**
   (usually `mail.rehohub.com`, SMTP port **465**, SSL).
3. cPanel → **Email Deliverability**: if rehohub.com shows a problem with **DKIM** or **SPF**,
   click **Repair**. This keeps verification emails out of spam.

## Step 6: write the private settings file

1. File Manager → go **up one level** from `public_html` to your home folder
   (`/home/yourcpaneluser`).
2. Copy `public_html/api/config.sample.php` into this home folder and rename the copy to
   **`rehohub-config.php`**. Keeping it outside `public_html` means nobody can ever download it.
3. Right-click → **Edit**, and fill in:
   - `db` → `name`, `user`, `pass` from step 3 (with the `yourcpaneluser_` prefixes).
   - `mail` → `smtp_pass` = the mailbox password from step 5 (and `smtp_host` if different).
   - `admin_notify_email` → where "new application waiting" alerts go (e.g. `info@rehohub.com`).
   - `setup_token` → make up a long random phrase, **at least 24 characters**, e.g. four or five
     unrelated words. You'll type it once in step 8.
4. Save. Set its permissions to **600** (right-click → Change Permissions → only Owner Read + Write).

## Step 7: make sure https works

cPanel → **SSL/TLS Status** → **Run AutoSSL** if rehohub.com isn't green. The account system
refuses to run over plain `http://`, to protect passwords.

## Step 8: create your own administrator account

1. Visit **https://www.rehohub.com/account/setup.html**.
2. Enter the setup phrase from step 6, then your own name, email and a strong password.
3. You are now the **super administrator** and land on the admin console.
4. This page now refuses to work for anyone, because an administrator exists.
5. **Go back to `rehohub-config.php` and set `setup_token` to `''` (empty).**

## Step 9: test it

1. In a private browser window, open **https://www.rehohub.com/account/register.html**, sign up
   as a GreenFed customer with a second email address, and confirm the email arrives (check spam).
2. Sign up again as an **AiMove rider** with a third address. After confirming the email, the
   application appears in **Admin console → Applications**. Approve it, and the rider gets an email.
3. Try **Invitations** to add a colleague as a GreenFed employee or a product administrator.

If anything fails, cPanel → **Errors** (or `public_html/error_log`) shows what went wrong. Error
messages never include passwords.

## Updating a site that is already live (AiPay app, November 2026)

If your database was created before the AiPay app, run this once, or AiPay "Request a payment
system" sign-ups will fail:

1. cPanel → **phpMyAdmin** → click your Rehohub database on the left → **SQL** tab.
2. Paste the contents of `database/migrations-001-aipay-gateway.sql` and press **Go**.

It only adds the new role to the list of allowed roles; no data changes.

---

## Who can do what

| Person                                                                   | How they get access                                                                       | What they can see and do                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Customer (shopper, sender, GreenFed customer, AiRise learner)            | Signs up → confirms email → **approved automatically**                                    | Their own account and the customer side of each product they joined   |
| Rider, merchant, AiPay payment system, GreenFed employee, AiRise trainer | Signs up or adds the role in My account → confirms email → **waits for an administrator** | Nothing on that side until approved; then only that side              |
| Product administrator (e.g. GreenFed admin)                              | **Invitation only**, sent by a super administrator                                        | Applications, invitations and approvals **for that product only**     |
| Super administrator                                                      | The one-time setup (you), then **invitation only**                                        | Everything: all applications, all users, account status, activity log |

- Account status (Admin console → **Users**): **active, warning, suspended, banned, deactivated**.
  Suspending, banning or deactivating signs the person out **everywhere immediately**.
- Nobody can approve their own application or change their own status, and the last super
  administrator can't be suspended or blocked.
- Every sign-up, sign-in, failed sign-in, approval, rejection, status change and invitation is
  recorded in **Admin console → Activity log**, with who did it and from which IP address.

## Security, and no hidden access

- There is **no back door**: no master password, no hidden page, no built-in account and no
  access for Claude or anyone else. The only ways to become an administrator are the one-time
  setup (which needs the phrase only you put in your private file, and closes for good once an
  administrator exists) and an invitation from an existing super administrator, both of which
  are written to the activity log. You can check this yourself: all routes are listed at the top
  of `api/index.php`.
- Passwords are stored only as secure hashes (PHP `password_hash`). Email, reset and invitation
  links are single-use, expire, and only their fingerprint (SHA-256) is stored.
- AiPay's password reset code (6 digits, emailed) expires in 10 minutes, works once, and allows
  5 tries an hour per email address.
- Five wrong passwords lock an account for 15 minutes; sign-up, sign-in and reset are rate-limited.
- Sessions use secure, HttpOnly cookies; every change needs a per-session security token (CSRF).
- Every database query uses prepared statements; application details are checked against a fixed
  list of allowed fields.
- The browser pages only show or hide screens. **The server decides** what each person may do, so
  changing the page code in a browser does not give anyone more access.

## What is still front-end only (next phases)

- **Product data**: GreenFed meal plans, orders and records, AiMove deliveries and wallet, and
  AiRise course progress, and AiPay payments, products and notifications are still saved
  **per account on the person's device**. AiPay checkouts run in test mode and move no money. The apps say so
  with a "Preview" note. Moving each of these into the database is the next phase, one product
  at a time.
- **Payments** (Paystack or Flutterwave), **document uploads** (ID, licence, CAC certificate) for
  approvals, **two-factor sign-in for administrators**, and the **terms and privacy policy pages**
  (the sign-up form links to the contact section for now).
- **Backups**: turn on cPanel → **Backup** (or JetBackup) so the database is backed up daily.
