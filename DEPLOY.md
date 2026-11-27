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

## Updating a site that is already live: the AiPay store (November 2026)

The AiPay store keeps stores, products, orders and notifications in your database. If your
database was set up before this update, add the new tables once:

1. cPanel → **phpMyAdmin** → click your Rehohub database on the left → **SQL** tab.
2. Open `database/migrations-001-aipay-store.sql` from the new files, copy everything, paste it
   into the box and press **Go**. It only adds tables whose names start with `aipay_`; nothing
   else changes. (New installs don't need this: `schema.sql` already has them.)
3. Upload the new files as usual (Step 1), including `api/lib/aipay.php`.

**How an AiPay store goes live:**

1. The merchant signs up as **Sell on AiPay**, confirms their email, opens AiPay and fills in
   **Profile Set Up** (business details, payout bank account, logo).
2. They pay the one-off **NGN 10,000 review fee** by transfer to **Rehohub Ltd, Moniepoint,
   810512715**, then enter the name and bank they paid from. You get an email.
3. In **Admin console → Applications**, the merchant's card shows the fee and the store details.
   Check the Moniepoint account, then press **Confirm fee received** (or **Fee not received**
   with a reason), and **Approve** the application.
4. The store is live once both are done: its products appear in the AiPay Store.

**How buyers pay:** by bank transfer straight to the store's account shown at checkout. The buyer
taps "I've sent the money", the store checks its account and taps **Payment received**, and the
order moves on (processing → ready → shipped → delivered). AiPay does not hold money and card
payment is shown as "coming soon" until a payment provider (e.g. Paystack) is connected.

## Updating a site that is already live: AiMove on the server (November 2026)

AiMove now keeps deliveries, the escrow wallet, rider earnings, messages and notifications in
your database instead of on each person's device. Add the new tables once:

1. cPanel → **phpMyAdmin** → your Rehohub database → **SQL** tab.
2. Paste everything from `database/migrations-002-aimove.sql` and press **Go**. It only adds
   tables whose names start with `aimove_`.
3. Upload the new files as usual (Step 1), including `api/lib/aimove.php`.

Anything people did in AiMove before this update was only saved in their own browser, so it
does not carry over: everyone starts with an empty wallet and no deliveries.

**How money moves in AiMove** (you run this from AiMove → **Top-ups & payouts**, signed in as
an administrator):

1. A customer tops up their wallet by transferring to **Rehohub Ltd, Moniepoint, 810512715**
   and telling AiMove the amount and the account they paid from. You get an email.
2. Check the Moniepoint account, then press **Confirm received** (or **Not received**). Only
   then does the money appear in their wallet.
3. Booking a delivery moves the price from their wallet into **escrow**. The server works out
   every price; nobody can change it from their browser.
4. When the rider enters the recipient's 4-digit PIN, 85% of the delivery fare goes to the
   rider's earnings automatically. The rest (15% plus the booking fee) is AiMove's.
   Cancelling before pickup refunds the customer's wallet.
5. A rider asks to withdraw their earnings to their bank. You get an email. Transfer the money
   to them, then press **Mark paid** (or **Return** to put it back in their earnings).

Riders must be approved in **Admin console → Applications** before they can take jobs.

## Updating a site that is already live: GreenFed on the server (November 2026)

GreenFed now keeps households, health records, meal plans, grocery orders, staff work and
communities in your database instead of on each person's device. Add the new tables once:

1. cPanel → **phpMyAdmin** → your Rehohub database → **SQL** tab.
2. Paste everything from `database/migrations-003-greenfed.sql` and press **Go**. It only adds
   tables whose names start with `gf_`, plus the starting prices, the grocery list and six
   starter communities. Running it again does not change prices you have already set.
3. Upload the new files as usual (Step 1), including `api/lib/greenfed.php`.

Anything people did in GreenFed before this update was only saved in their own browser, so it
does not carry over: everyone starts with an empty household and no orders.

**Set your prices first.** Sign in as an administrator, open GreenFed → **Prices and bank**:

- **Meal plan price** per person per week (starts at ₦25,000) and the **nutritionist's pay per
  delivered plan** (starts at ₦3,000). These are placeholders: change them before launch.
- The **grocery items**: price, unit, discount, what each contains (allergies), and whether it is
  on sale. Every item price is a placeholder too.
- The **bank account customers pay into**. It is set to **Access Bank, 0790145581, "GreenFed"**.
  Correct the account name to match the bank's records exactly.

New prices only apply to new orders. The server works out every price; nobody can change one
from their browser.

**How a GreenFed order works:**

1. A customer orders a meal plan or groceries and sees GreenFed's bank account and a reference
   (for example GF-12). They transfer the money and press **I've sent the money**, giving the
   name and bank they paid from. You get an email.
2. Check the Access Bank account, then open GreenFed → **Overview → Payments to confirm** and
   press **Money received** (or **Not received**, with a message; the customer is asked to check).
   Nobody can confirm a payment for their own order.
3. Only after you confirm does the order reach staff. Meal plans go to nutritionists: one picks
   it, writes the 7-day plan (drafted from the meal library around the allergies, then edited)
   and delivers it. Groceries go supplier → supply manager → quality assurance → packaging and
   delivery. The customer sees each step and the name of whoever is working on it.
4. Customers can cancel only before you confirm payment. After that, a cancellation and refund
   is handled by you, outside the app.

**Paying staff:**

- **Nutritionists** are paid per delivered meal plan. Overview → **Staff work meters** shows what
  each is owed and the bank account they saved. Pay them by transfer, then press **Mark ₦… paid**;
  their counter starts again.
- **Everyone else** (supply manager, quality assurance, packaging and delivery, health
  specialist) is on salary, and **suppliers** are partners paid per delivery contract, both
  outside the app. Their meter only counts work; press **Reset counter** at the start of each cycle.

**Communities:** six starter communities are added (Allergies, Balanced diet, Weight, Diet and
diabetes, Food & craft, Recovery kitchen). Customers and health specialists can create more,
public or private; the creator approves who joins a private one. Administrators can remove any post.

Approve GreenFed staff in **Admin console → Applications**; their type (nutritionist, supplier
and so on) comes from their application.

## Updating a site that is already live: AiRise on the server (November 2026)

AiRise now keeps learner progress, certificates, quiz results and trainers' courses (with their
files) in your database and on your server, instead of in each person's browser.

