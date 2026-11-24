# Rehohub — Website

A static, responsive website for **Rehohub**, written in plain **HTML, CSS and JavaScript**.
There is no build step, framework or server code: every page is a finished `.html` file you can edit directly.

## Structure

```
index.html                     Home page: hero, about, mission/vision, services, products, contact
services/<name>.html           One page per subsidiary (10): Rheti, RehoCon, RehoFarm, RehoTrans,
                               RehoArts, RehoEvent, RehoFac, RehoDez, RehoTex, RehoGive
products/aipay.html            AiPay: e-store with built-in payments
products/greenfed.html         GreenFed: meal plans, groceries and community
products/aimove.html           AiMove web app (customers, riders, operations); routes like aimove.html#/send
products/airise/               AiRise HR and employability site:
  index.html                     overview
  talent.html, employers.html    the two sides of the platform
  programme.html                 the nine-course Employability Skills Series
  course-<name>.html             one page per course (9)
  assessment.html                quizzes, final assessment and result calculator
  certificates.html              certificate types and number checker
  facilitators.html              delivery options and checklist
  platform.html, about.html      system design, roadmap and company story
  dashboard.html                 learner dashboard (app layout)
  learn.html                     course player, e.g. learn.html?course=adaptability
  trainer.html                   trainer studio: course list and four-step course upload
assets/css/styles.css          All styles (one file, design tokens at the top)
assets/js/main.js              Shared interactions: menu, scroll reveal, counters
assets/css/aimove-app.css      AiMove web app styles (light and dark)
assets/js/aimove-app.js        AiMove web app: data, pricing, routing and every screen
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
- **AiMove prices** in `assets/js/aimove-app.js` (and the price table on the RehoTrans page) mirror the
  AiMove Android app's pricing engine: update them together.
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
operations view (shipments, rider assignment, fleet GPS, API sandbox and logs). A "Viewing as" switch moves
between the three roles, which share the same data.

It is front-end only: data is saved in the browser (localStorage), payments, maps, calls and sign-in
providers are simulated, and riders, distances and GPS positions are sample data until a backend is connected.

## Brand application

| Guideline | Implementation |
|---|---|
| Colour palette `#1760BA` · `#2185FF` · `#FFFFFF` | CSS tokens `--blue-700`, `--blue-500`, `--white`; derived navy tints for depth |
| Typography: Hurme Geometric Sans 4 | First in the font stack; **Outfit** (Google Fonts) is the web fallback |
| Logo, word mark and logo icon | The "R" mark is an inline SVG; favicon in `assets/img/favicon.svg` |
| Heading underline bar device | `.bar` utility under section titles |
| Icon pattern (merchandise) | Animated R-pattern strip between Services and Products |

Sub-brands keep their own guides: AiPay's yellow accent, GreenFed's greens, AiMove's app blue,
and the navy and gold of AiRise and Rheti (Rheti uses Poppins, per its brand guide).

## Before launch

- The web-app and App Store / Google Play links for AiPay, AiMove, AiRise and GreenFed are placeholders.
- AiMove, AiRise and Rheti have no product email yet and use info@rehohub.com.
- The AiRise assessment page publishes only the structure and rules of the assessments.
  Keep answer keys, model answers and marking guides out of this public site.
