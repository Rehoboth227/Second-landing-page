# Rehohub — Website

A responsive website for **Rehohub**, written in plain **HTML, CSS and JavaScript**, with a small
**PHP + MySQL** account system (`api/`) shared by all products. There is no build step or framework:
every page is a finished `.html` file you can edit directly. To put the account system live, follow
**[DEPLOY.md](DEPLOY.md)**.

## Structure

```
index.html                     Home page: hero, about, mission/vision, services, products, contact
services/<name>.html           One page per subsidiary (11): Rheti, RehoCon, RehoFarm, RehoTrans,
                               RehoArts, RehoEvent, RehoFac, RehoDez, RehoTex, RehoGive, Havibank
services/havibank.html         Havibank, the digital financial institution: the AiPay design plus the
                               roadmap (AiPay live; payments and banking in progress)
products/aipay.html            AiPay web app (Ai Pay Project Figma + prototype videos). Shared Rehohub
                               sign-in. Buyers: AiPay Store, product details, cart, delivery option and
                               address, summary, payment method, bank transfer, confirmation, dashboard
                               with points card, profile. Merchants: Profile Set Up, NGN 10,000 review
                               fee, under review / live, dashboard, sales report (CSV), market place,
                               profile, settings, notifications. Data: api/lib/aipay.php (aipay_* tables)
products/greenfed.html         GreenFed web app (customers, staff, admin); routes like greenfed.html#/plans
                               Data on the server: api/lib/greenfed.php (gf_* tables): households, records,
                               plans, groceries, staff work, communities. Prices and bank set by admins
products/aimove.html           AiMove web app (customers, riders, operations); routes like aimove.html#/send.
                               Data on the server: api/lib/aimove.php (aimove_* tables): deliveries,
                               escrow wallet, rider earnings and payouts, messages, notifications.
                               Optional Google Maps (keys in the private config): address suggestions,
                               road distances, live rider location
services/rheti/                Rheti service site (the employability website, moved here from AiRise):
  index.html                     overview (services/rheti.html forwards here)
  talent.html, employers.html    the two sides of the platform
  programme.html                 the nine-course Employability Skills Series
  course-<name>.html             one page per course (9)
  assessment.html                quizzes, final assessment and result calculator
  certificates.html              certificate types and number checker
  facilitators.html              delivery options and checklist
  platform.html, about.html      system design, roadmap and company story
products/airise/               AiRise product: straight to sign-in and the platform
  index.html                     access gateway: sign in / register, or straight in when signed in
  dashboard.html                 learner dashboard
  learn.html                     course player, e.g. learn.html?course=adaptability
  trainer.html                   trainer studio: course list and four-step course upload
account/                       Rehohub accounts: login, register, verify, forgot, reset, invite,
                               setup (first admin, one time), index (My account), admin (console)
api/                           Account API (PHP 8.1+): index.php (all routes), lib/core.php,
                               config.sample.php (copy outside public_html; see DEPLOY.md)
database/schema.sql            MySQL tables, imported once in phpMyAdmin
assets/js/rh-auth.js           Browser helper: talks to /api, role checks, page guard for apps
assets/js/account.js           Logic for the account pages and admin console
assets/css/account.css         Styles for the account pages
DEPLOY.md                      Step-by-step cPanel setup for the account system
assets/css/styles.css          All styles (one file, design tokens at the top)
assets/js/main.js              Shared interactions: menu, scroll reveal, counters
assets/css/aimove-app.css      AiMove web app styles (light and dark)
assets/js/aimove-app.js        AiMove web app: data, escrow wallet, routing and every screen
assets/js/aimove-pricing.js    AiMove fare calculator (naira): rates, markups, commission, used everywhere
assets/js/aimove-calculator.js Public fare calculator widget on the RehoTrans page
assets/css/greenfed-app.css    GreenFed web app styles (light and dark)
assets/js/greenfed-app.js      GreenFed web app: meal library, routing and every screen (data from the API)
assets/js/airise.js            AiRise only: course filter, result calculator, certificate checker, checklist
assets/css/airise-app.css      AiRise app pages (dashboard, course player, trainer studio)
assets/js/airise-app.js        AiRise course data, dashboard and course player
assets/js/airise-trainer.js    Trainer studio: course list, upload wizard, quiz builder
assets/img/                    Logos, favicon and photography
assets/media/aipay/            AiPay walkthrough videos and their poster frames
```