1. cPanel → **phpMyAdmin** → your Rehohub database → **SQL** tab. Paste everything from
   `database/migrations-004-airise.sql` and press **Go**. It only adds tables whose names start
   with `airise_`.
2. Upload the new files as usual (Step 1), including `api/lib/airise.php` and the folder
   `api/storage/` with its `.htaccess` file. (In File Manager, turn on **Settings → Show Hidden
   Files** to see it.) That `.htaccess` stops anyone downloading uploaded files directly.
3. **Choose where uploaded files are kept** (recommended, about 5 minutes). Skip this and everything still
   works: files then go to `public_html/api/storage/`, which `api/storage/.htaccess` blocks from direct
   download. Keeping them outside `public_html` is safer still. See **"Where uploaded files are kept"**
   below for the step-by-step (it covers AiRise and AiPay files in one go).

4. Nothing else to change in PHP: files arrive in 4 MB pieces, which fits cPanel's usual upload
   limits.

Progress people made before this update was only saved in their own browser, so it does not
carry over: everyone starts at 0, and the sample progress and sample courses are gone.

**How it works:**

- **Learners**: every lesson they finish is saved to their account. When a course is complete,
  the server issues a certificate with a unique number (for example AIR-C3-2026-001). Employers
  can check any number on the Rheti **Certificates** page, which shows the learner's name, the
  course and the date.
- **Trainers** (approved in **Admin console → Applications**) write a course in the trainer
  studio. Files upload as soon as they choose them and stay private.
- **Reviewing courses**: you get an email when a trainer submits one. Open **Admin console →
  AiRise courses**. Check the lessons and files, and the quiz answers (shown with ✓), and press
  **Preview** to see it as a learner. Then press **Publish**, or **Ask for changes** with a note,
  which is emailed to the trainer. A published course can be taken down later with **Take down**.
  Nobody can review their own course.
- Quizzes on trainer courses are marked by the server and learners never see the answers. The
  nine-course series quizzes are sat with the instructor and then marked complete, as before.

## Updating a site that is already live: e-books on AiPay, portfolios and employers on AiRise (November 2026)

Run this **after** the AiRise migration above (004).

1. cPanel → **phpMyAdmin** → your Rehohub database → **SQL** tab. Paste everything from
   `database/migrations-005-portfolios-and-ebooks.sql` and press **Go**. It adds new tables and two new
   values to existing lists (the "employer" role and "digital" AiPay orders). Running it again changes
   nothing.
2. Upload the new files as usual, including `api/lib/uploads.php`, `assets/js/airise-portfolio.js`,
   `products/airise/portfolio.html` and `products/airise/talent.html`.
3. E-book files are kept privately on the server, never on the seller's device. Where they go is set in the
   same place as AiRise files: see **"Where uploaded files are kept"** below.

**AiPay e-books and audiobooks**

- A seller ticks **This is a digital download** when adding a product and uploads the file (PDF, EPUB, MOBI,
  AZW3, MP3, M4A or M4B). It never runs out of stock.
- An order of only downloads has no delivery step. The buyer pays the seller by transfer as usual; when the
  seller confirms the payment, the order is complete and a **Download** button appears in the buyer's order.
  Only that buyer (and the seller) can download it, and the buyer keeps the exact file they paid for even if
  the seller later replaces it.

