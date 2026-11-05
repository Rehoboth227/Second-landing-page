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
products/aimove.html           AiMove: logistics and delivery, with a fare estimator
products/airise/               AiRise HR and employability site:
  index.html                     overview
  talent.html, employers.html    the two sides of the platform
  programme.html                 the nine-course Employability Skills Series
  course-<name>.html             one page per course (9)
  assessment.html                quizzes, final assessment and result calculator
  certificates.html              certificate types and number checker
  facilitators.html              delivery options and checklist
  platform.html, about.html      system design, roadmap and company story
assets/css/styles.css          All styles (one file, design tokens at the top)
assets/js/main.js              Shared interactions: menu, scroll reveal, counters, AiMove fare estimator
assets/js/airise.js            AiRise only: course filter, result calculator, certificate checker, checklist
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
- **AiMove prices** in the fare estimator (`assets/js/main.js`) mirror the AiMove app's pricing engine:
  update both together.
- **Formatting:** files are formatted with Prettier (`npx prettier --print-width 120 --write .`).

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