## Viewing it

Open `index.html` in a browser, or serve the folder so the videos and relative links behave exactly as online:

```bash
python3 -m http.server 8000   # or: npx serve .
```

Then visit http://localhost:8000. To publish it, turn on **GitHub Pages** (Settings → Pages → deploy from `main`, root folder).

## Editing

Edit the HTML files directly. Shared parts (the header, footer and contact section) appear in every page,
so when you change one of them, change it in all pages; a project-wide search and replace in your editor
is the quickest way.

- **Colours, spacing and fonts** are CSS custom properties at the top of `assets/css/styles.css`
  (`--blue-700`, `--blue-500`, …). Product themes are grouped further down: `.theme-gf` (GreenFed),
  `.theme-am` (AiMove), `.theme-ar` (AiRise) and `.theme-rh` (Rheti).
- **Breakpoints:** the layout adapts at 1100, 1024, 960, 860, 760, 600, 560, 520 and 480px.
  Every page has been checked at 320, 360, 390, 768, 1024 and 1440px with no horizontal scrolling.
- **AiMove prices** live in one file, `assets/js/aimove-pricing.js` (the `CONFIG` block at the top). The AiMove
  app and the fare calculator on the RehoTrans page both read it, so changing a number there changes it everywhere.
- **Formatting:** files are formatted with Prettier (`npx prettier --print-width 120 --write .`).

## AiRise app pages

The dashboard, course player and trainer studio follow the "Online Learning" dashboard layout and the
"E Learning Site" course view from the Figma files, in AiRise navy and gold with Poppins (as on Rheti).
They are front-end only: learner progress and trainers' courses are saved in the visitor's browser
(localStorage), and uploaded files are not sent anywhere; only their names and sizes are kept.
Connecting a backend (accounts, file storage, review queue) is the next step before launch.

## AiMove web app

`products/aimove.html` is the AiMove web app, not a marketing page. It follows the "upgrade Aimove" Figma
screens and the AiMove Android app: sign-up and login (with OTP reset), home, send a package with an upfront
fare, review and payment, live tracking with a PIN, book a rider, wallet and cards, chat, notifications and
profile; a rider view (accept jobs, pickup, transit, PIN proof of delivery, earnings and payout); and an
operations view (shipments, rider assignment, fleet GPS, API sandbox and logs). Which views a person sees
comes from their Rehohub account (customer, approved rider, AiMove or super administrator); someone with
several roles can switch between their own roles only.

Sign-in and roles are real (see "Accounts and roles"). Deliveries, wallet and payouts are still saved per
account on the device; payments, maps and calls are simulated, and other riders, distances and GPS positions
are sample data until bookings are connected to the database.

## AiMove pricing and escrow

AiMove fares follow how Nigerian ride-hailing and logistics services price trips (Bolt and Gokada:
base + per km + per minute with a minimum fare; GIG Logistics: weight brackets):

|                                 | Motorcycle (≤10 kg) | Car (≤50 kg) | Van (≤1,000 kg) |
| ------------------------------- | ------------------- | ------------ | --------------- |
| Base fare                       | ₦500                | ₦1,000       | ₦3,000          |
| Per km (first 30 km, then half) | ₦120                | ₦200         | ₦400            |
| Per minute                      | ₦15                 | ₦25          | ₦40             |
| Minimum fare                    | ₦1,200              | ₦2,500       | ₦6,000          |

Plus a weight charge above 5 kg (₦300 / ₦700 / ₦1,500, then ₦30 per kg above 50 kg), fixed markups for
**Express (+₦800, within 3 hours)** and **Instant (+₦1,500, pickup now)**, ×1.25 on distance and time at peak
hours (7–10am, 5–8pm), a ₦200 booking fee, 0.5% goods protection for items worth over ₦50,000 (capped at
₦5,000), rounded up to ₦50. Riders keep 85% of the delivery fare; AiMove's commission is 15%.

Every payment, from the wallet or by card, is held in **escrow**. When the rider enters the recipient's
4-digit PIN, the escrow is released automatically to the rider's earnings (their 85% share): no
administrator approval. Five wrong PINs lock the delivery until support helps. Cancelling before pickup
refunds the escrow to the customer's wallet. Operations staff can move a delivery along but cannot mark it
delivered; only the PIN does that. In this preview the wallet and escrow are kept on the device; when
bookings move to the server, the server must hold the escrow and recalculate every price itself.