**AiRise portfolios and employers**

- Learners open **My portfolio** to add their course of study, school, grade (CGPA), preferred career path
  and a short summary, and to upload documents into four folders: academic results, certificates and awards,
  projects and work samples, references. Portfolios are **hidden until the learner chooses** "Show my
  portfolio to employers".
- **Checking documents**: Admin console → **AiRise courses** → choose **Portfolio documents to check**. Open
  each file and press **Verified** or **Can't verify** (with a reason, emailed to the learner).
- **Score and ranking** (out of 100, shown to the learner with how to raise it): AiRise certificates up to
  35, grades up to 25 (CGPA counts fully once a results document is verified, plus AiRise quiz marks),
  portfolio documents up to 30 (verified documents count fully, waiting ones partly), a complete profile 10.
  Learners are ranked against others on the same career path who show their portfolio.
- **Course suggestions** on the dashboard and portfolio come from the career path, the course of study and
  what the learner has not finished.
- **Employers** sign up with **Hire from AiRise** (company name and job title). Approve them in **Admin
  console → Applications** only once you know the company is real: they will see learners' names, email
  addresses and documents. Approved employers use the **Talent search** page; they only see portfolios
  learners chose to show, and never documents you could not verify.

## Where uploaded files are kept (the settings file)

AiRise course videos, learner portfolio documents and AiPay e-books are files people upload. By default they
are saved in `public_html/api/storage/`, protected by `api/storage/.htaccess`. It is safer to keep them in a
folder **outside** `public_html`, where a browser can never reach them. To do that:

1. **Find your cPanel username.** It is shown on the right of the cPanel home page ("Current user"), and in
   File Manager the top folder is `/home/` followed by it, e.g. `/home/rehohub1`.
2. **Make two folders.** In File Manager, go to that top folder (the one that _contains_ `public_html`, not
   inside it) and click **+ Folder** twice: `airise-files` and `aipay-files`.
3. **Open the settings file.** This is the private file you made in Step 6, `rehohub-config.php`, in that
   same top folder (next to `public_html`). If you put it in `public_html/api/config.php` instead, open that.
   Right-click it → **Edit**.
4. **Paste the settings.** First search the file (Ctrl+F) for `'airise' =>`. If it is already there (copies of
   the sample made from late November 2026 include it), don't paste anything: just type the folder paths
   between the quotes after `'storage_dir' =>` in the `'airise'` and `'aipay'` sections, e.g.
   `'storage_dir' => '/home/rehohub1/airise-files',`, then go to step 5. Otherwise, near the bottom of the
   file you will see these two lines:

   ```php
       'setup_token' => '',
   ];
   ```

   Click at the start of the line `];` and paste the block below **just above it**. Replace `rehohub1` with
   your own cPanel username in both places:

   ```php
       // Where uploaded files are kept (outside public_html).
       'airise' => [
           'storage_dir'      => '/home/rehohub1/airise-files',
           'max_upload_mb'    => 500,   // largest single course file
           'trainer_quota_mb' => 5000,  // total space for each trainer
           'learner_quota_mb' => 200,   // space for each learner's portfolio
       ],
       'aipay' => [
           'storage_dir'       => '/home/rehohub1/aipay-files',
           'max_upload_mb'     => 100,  // largest e-book or audiobook
           'merchant_quota_mb' => 2000, // total space for each seller
       ],
   ```

   The end of the file should then read `'setup_token' => '',` then your pasted block, then `];`. Every
   line inside the brackets ends with a comma; the very last line of the file is `];`.

5. **Save Changes.** Then check: sign in as a trainer and upload a small file to a course. If it uploads,
   you're done. If you see "Uploads are not set up on the server yet", the folder path is wrong (check the
   username and spelling) or the folder is missing.

Course videos take space: check **cPanel → Disk Usage** now and then.

## Updating a site that is already live: seller links, payments tab, AiRise classes and opportunities (November 2026)

Run this **after** migrations 004 and 005.

1. cPanel → **phpMyAdmin** → your Rehohub database → **SQL** tab. Paste everything from
   `database/migrations-006-airise-cohorts-opportunities.sql` and press **Go**. It only adds new tables.
2. Upload the new files as usual, including `api/lib/admin_payments.php`, `api/lib/airise_hub.php`,
   `assets/js/airise-hub.js` and the new pages in `products/airise/`: `courses.html`, `assessments.html`,
   `certificates.html`, `opportunities.html`, `classes.html`, `cohorts.html`, `jobs.html`, `verify.html`.

**What's new:**

