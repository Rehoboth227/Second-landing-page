/* AiPay web app.
   Built from the "Ai Pay Project" Figma file: Onboarding and Sign up, Login, Third Party payment
   user (dashboard, payment history, details, notifications, profile, settings), the design-system
   frame (merchant menu: Dashboard, Sales, Products) and the AiPay points-card designs.
   Accounts, sign-in, password reset and approvals use the shared Rehohub account system (/api via
   rh-auth.js). Payments, products, notifications and settings are saved per account on this
   device until the AiPay payment server is connected: checkouts run in test mode and move no money. */
(() => {
  "use strict";

  // ------------------------------------------------------------ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = RH.esc;
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const logo = (light) => `<svg aria-hidden="true"><use href="#i-logo${light ? "-w" : ""}"/></svg><span>AiPay</span>`;
  const ngn = (n) => "NGN " + Math.round(n).toLocaleString("en-NG");
  const short = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
  const first = (n) =>
    String(n || "")
      .trim()
      .split(/\s+/)[0] || "there";
  const initials = (n) =>
    String(n || "?")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDate = (t) => {
    const d = new Date(t);
    return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "long" })}, ${d.getFullYear()}`;
  };
  const fmtDateTime = (t) =>
    fmtDate(t) + ", " + new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ago = (t) => {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return "Just now";
    const m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.round(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  };
  const monthKey = (t) => {
    const d = new Date(t);
    return d.getFullYear() * 12 + d.getMonth();
  };
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
  const store = {
    get(k, f) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : f;
      } catch (e) {
        return f;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
  };
  const randDigits = (n) => {
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return [...a].map((x) => x % 10).join("");
  };
  const toast = (msg) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };
  const go = (h) => {
    if (location.hash === h) render();
    else location.hash = h;
  };

  // ------------------------------------------------------------ constants
  const INTENTS = {
    store: { role: "merchant", label: "Create a store" },
    buy: { role: "customer", label: "Buy high classic products" },
  };
  const BANKS = [
    "Access Bank",
    "Fidelity Bank",
    "First Bank",
    "FCMB",
    "GTBank",
    "Kuda",
    "Moniepoint",
    "OPay",
    "PalmPay",
    "Polaris Bank",
    "Stanbic IBTC",
    "Sterling Bank",
    "UBA",
    "Union Bank",
    "Wema Bank",
    "Zenith Bank",
  ];
  // Points: shoppers earn 1 point per ₦100 paid; businesses 1 point per ₦1,000 received.
  const TIERS = [
    { min: 50000, name: "VVIP Black", tag: "VVIP", cls: "pts--black", coin: true },
    { min: 10000, name: "VVIP", tag: "VVIP", cls: "pts--navy" },
    { min: 0, name: "VIP", tag: "VIP", cls: "pts--gold" },
  ];
  const tierOf = (p) => TIERS.find((t) => p >= t.min);
  const SETTINGS = {
    sales: [
      ["reg", "Registration Confirmation", "You will be notified when you finish up your registration", true],
      ["paid", "Payment Completed", "You will be notified when payment is made on any of your product", true],
      ["order", "Order Confirmation", "You will be notified when an order is made for your product", false],
      ["profile", "Profile Update", "You will be notified when there is an update on your profile", true],
      ["salesEmail", "Email Notification", "Turn on email notification to get updates through email", false],
    ],
    bank: [
      ["transfer", "Receive Bank Transfer", "Allow users to make payment through bank transfer", true],
      ["bankPaid", "Payment Completed", "You will be notified when payment is made on any of your product", true],
      ["bankEmail", "Email Notification", "You will be notified when a transaction is made through email", false],
    ],
    notify: [
      ["screen", "On-screen Notification", "Receive notification on your screen", true],
      ["email", "Email Notification", "Receive notification through your mail", true],
      ["sms", "Phone Number Notification", "Receive notification through SMS", false],
    ],
  };
  const defaultSettings = () =>
    Object.fromEntries(
      Object.values(SETTINGS)
        .flat()
        .map(([k, , , v]) => [k, v]),
    );

  // ------------------------------------------------------------ state
  let SESSION = null; // { user }
  let ROLE = null; // active AiPay side: gateway | merchant | customer
  let D = null; // this account's AiPay data on this device
  const KEY = (uid) => "aipay-app-v1:" + uid;
  const LINKS = "aipay-links-v1"; // payment-link code -> { uid, business }

  function blank() {
    return {
      code: randDigits(8),
      profile: {
        street: "",
        city: "",
        country: "Nigeria",
        domain: "",
        card: { last4: "", name: "", expiry: "" },
        transfer: { name: "", bank: "", number: "" },
      },
      settings: defaultSettings(),
      notes: [],
      txns: [],
      visits: [],
      products: [],
      seenApproved: {},
    };
  }
  const load = (uid) => Object.assign(blank(), store.get(KEY(uid), {}));
  const save = () => SESSION && SESSION.user && store.set(KEY(SESSION.user.id), D);
  const loadFor = (uid) => Object.assign(blank(), store.get(KEY(uid), {}));
  const saveFor = (uid, data) => store.set(KEY(uid), data);

  function aipayRoles(user) {
    const r = RH.rolesIn(user, "aipay");
    if (r.includes("admin")) return ["merchant", "customer"];
    return ["gateway", "merchant", "customer"].filter((x) => r.includes(x));
  }
  const membership = (role) => RH.memberships(SESSION.user, "aipay").find((m) => m.role === role) || null;
  const business = () => {
    const m = membership(ROLE) || membership("gateway") || membership("merchant");
    return (m && m.details && m.details.business_name) || SESSION.user.full_name;
  };
  const isBusiness = () => ROLE === "gateway" || ROLE === "merchant";

  function notify(data, text, kind = "info") {
    if (!data.settings.screen) return;
    data.notes.unshift({ id: randDigits(10), at: Date.now(), text, kind, read: false });
    data.notes = data.notes.slice(0, 200);
  }

  // Registers this account's payment link on this device, so the checkout page can find it.
  function registerLink() {
    const links = store.get(LINKS, {});
    links[D.code] = { uid: SESSION.user.id, business: business(), role: ROLE };
    store.set(LINKS, links);
  }
  const payUrl = (extra = "") => {
    const u = new URL(location.href);
    u.hash = "#/pay/" + D.code + extra;
    return u.href;
  };

  // ------------------------------------------------------------ numbers
  const mine = () => D.txns.filter((t) => (isBusiness() ? t.side !== "out" : t.side === "out"));
  function points(data = D, role = ROLE) {
    const per = role === "customer" ? 100 : 1000;
    const list = data.txns.filter(
      (t) => t.status === "success" && (role === "customer" ? t.side === "out" : t.side !== "out"),
    );
    const total = list.reduce((a, t) => a + Math.floor(t.amount / per), 0);
    const nowK = monthKey(Date.now());
    const m = (k) => list.filter((t) => monthKey(t.at) === k).reduce((a, t) => a + Math.floor(t.amount / per), 0);
    return { total, delta: pct(m(nowK), m(nowK - 1)) };
  }

  // ------------------------------------------------------------ shared pieces
  function pointsCard(name, p) {
    const t = tierOf(p.total);
    const chip = `<svg class="pts__chip" viewBox="0 0 96 76" aria-hidden="true"><rect width="96" height="76" rx="10" fill="#FFA31A"/><path d="M38 6v18c0 7-13 6-13 14s13 7 13 14v18M58 6v18c0 7 13 6 13 14s-13 7-13 14v18M8 38h22M66 38h22" fill="none" stroke="#FFD36B" stroke-width="5" stroke-linecap="round"/></svg>`;
    return `<div class="pts ${t.cls}" role="img" aria-label="AiPay ${t.name} points card for ${esc(name)}: ${p.total.toLocaleString("en-NG")} points">
      <div class="pts__logo"><svg aria-hidden="true"><use href="#i-logo"/></svg><span>AiPay</span></div>
      ${chip}
      ${t.coin ? `<span class="pts__coin"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><ellipse cx="12" cy="9" rx="7" ry="3.5"/><path d="M5 9v5c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5V9"/></svg></span>` : ""}
      <span class="pts__label">Your Points</span>
      <span class="pts__num">${p.total.toLocaleString("en-NG")}</span>
      <span class="pts__delta ${p.delta < 0 ? "is-down" : ""}">${Math.abs(p.delta)}% ${p.delta < 0 ? "Down from" : "From"} last month</span>
      <span class="pts__tier">${t.tag}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/></svg></span>
      <span class="pts__name">${esc(name)}</span>
    </div>`;
  }
  function pointsPanel() {
    const p = points();
    const t = tierOf(p.total);
    const next = TIERS.slice()
      .reverse()
      .find((x) => x.min > p.total);
    const per = ROLE === "customer" ? "₦100 you pay" : "₦1,000 you receive";
    return `<section class="card"><div class="ptswrap">${pointsCard(SESSION.user.full_name, p)}
      <div class="grid" style="gap:14px">
        <div><h2 style="margin:0">${t.name} member</h2><p style="margin:4px 0 0;color:var(--mute);font-size:12.5px">You earn 1 point for every ${per} through AiPay.</p></div>
        ${
          next
            ? `<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>${p.total.toLocaleString("en-NG")} points</span><span>${next.min.toLocaleString("en-NG")} for ${next.name}</span></div><div class="bar-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${next.min}" aria-valuenow="${p.total}" aria-label="Progress to ${next.name}"><i style="width:${Math.min(100, (p.total / next.min) * 100)}%"></i></div></div>`
            : `<p style="margin:0;font-size:12.5px">You've reached the top tier.</p>`
        }
        <div class="tiers"><div><i style="background:#c4890f"></i>VIP: from 0 points</div><div><i style="background:#133b66"></i>VVIP: from 10,000 points</div><div><i style="background:#1c1c1c"></i>VVIP Black: from 50,000 points</div></div>
      </div></div></section>`;
  }
  const pill = (s) =>
    `<span class="pill pill--${s}">${s === "success" ? "Success" : s === "pending" ? "Pending" : "Failed"}</span>`;
  function modal(html, cls = "") {
    closeModal();
    const m = document.createElement("div");
    m.className = "modal " + cls;
    m.innerHTML = `<div class="modal__box" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-close]")) closeModal();
    });
    const box = $(".modal__box", m);
    (box.querySelector("input,button:not(.modal__x)") || box).focus();
    return box;
  }
  function closeModal() {
    $$(".modal").forEach((m) => m.remove());
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  const xBtn = `<button type="button" class="modal__x" data-close aria-label="Close">${ic("x")}</button>`;

  function fieldErrors(form, err) {
    $$(".field", form).forEach((f) => {
      f.classList.remove("has-error");
      const s = $("small.err", f);
      if (s) s.remove();
    });
    const fields = (err && err.fields) || {};
    let firstBad = null;
    for (const [k, msg] of Object.entries(fields)) {
      const inp = form.querySelector(`[name="${k}"]`);
      if (!inp) continue;
      const f = inp.closest(".field");
      f.classList.add("has-error");
      f.insertAdjacentHTML("beforeend", `<small class="err">${esc(msg)}</small>`);
      firstBad = firstBad || inp;
    }
    if (firstBad) firstBad.focus();
  }
  function showAlert(form, msg, kind = "") {
    let a = $(".alert", form);
    if (!a) {
      a = document.createElement("div");
      form.prepend(a);
    }
    a.className = "alert " + (kind ? "alert--" + kind : "");
    a.setAttribute("role", "alert");
    a.textContent = msg;
  }
  async function busy(btn, fn) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.textContent = "Please wait…";
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-busy");
      btn.innerHTML = label;
    }
  }
  // ------------------------------------------------------------ signed out: shared Rehohub sign-in
  // AiPay has no sign-in of its own: like AiMove, GreenFed and AiRise it uses the Rehohub account
  // pages (account/login.html, account/register.html), and the admin console approves stores and
  // payment systems.
  function authPage({ top = "", body }) {
    app.innerHTML = `<div class="auth">
      <aside class="auth__art"><a class="logo logo--light" href="../index.html" aria-label="Rehohub home">${logo(true)}</a></aside>
      <main class="auth__main" id="main">
        <div class="auth__mobile-head"><a class="logo" href="../index.html" aria-label="Rehohub home">${logo()}</a></div>
        <div class="auth__top">${top}</div>
        <div class="auth__body">${body}</div>
      </main></div>`;
    window.scrollTo(0, 0);
  }
  let intent = "";
  function viewWelcome(note = "") {
    const login = RH.loginUrl(location.pathname + "#/dashboard");
    authPage({
      top: `<span class="grow"></span><span>Already have an account? <a class="link" href="${esc(login)}">Sign in</a></span>`,
      body: `<h1>Join AiPay Today</h1>
        <p>Create an e-store in just simple steps and buy high quality products, all on AiPay. One Rehohub account works for AiPay, AiMove, GreenFed and AiRise.</p>
        <form class="grid" id="join" style="gap:16px" novalidate>
          ${note ? `<div class="alert" role="alert">${esc(note)}</div>` : ""}
          <div class="q"><h2>You want to?</h2><p>Please select at least one option</p>
            <div class="choices" role="group" aria-label="What you want to do">
              ${Object.entries(INTENTS)
                .map(
                  ([k, v]) =>
                    `<button type="button" class="choice" data-intent="${k}" aria-pressed="${intent === k}">${v.label}</button>`,
                )
                .join("")}
            </div></div>
          <button class="btn btn--block" type="submit" style="margin-top:28px">Continue</button>
          <a class="btn btn--line btn--block" href="${esc(login)}">Sign in</a>
        </form>`,
    });
    $$("[data-intent]").forEach((b) =>
      b.addEventListener("click", () => {
        intent = b.dataset.intent;
        $$("[data-intent]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }),
    );
    $("#join").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!intent) return showAlert(e.target, "Please choose what you want to do on AiPay.");
      location.href = RH.url(`account/register.html?product=aipay&role=${INTENTS[intent].role}`);
    });
  }

  // ------------------------------------------------------------ app shell
  const NAV = {
    gateway: [
      ["dashboard", "Dashboard", "home"],
      ["history", "Payment History", "doc"],
    ],
    merchant: [
      ["dashboard", "Dashboard", "home"],
      ["sales", "Sales", "cart"],
      ["products", "Products", "bag"],
    ],
    customer: [
      ["dashboard", "Dashboard", "home"],
      ["history", "Payment History", "doc"],
    ],
  };
  const SIDE_LABEL = { gateway: "Payment system", merchant: "Store", customer: "Shopper" };
  function shell(page, title, sub, content) {
    const unread = D.notes.filter((n) => !n.read).length;
    const roles = aipayRoles(SESSION.user);
    const nav = (items) =>
      items
        .map(
          ([k, label, i]) =>
            `<a href="#/${k}" ${page === k ? 'aria-current="page"' : ""}>${ic(i)}${label}${k === "notifications" && unread ? `<span class="dot">${unread}</span>` : ""}</a>`,
        )
        .join("");
    app.innerHTML = `<div class="app">
      <div class="mtop"><a class="logo" href="#/dashboard">${logo()}</a><button class="menu-btn" type="button" data-menu aria-label="Open menu" aria-expanded="false">${ic("menu")}</button></div>
      <div class="scrim" data-menu></div>
      <aside class="side" aria-label="AiPay menu">
        <a class="logo" href="#/dashboard">${logo()}</a>
        ${isBusiness() ? `<div class="side__domain">${ic("link")}<span>${esc(D.profile.domain || "aipay.rehohub.com/pay/" + D.code)}</span></div>` : ""}
        <div class="side__label">Menu</div>
        <nav class="nav">${nav(NAV[ROLE])}</nav>
        <div class="side__label">User</div>
        <nav class="nav">${nav([
          ["notifications", "Notifications", "bell"],
          ["profile", "Profile", "user"],
          ["settings", "Settings", "gear"],
        ])}</nav>
        <div class="side__user">
          <span class="av" aria-hidden="true">${esc(initials(SESSION.user.full_name))}</span>
          <small>${esc(SESSION.user.full_name)}</small>
          <b>${esc(isBusiness() ? business() : SIDE_LABEL.customer)}</b>
          ${
            roles.length > 1
              ? `<label class="sr" for="role">Switch AiPay view</label><select id="role">${roles.map((r) => `<option value="${r}" ${r === ROLE ? "selected" : ""}>${SIDE_LABEL[r]}</option>`).join("")}</select>`
              : ""
          }
          ${
            RH.isAdminFor(SESSION.user, "aipay")
              ? `<a class="link" style="font-size:12px;margin-top:6px" href="${esc(RH.url("account/admin.html"))}">Admin console</a>`
              : ""
          }
          <a class="link" style="font-size:12px" href="${esc(RH.url("account/index.html"))}">My Rehohub account</a>
          <button class="btn btn--sm" type="button" data-logout>Log Out</button>
        </div>
      </aside>
      <main class="main" id="main">
        <div class="top"><div class="grow"><h1>${title}</h1><p>${sub}</p></div>
          <a class="top__ico" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<b>${unread}</b>` : ""}</a>
          <a href="#/profile" aria-label="Profile"><span class="av">${esc(initials(SESSION.user.full_name))}</span></a>
        </div>
        ${content}
      </main></div>`;
    const sel = $("#role");
    if (sel)
      sel.addEventListener("change", () => {
        ROLE = sel.value;
        store.set("aipay-role:" + SESSION.user.id, ROLE);
        go("#/dashboard");
      });
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (e) => {
    const m = e.target.closest("[data-menu]");
    if (m) {
      const a = $(".app");
      const open = !a.classList.contains("nav-open");
      a.classList.toggle("nav-open", open);
      const b = $(".menu-btn");
      if (b) b.setAttribute("aria-expanded", String(open));
    }
    if (e.target.closest("[data-logout]")) {
      RH.logout(location.pathname);
    }
  });

  // ------------------------------------------------------------ dashboard
  function statCard(icon, label, value, delta) {
    return `<div class="card stat"><span class="stat__ico">${ic(icon)}</span><small>${label}</small><b>${value}</b>
      <div class="stat__trend"><span class="trend ${delta < 0 ? "trend--down" : ""}">${ic(delta < 0 ? "down" : "up")}${Math.abs(delta)}%</span>vs last month</div></div>`;
  }
  function barChart(list, year) {
    const sums = MONTHS.map((_, i) =>
      list
        .filter(
          (t) => t.status === "success" && new Date(t.at).getFullYear() === year && new Date(t.at).getMonth() === i,
        )
        .reduce((a, t) => a + t.amount, 0),
    );
    const peak = Math.max(...sums);
    const top =
      peak <= 0
        ? 500000
        : Math.ceil(peak / 5 / 10 ** Math.floor(Math.log10(peak / 5))) * 10 ** Math.floor(Math.log10(peak / 5)) * 5;
    const ticks = [0, 1, 2, 3, 4, 5].map((k) => short((top / 5) * k));
    const best = sums.indexOf(peak);
    return `<div class="bars"><div class="bars__y" aria-hidden="true">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="bars__plot">${sums
        .map(
          (s, i) =>
            `<button type="button" class="bar ${peak > 0 && i === best ? "is-on" : ""} ${i > 8 ? "bar--end" : i < 3 ? "bar--start" : ""}" aria-label="${MONTHS[i]} ${year}: ${ngn(s)}"><i style="height:${top ? (s / top) * 100 : 0}%"></i><em>${MONTHS[i]} ${year}<br>${ngn(s)}</em><span>${MONTHS[i]}</span></button>`,
        )
        .join("")}</div></div>`;
  }
  function donut(list) {
    const n = { success: 0, pending: 0, failed: 0 };
    list.forEach((t) => (n[t.status] += 1));
    const total = list.length;
    const col = { success: "#1760BA", pending: "#F5A40C", failed: "#C8231C" };
    let a = -90;
    const arcs = [];
    for (const k of ["success", "pending", "failed"]) {
      if (!n[k]) continue;
      const sweep = (n[k] / total) * 360;
      const r = 80,
        cx = 100,
        cy = 100;
      const p = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
      const [x1, y1] = p(a),
        [x2, y2] = p(a + sweep - 0.01);
      const mid = p(a + sweep / 2).map((v, i) => (v - (i ? cy : cx)) * 0.62 + (i ? cy : cx));
      arcs.push(
        sweep >= 359.9
          ? `<circle cx="100" cy="100" r="80" fill="${col[k]}"/>`
          : `<path d="M100 100L${x1.toFixed(1)} ${y1.toFixed(1)}A80 80 0 ${sweep > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="${col[k]}" stroke="#fff" stroke-width="1.5"/>`,
      );
      if (sweep > 18)
        arcs.push(
          `<text x="${mid[0].toFixed(1)}" y="${mid[1].toFixed(1)}" fill="#fff" font-size="11" text-anchor="middle" dominant-baseline="middle">${Math.round((n[k] / total) * 100)}%</text>`,
        );
      a += sweep;
    }
    return `<div class="donut">${
      total
        ? `<svg viewBox="0 0 200 200" role="img" aria-label="${n.success} successful, ${n.pending} pending, ${n.failed} failed">${arcs.join("")}</svg>`
        : `<svg viewBox="0 0 200 200" role="img" aria-label="No payments yet"><circle cx="100" cy="100" r="80" fill="#e9f1fc"/><text x="100" y="104" text-anchor="middle" font-size="12" fill="#7b8190">No payments yet</text></svg>`
    }<div class="legend"><span><i style="background:#1760BA"></i>Successful</span><span><i style="background:#F5A40C"></i>Pending</span><span><i style="background:#C8231C"></i>Failed</span></div></div>`;
  }
  function txTable(list, opts = {}) {
    const who = isBusiness() ? "Name of Payer" : "Paid to";
    if (!list.length)
      return `<div class="empty">${ic("doc")}<p style="margin:0">${opts.empty || "No transactions yet."}</p></div>`;
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Transaction ID</th><th>Date</th><th>${who}</th><th>Amount</th><th>Status</th>${opts.more ? '<th><span class="sr">More</span></th>' : ""}</tr></thead><tbody>
      ${list
        .map(
          (t) =>
            `<tr class="row" data-tx="${esc(t.id)}" tabindex="0"><td>${esc(t.id)}</td><td>${fmtDate(t.at)}</td><td>${esc(isBusiness() ? t.payer : t.business)}</td><td>${ngn(t.amount)}</td><td>${pill(t.status)}</td>${
              opts.more
                ? `<td><button class="kebab" type="button" data-tx="${esc(t.id)}" aria-label="Details of ${esc(t.id)}">${ic("dots")}</button></td>`
                : ""
            }</tr>`,
        )
        .join("")}</tbody></table></div>`;
  }
  function bindRows() {
    $$("[data-tx]").forEach((el) => {
      const open = (e) => {
        e.stopPropagation();
        details(el.dataset.tx);
      };
      el.addEventListener("click", open);
      if (el.tagName === "TR")
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") open(e);
        });
    });
  }

  function viewDashboard() {
    const list = mine().sort((a, b) => b.at - a.at);
    const nowK = monthKey(Date.now());
    const sumK = (k) =>
      list.filter((t) => t.status === "success" && monthKey(t.at) === k).reduce((a, t) => a + t.amount, 0);
    const total = list.filter((t) => t.status === "success").reduce((a, t) => a + t.amount, 0);
    const visitsK = (k) => D.visits.filter((v) => monthKey(v) === k).length;
    const year = +(new URLSearchParams(location.hash.split("?")[1] || "").get("year") || new Date().getFullYear());
    const years = [...new Set([new Date().getFullYear(), ...list.map((t) => new Date(t.at).getFullYear())])].sort(
      (a, b) => b - a,
    );
    const done = list.filter((t) => t.status === "success").length;
    const rate = list.length ? Math.round((done / list.length) * 100) : 0;
    const biz = isBusiness();
    const stats = biz
      ? statCard("wallet", "Total Transaction", ngn(total), pct(sumK(nowK), sumK(nowK - 1))) +
        statCard("swap", "New Transaction", ngn(sumK(nowK)), pct(sumK(nowK), sumK(nowK - 1))) +
        statCard(
          "users",
          "Total Visitors",
          D.visits.length.toLocaleString("en-NG"),
          pct(visitsK(nowK), visitsK(nowK - 1)),
        )
      : statCard("wallet", "Total Spent", ngn(total), pct(sumK(nowK), sumK(nowK - 1))) +
        statCard("swap", "This Month", ngn(sumK(nowK)), pct(sumK(nowK), sumK(nowK - 1))) +
        statCard("card", "Points", points().total.toLocaleString("en-NG"), points().delta);
    const linkCard = biz
      ? `<section class="card"><div class="card__head"><h2>Your payment link</h2></div>
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--mute)">Share this link with customers or add it to your website. Payments made through it appear here. <b>Test mode:</b> no real money moves until the AiPay payment server is connected.</p>
          <div class="linkbox"><label class="sr" for="plink">Payment link</label><input id="plink" readonly value="${esc(payUrl())}" /><button class="btn btn--sm" type="button" id="copyLink">${ic("copy")}Copy</button><a class="btn btn--sm btn--line" href="#/pay/${esc(D.code)}">Open</a></div></section>`
      : `<section class="card"><div class="card__head"><h2>Pay a business</h2></div>
          <p style="margin:0;font-size:12.5px;color:var(--mute)">Pay any AiPay business with its payment link and earn points on every payment. The AiPay store for buyers is coming to this page next.</p></section>`;
    shell(
      "dashboard",
      `Welcome, ${esc(first(SESSION.user.full_name))} <span aria-hidden="true">👋</span>`,
      biz ? "Look at what is happening with your business" : "Look at what is happening with your payments",
      `<div class="grid">
        <div class="stats">${stats}</div>
        <div class="two">
          <section class="card"><div class="card__head"><h2>${ROLE === "merchant" ? "Sales Report" : "Overview"}</h2>
            <label class="sr" for="yr">Year</label><select class="year" id="yr">${years.map((y) => `<option ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select></div>
            ${barChart(list, year)}</section>
          <section class="card"><div class="card__head"><h2>${biz ? "Order Status" : "Payment Status"}</h2><span class="rate">${ic("up")}${rate}%</span></div>${donut(list)}</section>
        </div>
        ${pointsPanel()}
        ${linkCard}
        <section class="card"><div class="card__head"><h2>Recent Transaction</h2>${list.length > 5 ? `<a class="link" href="#/${ROLE === "merchant" ? "sales" : "history"}">View all</a>` : ""}</div>
          ${txTable(list.slice(0, 5), { empty: biz ? "No payments yet. Share your payment link to receive your first one." : "You haven't paid with AiPay yet." })}</section>
      </div>`,
    );
    $("#yr").addEventListener("change", (e) => go("#/dashboard?year=" + e.target.value));
    const cp = $("#copyLink");
    if (cp) cp.addEventListener("click", () => copy(payUrl()));
    bindRows();
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch (e) {
      toast("Copy failed. Select the text and copy it.");
    }
  }

  // ------------------------------------------------------------ payment history / sales
  const HQ = { q: "", status: "", size: 10, page: 1 };
  function viewHistory(page = "history") {
    const all = mine().sort((a, b) => b.at - a.at);
    const q = HQ.q.toLowerCase();
    const list = all.filter(
      (t) =>
        (!HQ.status || t.status === HQ.status) &&
        (!q ||
          [t.id, t.payer, t.business, String(t.amount), t.item || ""].some((x) => String(x).toLowerCase().includes(q))),
    );
    const pages = Math.max(1, Math.ceil(list.length / HQ.size));
    HQ.page = Math.min(HQ.page, pages);
    const slice = list.slice((HQ.page - 1) * HQ.size, HQ.page * HQ.size);
    const merchant = page === "sales";
    shell(
      page,
      merchant
        ? "Sales"
        : isBusiness()
          ? `Welcome, ${esc(first(SESSION.user.full_name))} <span aria-hidden="true">👋</span>`
          : "Payment History",
      merchant
        ? "Every sale made through your store and payment links"
        : "Look at what is happening with your " + (isBusiness() ? "business" : "payments"),
      `${merchant ? `<section class="card" style="margin-bottom:20px"><div class="card__head"><h2>Sales Report</h2></div>${barChart(all, new Date().getFullYear())}</section>` : ""}
      ${pointsPanel()}
      <div class="tools" style="margin-top:20px">
        <div class="search">${ic("search")}<label class="sr" for="q">Search transactions</label><input id="q" type="search" placeholder="Search" value="${esc(HQ.q)}" /></div>
        <div class="filter"><label class="sr" for="st">Filter by status</label><select id="st"><option value="">All statuses</option><option value="success" ${HQ.status === "success" ? "selected" : ""}>Success</option><option value="pending" ${HQ.status === "pending" ? "selected" : ""}>Pending</option><option value="failed" ${HQ.status === "failed" ? "selected" : ""}>Failed</option></select></div>
      </div>
      <section class="card"><h2>Transaction History</h2>
        ${txTable(slice, { more: true, empty: all.length ? "No transactions match your search." : isBusiness() ? "No payments yet. Share your payment link from the dashboard." : "You haven't paid with AiPay yet." })}
        ${
          list.length
            ? `<div class="pager"><span>Showing <label class="sr" for="sz">Rows per page</label><select id="sz">${[10, 20, 50].map((n) => `<option ${n === HQ.size ? "selected" : ""}>${n}</option>`).join("")}</select> of ${list.length}</span>
          <div class="pages"><button type="button" data-pg="${HQ.page - 1}" ${HQ.page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>${Array.from(
            { length: pages },
            (_, i) => i + 1,
          )
            .filter((n) => n === 1 || n === pages || Math.abs(n - HQ.page) <= 1)
            .map(
              (n) => `<button type="button" data-pg="${n}" ${n === HQ.page ? 'aria-current="true"' : ""}>${n}</button>`,
            )
            .join(
              "",
            )}<button type="button" data-pg="${HQ.page + 1}" ${HQ.page === pages ? "disabled" : ""} aria-label="Next page">›</button></div></div>`
            : ""
        }
      </section>`,
    );
    const qi = $("#q");
    qi.addEventListener("input", () => {
      HQ.q = qi.value;
      HQ.page = 1;
      const pos = qi.selectionStart;
      viewHistory(page);
      const n = $("#q");
      n.focus();
      n.setSelectionRange(pos, pos);
    });
    $("#st").addEventListener("change", (e) => {
      HQ.status = e.target.value;
      HQ.page = 1;
      viewHistory(page);
    });
    const sz = $("#sz");
    if (sz)
      sz.addEventListener("change", (e) => {
        HQ.size = +e.target.value;
        HQ.page = 1;
        viewHistory(page);
      });
    $$("[data-pg]").forEach((b) =>
      b.addEventListener("click", () => {
        HQ.page = +b.dataset.pg;
        viewHistory(page);
      }),
    );
    bindRows();
  }

  function details(id) {
    const t = D.txns.find((x) => x.id === id);
    if (!t) return;
    const inbound = t.side !== "out";
    const box = modal(
      `${xBtn}<h2 style="text-align:left;color:var(--ink);font-size:18px">Details</h2>
      <div class="amount-ico">${ic("doc")}</div>
      <p class="amount">${inbound ? "+" : "−"} ${ngn(t.amount)}</p>
      <dl class="dl">
        <div><dt>${inbound ? "Name of Sender" : "Paid to"}</dt><dd>${esc(inbound ? t.payer : t.business)}</dd></div>
        ${t.item ? `<div><dt>For</dt><dd>${esc(t.item)}</dd></div>` : ""}
        <div><dt>Date &amp; Time</dt><dd>${fmtDateTime(t.at)}</dd></div>
        <div><dt>Transaction ID</dt><dd>${esc(t.id)}<button class="copy" type="button" id="cpid" aria-label="Copy transaction ID">${ic("copy")}</button></dd></div>
        <div><dt>Method</dt><dd>${t.method === "transfer" ? "Bank transfer" : "Card"}</dd></div>
        <div><dt>Status</dt><dd>${pill(t.status)}</dd></div>
        ${inbound ? `<div><dt>Transaction Fee</dt><dd>${ngn(t.fee)}</dd></div>` : ""}
      </dl>
      ${
        inbound && t.status === "pending"
          ? `<p style="margin:0;font-size:12px;color:var(--mute)">Waiting for this bank transfer. Mark it once you've checked your account.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn btn--line" type="button" data-mark="failed">Not received</button><button class="btn" type="button" data-mark="success">Received</button></div>`
          : ""
      }
      <button class="btn btn--block" type="button" id="receipt">Download Receipt</button>`,
    );
    $("#cpid", box).addEventListener("click", () => copy(t.id));
    $("#receipt", box).addEventListener("click", () => printReceipt(t));
    $$("[data-mark]", box).forEach((b) =>
      b.addEventListener("click", () => {
        t.status = b.dataset.mark;
        mirrorStatus(t);
        if (t.status === "success" && (D.settings.bankPaid || D.settings.paid))
          notify(D, `A new transaction of ${ngn(t.amount)} just arrived on your dashboard.`, "pay");
        save();
        closeModal();
        render();
        details(t.id);
      }),
    );
  }
  // Keeps the payer's copy (if they paid while signed in on this device) in step.
  function mirrorStatus(t) {
    if (!t.payerUid) return;
    const other = loadFor(t.payerUid);
    const o = other.txns.find((x) => x.id === t.id);
    if (o) {
      o.status = t.status;
      if (t.status === "success")
        notify(other, `Your payment of ${ngn(t.amount)} to ${t.business} was confirmed.`, "pay");
      saveFor(t.payerUid, other);
    }
  }
  function printReceipt(t) {
    const r = $("#receipt-print");
    r.innerHTML = `<h1 style="font-family:Poppins,sans-serif;color:#1760BA;margin:0 0 4px">AiPay receipt</h1>
      <p style="margin:0 0 20px;color:#555">${t.test ? "Test payment: no money moved." : ""}</p>
      <table style="border-collapse:collapse;font-family:Poppins,sans-serif;font-size:14px">
      ${[
        ["Amount", ngn(t.amount)],
        ["Paid to", t.business],
        ["Paid by", t.payer],
        ["For", t.item || "Payment"],
        ["Date & time", fmtDateTime(t.at)],
        ["Transaction ID", t.id],
        ["Method", t.method === "transfer" ? "Bank transfer" : "Card"],
        ["Status", t.status],
      ]
        .map(
          ([a, b]) =>
            `<tr><td style="padding:6px 24px 6px 0;color:#555">${esc(a)}</td><td style="padding:6px 0;font-weight:600">${esc(b)}</td></tr>`,
        )
        .join("")}</table>`;
    document.body.classList.add("printing");
    const done = () => {
      document.body.classList.remove("printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1500);
  }

  // ------------------------------------------------------------ notifications
  let onlyNew = false;
  function viewNotifications() {
    const unread = D.notes.filter((n) => !n.read).length;
    const list = onlyNew ? D.notes.filter((n) => !n.read) : D.notes;
    shell(
      "notifications",
      "Your Notifications",
      "Look at what is happening with your " + (isBusiness() ? "business" : "account"),
      `<div class="tools"><button class="btn btn--sm ${onlyNew ? "" : "btn--line"}" type="button" id="onlyNew" aria-pressed="${onlyNew}">${unread} New</button><span style="flex:1"></span>
        <button class="btn btn--sm btn--line" type="button" id="readAll" ${unread ? "" : "disabled"}>Mark all as read</button>
        <button class="btn btn--sm btn--line" type="button" id="clearAll" ${D.notes.length ? "" : "disabled"}>Clear all</button></div>
      <h2 style="font-size:17px;margin:0 0 12px">Recent Activities</h2>
      ${
        list.length
          ? `<div class="notes">${list
              .map(
                (n) =>
                  `<article class="note ${n.read ? "is-read" : ""}" data-note="${n.id}"><span class="note__ico">${ic(n.kind === "pay" ? "wallet" : "doc")}</span><div><p>${esc(n.text)}</p><time datetime="${new Date(n.at).toISOString()}">${ago(n.at)}</time></div><button class="note__x" type="button" data-del="${n.id}" aria-label="Delete notification">${ic("x")}</button></article>`,
              )
              .join("")}</div>`
          : `<div class="card empty">${ic("bell")}<p style="margin:0">${onlyNew ? "No new notifications." : "You're all caught up."}</p></div>`
      }`,
    );
    $("#onlyNew").addEventListener("click", () => {
      onlyNew = !onlyNew;
      viewNotifications();
    });
    $("#readAll").addEventListener("click", () => {
      D.notes.forEach((n) => (n.read = true));
      save();
      viewNotifications();
    });
    $("#clearAll").addEventListener("click", () => {
      if (!confirm("Clear all notifications?")) return;
      D.notes = [];
      save();
      viewNotifications();
    });
    $$("[data-note]").forEach((el) =>
      el.addEventListener("click", (e) => {
        const n = D.notes.find((x) => x.id === el.dataset.note);
        if (e.target.closest("[data-del]")) D.notes = D.notes.filter((x) => x !== n);
        else if (n) n.read = true;
        save();
        viewNotifications();
      }),
    );
  }

  // ------------------------------------------------------------ profile
  function viewProfile(edit = false) {
    const u = SESSION.user,
      p = D.profile;
    const ro = edit ? "" : "readonly";
    const row = (label, name, value, extra = "", attrs = "") =>
      `<div class="row-f"><label for="pf-${name}">${label}</label><div class="fx"><input id="pf-${name}" name="${name}" value="${esc(value)}" ${ro} ${attrs} />${extra}</div></div>`;
    shell(
      "profile",
      edit ? "Edit Profile" : "Profile",
      "Look at what is happening with your " + (isBusiness() ? "business" : "account"),
      `<form id="pf" novalidate>
        <div class="actions">${
          edit
            ? `<a class="btn btn--line" href="#/profile">Cancel</a><button class="btn" type="submit">Save Changes</button>`
            : `<a class="btn" href="#/profile?edit=1">Edit Profile</a>`
        }</div>
        <section class="card"><div class="pf">
          <div><h2>Basic Information</h2>
            ${row("Full Name", "full_name", u.full_name, "", 'autocomplete="name" required')}
            <div class="row-f"><label for="pf-email">Email Address</label><div class="fx"><input id="pf-email" value="${esc(u.email)}" readonly aria-describedby="email-hint" /></div></div>
            ${edit ? `<p class="hint" id="email-hint">To change your email, contact info@rehohub.com.</p>` : ""}
            ${row("Phone Number", "phone", u.phone || "", "", 'type="tel" autocomplete="tel"')}
            <div class="row-f"><label for="pf-cur">Currency</label><div class="fx"><input id="pf-cur" value="Naira" readonly /><i class="flag" aria-hidden="true"></i></div></div>
            <p class="hint">We are only accepting Naira payment, for the future we are hoping to expand our services across other African countries.</p>
          </div>
          <div><h2>Location</h2>
            ${row("Street", "street", p.street, "", 'autocomplete="street-address"')}
            ${row("City", "city", p.city, "", 'autocomplete="address-level2"')}
            <div class="row-f"><label for="pf-country">Country</label><div class="fx"><input id="pf-country" value="Nigeria" readonly /><i class="flag" aria-hidden="true"></i></div></div>
            ${isBusiness() ? row("Company Domain", "domain", p.domain, "", 'placeholder="www.yourbusiness.com"') : ""}
          </div>
          <div style="grid-column:1/-1"><h2 style="margin:0">Bank Information</h2></div>
          <div><h3>Card Details</h3>
            ${
              edit
                ? row(
                    "Card Number",
                    "card_number",
                    "",
                    "",
                    `inputmode="numeric" autocomplete="cc-number" placeholder="${p.card.last4 ? "•••• •••• •••• " + esc(p.card.last4) : "Card number"}"`,
                  )
                : row(
                    "Card Number",
                    "card_number",
                    p.card.last4 ? "•••• •••• •••• " + p.card.last4 : "",
                    `<span class="tag">${esc(cardBrand(p.card.brand))}</span>`,
                  )
            }
            ${row("Card Name", "card_name", p.card.name, "", 'autocomplete="cc-name"')}
            ${row("Expiry Date", "card_expiry", p.card.expiry, "", 'placeholder="MM/YY" autocomplete="cc-exp" maxlength="5"')}
            <p class="hint">For your safety AiPay keeps only the last 4 digits of your card on this device, and never your CVV or PIN.</p>
          </div>
          <div><h3>Transfer Details</h3>
            ${row("Account Name", "acct_name", p.transfer.name)}
            ${
              edit
                ? `<div class="row-f"><label for="pf-bank">Bank Name</label><div class="fx"><select id="pf-bank" name="bank"><option value="">Select bank</option>${BANKS.map((b) => `<option ${b === p.transfer.bank ? "selected" : ""}>${b}</option>`).join("")}</select></div></div>`
                : row("Bank Name", "bank", p.transfer.bank)
            }
            ${row("Account Number", "acct_no", p.transfer.number, edit ? "" : `<button class="copy tag" type="button" id="cpacct" aria-label="Copy account number">${ic("copy")}</button>`, 'inputmode="numeric" maxlength="10"')}
          </div>
        </div></section></form>`,
    );
    const cp = $("#cpacct");
    if (cp) cp.addEventListener("click", () => p.transfer.number && copy(p.transfer.number));
    if (!edit) return;
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const v = Object.fromEntries(new FormData(f));
      const digits = (v.card_number || "").replace(/\D/g, "");
      if (digits && (digits.length < 12 || digits.length > 19)) return toast("Check the card number.");
      if (v.card_expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(v.card_expiry))
        return toast("Use MM/YY for the expiry date.");
      if (v.acct_no && !/^\d{10}$/.test(v.acct_no)) return toast("Account numbers have 10 digits.");
      const btn = e.submitter || $('button[type="submit"]', f);
      await busy(btn, async () => {
        try {
          if (v.full_name.trim() !== u.full_name || (v.phone || "").trim() !== (u.phone || "")) {
            await RH.call("me/profile", {
              method: "POST",
              body: { full_name: v.full_name.trim(), phone: (v.phone || "").trim() },
            });
            SESSION = await RH.session(true);
          }
          Object.assign(p, { street: v.street.trim(), city: v.city.trim(), domain: (v.domain || "").trim() });
          if (digits) p.card = { ...p.card, last4: digits.slice(-4), brand: digits[0] };
          Object.assign(p.card, { name: v.card_name.trim(), expiry: v.card_expiry.trim() });
          p.transfer = { name: v.acct_name.trim(), bank: v.bank || "", number: v.acct_no.trim() };
          if (D.settings.profile) notify(D, "Your profile was updated.");
          save();
          history.replaceState(null, "", "#/profile");
          viewProfile(false);
          modal(
            `<div class="done-ico">${ic("check")}</div><h2>Edited Successfully</h2><p class="sub">Your profile has been updated successfully.</p><button class="btn btn--sm" type="button" data-close>Close</button>`,
            "modal--small",
          );
        } catch (err) {
          toast(err.message);
        }
      });
    });
  }
  const cardBrand = (d) => (d === "4" ? "VISA" : d === "5" || d === "2" ? "MC" : d === "6" ? "VERVE" : "");

  // ------------------------------------------------------------ settings
  function viewSettings() {
    const s = { ...D.settings };
    const group = (title, items) =>
      `<section><h2 style="font-size:17px;margin:0 0 12px">${title}</h2><div class="toggles">${items
        .map(
          ([k, label, sub]) =>
            `<div class="tg"><div><b id="lb-${k}">${label}</b><small>${sub}</small></div><span class="sw"><input type="checkbox" role="switch" data-k="${k}" aria-labelledby="lb-${k}" ${s[k] ? "checked" : ""} /><span></span></span></div>`,
        )
        .join("")}</div></section>`;
    shell(
      "settings",
      "Settings",
      "Look at what is happening with your " + (isBusiness() ? "business" : "account"),
      `<div class="actions"><button class="btn btn--line" type="button" id="cancel">Cancel</button><button class="btn" type="button" id="saveS">Save</button></div>
      <div class="card"><div class="pf">
        <div class="grid">${isBusiness() ? group("Sales", SETTINGS.sales) : ""}${group("Notification", SETTINGS.notify)}</div>
        <div>${isBusiness() ? group("Bank", SETTINGS.bank) : ""}<p class="hint" style="margin-top:14px">Email and SMS alerts start when the AiPay server is connected. On-screen notifications work now.</p></div>
      </div></div>`,
    );
    $$("[data-k]").forEach((c) => c.addEventListener("change", () => (s[c.dataset.k] = c.checked)));
    $("#cancel").addEventListener("click", viewSettings);
    $("#saveS").addEventListener("click", () => {
      D.settings = s;
      save();
      toast("Settings saved");
    });
  }

  // ------------------------------------------------------------ products (merchant)
  function viewProducts() {
    shell(
      "products",
      "Products",
      "Add what you sell and share a payment link for each product",
      `<div class="actions"><button class="btn" type="button" id="addP">${ic("plus")}Add product</button></div>
      <section class="card">${
        D.products.length
          ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Price</th><th>In stock</th><th>Sold</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${D.products
              .map(
                (p) =>
                  `<tr><td><b style="font-weight:600">${esc(p.name)}</b>${p.desc ? `<br><small style="color:var(--mute)">${esc(p.desc)}</small>` : ""}</td><td>${ngn(p.price)}</td><td>${p.stock}</td><td>${p.sold || 0}</td><td style="text-align:right"><button class="btn btn--sm btn--line" type="button" data-plink="${p.id}">${ic("link")}Copy pay link</button> <button class="btn btn--sm btn--line" type="button" data-pedit="${p.id}">Edit</button></td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : `<div class="empty">${ic("bag")}<p style="margin:0">No products yet. Add your first product to start selling.</p></div>`
      }</section>`,
    );
    $("#addP").addEventListener("click", () => productForm());
    $$("[data-pedit]").forEach((b) =>
      b.addEventListener("click", () => productForm(D.products.find((p) => p.id === b.dataset.pedit))),
    );
    $$("[data-plink]").forEach((b) => b.addEventListener("click", () => copy(payUrl("?item=" + b.dataset.plink))));
  }
  function productForm(p) {
    const box = modal(
      `${xBtn}<h2>${p ? "Edit product" : "Add product"}</h2>
      <form class="grid" id="prod" style="gap:12px" novalidate>
        <label class="field"><span>Product name</span><input name="name" required maxlength="80" value="${esc(p ? p.name : "")}" /></label>
        <label class="field"><span>Price (NGN)</span><input name="price" inputmode="numeric" required value="${p ? p.price : ""}" /></label>
        <label class="field"><span>Quantity in stock</span><input name="stock" inputmode="numeric" required value="${p ? p.stock : ""}" /></label>
        <label class="field"><span>Short description</span><input name="desc" maxlength="120" value="${esc(p ? p.desc : "")}" /></label>
        <button class="btn btn--block" type="submit">${p ? "Save product" : "Add product"}</button>
        ${p ? `<button class="btn btn--line btn--block" type="button" id="delP">Remove product</button>` : ""}
      </form>`,
    );
    $("#prod", box).addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(e.target));
      const price = +String(v.price).replace(/[^\d]/g, ""),
        stock = +String(v.stock).replace(/[^\d]/g, "");
      const errs = {};
      if (v.name.trim().length < 2) errs.name = "Enter the product name.";
      if (!(price >= 100)) errs.price = "Enter a price of at least NGN 100.";
      if (!(stock >= 0) || v.stock === "") errs.stock = "Enter how many you have.";
      if (Object.keys(errs).length) return fieldErrors(e.target, { fields: errs });
      if (p) Object.assign(p, { name: v.name.trim(), price, stock, desc: v.desc.trim() });
      else D.products.unshift({ id: randDigits(8), name: v.name.trim(), price, stock, desc: v.desc.trim(), sold: 0 });
      save();
      closeModal();
      viewProducts();
    });
    const del = $("#delP", box);
    if (del)
      del.addEventListener("click", () => {
        D.products = D.products.filter((x) => x !== p);
        save();
        closeModal();
        viewProducts();
      });
  }

  // ------------------------------------------------------------ checkout (payment link)
  function viewPay(code, params) {
    const link = store.get(LINKS, {})[code];
    if (!link) {
      authPage({
        top: "",
        body: `<h1>Payment link not found</h1><p>This AiPay payment link isn't available. Check the link with the business that sent it.</p><p style="font-size:12px;color:var(--mute)">While AiPay is in test mode, a payment link only works in the browser where the business signed in.</p><a class="btn btn--block" href="#/login">Go to AiPay</a>`,
      });
      return;
    }
    const owner = loadFor(link.uid);
    const item = params.get("item") ? owner.products.find((p) => p.id === params.get("item")) : null;
    if (!sessionStorage.getItem("aipay-visit:" + code)) {
      owner.visits.push(Date.now());
      saveFor(link.uid, owner);
      try {
        sessionStorage.setItem("aipay-visit:" + code, "1");
      } catch (e) {}
    }
    const me = SESSION && SESSION.user;
    const allowTransfer = owner.settings.transfer !== false;
    app.innerHTML = `<main class="checkout" id="main"><div class="checkout__box">
      <a class="logo" href="#/dashboard">${logo()}</a>
      <div class="checkout__biz"><span class="av" aria-hidden="true">${esc(initials(link.business))}</span><div><b>${esc(link.business)}</b><small>${item ? esc(item.name) : "Secure payment with AiPay"}</small></div></div>
      <div class="testmode" role="note"><b>Test mode.</b> No money moves and no card is charged. Real payments start when the AiPay payment server is connected.</div>
      <form class="grid" id="pay" style="gap:12px" novalidate>
        <label class="field"><span>Amount (NGN)</span><input name="amount" inputmode="numeric" required ${item ? `value="${item.price}" readonly` : 'placeholder="e.g. 15000"'} /></label>
        <label class="field"><span>Your name</span><input name="payer" autocomplete="name" required value="${esc(me ? me.full_name : "")}" /></label>
        <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required value="${esc(me ? me.email : "")}" /></label>
        <div class="field"><span id="mlabel">Pay with</span><div class="methods" role="group" aria-labelledby="mlabel">
          <button type="button" class="method" data-m="card" aria-pressed="true">${ic("card")}Card</button>
          ${allowTransfer ? `<button type="button" class="method" data-m="transfer" aria-pressed="false">${ic("bank")}Bank transfer</button>` : ""}
        </div></div>
        <p class="hint" id="mhint" style="margin:0">Your card is checked by the payment provider. AiPay never sees your PIN or CVV.</p>
        <button class="btn btn--block" type="submit">Pay</button>
      </form></div></main>`;
    let method = "card";
    $$("[data-m]").forEach((b) =>
      b.addEventListener("click", () => {
        method = b.dataset.m;
        $$("[data-m]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        $("#mhint").textContent =
          method === "card"
            ? "Your card is checked by the payment provider. AiPay never sees your PIN or CVV."
            : "You'll get account details to transfer to. The business confirms when the money arrives.";
      }),
    );
    $("#pay").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const v = Object.fromEntries(new FormData(f));
      const amount = +String(v.amount).replace(/[^\d]/g, "");
      const errs = {};
      if (!(amount >= 100)) errs.amount = "Enter at least NGN 100.";
      if (amount > 5000000) errs.amount = "The most you can pay at once is NGN 5,000,000.";
      if (v.payer.trim().length < 2) errs.payer = "Enter your name.";
      if (!/^\S+@\S+\.\S+$/.test(v.email)) errs.email = "Enter a valid email address.";
      if (Object.keys(errs).length) return fieldErrors(f, { fields: errs });
      const o = loadFor(link.uid);
      const t = {
        id: "#" + randDigits(10),
        at: Date.now(),
        side: "in",
        payer: v.payer.trim(),
        payerEmail: v.email.trim(),
        payerUid: me ? me.id : null,
        business: link.business,
        item: item ? item.name : "",
        amount,
        fee: Math.min(2000, Math.round(amount * 0.015)),
        method,
        status: method === "card" ? "success" : "pending",
        test: true,
      };
      o.txns.push(t);
      if (item) {
        const p = o.products.find((x) => x.id === item.id);
        if (p) {
          p.sold = (p.sold || 0) + 1;
          p.stock = Math.max(0, p.stock - 1);
        }
      }
      if (t.status === "success" && o.settings.paid)
        notify(o, `A new transaction of ${ngn(amount)} just arrived on your dashboard.`, "pay");
      if (t.status === "pending")
        notify(o, `${t.payer} started a bank transfer of ${ngn(amount)}. Confirm it when the money arrives.`, "pay");
      saveFor(link.uid, o);
      if (me && me.id !== link.uid) {
        const mineD = loadFor(me.id);
        mineD.txns.push({ ...t, side: "out" });
        notify(mineD, `You paid ${ngn(amount)} to ${link.business}.`, "pay");
        saveFor(me.id, mineD);
        if (D && SESSION.user.id === me.id) D = mineD;
      }
      if (D && SESSION && SESSION.user && SESSION.user.id === link.uid) D = o;
      const box = modal(
        `<div class="done-ico">${ic("check")}</div><h2>${t.status === "success" ? "Payment successful" : "Transfer started"}</h2>
        <p class="sub">${
          t.status === "success"
            ? `You paid ${ngn(amount)} to ${esc(link.business)}.`
            : `Transfer ${ngn(amount)} to ${esc(link.business)}. In test mode no account details are shown; the business will mark it as received.`
        }</p>
        <dl class="dl" style="text-align:left"><div><dt>Transaction ID</dt><dd>${esc(t.id)}</dd></div><div><dt>Status</dt><dd>${pill(t.status)}</dd></div></dl>
        <button class="btn btn--block" type="button" id="rcpt">Download Receipt</button>
        <a class="btn btn--line btn--block" href="${me ? "#/dashboard" : "../index.html"}">${me ? "Back to AiPay" : "Done"}</a>`,
        "modal--small",
      );
      $("#rcpt", box).addEventListener("click", () => printReceipt(t));
      f.reset();
    });
  }

  // ------------------------------------------------------------ router
  const app = $("#app");

  function render() {
    closeModal();
    const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
    const params = new URLSearchParams(query || "");
    const [page, arg] = path.split("/");
    const user = SESSION && SESSION.user;
    document.title = "AiPay";
    if (page === "pay" && arg) return viewPay(arg.replace(/\D/g, ""), params);
    if (!user) return viewWelcome();
    const roles = aipayRoles(user);
    if (!roles.length) {
      // Not added yet, waiting for approval, rejected or suspended: the shared Rehohub screen explains.
      RH.guard("aipay", ["customer", "merchant"]).catch(() => {});
      return;
    }
    const saved = store.get("aipay-role:" + user.id, null);
    ROLE = roles.includes(ROLE) ? ROLE : roles.includes(saved) ? saved : roles[0];
    D = load(user.id);
    if (isBusiness()) registerLink();
    // Welcome and approval notices, once.
    for (const r of roles) {
      if (!D.seenApproved[r]) {
        D.seenApproved[r] = Date.now();
        if (D.settings.reg !== false)
          notify(
            D,
            r === "customer"
              ? "Welcome to AiPay. Pay any AiPay business and earn points on every payment."
              : `Your ${r === "gateway" ? "payment system" : "store"} has been reviewed and approved. You can now share your payment link and receive payments.`,
          );
      }
    }
    save();
    const pages = {
      dashboard: viewDashboard,
      history: () => viewHistory("history"),
      sales: () => (ROLE === "merchant" ? viewHistory("sales") : go("#/history")),
      products: () => (ROLE === "merchant" ? viewProducts() : go("#/dashboard")),
      notifications: viewNotifications,
      profile: () => viewProfile(params.get("edit") === "1"),
      settings: viewSettings,
    };
    if (page === "history" && ROLE === "merchant") return go("#/sales");
    (pages[page] || (() => location.replace("#/dashboard")))();
    document.title = (page && pages[page] ? page[0].toUpperCase() + page.slice(1) + " · " : "") + "AiPay";
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (e) => {
    if (SESSION && SESSION.user && e.key === KEY(SESSION.user.id)) render();
  });

  (async () => {
    try {
      SESSION = await RH.session(true);
    } catch (e) {
      SESSION = { user: null };
      const [page] = location.hash.replace(/^#\/?/, "").split(/[/?]/);
      if (page !== "pay") return viewWelcome(e.message);
    }
    render();
  })();
})();