## GreenFed web app

`products/greenfed.html` is the GreenFed web app, not a marketing page. It follows the "GreenFed USERS DESIGN"
Figma screens (onboarding, sign-in and sign-up, health records, meal plans, grocery, community and
notifications) and the GreenFed requirements:

- **Customers** add family members and allergies, request a meal plan (members, duration, meals, allergies),
  review the price and pay by bank transfer to GreenFed, then follow it from payment to delivery. Delivered
  plans show day by day, and can be downloaded, shared and reviewed. The grocery store has categories,
  offers, favourites and "from my plan" shopping, an allergy check in the cart, weekly delivery slots and
  stage-by-stage tracking with ratings and late or poor-quality reports. Customers and health specialists
  can create communities, public or private (the creator approves who joins), with posts and nested replies.
- **Employees** (nutritionist, supply manager, quality assurance, packaging and delivery, health specialist,
  supplier) see only their own queue and hold one order at a time. Nutritionists edit a 7-day plan drafted
  from the meal library around the plan's allergies before delivering it. The work meter shows what a
  nutritionist is owed per plan; the others are salaried or contracted outside the app, so it only counts.
- **Administrators** confirm customers' transfers (staff only see an order after that), set the meal-plan
  price, the nutritionist rate, every grocery price and discount and the bank account, mark nutritionists
  paid, reset meters, resolve conflicts (late delivery: waive the next delivery; poor quality: recall and
  resupply) and handle staff complaints. User status and staff approvals live in the Rehohub admin console.

Everything is stored on the server (`api/lib/greenfed.php`, `gf_*` tables from
`database/migrations-003-greenfed.sql`); the browser only keeps the cart and the side last used. Prices are
in naira and the server works out every total. Starting prices are placeholders for administrators to change.

## Accounts and roles

One Rehohub account works for every product. Customers are approved automatically once their
email is confirmed; riders, merchants, GreenFed employees and AiRise trainers wait for an
administrator; administrators are invite-only (the very first one is created once with
`account/setup.html`). The server (`api/`) decides who may use each side of each app; the pages
only show the right screens. AiMove and GreenFed use it for sign-in and roles, and the AiRise
dashboard, course player and trainer studio require an approved AiRise role. Product data
(orders, plans, progress) is still saved per account on the device until each product is
connected to the database. See DEPLOY.md for the full permission table.

Local testing needs PHP and MySQL: point the `REHOHUB_CONFIG` environment variable at a config
file with `'env' => 'development'` (which also allows `'mail' => ['transport' => 'log']` to write
emails to a file instead of sending them).

## Brand application

| Guideline                                        | Implementation                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Colour palette `#1760BA` · `#2185FF` · `#FFFFFF` | CSS tokens `--blue-700`, `--blue-500`, `--white`; derived navy tints for depth |
| Typography: Hurme Geometric Sans 4               | First in the font stack; **Outfit** (Google Fonts) is the web fallback         |
| Logo, word mark and logo icon                    | The "R" mark is an inline SVG; favicon in `assets/img/favicon.svg`             |
| Heading underline bar device                     | `.bar` utility under section titles                                            |
| Icon pattern (merchandise)                       | Animated R-pattern strip between Services and Products                         |

Sub-brands keep their own guides: AiPay's yellow accent, GreenFed's greens, AiMove's app blue,
and the navy and gold of AiRise and Rheti (Rheti uses Poppins, per its brand guide).

## Before launch

- The App Store / Google Play links are placeholders. AiPay payments, products and notifications are saved per account on the device and checkouts run in test mode until the AiPay payment server is connected.
- AiMove, AiRise and Rheti have no product email yet and use info@rehohub.com.
- The AiRise assessment page publishes only the structure and rules of the assessments.
  Keep answer keys, model answers and marking guides out of this public site.

## AiPay points card

`assets/img/aipay/world.svg` is drawn from Natural Earth land data (public domain) via the
`world-atlas` package. Shoppers earn 1 point per ₦100 paid and businesses 1 point per ₦1,000
received. Tiers: VIP (gold) from 0, VVIP (navy) from 10,000, VVIP Black from 50,000 points.