- **Admin console → Payments to confirm.** AiMove wallet top-ups, AiMove rider payouts and GreenFed meal plan
  and grocery payments now all wait here for you, with a count on the tab. The email you get when someone
  says they have paid links straight to it. A GreenFed meal plan only reaches nutritionists after you press
  **Money received**. (AiPay order payments go to each seller's own bank and are confirmed by the seller.)
- **Each AiPay seller has their own shop link** (shown under the logo in their store menu, with a copy
  button), e.g. `www.rehohub.com/products/aipay.html#/s/12-tolu-books`. It opens a page with only that
  seller's profile and products, which they can share on WhatsApp or Instagram. Their products still show in
  the main AiPay Store too.
- **AiRise learner menu stays inside AiRise:** Courses (every course with progress), Assessments (picks up
  the assessment they were last working on, plus every assessment and result), Certificates (all certificates
  earned, with numbers to share), Opportunities (SIWES, internships and jobs posted by employers; learners
  apply with their portfolio), and **My classes** (cohorts, class schedule, trainer messages, notifications).
- **Trainers → Run a cohort:** create a cohort for a course, share its join code or add learners by email,
  schedule live classes (a free Jitsi Meet room is created for them, or they paste a Zoom or Google Meet
  link), cancel a class, and message everyone. Learners are told in AiRise and by email.
- **Employers:** **Opportunities** to post SIWES placements, internships and jobs, see applicants with their
  portfolio and score, and shortlist or decline them (the learner is told). **Check a certificate** now works
  inside the employer area.
- **Admin console → AiRise courses → "Opportunities posted by employers"** lets you remove any post.

## Google Maps for AiMove (optional, recommended)

Without keys, AiMove estimates distances from the addresses and shows an illustrated map. With
Google Maps keys, addresses suggest themselves as people type, prices use the real road
distance, and customers and operations follow the rider live on a map.

1. Go to **console.cloud.google.com** and sign in with the Google account Rehohub uses.
   Create a project called _Rehohub_.
2. **Billing**: link a billing account. Google Maps needs one, but each Maps service includes a
   free monthly allowance; check Google's current pricing page. Then open **Billing → Budgets &
   alerts** and set a monthly budget (for example ₦20,000) so you get an email before costs grow.
3. **APIs & Services → Library**: turn on **Maps JavaScript API**, **Places API (New)** and
   **Routes API**.
4. **APIs & Services → Credentials → Create credentials → API key**. Make two keys:
   - **Browser key**: under _Application restrictions_ choose **Websites** and add
     `https://www.rehohub.com/*` and `https://rehohub.com/*`. Under _API restrictions_
     allow only **Maps JavaScript API** and **Places API (New)**.
   - **Server key**: under _Application restrictions_ choose **IP addresses** and add your
     hosting server's IP (cPanel home page → right-hand column → _Shared IP Address_). Under
     _API restrictions_ allow only **Routes API**.
5. Open your private settings file (`rehohub-config.php`, above `public_html`) and add:

   ```php
   'google_maps' => [
       'server_key'  => 'PASTE-THE-SERVER-KEY',
       'browser_key' => 'PASTE-THE-BROWSER-KEY',
   ],
   ```

   (Put it before the last `];`, like the other settings. `api/config.sample.php` shows where.)

6. Open AiMove → **Send a package** and start typing an address: suggestions should appear.

If a key is wrong, AiMove quietly goes back to estimated distances and the illustrated map, so
nothing breaks. Riders share their location only while they are online in AiMove, only if they
allow it in their browser and in **Profile → Notification settings**, and it stops when they go
offline.

---

## Who can do what

| Person                                                        | How they get access                                                                       | What they can see and do                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Customer (shopper, sender, GreenFed customer, AiRise learner) | Signs up → confirms email → **approved automatically**                                    | Their own account and the customer side of each product they joined   |
| Rider, merchant, GreenFed employee, AiRise trainer            | Signs up or adds the role in My account → confirms email → **waits for an administrator** | Nothing on that side until approved; then only that side              |
| Product administrator (e.g. GreenFed admin)                   | **Invitation only**, sent by a super administrator                                        | Applications, invitations and approvals **for that product only**     |
| Super administrator                                           | The one-time setup (you), then **invitation only**                                        | Everything: all applications, all users, account status, activity log |

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
- Five wrong passwords lock an account for 15 minutes; sign-up, sign-in and reset are rate-limited.
- Sessions use secure, HttpOnly cookies; every change needs a per-session security token (CSRF).
- Every database query uses prepared statements; application details are checked against a fixed
  list of allowed fields.
- The browser pages only show or hide screens. **The server decides** what each person may do, so
  changing the page code in a browser does not give anyone more access.

## What is still front-end only (next phases)

- **Payments** (Paystack or Flutterwave), **document uploads for approvals** (ID, licence, CAC
  certificate; AiRise course files already upload), **two-factor sign-in for administrators**, and the **terms and privacy policy pages**
  (the sign-up form links to the contact section for now).
- **Backups**: turn on cPanel → **Backup** (or JetBackup) so the database is backed up daily.
