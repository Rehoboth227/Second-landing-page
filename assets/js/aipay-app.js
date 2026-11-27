/* AiPay web app (products/aipay.html).
   Built from the "Ai Pay Project" Figma file and its prototype recordings: the buyer store, cart and
   checkout, buyer dashboard; merchant profile set-up, review fee, dashboard, sales report, market
   place, profile, settings and notifications; and the AiPay points-card designs.
   Sign-in, sign-up and approvals use the shared Rehohub account pages and admin console.
   Stores, products, orders, notifications and settings are saved on the server (api/lib/aipay.php).
   Payment is by bank transfer to the store's account: the buyer says they've sent it and the store
   confirms it arrived. Card payment needs a payment provider and is shown as coming soon. */
(() => {
  "use strict";

  // ------------------------------------------------------------ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = RH.esc;
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const logo = (light) => `<svg aria-hidden="true"><use href="#i-logo${light ? "-w" : ""}"/></svg><span>AiPay</span>`;
  const ngn = (n) => "NGN " + Math.round(n || 0).toLocaleString("en-NG");
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
  const toDate = (s) => (typeof s === "string" ? new Date(s.replace(" ", "T") + "Z") : new Date(s));
  const fmtDate = (s) => {
    const d = toDate(s);
    return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "long" })}, ${d.getFullYear()}`;
  };
  const fmtDateTime = (s) =>
    fmtDate(s) + ", " + toDate(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ago = (s) => {
    const sec = Math.max(1, Math.round((Date.now() - toDate(s)) / 1000));
    if (sec < 60) return "Just now";
    const m = Math.round(sec / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.round(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  };
  const img = (id) => (id ? RH.url("api/aipay/image?id=" + id) : "");
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
      } catch (e) {}
    },
  };
  const toast = (msg) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  };
  const go = (h) => (location.hash === h ? render() : (location.hash = h));
  const GET = (p) => RH.call(p);
  const POST = (p, body) => RH.call(p, { method: "POST", body });
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch (e) {
      toast("Copy failed. Select the text and copy it.");
    }
  }

  const STATUS = {
    awaiting_payment: ["Awaiting payment", "pending"],
    payment_sent: ["Confirming payment", "pending"],
    processing: ["Processing", "success"],
    ready: ["Ready", "success"],
    shipped: ["Shipped", "success"],
    delivered: ["Delivered", "success"],
    cancelled: ["Cancelled", "failed"],
  };
  const pill = (s) => `<span class="pill pill--${(STATUS[s] || ["", "pending"])[1]}">${(STATUS[s] || [s])[0]}</span>`;
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
    "Providus Bank",
    "Stanbic IBTC",
    "Sterling Bank",
    "UBA",
    "Union Bank",
    "Wema Bank",
    "Zenith Bank",
  ];
  // Points: shoppers earn 1 point per ₦100 paid; stores 1 point per ₦1,000 of sales.
  const TIERS = [
    { min: 50000, name: "VVIP Black", tag: "VVIP", cls: "pts--black", coin: true },
    { min: 10000, name: "VVIP", tag: "VVIP", cls: "pts--navy" },
    { min: 0, name: "VIP", tag: "VIP", cls: "pts--gold" },
  ];
  const tierOf = (p) => TIERS.find((t) => p >= t.min);

  // ------------------------------------------------------------ state
  let SESSION = null; // shared Rehohub session { user }
  let ME = null; // GET aipay/me
  let VIEW = "shop"; // shop | store
  const app = $("#app");
  const CART_KEY = "aipay-cart-v1";
  const cart = {
    get: () => store.get(CART_KEY, { merchant_id: 0, store: "", items: [] }),
    set: (c) => (store.set(CART_KEY, c), updateCartBadge()),
    count: () => cart.get().items.reduce((a, i) => a + i.qty, 0),
    total: () => cart.get().items.reduce((a, i) => a + i.qty * i.price, 0),
  };
  const merchant = () => (ME && ME.merchant) || null;
  const storeLive = () => !!(ME && ME.store && ME.store.live);
  const isMerchant = () => !!merchant() && ["pending", "approved"].includes(merchant().status);
  async function refreshMe() {
    ME = await GET("aipay/me");
    return ME;
  }

  // ------------------------------------------------------------ modal, forms
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
    (box.querySelector("input,select,button:not(.modal__x)") || box).focus();
    return box;
  }
  let poll = null;
  function closeModal() {
    $$(".modal").forEach((m) => m.remove());
    if (poll) clearInterval(poll);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  const xBtn = `<button type="button" class="modal__x" data-close aria-label="Close">${ic("x")}</button>`;
  const back = (label = "Back") => `<button type="button" class="back" data-back>${ic("back")}${label}</button>`;
  const dots = `<div class="dots-spin" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;

  function fieldErrors(form, err) {
    $$(".field", form).forEach((f) => {
      f.classList.remove("has-error");
      const s = $("small.err", f);
      if (s) s.remove();
    });
    let firstBad = null;
    for (const [k, msg] of Object.entries((err && err.fields) || {})) {
      const inp = form.querySelector(`[name="${k}"]`);
      const f = inp && inp.closest(".field");
      if (!f) continue;
      f.classList.add("has-error");
      f.insertAdjacentHTML("beforeend", `<small class="err">${esc(msg)}</small>`);
      firstBad = firstBad || inp;
    }
    if (firstBad) firstBad.focus();
  }
  function showAlert(form, msg, kind = "") {
    let a = $(":scope > .alert", form);
    if (!a) {
      a = document.createElement("div");
      form.prepend(a);
    }
    a.className = "alert " + (kind ? "alert--" + kind : "");
    a.setAttribute("role", "alert");
    a.textContent = msg;
  }
  async function busy(btn, fn) {
    const label = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-busy");
      btn.textContent = "Please wait…";
    }
    try {
      return await fn();
    } finally {
      if (btn && btn.isConnected) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
        btn.innerHTML = label;
      }
    }
  }
  /** Runs an API call from a form: shows field errors and messages. */
  function submit(form, fn) {
    return busy(form.querySelector("button[type=submit]"), async () => {
      try {
        fieldErrors(form, null);
        return await fn();
      } catch (err) {
        showAlert(form, err.message);
        fieldErrors(form, err);
        return undefined;
      }
    });
  }
  const values = (form) => Object.fromEntries(new FormData(form));
  const field = (name, label, value = "", attrs = "", hint = "") =>
    `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs} />${hint ? `<small class="hint">${hint}</small>` : ""}</label>`;
  const select = (name, label, list, value = "", ph = "Select") =>
    `<label class="field"><span>${label}</span><select name="${name}"><option value="">${ph}</option>${list.map((x) => `<option ${x === value ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`;
  const row = (label, name, value = "", attrs = "") =>
    `<div class="row-f field"><label for="f-${name}">${label}</label><div class="fx"><input id="f-${name}" name="${name}" value="${esc(value)}" ${attrs} /></div></div>`;
  const rowSel = (label, name, list, value = "", ph = "Select") =>
    `<div class="row-f field"><label for="f-${name}">${label}</label><div class="fx"><select id="f-${name}" name="${name}"><option value="">${ph}</option>${list.map((x) => `<option ${x === value ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div></div>`;

  // Shrinks a photo in the browser, then uploads it. Returns the image id.
  async function uploadImage(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPG, PNG or WebP picture.");
    if (file.size > 15 * 1024 * 1024) throw new Error("That picture is too large. Use one smaller than 15 MB.");
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((ok, bad) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => bad(new Error("That file isn't a picture we can read."));
        i.src = url;
      });
      const k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(im.naturalWidth * k));
      c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      return (await POST("aipay/image", { data: c.toDataURL("image/jpeg", 0.82) })).id;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const mb = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const BOOK_TYPES = ".pdf,.epub,.mobi,.azw3,.mp3,.m4a,.m4b";
  // Sends an e-book or audiobook to the server in 4 MB pieces. Returns the stored file.
  async function uploadBook(file, onPct) {
    const st = await POST("aipay/file/start", { name: file.name, size: file.size });
    let off = 0;
    let out = null;
    while (off < file.size) {
      const r = await RH.raw("aipay/file/chunk?id=" + st.id + "&offset=" + off, file.slice(off, off + st.chunk));
      off = r.received;
      onPct(Math.round((off / file.size) * 100));
      if (r.done) out = r.file;
    }
    return out;
  }
  const downloadUrl = (code, pid) =>
    RH.url("api/aipay/download?" + (code ? "code=" + encodeURIComponent(code) + "&" : "") + "product=" + pid);
  // An upload box (click, or drag and drop a picture onto it).
  function bindUpload(boxSel, inputName, label) {
    const boxEl = $(boxSel);
    const hidden = boxEl.closest("form").querySelector(`[name="${inputName}"]`);
    const take = async (file) => {
      if (!file) return;
      boxEl.classList.add("is-busy");
      try {
        const id = await uploadImage(file);
        hidden.value = id;
        $(".upload__pic", boxEl).innerHTML = `<img src="${esc(img(id))}" alt="${esc(label)}" />`;
      } catch (err) {
        toast(err.message);
      } finally {
        boxEl.classList.remove("is-busy");
      }
    };
    $("input[type=file]", boxEl).addEventListener("change", (e) => take(e.target.files[0]));
    boxEl.addEventListener("dragover", (e) => (e.preventDefault(), boxEl.classList.add("is-over")));
    boxEl.addEventListener("dragleave", () => boxEl.classList.remove("is-over"));
    boxEl.addEventListener("drop", (e) => {
      e.preventDefault();
      boxEl.classList.remove("is-over");
      take(e.dataTransfer.files[0]);
    });
  }
  const uploadBox = (id, imageId, label) =>
    `<div class="upload" id="${id}"><div class="upload__pic">${imageId ? `<img src="${esc(img(imageId))}" alt="${esc(label)}" />` : `<span class="upload__ico">${ic("doc")}</span><small>JPG or PNG smaller than 15MB</small>`}</div>
      <p>Drag and drop your image here</p><label class="btn btn--sm">Choose file<input type="file" accept="image/jpeg,image/png,image/webp" class="sr" /></label></div>`;

  // ------------------------------------------------------------ points card
  function pointsCard(name, p) {
    const t = tierOf(p.points);
    const chip = `<svg class="pts__chip" viewBox="0 0 96 76" aria-hidden="true"><rect width="96" height="76" rx="10" fill="#FFA31A"/><path d="M38 6v18c0 7-13 6-13 14s13 7 13 14v18M58 6v18c0 7 13 6 13 14s-13 7-13 14v18M8 38h22M66 38h22" fill="none" stroke="#FFD36B" stroke-width="5" stroke-linecap="round"/></svg>`;
    return `<div class="pts ${t.cls}" role="img" aria-label="AiPay ${t.name} points card for ${esc(name)}: ${p.points.toLocaleString("en-NG")} points">
      <div class="pts__logo"><svg aria-hidden="true"><use href="#i-logo"/></svg><span>AiPay</span></div>
      ${chip}
      ${t.coin ? `<span class="pts__coin"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><ellipse cx="12" cy="9" rx="7" ry="3.5"/><path d="M5 9v5c0 2 3.1 3.5 7 3.5s7-1.5 7-3.5V9"/></svg></span>` : ""}
      <span class="pts__label">Your Points</span>
      <span class="pts__num">${p.points.toLocaleString("en-NG")}</span>
      <span class="pts__delta ${p.delta < 0 ? "is-down" : ""}">${Math.abs(p.delta)}% ${p.delta < 0 ? "Down from" : "From"} last month</span>
      <span class="pts__tier">${t.tag}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/></svg></span>
      <span class="pts__name">${esc(name)}</span>
    </div>`;
  }
  const tierNote = (per) =>
    `<p class="hint" style="margin:10px 0 0">You earn 1 point for every ${per}. VIP from 0, VVIP from 10,000 and VVIP Black from 50,000 points.</p>`;

  // ------------------------------------------------------------ signed out
  function authPage(body, top = "") {
    app.innerHTML = `<div class="auth">
      <aside class="auth__art"><a class="logo logo--light" href="../index.html" aria-label="Rehohub home">${logo(true)}</a></aside>
      <main class="auth__main" id="main">
        <div class="auth__mobile-head"><a class="logo" href="../index.html" aria-label="Rehohub home">${logo()}</a></div>
        <div class="auth__top">${top}</div>
        <div class="auth__body">${body}</div>
      </main></div>`;
    window.scrollTo(0, 0);
  }
  const INTENTS = {
    store: { role: "merchant", label: "Create a store" },
    buy: { role: "customer", label: "Buy high classic products" },
  };
  let intent = "";
  function viewWelcome(note = "") {
    const login = RH.loginUrl(location.pathname + "#/store");
    authPage(
      `<h1>Join AiPay Today</h1>
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
          <a class="link center" href="#/store">Browse the AiPay Store first</a>
        </form>`,
      `<span class="grow"></span><span>Already have an account? <a class="link" href="${esc(login)}">Sign in</a></span>`,
    );
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

  // ------------------------------------------------------------ buyer layout (top bar, as in the buyer design)
  function shopShell(page, content, opts = {}) {
    const u = SESSION && SESSION.user;
    const link = (h, label) => `<a href="#/${h}" ${page === h ? 'aria-current="page"' : ""}>${label}</a>`;
    const unread = ME ? ME.unread : 0;
    const menuLinks = `${link("store", "Store")}${u ? link("orders", "Dashboard") : ""}<button type="button" data-cart>Cart</button>${u ? link("profile", "Profile") + link("notifications", "Notifications" + (unread ? ` (${unread})` : "")) + link("settings", "Settings") : ""}${isMerchant() ? `<a href="#/dashboard" data-view="store">My store</a>` : ""}${u && RH.isAdminFor(u, "aipay") ? `<a href="${esc(RH.url("account/admin.html"))}">Admin console</a>` : ""}${u ? `<a href="${esc(RH.url("account/index.html"))}">My Rehohub account</a>` : ""}`;
    app.innerHTML = `<div class="shop ${opts.plain ? "shop--plain" : ""}">
      <header class="shop__bar"><div class="shop__in">
        <a class="logo" href="#/store">${logo()}</a>
        ${
          opts.plain
            ? `<nav class="shop__nav" aria-label="AiPay">${link("store", "Store")}${u ? link("orders", "Dashboard") + link("profile", "Profile") : ""}</nav><span class="grow"></span>`
            : `<form class="shop__search" id="topSearch" role="search"><label class="sr" for="tq">Search products</label>${ic("search")}<input id="tq" type="search" placeholder="Search anything..." value="${esc(SQ.q)}" /></form>`
        }
        <div class="shop__icons">
          ${u ? `<a class="top__ico" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<b>${unread}</b>` : ""}</a>` : ""}
          <button class="top__ico" type="button" data-cart aria-label="Cart">${ic("cart")}<b data-cart-n hidden></b></button>
          ${
            u
              ? `<details class="me"><summary aria-label="Account menu"><span class="av">${esc(initials(u.full_name))}</span></summary><div class="me__menu"><b>${esc(u.full_name)}</b><small>${esc(u.email)}</small>${menuLinks}<button type="button" data-logout>Log out</button></div></details>`
              : `<a class="btn btn--sm" href="${esc(RH.loginUrl(location.pathname + location.hash))}">Sign in</a>`
          }
          <button class="menu-btn" type="button" data-shopmenu aria-label="Open menu" aria-expanded="false">${ic("menu")}</button>
        </div>
      </div>
      <nav class="shop__drawer" aria-label="Menu" hidden><p class="side__label">Menu</p>${menuLinks}${u ? `<button type="button" class="btn btn--sm" data-logout>Log Out</button>` : `<a class="btn btn--sm" href="${esc(RH.loginUrl(location.pathname + location.hash))}">Sign in</a>`}</nav>
      </header>
      <main class="shop__main" id="main">${content}</main></div>`;
    const ts = $("#topSearch");
    if (ts)
      ts.addEventListener("submit", (e) => {
        e.preventDefault();
        SQ.q = $("#tq").value.trim();
        SQ.page = 1;
        if (location.hash.startsWith("#/store")) viewStore();
        else go("#/store");
      });
    updateCartBadge();
    window.scrollTo(0, 0);
  }
  function updateCartBadge() {
    const n = cart.count();
    $$("[data-cart-n]").forEach((b) => {
      b.hidden = !n;
      b.textContent = n;
    });
  }

  // ------------------------------------------------------------ a seller's own shop (their link)
  const slug = (s) =>
    String(s || "store")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "store";
  const shopHash = (id, name) => `#/s/${id}-${slug(name)}`;
  const shopUrl = (id, name) => location.origin + location.pathname + shopHash(id, name);
  async function viewShop(id) {
    shopShell(
      "shop",
      `<div class="loading-inline"><div class="spin" role="status" aria-label="Loading the store"></div></div>`,
    );
    let s, r;
    try {
      [s, r] = await Promise.all([GET("aipay/storefront?id=" + id), GET("aipay/products?store=" + id)]);
      s = s.store;
    } catch (e) {
      $("#main").innerHTML =
        `<div class="card empty">${ic("bag")}<p style="margin:0">${esc(e.message)}</p><a class="btn btn--sm" href="#/store">Go to the AiPay Store</a></div>`;
      return;
    }
    document.title = s.business_name + " · AiPay";
    $("#main").innerHTML = `<section class="card shopfront">
        <div class="shopfront__logo">${s.logo_id ? `<img src="${esc(img(s.logo_id))}" alt="" />` : esc(initials(s.business_name))}</div>
        <div class="shopfront__body"><h1>${esc(s.business_name)}</h1>
          <p class="hint" style="margin:0">${esc(s.category || "")}${s.city ? " · " + esc([s.city, s.state].filter(Boolean).join(", ")) : ""} · ${s.products} product${s.products === 1 ? "" : "s"}</p>
          ${s.about ? `<p style="margin:8px 0 0">${esc(s.about)}</p>` : ""}
          <p class="hint" style="margin:8px 0 0">${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : ""}${s.phone && s.email ? " · " : ""}${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ""}</p></div>
        <div class="shopfront__acts"><button class="btn btn--line btn--sm" type="button" id="shareShop">${ic("link")}Share this store</button><a class="btn btn--sm" href="#/store">All AiPay stores</a></div>
      </section>
      ${
        r.items.length
          ? `<div class="pgrid">${r.items.map(productCard).join("")}</div>`
          : `<div class="card empty">${ic("bag")}<p style="margin:0">This store has no products yet.</p></div>`
      }`;
    $("#shareShop").addEventListener("click", () => copy(shopUrl(s.id, s.business_name)));
    $$("[data-product]").forEach((el) =>
      el.addEventListener("click", (e) => productModal(+el.dataset.product, !!e.target.closest("[data-quick]"))),
    );
  }

  // ------------------------------------------------------------ buyer: store
  const SQ = { q: "", category: "", city: store.get("aipay-city", ""), page: 1 };
  const CAT_ICON = {
    "Foods & Drinks": "🍔",
    Fashion: "👗",
    Electronics: "💻",
    "Phones & Gadgets": "📱",
    "Make-up & Beauty": "💄",
    "Home & Kitchen": "🍳",
    Groceries: "🥕",
    "Books & Stationery": "📚",
    Health: "💊",
    Others: "🛍️",
  };
  async function viewStore() {
    shopShell(
      "store",
      `<div class="loading-inline"><div class="spin" role="status" aria-label="Loading products"></div></div>`,
    );
    let r;
    try {
      r = await GET(
        "aipay/products?" + new URLSearchParams({ q: SQ.q, category: SQ.category, city: SQ.city, page: SQ.page }),
      );
    } catch (e) {
      $("#main").innerHTML = `<div class="alert">${esc(e.message)}</div>`;
      return;
    }
    const cats = r.categories;
    $("#main").innerHTML = `<div class="store-head">
        <div><h1>Welcome To AiPay Store</h1><p>Enjoy high classic products only on AiPay</p></div>
        <button class="loc" type="button" id="locBtn">${ic("pin")}<span><b>${SQ.city ? "Stores near" : "Use your current location"}</b><small>${esc(SQ.city || (ME && ME.address ? [ME.address.street, ME.address.city].join(", ") : "Find stores near you"))}</small></span></button>
      </div>
      <div class="cats" role="group" aria-label="Categories">
        <label class="sr" for="catSel">Category</label>
        <select id="catSel" class="cat-sel"><option value="">All Category</option>${cats.map((c) => `<option ${c === SQ.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        ${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === SQ.category}"><span aria-hidden="true">${CAT_ICON[c] || ""}</span>${esc(c)}</button>`).join("")}
      </div>
      ${SQ.q ? `<p class="results">Results for “${esc(SQ.q)}” · <button class="link" type="button" id="clearQ">Clear search</button></p>` : ""}
      ${
        r.items.length
          ? `<div class="pgrid">${r.items.map(productCard).join("")}</div>
             <div class="pager" style="justify-content:center;gap:10px">${SQ.page > 1 ? `<button class="btn btn--line btn--sm" type="button" data-page="${SQ.page - 1}">Previous</button>` : ""}${r.more ? `<button class="btn btn--line btn--sm" type="button" data-page="${SQ.page + 1}">More products</button>` : ""}</div>`
          : `<div class="card empty">${ic("bag")}<p style="margin:0">${SQ.q || SQ.category ? "Nothing matches. Try another search or category." : "No products yet. Stores are getting ready, check back soon."}</p></div>`
      }`;
    $("#catSel").addEventListener("change", (e) => ((SQ.category = e.target.value), (SQ.page = 1), viewStore()));
    $$("[data-cat]").forEach((b) =>
      b.addEventListener("click", () => {
        SQ.category = SQ.category === b.dataset.cat ? "" : b.dataset.cat;
        SQ.page = 1;
        viewStore();
      }),
    );
    $$("[data-page]").forEach((b) => b.addEventListener("click", () => ((SQ.page = +b.dataset.page), viewStore())));
    const cq = $("#clearQ");
    if (cq) cq.addEventListener("click", () => ((SQ.q = ""), viewStore()));
    $("#locBtn").addEventListener("click", locationModal);
    $$("[data-product]").forEach((el) =>
      el.addEventListener("click", (e) => productModal(+el.dataset.product, !!e.target.closest("[data-quick]"))),
    );
  }
  const productCard = (p) =>
    `<article class="pcard"><button type="button" class="pcard__img" data-product="${p.id}" aria-label="View ${esc(p.name)}">${p.image_id ? `<img src="${esc(img(p.image_id))}" alt="" loading="lazy" />` : ic("bag")}</button>
      <div class="pcard__body"><h3>${esc(p.name)}</h3><small>${p.digital ? `<b>${esc(p.format)} download</b> · ` : ""}<a href="${shopHash(p.merchant_id, p.store)}" class="pcard__store">${esc(p.store)}</a>${p.city ? " · " + esc(p.city) : ""}</small>
      <div class="pcard__row"><b>${ngn(p.price)}</b>${p.stock > 0 ? `<button type="button" class="plus" data-product="${p.id}" data-quick aria-label="Add ${esc(p.name)} to cart">${ic("plus")}</button>` : `<span class="soldout">Sold out</span>`}</div></div></article>`;

  function locationModal() {
    const saved = (ME && ME.address) || null;
    const box = modal(`${xBtn}<h2 class="mh">Your Location</h2>
      <form class="grid" id="locF" style="gap:12px" novalidate>
        <label class="field field--icon"><span class="sr">City or town</span>${ic("pin")}<input name="city" value="${esc(SQ.city)}" placeholder="Enter a city or town, e.g. Ikeja" autocomplete="address-level2" /></label>
        ${saved ? `<button class="loc loc--row" type="button" id="useSaved">${ic("pin")}<span><b>Use your current location</b><small>${esc([saved.street, saved.city, saved.state].filter(Boolean).join(", "))}</small></span></button>` : ""}
        <button class="btn btn--block" type="submit">Show stores near me</button>
        ${SQ.city ? `<button class="btn btn--line btn--block" type="button" id="anyLoc">Show all stores</button>` : ""}
      </form>`);
    const done = (city) => {
      SQ.city = city;
      store.set("aipay-city", city);
      SQ.page = 1;
      closeModal();
      viewStore();
    };
    $("#locF", box).addEventListener("submit", (e) => (e.preventDefault(), done(values(e.target).city.trim())));
    const us = $("#useSaved", box);
    if (us) us.addEventListener("click", () => done(saved.city));
    const any = $("#anyLoc", box);
    if (any) any.addEventListener("click", () => done(""));
  }

  async function productModal(id, quick) {
    let p;
    try {
      p = (await GET("aipay/product?id=" + id)).product;
    } catch (e) {
      return toast(e.message);
    }
    if (quick) return addToCart(p, 1);
    let qty = 1;
    const inCart = cart.get().items.find((i) => i.id === p.id);
    const box = modal(
      `${xBtn}${back()}${inCart ? `<button type="button" class="rm-item" id="rmItem">${ic("x")}Remove item</button>` : ""}<h2 class="mh">Product Details</h2><div class="pd">
      <div class="pd__img">${p.image_id ? `<img src="${esc(img(p.image_id))}" alt="${esc(p.name)}" />` : ic("bag")}</div>
      <div class="pd__body"><h3>${esc(p.name)}</h3><p class="pd__price">${ngn(p.price)}</p>
        <p class="pd__store">${esc(p.store)}${p.city ? " · " + esc(p.city) + ", " + esc(p.state) : ""}</p>
        ${p.digital ? `<p class="alert alert--info" style="margin:0">${ic("doc")} Digital download: ${esc(p.format)}, ${mb(p.file_size)}. Download it from <b>My orders</b> as soon as the store confirms your payment. Nothing is delivered.</p>` : p.stock > 0 ? `<div class="pd__qty"><span>Quantity</span>${stepper("pq", 1)}</div>` : `<p class="soldout">Sold out</p>`}
        ${p.description ? `<h4>Description</h4><p class="pd__desc">${esc(p.description)}</p>` : ""}
        <p class="pd__stock">${!p.digital && p.stock > 0 ? p.stock + " in stock" : ""}</p>
        ${p.stock > 0 ? `<div class="grid" style="gap:10px;grid-template-columns:1fr 1fr"><button class="btn btn--line" type="button" id="addC">Add to cart</button><button class="btn" type="button" id="buyN">Buy now</button></div>` : ""}
      </div></div>`,
      "modal--wide",
    );
    $("[data-back]", box).addEventListener("click", closeModal);
    const rm = $("#rmItem", box);
    if (rm)
      rm.addEventListener("click", () => {
        const c = cart.get();
        c.items = c.items.filter((i) => i.id !== p.id);
        cart.set(c);
        closeModal();
        toast("Removed from cart");
      });
    if (p.stock <= 0) return;
    if (!p.digital)
      bindStepper(
        box,
        "pq",
        () => qty,
        (v) => (qty = Math.max(1, Math.min(p.stock, v))),
      );
    $("#addC", box).addEventListener("click", () => addToCart(p, qty));
    $("#buyN", box).addEventListener("click", () => addToCart(p, qty, true));
  }
  const stepper = (id, v) =>
    `<div class="step" data-step="${id}"><button type="button" data-d="-1" aria-label="Fewer">−</button><output aria-live="polite">${v}</output><button type="button" data-d="1" aria-label="More">+</button></div>`;
  function bindStepper(root, id, get, set) {
    const s = $(`[data-step="${id}"]`, root);
    s.addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]");
      if (!b) return;
      set(get() + +b.dataset.d);
      $("output", s).textContent = get();
    });
  }
  function addToCart(p, qty, open) {
    const c = cart.get();
    if (c.items.length && c.merchant_id !== p.merchant_id) {
      if (
        !confirm(
          `Your cart has items from ${c.store}. You can order from one store at a time. Empty the cart and add this item?`,
        )
      )
        return;
      c.items = [];
    }
    c.merchant_id = p.merchant_id;
    c.store = p.store;
    const it = c.items.find((i) => i.id === p.id);
    if (it) it.qty = Math.min(p.stock, it.qty + qty);
    else
      c.items.push({
        id: p.id,
        name: p.name,
        price: p.price,
        image_id: p.image_id,
        qty: Math.min(p.stock, qty),
        stock: p.stock,
        digital: !!p.digital,
        format: p.format || "",
      });
    cart.set(c);
    if (open) return cartModal();
    closeModal();
    toast(`${p.name} added to cart`);
  }

  // ------------------------------------------------------------ buyer: cart and checkout (modals, as in the design)
  const CO = { delivery: "", address: null, phone: "" };
  function cartModal() {
    const c = cart.get();
    if (!c.items.length)
      return modal(
        `${xBtn}<h2 class="mh">Cart</h2><div class="empty">${ic("cart")}<p style="margin:0">Your cart is so lonely</p><button class="btn btn--sm" type="button" data-close data-goshop>Add items</button></div>`,
      );
    const box = modal(`${xBtn}<h2 class="mh">Cart</h2>
      <p class="hint" style="margin:-8px 0 0">From ${esc(c.store)}</p>
      <div class="citems">${c.items
        .map(
          (i) =>
            `<div class="citem"><div class="citem__img">${i.image_id ? `<img src="${esc(img(i.image_id))}" alt="" />` : ic("bag")}</div><div class="citem__body"><b>${esc(i.name)}</b><span>${ngn(i.price)}${i.digital ? " · " + esc(i.format) + " download" : ""}</span></div>${i.digital ? "<span></span>" : stepper("c" + i.id, i.qty)}<button type="button" class="kebab" data-rm="${i.id}" aria-label="Remove ${esc(i.name)}">${ic("x")}</button></div>`,
        )
        .join("")}</div>
      <button type="button" class="link center" data-close data-goshop>Add more items ↗</button>
      <button class="btn btn--block" type="button" id="toCheckout">Checkout (${ngn(cart.total())})</button>`);
    c.items
      .filter((i) => !i.digital)
      .forEach((i) =>
        bindStepper(
          box,
          "c" + i.id,
          () => i.qty,
          (v) => {
            i.qty = Math.max(1, Math.min(i.stock || 99, v));
            cart.set(c);
            $("#toCheckout", box).textContent = `Checkout (${ngn(cart.total())})`;
          },
        ),
      );
    $$("[data-rm]", box).forEach((b) =>
      b.addEventListener("click", () => {
        c.items = c.items.filter((i) => i.id !== +b.dataset.rm);
        cart.set(c);
        cartModal();
      }),
    );
    $("#toCheckout", box).addEventListener("click", () => {
      if (!SESSION || !SESSION.user) return (location.href = RH.loginUrl(location.pathname + "#/store?cart=1"));
      // Only downloads in the cart: nothing to deliver.
      if (c.items.every((i) => i.digital)) {
        CO.delivery = "digital";
        return summaryModal();
      }
      deliveryModal();
    });
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-goshop]") && !location.hash.startsWith("#/store")) go("#/store");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-copy-shop]") && ME && ME.store) copy(shopUrl(SESSION.user.id, ME.store.business_name));
  });

  function deliveryModal() {
    const f = ME.delivery_fees;
    const box = modal(`${xBtn}${back()}<h2 class="mh">Delivery option</h2>
      <p class="hint" style="margin:-8px 0 4px">Choose how you want to get your order</p>
      <button type="button" class="opt" data-dl="pickup"><span><b>Pick-up</b><small>Collect your order from ${esc(cart.get().store)}. Free.</small></span>${ic("chev")}</button>
      <button type="button" class="opt" data-dl="delivery"><span><b>AiPay Delivery</b><small>Delivered to your address: ${ngn(f.city)} in the same city, ${ngn(f.state)} in the same state, ${ngn(f.country)} to another state.</small></span>${ic("chev")}</button>`);
    $("[data-back]", box).addEventListener("click", cartModal);
    $$("[data-dl]", box).forEach((b) =>
      b.addEventListener("click", () => ((CO.delivery = b.dataset.dl), addressModal())),
    );
  }

  function addressModal() {
    const a = CO.address || (ME && ME.address) || {};
    const pickup = CO.delivery === "pickup";
    const box = modal(`${xBtn}${back()}<h2 class="mh">${pickup ? "Your phone number" : "Delivery Address"}</h2>
      <form class="grid" id="addrF" style="gap:12px" novalidate>
        ${
          pickup
            ? field(
                "phone",
                "Phone number",
                CO.phone || a.phone || SESSION.user.phone || "",
                'type="tel" autocomplete="tel" required',
                "The store calls this number when your order is ready.",
              )
            : `${ME.address ? `<button class="loc loc--row" type="button" id="useSaved">${ic("pin")}<span><b>Use your saved address</b><small>${esc([ME.address.street, ME.address.city, ME.address.state].join(", "))}</small></span></button>` : ""}
               ${field("street", "Street address", a.street || "", 'autocomplete="street-address" required placeholder="Enter a new address"')}
               <div class="grid2">${field("city", "City or town", a.city || "", 'autocomplete="address-level2" required')}${select("state", "State", ME.states, a.state || "", "Select state")}</div>
               ${field("phone", "Phone number", a.phone || SESSION.user.phone || "", 'type="tel" autocomplete="tel" required', "For the rider to reach you.")}
               <label class="check"><input type="checkbox" name="save" ${ME.address ? "" : "checked"} />Save this address for next time</label>`
        }
        <button class="btn btn--block" type="submit">Continue</button>
      </form>`);
    $("[data-back]", box).addEventListener("click", deliveryModal);
    const us = $("#useSaved", box);
    if (us) us.addEventListener("click", () => ((CO.address = { ...ME.address }), summaryModal()));
    $("#addrF", box).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const v = values(f);
      if (pickup) {
        if (!/^\+?[0-9 ()-]{7,20}$/.test(v.phone || ""))
          return fieldErrors(f, { fields: { phone: "Enter a valid phone number." } });
        CO.phone = v.phone.trim();
        return summaryModal();
      }
      const addr = { street: v.street.trim(), city: v.city.trim(), state: v.state, phone: v.phone.trim() };
      const errs = {};
      if (addr.street.length < 5) errs.street = "Enter the street address.";
      if (addr.city.length < 2) errs.city = "Enter the city or town.";
      if (!addr.state) errs.state = "Choose the state.";
      if (!/^\+?[0-9 ()-]{7,20}$/.test(addr.phone)) errs.phone = "Enter a valid phone number.";
      if (Object.keys(errs).length) return fieldErrors(f, { fields: errs });
      CO.address = addr;
      if (v.save) {
        const ok = await submit(f, async () => {
          ME.address = (await POST("aipay/prefs", { address: addr })).address;
          return true;
        });
        if (!ok) return;
      }
      summaryModal();
    });
  }

  function summaryModal() {
    const c = cart.get();
    const sub = cart.total();
    const box = modal(`${xBtn}${back()}<h2 class="mh">Summary</h2>
      <div class="tbl-wrap"><table class="tbl tbl--sum"><thead><tr><th>Product</th><th>Quantity</th><th>Amount</th></tr></thead><tbody>
      ${c.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${ngn(i.price * i.qty)}</td></tr>`).join("")}
      <tr><td>Delivery Cost</td><td></td><td>${CO.delivery === "digital" ? "None (download)" : CO.delivery === "pickup" ? "Free (pick-up)" : "Added when you continue"}</td></tr>
      <tr class="sum-total"><td>Subtotal</td><td></td><td>${ngn(sub)}</td></tr>
      </tbody></table></div>
      <p class="hint" style="margin:0">${CO.delivery === "digital" ? "You'll download your purchase from My orders once the store confirms your payment." : CO.delivery === "pickup" ? `Pick up from ${esc(c.store)}.` : `Deliver to ${esc([CO.address.street, CO.address.city, CO.address.state].join(", "))}.`}${c.items.some((i) => i.digital) && CO.delivery !== "digital" ? " Downloads are ready in My orders once payment is confirmed." : ""} You'll earn about ${Math.floor(sub / 100).toLocaleString("en-NG")} points.</p>
      <button type="button" class="link center" id="editItems">Edit items ↗</button>
      <form id="placeF" class="grid" novalidate><button class="btn btn--block" type="submit">Make Payment</button></form>`);
    $("[data-back]", box).addEventListener("click", CO.delivery === "digital" ? cartModal : addressModal);
    $("#editItems", box).addEventListener("click", cartModal);
    $("#placeF", box).addEventListener("submit", (e) => {
      e.preventDefault();
      submit(e.target, async () => {
        const r = await POST("aipay/orders", {
          items: c.items.map((i) => ({ product_id: i.id, qty: i.qty })),
          delivery: CO.delivery,
          ...(CO.delivery === "delivery"
            ? { address: CO.address }
            : CO.delivery === "pickup"
              ? { phone: CO.phone }
              : {}),
        });
        cart.set({ merchant_id: 0, store: "", items: [] });
        paymentMethodModal(r.order);
      });
    });
  }

  function paymentMethodModal(o) {
    const box = modal(`${xBtn}<h2 class="mh">Payment Method</h2>
      <p class="hint" style="margin:-8px 0 4px">Choose a payment method to carry out this transaction. Order #${esc(o.code)}: <b>${ngn(o.total)}</b>${o.delivery_fee ? ` (includes ${ngn(o.delivery_fee)} delivery)` : ""}</p>
      <button type="button" class="opt" id="byCard"><span><b>Card Payment</b><small>Provide your card details to carry out this transaction.</small></span>${ic("chev")}</button>
      <button type="button" class="opt" id="byTransfer"><span><b>Bank Transfer</b><small>Copy the account details and send the exact amount seen.</small></span>${ic("chev")}</button>`);
    $("#byTransfer", box).addEventListener("click", () => transferModal(o));
    $("#byCard", box).addEventListener("click", () => {
      const b2 = modal(`${xBtn}${back()}<h2 class="mh">Card Payment</h2>
        <div class="alert alert--wait">Card payments are coming soon. They start when AiPay's payment provider is connected. For now, please pay by bank transfer.</div>
        <button class="btn btn--block" type="button" id="useT">Pay by bank transfer</button>`);
      $("[data-back]", b2).addEventListener("click", () => paymentMethodModal(o));
      $("#useT", b2).addEventListener("click", () => transferModal(o));
    });
  }

  function transferModal(o) {
    const to = o.pay_to || {};
    const box =
      modal(`${xBtn}<div class="xfer__top">${back()}<button type="button" class="btn btn--sm btn--soft" id="chg">Change method</button></div>
      <div class="xfer__head"><div><h2 class="mh" style="margin:0">Transfer</h2><p class="hint" style="margin:2px 0 0">Complete your purchase by sending the money</p></div><b class="xfer__amt"><small>NGN</small>${Math.round(o.total).toLocaleString("en-NG")}</b></div>
      <p class="xfer__line">Transfer <b>${ngn(o.total)}</b> to ${esc(o.store_name || "the store")}. Use <b>#${esc(o.code)}</b> as the description.</p>
      <dl class="dl">
        <div><dt>Bank</dt><dd>${esc(to.bank_name || "")}</dd></div>
        <div><dt>Account name</dt><dd>${esc(to.account_name || "")}</dd></div>
        <div><dt>Account number</dt><dd>${esc(to.account_number || "")}<button class="copy" type="button" id="cpA" aria-label="Copy account number">${ic("copy")}</button></dd></div>
        <div><dt>Amount</dt><dd>${ngn(o.total)}<button class="copy" type="button" id="cpN" aria-label="Copy amount">${ic("copy")}</button></dd></div>
      </dl>
      <form class="grid" id="paidF" style="gap:12px" novalidate>
        <p style="margin:6px 0 0;font-weight:600;font-size:13px">After you've paid, tell the store:</p>
        <div class="grid2">${field("sender", "Name on your account", SESSION.user.full_name, 'required autocomplete="name"')}${select("bank", "Your bank", BANKS, "", "Select bank")}</div>
        <p class="hint center" style="margin:0">By continuing, you agree to our <a class="link" href="../index.html#contact">Terms &amp; Condition</a> and Privacy Policy</p>
        <button class="btn btn--block" type="submit">I've sent ${ngn(o.total)}</button>
      </form>
      <p class="secure">${ic("check")}Secured by <b>AiPay</b></p>`);
    $("[data-back]", box).addEventListener("click", () => paymentMethodModal(o));
    $("#chg", box).addEventListener("click", () => paymentMethodModal(o));
    $("#cpA", box).addEventListener("click", () => copy(to.account_number || ""));
    $("#cpN", box).addEventListener("click", () => copy(String(o.total)));
    $("#paidF", box).addEventListener("submit", (e) => {
      e.preventDefault();
      const v = values(e.target);
      if (!v.bank) return fieldErrors(e.target, { fields: { bank: "Choose the bank you paid from." } });
      submit(e.target, async () =>
        confirmingModal(
          (await POST("aipay/order", { code: o.code, action: "paid", sender: v.sender, bank: v.bank })).order,
        ),
      );
    });
  }

  function confirmingModal(o) {
    const box = modal(
      `${xBtn}${dots}<h2 class="mh center">We're confirming your payment</h2>
      <p class="sub">Hello ${esc(first(SESSION.user.full_name))}, we are waiting for ${esc(o.store_name || "the store")} to confirm your payment of ${ngn(o.total)}. Please hold on; we will let you know when you are set to continue. You can close this: the order stays in your dashboard.</p>
      <a class="btn btn--line btn--block" href="#/orders">Go to my dashboard</a>`,
      "modal--small",
    );
    poll = setInterval(async () => {
      if (!box.isConnected) return clearInterval(poll);
      try {
        const r = await GET("aipay/order?code=" + encodeURIComponent(o.code));
        if (r.order.status !== "payment_sent") {
          clearInterval(poll);
          confirmedModal(r.order);
        }
      } catch (e) {}
    }, 8000);
  }

  function confirmedModal(o) {
    refreshMe().catch(() => {});
    if (o.status === "awaiting_payment") {
      const b = modal(
        `${xBtn}<h2 class="mh center">Payment not received yet</h2><p class="sub">${esc(o.store_name || "The store")} hasn't received your payment for order #${esc(o.code)}. Check the transfer, then tell them again.</p><button class="btn btn--block" type="button" id="again">Pay again</button>`,
        "modal--small",
      );
      return $("#again", b).addEventListener("click", () => transferModal(o));
    }
    modal(
      `${xBtn}<div class="done-ico">${ic("check")}</div><h2 class="mh center">${o.status === "cancelled" ? "Order cancelled" : `Your payment of <span style="color:var(--blue)">${ngn(o.total)}</span> is confirmed`}</h2>
      <p class="sub">${o.status === "cancelled" ? esc(o.cancel_note || "") : "Stay updated on the progress of your order and stay informed about the status of its delivery."}</p>
      <a class="btn btn--block" href="#/orders">Check Order Status</a>`,
      "modal--small",
    );
  }

  // ------------------------------------------------------------ buyer: dashboard
  async function viewOrders() {
    shopShell(
      "orders",
      `<div class="loading-inline"><div class="spin" role="status" aria-label="Loading"></div></div>`,
      { plain: true },
    );
    const [r] = await Promise.all([GET("aipay/orders"), refreshMe()]);
    const list = r.items;
    $("#main").innerHTML = `<a class="back" href="#/store">${ic("back")}Back</a>
      <h1 class="page-h">Your Dashboard</h1>
      <div class="dash2">
        <section class="card"><h2>Your History</h2>${
          list.length
            ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Order ID</th><th>Price</th><th>Status</th></tr></thead><tbody>${list
                .map(
                  (o) =>
                    `<tr class="row" tabindex="0" data-order="${esc(o.code)}"><td><span class="thumbcell">${o.items[0] && o.items[0].image_id ? `<img src="${esc(img(o.items[0].image_id))}" alt="" />` : `<i>${ic("bag")}</i>`}<span>${esc(o.items.map((i) => i.name).join(", "))}<small>Quantity ${o.items.reduce((a, i) => a + i.qty, 0)} · ${fmtDate(o.created_at)}</small></span></span></td><td>#${esc(o.code)}</td><td>${ngn(o.total)}</td><td>${pill(o.status)}</td></tr>`,
                )
                .join("")}</tbody></table></div>`
            : `<div class="empty">${ic("doc")}<p style="margin:0">Nothing is here yet. Your orders will show here.</p><a class="btn btn--sm" href="#/store">Start shopping</a></div>`
        }</section>
        <section class="card"><h2>Your Points</h2>${pointsCard(SESSION.user.full_name, ME.buyer)}${tierNote("₦100 you pay on AiPay")}</section>
      </div>`;
    $$("[data-order]").forEach((el) => {
      const open = () => orderModal(list.find((o) => o.code === el.dataset.order));
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => e.key === "Enter" && open());
    });
  }
  const STEPS = ["awaiting_payment", "payment_sent", "processing", "ready", "shipped", "delivered"];
  function timeline(o) {
    if (o.status === "cancelled")
      return `<p class="alert">Cancelled${o.cancel_note ? ": " + esc(o.cancel_note) : ""}</p>`;
    const at = STEPS.indexOf(o.status);
    const label = {
      awaiting_payment: "Order placed",
      payment_sent: "Payment sent",
      processing: "Payment confirmed",
      ready: o.delivery === "pickup" ? "Ready for pick-up" : "Packed",
      shipped: "On the way",
      delivered: o.delivery === "digital" ? "Download ready" : o.delivery === "pickup" ? "Collected" : "Delivered",
    };
    return `<ol class="tl">${STEPS.filter(
      (s) =>
        !(o.delivery === "pickup" && s === "shipped") &&
        !(o.delivery === "digital" && ["processing", "ready", "shipped"].includes(s)),
    )
      .map((s) => `<li class="${STEPS.indexOf(s) <= at ? "is-done" : ""}">${label[s]}</li>`)
      .join("")}</ol>`;
  }
  function orderModal(o) {
    const box = modal(`${xBtn}<h2 class="mh">Order #${esc(o.code)}</h2>
      <p class="hint" style="margin:-8px 0 0">${esc(o.store_name || "")} · ${fmtDateTime(o.created_at)}</p>
      ${timeline(o)}
      ${
        o.items.some((i) => i.digital)
          ? `<div class="grid" style="gap:8px">${o.items
              .filter((i) => i.digital)
              .map((i) =>
                i.download
                  ? `<a class="btn btn--block" href="${esc(downloadUrl(o.code, i.product_id))}" download>${ic("doc")} Download ${esc(i.name)} (${esc(i.format)}, ${mb(i.file_size)})</a>`
                  : `<p class="hint" style="margin:0">${ic("doc")} ${esc(i.name)}: your download appears here once the store confirms your payment.</p>`,
              )
              .join("")}</div>`
          : ""
      }
      <dl class="dl">${o.items.map((i) => `<div><dt>${esc(i.name)} × ${i.qty}${i.digital ? " (" + esc(i.format) + ")" : ""}</dt><dd>${ngn(i.price * i.qty)}</dd></div>`).join("")}
        <div><dt>Delivery</dt><dd>${o.delivery === "digital" ? "Download" : o.delivery === "pickup" ? "Pick-up" : ngn(o.delivery_fee)}</dd></div>
        <div><dt>Total</dt><dd>${ngn(o.total)}</dd></div>
        <div><dt>Status</dt><dd>${pill(o.status)}</dd></div></dl>
      ${o.status === "awaiting_payment" ? `<button class="btn btn--block" type="button" id="payNow">Pay now</button>` : ""}
      ${["ready", "shipped"].includes(o.status) ? `<button class="btn btn--block" type="button" id="gotIt">I've received my order</button>` : ""}
      ${["awaiting_payment", "payment_sent"].includes(o.status) ? `<button class="btn btn--line btn--block" type="button" id="cancelO">Cancel order</button>` : ""}`);
    const pay = $("#payNow", box);
    if (pay) pay.addEventListener("click", () => transferModal(o));
    const act = (sel, action, msg) => {
      const b = $(sel, box);
      if (b)
        b.addEventListener("click", () =>
          busy(b, async () => {
            if (action === "cancel" && !confirm("Cancel this order?")) return;
            try {
              await POST("aipay/order", { code: o.code, action });
              closeModal();
              toast(msg);
              viewOrders();
            } catch (e) {
              toast(e.message);
            }
          }),
        );
    };
    act("#gotIt", "received", "Thanks! Enjoy your order.");
    act("#cancelO", "cancel", "Order cancelled");
  }

  // ------------------------------------------------------------ buyer: profile
  function viewBuyerProfile(edit) {
    const u = SESSION.user;
    const a = ME.address || {};
    const ro = edit ? "" : "readonly";
    shopShell(
      "profile",
      `<a class="back" href="#/store">${ic("back")}Back</a>
      <form id="bpf" novalidate><div class="page-hrow"><h1 class="page-h">Your Profile</h1><div class="actions" style="margin:0">${
        edit
          ? `<a class="btn btn--line" href="#/profile">Cancel</a><button class="btn" type="submit">Save</button>`
          : `<a class="btn" href="#/profile?edit=1">Edit Profile</a>`
      }</div></div>
      <section class="card"><div class="pf pf--3">
        <div class="pf__who"><span class="av av--xl">${esc(initials(u.full_name))}</span><b>${esc(u.full_name)}</b><small>Shopper</small></div>
        <div><h2>Basic Information</h2>
          ${row("Full Name", "full_name", u.full_name, `${ro} autocomplete="name"`)}
          <div class="row-f"><label for="pf-email">Email Address</label><div class="fx"><input id="pf-email" value="${esc(u.email)}" readonly /></div></div>
          ${row("Phone Number", "phone", u.phone || "", `${ro} type="tel" autocomplete="tel"`)}
          <div class="row-f"><label for="pf-cur">Currency</label><div class="fx"><input id="pf-cur" value="Naira" readonly /><i class="flag" aria-hidden="true"></i></div></div>
          <p class="hint">We are only accepting Naira payment for now.</p>
          <h2 style="margin-top:20px">Delivery Address</h2>
          ${row("Street", "street", a.street || "", `${ro} autocomplete="street-address"`)}
          ${row("City", "city", a.city || "", `${ro} autocomplete="address-level2"`)}
          ${edit ? rowSel("State", "state", ME.states, a.state || "", "Select state") : row("State", "state", a.state || "", "readonly")}
          ${row("Phone for delivery", "dphone", a.phone || "", `${ro} type="tel"`)}
        </div>
      </div></section></form>`,
      { plain: true },
    );
    if (!edit) return;
    $("#bpf").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = values(e.target);
      submit(e.target, async () => {
        if (v.full_name.trim() !== u.full_name || (v.phone || "").trim() !== (u.phone || "")) {
          await POST("me/profile", { full_name: v.full_name.trim(), phone: (v.phone || "").trim() });
          SESSION = await RH.session(true);
        }
        if (v.street || v.city || v.state || v.dphone)
          ME.address = (
            await POST("aipay/prefs", { address: { street: v.street, city: v.city, state: v.state, phone: v.dphone } })
          ).address;
        history.replaceState(null, "", "#/profile");
        viewBuyerProfile(false);
        modal(
          `<div class="done-ico">${ic("check")}</div><h2 class="mh center">Profile edited successfully</h2><p class="sub">Your changes have been saved.</p><button class="btn btn--sm" type="button" data-close>Close</button>`,
          "modal--small",
        );
      });
    });
  }

  // ------------------------------------------------------------ merchant layout (sidebar, as in the merchant design)
  function storeShell(page, title, sub, content) {
    const u = SESSION.user;
    const s = ME.store;
    const unread = ME.unread;
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
      <aside class="side" aria-label="AiPay store menu">
        <a class="logo" href="#/dashboard">${logo()}</a>
        ${s ? `<div class="side__domain">${ic("link")}<a href="${shopHash(u.id, s.business_name)}" title="Your store's own page: share this link with buyers">${esc(shopUrl(u.id, s.business_name).replace(/^https?:\/\//, ""))}</a><button type="button" class="copy" data-copy-shop aria-label="Copy your store link">${ic("copy")}</button></div>` : ""}
        <div class="side__label">Menu</div>
        <nav class="nav">${nav([
          ["dashboard", "Dashboard", "home"],
          ["sales", "Sales", "cart"],
          ["products", "Products", "bag"],
        ])}</nav>
        <div class="side__label">User</div>
        <nav class="nav">${nav([
          ["notifications", "Notifications", "bell"],
          ["profile", "Profile", "user"],
          ["settings", "Settings", "gear"],
        ])}</nav>
        <div class="side__user">
          <span class="av" aria-hidden="true">${s && s.logo_id ? `<img src="${esc(img(s.logo_id))}" alt="" />` : esc(initials(u.full_name))}</span>
          <small>${esc(u.full_name)}</small>
          <b>${esc((s && s.business_name) || (merchant().details && merchant().details.business_name) || "Your store")}</b>
          <a class="link" style="font-size:12px;margin-top:6px" href="#/store" data-view="shop">Go to AiPay Store</a>
          ${RH.isAdminFor(u, "aipay") ? `<a class="link" style="font-size:12px" href="${esc(RH.url("account/admin.html"))}">Admin console</a>` : ""}
          <a class="link" style="font-size:12px" href="${esc(RH.url("account/index.html"))}">My Rehohub account</a>
          <button class="btn btn--sm" type="button" data-logout>Log Out</button>
        </div>
      </aside>
      <main class="main" id="main">
        <div class="top"><div class="grow"><h1>${title}</h1><p>${sub}</p></div>
          <a class="top__ico" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<b>${unread}</b>` : ""}</a>
          <a href="#/profile" aria-label="Profile"><span class="av">${esc(initials(u.full_name))}</span></a>
        </div>
        ${content}
      </main></div>`;
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------ merchant: Profile Set Up and review fee
  function viewSetup(edit) {
    const s = ME.store || {};
    const d = (merchant() && merchant().details) || {};
    storeShell(
      "profile",
      edit ? "Edit Profile" : "Profile Set Up",
      edit
        ? "Update your store details"
        : `NB: Note that you will be required to pay a token fee of ${ngn(ME.fee.amount)} for your business to be verified. <button type="button" class="link" id="learnFee">Learn More</button>`,
      `<form id="setupF" class="grid" style="gap:20px" novalidate>
      <p class="side__label" style="margin:0;border:0">User details</p>
      <div class="setup">
        <section class="card setup__main"><div class="pf">
          <div><h2>General Information</h2>
            ${row("Registration Name", "business_name", s.business_name || d.business_name || "", 'required autocomplete="organization"')}
            ${row("ID Number", "reg_number", s.reg_number || d.cac_number || "", 'placeholder="CAC or ID number (optional)"')}
            ${row("Email Address", "email", s.email || SESSION.user.email, 'type="email" required autocomplete="email"')}
            ${row("Phone Number", "phone", s.phone || SESSION.user.phone || "", 'type="tel" required autocomplete="tel"')}
            ${row("Social Handle(s)", "social", s.social || "", 'placeholder="e.g. Instagram @yourstore (optional)"')}
          </div>
          <div><h2>Location</h2>
            ${row("Street Name", "street", s.street || d.business_address || "", 'required autocomplete="street-address"')}
            ${row("City", "city", s.city || "", 'required autocomplete="address-level2"')}
            ${rowSel("State", "state", ME.states, s.state || "", "Select state")}
            <div class="row-f"><label for="f-country">Country</label><div class="fx"><input id="f-country" value="Nigeria" readonly /><i class="flag" aria-hidden="true"></i></div></div>
          </div>
          <div><h2>Financial Information</h2>
            <p class="hint" style="margin:-8px 0 10px">Buyers pay into this account. Use an account in your business name.</p>
            ${row("Account Name", "account_name", s.account_name || "", "required")}
            ${rowSel("Bank Name", "bank_name", BANKS, s.bank_name || "", "Select bank")}
            ${row("Account Number", "account_number", s.account_number || "", 'inputmode="numeric" maxlength="10" required')}
          </div>
          <div><h2>About Business</h2>
            ${rowSel("Industry", "category", ME.categories, s.category || "", "Select category")}
            <label class="field"><span style="font-size:12.5px;color:var(--ink-2)">Give a brief description of your business</span><textarea name="about" maxlength="600" placeholder="Describe your business...">${esc(s.about || d.about || "")}</textarea></label>
          </div>
        </div></section>
        <section class="card setup__logo"><h2>Logo</h2>${uploadBox("logoBox", s.logo_id, "Your logo")}<input type="hidden" name="logo_id" value="${s.logo_id || ""}" /></section>
      </div>
      <div class="actions">${edit ? `<a class="btn btn--line" href="#/profile">Cancel</a>` : ""}<button class="btn" type="submit">Save</button></div>
    </form>`,
    );
    const lf = $("#learnFee");
    if (lf) lf.addEventListener("click", () => feeModal(true));
    bindUpload("#logoBox", "logo_id", "Your logo");
    const f = $("#setupF");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = values(f);
      v.logo_id = v.logo_id ? +v.logo_id : null;
      submit(f, async () => {
        await POST("aipay/store", v);
        await refreshMe();
        if (edit || ["submitted", "confirmed"].includes(ME.store.fee_status)) {
          history.replaceState(null, "", "#/profile");
          await viewStoreProfile();
          modal(
            `<div class="done-ico">${ic("check")}</div><h2 class="mh center">Edited Successfully</h2><p class="sub">Your store profile has been updated.</p><button class="btn btn--sm" type="button" data-close>Close</button>`,
            "modal--small",
          );
          return;
        }
        feeModal();
      });
    });
  }
  function feeModal(infoOnly) {
    const box =
      modal(`${xBtn}<div class="done-ico">${ic("doc")}</div><h2 class="mh center">Pay for Account Organisation Review</h2>
      <div class="terms">
        <p>Before your store goes live, our team checks your business details, your bank account and what you sell, so buyers can trust every store on AiPay.</p>
        <p>The review fee is paid once. If we can't approve your store, we'll tell you why so you can fix it, without paying again.</p>
        <p>Pay by bank transfer to Rehohub Ltd. We confirm your payment, then review your store, usually within 2 working days.</p>
      </div>
      <p class="center" style="margin:0">You will be required to pay a sum of<br><b style="font-size:18px;color:var(--blue)">${ngn(ME.fee.amount)}</b></p>
      ${infoOnly ? `<button class="btn btn--block" type="button" data-close>Got it</button>` : `<button class="btn btn--block" type="button" id="feeGo">Proceed</button>`}`);
    const g = $("#feeGo", box);
    if (g) g.addEventListener("click", feeTransferModal);
  }
  function feeTransferModal() {
    const fee = ME.fee;
    const box =
      modal(`${xBtn}${back()}<div class="xfer__head"><div><h2 class="mh" style="margin:0">Transfer</h2><p class="hint" style="margin:2px 0 0">Account review fee</p></div><b class="xfer__amt"><small>NGN</small>${fee.amount.toLocaleString("en-NG")}</b></div>
      <p class="xfer__line">Transfer <b>${ngn(fee.amount)}</b> from your bank app to Rehohub. Use your business name as the description.</p>
      <dl class="dl">
        <div><dt>Bank</dt><dd>${esc(fee.bank_name)}</dd></div>
        <div><dt>Account name</dt><dd>${esc(fee.account_name)}</dd></div>
        <div><dt>Account number</dt><dd>${esc(fee.account_number)}<button class="copy" type="button" id="cpF" aria-label="Copy account number">${ic("copy")}</button></dd></div>
        <div><dt>Amount</dt><dd>${ngn(fee.amount)}</dd></div>
      </dl>
      <p class="hint center" style="margin:0">By continuing, you agree to our Terms &amp; Condition and Privacy Policy</p>
      <button class="btn btn--block" type="button" id="feeSent">I've sent the money</button>
      <p class="secure">${ic("check")}Secured by <b>AiPay</b></p>`);
    $("[data-back]", box).addEventListener("click", () => feeModal());
    $("#cpF", box).addEventListener("click", () => copy(fee.account_number));
    $("#feeSent", box).addEventListener("click", feeConfirmModal);
  }
  function feeConfirmModal() {
    const box =
      modal(`${xBtn}${back()}<div class="done-ico">${ic("bank")}</div><h2 class="mh center">Confirm Payment</h2>
      <p class="sub">Enter your details as we confirm your payment</p>
      <form class="grid" id="feeF" style="gap:12px" novalidate>
        ${field("sender", "Name of account", SESSION.user.full_name, 'required autocomplete="name" placeholder="Enter name of account used"')}
        ${select("bank", "Bank", BANKS, "", "Enter the bank name")}
        ${field("amount", "Amount", ngn(ME.fee.amount), "readonly")}
        <button class="btn btn--block" type="submit">Proceed</button>
      </form>`);
    $("[data-back]", box).addEventListener("click", feeTransferModal);
    $("#feeF", box).addEventListener("submit", (e) => {
      e.preventDefault();
      const v = values(e.target);
      if (!v.bank) return fieldErrors(e.target, { fields: { bank: "Choose the bank you paid from." } });
      submit(e.target, async () => {
        await POST("aipay/store/fee", { sender: v.sender, bank: v.bank });
        modal(
          `${dots}<h2 class="mh center">We're confirming your payment</h2><p class="sub">Hello ${esc(first(SESSION.user.full_name))}, we are currently awaiting the confirmation of your payment. Please hold on; we will email you when it's confirmed.</p>`,
          "modal--small",
        );
        await refreshMe();
        setTimeout(() => go("#/welcome"), 2200);
      });
    });
  }
  function viewCongrats() {
    storeShell(
      "dashboard",
      "Getting started",
      "",
      `<section class="card state"><div class="done-ico">${ic("check")}</div><h2>🎉 Congratulations! 🎉</h2>
        <p>Welcome to AiPay. Your store details and payment details have been sent. Our team will confirm your payment and review your store, then we'll email you when you're live. While you wait, add your products so they're ready to sell.</p>
        <div class="row-btns"><a class="btn" href="#/products/new">Add products</a><a class="btn btn--line" href="#/dashboard">Go to dashboard</a></div></section>`,
    );
  }

  // ------------------------------------------------------------ merchant: dashboard
  function niceTop(max, parts) {
    if (max <= 0) return parts * 25000;
    const step = max / parts;
    const mag = 10 ** Math.floor(Math.log10(step));
    return Math.ceil(step / mag) * mag * parts;
  }
  function lineChart(monthly, year) {
    const top = niceTop(Math.max(...monthly, 0), 4);
    const W = 600,
      H = 200;
    const pts = monthly.map((v, i) => [30 + (i * (W - 50)) / 11, H - 20 - (v / top) * (H - 40)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return `<svg class="line" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="Sales by month in ${year}: ${monthly.map((v, i) => MONTHS[i] + " " + ngn(v)).join(", ")}">
      ${[0, 1, 2, 3, 4].map((k) => `<line x1="30" x2="${W - 20}" y1="${H - 20 - (k * (H - 40)) / 4}" y2="${H - 20 - (k * (H - 40)) / 4}" stroke="#eef0f4"/><text x="0" y="${H - 17 - (k * (H - 40)) / 4}" font-size="9" fill="#7b8190">${short((top / 4) * k)}</text>`).join("")}
      <path d="${d} L${pts[11][0]} ${H - 20} L${pts[0][0]} ${H - 20}Z" fill="rgba(23,96,186,.08)"/>
      <path d="${d}" fill="none" stroke="#1760BA" stroke-width="2.5" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#1760BA"><title>${MONTHS[i]}: ${ngn(monthly[i])}</title></circle><text x="${p[0]}" y="${H + 10}" font-size="9" fill="#7b8190" text-anchor="middle">${MONTHS[i]}</text>`).join("")}
    </svg>`;
  }
  function barChart(monthly, year) {
    const top = niceTop(Math.max(...monthly, 0), 5);
    const best = monthly.indexOf(Math.max(...monthly));
    return `<div class="bars"><div class="bars__y" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map((k) => `<span>${short((top / 5) * k)}</span>`).join("")}</div>
      <div class="bars__plot">${monthly
        .map(
          (s, i) =>
            `<button type="button" class="bar ${s > 0 && i === best ? "is-on" : ""} ${i > 8 ? "bar--end" : i < 3 ? "bar--start" : ""}" aria-label="${MONTHS[i]} ${year}: ${ngn(s)}"><i style="height:${(s / top) * 100}%"></i><em>${MONTHS[i]} ${year}<br>${ngn(s)}</em><span>${MONTHS[i]}</span></button>`,
        )
        .join("")}</div></div>`;
  }
  const stat = (icon, label, value, delta, note = "") =>
    `<div class="card stat"><span class="stat__ico">${ic(icon)}</span><small>${label}</small><b>${value}</b>
      <div class="stat__trend">${delta !== null && delta !== undefined ? `<span class="trend ${delta < 0 ? "trend--down" : ""}">${ic(delta < 0 ? "down" : "up")}${Math.abs(delta)}%</span>vs last month` : esc(note)}</div></div>`;
  const welcomeTitle = () => `Welcome, ${esc(first(SESSION.user.full_name))} <span aria-hidden="true">👋</span>`;

  async function viewDashboard() {
    const s = ME.store;
    const m = merchant();
    if (!s) return go("#/setup");
    if (s.fee_status === "unpaid") {
      storeShell(
        "dashboard",
        welcomeTitle(),
        "Look at what is happening with your business",
        `<section class="card state"><div class="state__art">${ic("doc")}</div><h2>Finish setting up your store</h2><p>Pay the one-time ${ngn(ME.fee.amount)} review fee so our team can review your store.</p><div class="row-btns"><button class="btn" type="button" id="payFee">Pay review fee</button><a class="btn btn--line" href="#/setup">Edit store details</a></div></section>`,
      );
      return $("#payFee").addEventListener("click", () => feeModal());
    }
    if (!s.live) {
      const rejected = s.fee_status === "rejected";
      const blocked = m.status === "rejected" || m.status === "suspended";
      storeShell(
        "dashboard",
        welcomeTitle(),
        "Look at what is happening with your business",
        `<section class="card state"><div class="state__art">${ic(rejected || blocked ? "x" : "doc")}</div>
          <h2>${rejected ? "We couldn't confirm your payment" : blocked ? (m.status === "rejected" ? "Your store wasn't approved" : "Your store is suspended") : "Your account is under review."}</h2>
          <p>${
            rejected
              ? esc(s.fee_note || "") + " Please check your transfer and send the details again."
              : blocked
                ? "See My Rehohub account for the reason, or contact info@rehohub.com."
                : `We will notify you once your account is live. We're ${s.fee_status === "submitted" ? "confirming your " + ngn(ME.fee.amount) + " payment and " : ""}reviewing your store; meanwhile, add your products.`
          }</p>
          <div class="row-btns">${rejected ? `<button class="btn" type="button" id="payFee">Send payment details again</button>` : `<a class="btn" href="#/products">Add products</a>`}<a class="btn btn--line" href="#/setup?edit=1">Edit store details</a></div></section>`,
      );
      const pf = $("#payFee");
      if (pf) pf.addEventListener("click", feeTransferModal);
      return;
    }
    if (!+s.live_seen) {
      storeShell(
        "dashboard",
        welcomeTitle(),
        "Look at what is happening with your business",
        `<section class="card state"><div class="done-ico">${ic("check")}</div><h2>You are now live</h2><p>Your store has been approved. Buyers can now find your products on the AiPay Store.</p><div class="row-btns"><button class="btn" type="button" id="seen">Go to dashboard</button></div></section>`,
      );
      return $("#seen").addEventListener("click", async () => {
        await POST("aipay/store/seen", {}).catch(() => {});
        ME.store.live_seen = 1;
        viewDashboard();
      });
    }
    const year = +(new URLSearchParams(location.hash.split("?")[1] || "").get("year") || new Date().getFullYear());
    storeShell(
      "dashboard",
      welcomeTitle(),
      "Look at what is happening with your business",
      `<div class="loading-inline"><div class="spin" role="status" aria-label="Loading"></div></div>`,
    );
    const r = await GET("aipay/dashboard?year=" + year);
    const c = r.counts;
    const years = [...new Set([new Date().getFullYear(), ...r.years])].sort((a, b) => b - a);
    const newOrders = (c.awaiting_payment || 0) + (c.payment_sent || 0);
    const box = (title, st, n, list) =>
      `<section class="card osum"><div class="card__head"><h2>${title}</h2><a class="link" href="#/sales?status=${st}">See more</a></div>${
        list.length
          ? `<ul class="olist">${list.map((o) => `<li><button type="button" data-sale="${esc(o.code)}"><span class="odot"></span><span><b>${esc(o.items.map((i) => i.name).join(", "))}</b><small>Order ID: ${esc(o.code)}</small></span><b>${ngn(o.total)}</b></button></li>`).join("")}</ul>`
          : `<p class="hint">${n ? n + " orders" : "No orders here."}</p>`
      }</section>`;
    const fresh = r.recent.filter((o) => ["awaiting_payment", "payment_sent"].includes(o.status)).slice(0, 3);
    $("#main .loading-inline").outerHTML = `<div class="grid">
        <div class="dgrid">
          <div class="stats stats--2">${stat("wallet", "Total Balance", ngn(r.seller.spent), r.seller.delta)}${stat("users", "Total Visitors", r.views.toLocaleString("en-NG"), null, `${r.products} products${r.low_stock ? ` · ${r.low_stock} low on stock` : ""}`)}</div>
          <section class="card dgrid__chart"><div class="card__head"><h2>Sales Report</h2><label class="sr" for="yr">Year</label><select class="year" id="yr">${years.map((y) => `<option ${y === r.year ? "selected" : ""}>${y}</option>`).join("")}</select></div>
            <p class="big">${ngn(r.monthly.reduce((a, b) => a + b, 0))}<small>${r.year} sales</small></p>${lineChart(r.monthly, r.year)}</section>
          <div class="osums">${box("New Orders", "payment_sent", newOrders, fresh)}${box("Order Processing", "processing", c.processing || 0, r.lists.processing)}${box("Ready To Ship", "ready", c.ready || 0, r.lists.ready)}${box("Order Shipped", "shipped", c.shipped || 0, r.lists.shipped)}</div>
          <section class="card dgrid__side"><h2>Financial Aids</h2><p class="hint" style="margin:0">Loans and savings for AiPay stores are coming with Havibank. Your sales history on AiPay will help you qualify.</p><a class="link" style="font-size:12.5px" href="../services/havibank.html">About Havibank</a></section>
        </div>
        ${c.payment_sent ? `<a class="alert alert--wait" href="#/sales?status=payment_sent">${c.payment_sent === 1 ? "A buyer says they have" : c.payment_sent + " buyers say they have"} paid. Check your account and confirm.</a>` : ""}
        <div class="two">
          <section class="card"><div class="card__head"><h2>Recent Transactions</h2>${r.recent.length ? `<a class="link" href="#/sales">View all</a>` : ""}</div>${salesTable(r.recent.slice(0, 5))}</section>
          <div class="grid">
            <section class="card"><h2>Contact Aipay Admin</h2><p class="hint" style="margin:0 0 8px">Questions about your store, payments or the review?</p><a class="link" href="mailto:info@rehohub.com">info@rehohub.com</a><br><a class="link" href="tel:+2348056516548">+234 805 651 6548</a></section>
            <section class="card"><h2>Your Points</h2>${pointsCard(SESSION.user.full_name, r.seller)}${tierNote("₦1,000 of sales")}</section>
          </div>
        </div>
      </div>`;
    $("#yr").addEventListener("change", (e) => go("#/dashboard?year=" + e.target.value));
    bindSales(r.recent.concat(...Object.values(r.lists)));
  }

  // ------------------------------------------------------------ merchant: sales
  function salesTable(list, more) {
    if (!list.length)
      return `<div class="empty">${ic("doc")}<p style="margin:0">No sales yet. When buyers order, they show here.</p></div>`;
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer Name</th><th>Product Name</th><th>Date Ordered</th><th>Order ID</th><th>Price</th><th>Status</th>${more ? '<th><span class="sr">More</span></th>' : ""}</tr></thead><tbody>${list
      .map(
        (o) =>
          `<tr class="row" tabindex="0" data-sale="${esc(o.code)}"><td>${esc(o.buyer_name || "")}</td><td>${esc(o.items.map((i) => i.name).join(", "))}</td><td>${fmtDate(o.created_at)}</td><td>${esc(o.code)}</td><td>${ngn(o.total)}</td><td>${pill(o.status)}</td>${more ? `<td><button class="kebab" type="button" data-sale="${esc(o.code)}" aria-label="Details of order ${esc(o.code)}">${ic("dots")}</button></td>` : ""}</tr>`,
      )
      .join("")}</tbody></table></div>`;
  }
  function bindSales(list) {
    $$("[data-sale]").forEach((el) => {
      const open = (e) => {
        e.stopPropagation();
        saleModal(list.find((o) => o.code === el.dataset.sale));
      };
      el.addEventListener("click", open);
      if (el.tagName === "TR") el.addEventListener("keydown", (e) => e.key === "Enter" && open(e));
    });
  }
  const SALES = { status: "", q: "", page: 1, size: 10, period: "all" };
  const PERIODS = { week: ["This week", 7], month: ["This month", 31], year: ["This year", 366], all: ["All time", 0] };
  async function viewSales() {
    const qs = new URLSearchParams(location.hash.split("?")[1] || "");
    if (qs.has("status")) SALES.status = qs.get("status");
    storeShell(
      "sales",
      "Sales Report",
      "Look at what is happening with your business",
      `<div class="loading-inline"><div class="spin" role="status" aria-label="Loading"></div></div>`,
    );
    const all = (await GET("aipay/sales")).items;
    const filtered = () => {
      const q = SALES.q.toLowerCase();
      const days = PERIODS[SALES.period][1];
      const since = days ? Date.now() - days * 864e5 : 0;
      return all.filter(
        (o) =>
          (!SALES.status ||
            o.status === SALES.status ||
            (SALES.status === "payment_sent" && o.status === "awaiting_payment")) &&
          toDate(o.created_at) >= since &&
          (!q ||
            [o.code, o.buyer_name, String(o.total), ...o.items.map((i) => i.name)].some((x) =>
              String(x || "")
                .toLowerCase()
                .includes(q),
            )),
      );
    };
    const draw = () => {
      const list = filtered();
      const pages = Math.max(1, Math.ceil(list.length / SALES.size));
      SALES.page = Math.min(SALES.page, pages);
      const slice = list.slice((SALES.page - 1) * SALES.size, SALES.page * SALES.size);
      $("[data-sales]").innerHTML = `${salesTable(slice, true)}
        ${
          list.length
            ? `<div class="pager"><span>Showing ${slice.length} of ${list.length}</span><div class="pages"><button type="button" data-pg="${SALES.page - 1}" ${SALES.page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>${Array.from(
                { length: pages },
                (_, i) => i + 1,
              )
                .filter((n) => n === 1 || n === pages || Math.abs(n - SALES.page) <= 1)
                .map(
                  (n) =>
                    `<button type="button" data-pg="${n}" ${n === SALES.page ? 'aria-current="true"' : ""}>${n}</button>`,
                )
                .join(
                  "",
                )}<button type="button" data-pg="${SALES.page + 1}" ${SALES.page === pages ? "disabled" : ""} aria-label="Next page">›</button></div></div>`
            : ""
        }`;
      $$("[data-pg]").forEach((b) => b.addEventListener("click", () => ((SALES.page = +b.dataset.pg), draw())));
      bindSales(all);
    };
    $("#main .loading-inline").outerHTML = `<div class="tools">
        <div class="filter"><label class="sr" for="per">Period</label><select id="per">${Object.entries(PERIODS)
          .map(([k, [l]]) => `<option value="${k}" ${k === SALES.period ? "selected" : ""}>${l}</option>`)
          .join("")}</select></div>
        <div class="filter"><label class="sr" for="st">Status</label><select id="st"><option value="">All orders</option>${Object.entries(
          STATUS,
        )
          .filter(([k]) => k !== "awaiting_payment")
          .map(
            ([k, [l]]) =>
              `<option value="${k}" ${k === SALES.status ? "selected" : ""}>${k === "payment_sent" ? "New orders" : l}</option>`,
          )
          .join("")}</select></div>
        <div class="search">${ic("search")}<label class="sr" for="q">Search sales</label><input id="q" type="search" placeholder="Search" value="${esc(SALES.q)}" /></div>
        <span style="flex:1"></span><button class="btn" type="button" id="dl">Download Report</button>
      </div>
      <section class="card"><h2>Recent Sales</h2><div data-sales></div></section>`;
    $("#per").addEventListener("change", (e) => ((SALES.period = e.target.value), (SALES.page = 1), draw()));
    $("#st").addEventListener("change", (e) => ((SALES.status = e.target.value), (SALES.page = 1), draw()));
    $("#q").addEventListener("input", (e) => ((SALES.q = e.target.value), (SALES.page = 1), draw()));
    $("#dl").addEventListener("click", () => {
      const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        [
          "Order ID",
          "Date",
          "Customer",
          "Products",
          "Delivery",
          "Subtotal",
          "Delivery fee",
          "Total",
          "Status",
          "Paid from",
        ]
          .map(cell)
          .join(","),
      ].concat(
        filtered().map((o) =>
          [
            o.code,
            fmtDateTime(o.created_at),
            o.buyer_name,
            o.items.map((i) => `${i.name} x${i.qty}`).join("; "),
            o.delivery,
            o.subtotal,
            o.delivery_fee,
            o.total,
            STATUS[o.status][0],
            o.pay_sender ? `${o.pay_sender} (${o.pay_bank})` : "",
          ]
            .map(cell)
            .join(","),
        ),
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
      a.download = `aipay-sales-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    draw();
  }
  function saleModal(o) {
    if (!o) return;
    const a = o.address || {};
    const actions =
      {
        awaiting_payment: [
          ["confirm_payment", "Payment received", ""],
          ["cancel", "Cancel order", "btn--line"],
        ],
        payment_sent: [
          ["confirm_payment", "Payment received", ""],
          ["not_received", "Not received", "btn--line"],
        ],
        processing:
          o.delivery === "pickup"
            ? [["ready", "Ready for pick-up", ""]]
            : [
                ["ready", "Ready to ship", ""],
                ["shipped", "Mark as shipped", "btn--line"],
              ],
        ready: [
          [
            o.delivery === "pickup" ? "delivered" : "shipped",
            o.delivery === "pickup" ? "Collected by buyer" : "Mark as shipped",
            "",
          ],
        ],
        shipped: [["delivered", "Mark as delivered", ""]],
      }[o.status] || [];
    const i0 = o.items[0] || {};
    const box = modal(`${xBtn}<h2 class="mh">Details</h2>
      <div class="amount-ico amount-ico--img">${i0.image_id ? `<img src="${esc(img(i0.image_id))}" alt="" />` : ic("bag")}</div>
      <p class="amount">${esc(o.items.map((i) => i.name).join(", "))}</p>
      <dl class="dl">
        <div><dt>Customer Name</dt><dd>${esc(o.buyer_name || "")}</dd></div>
        <div><dt>Amount</dt><dd>${ngn(o.total)}</dd></div>
        <div><dt>Date &amp; Time</dt><dd>${fmtDateTime(o.created_at)}</dd></div>
        <div><dt>Order ID</dt><dd>${esc(o.code)}<button class="copy" type="button" id="cpO" aria-label="Copy order ID">${ic("copy")}</button></dd></div>
        ${o.items.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${i.qty} × ${ngn(i.price)}</dd></div>`).join("")}
        <div><dt>${o.delivery === "digital" ? "Delivery" : o.delivery === "pickup" ? "Pick-up" : "Deliver to"}</dt><dd>${o.delivery === "digital" ? "Download: the buyer gets the file once you confirm payment" : o.delivery === "pickup" ? "At your store" : esc([a.street, a.city, a.state].filter(Boolean).join(", "))}</dd></div>
        <div><dt>Phone</dt><dd>${a.phone ? `<a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>` : ""}</dd></div>
        ${o.pay_sender ? `<div><dt>Paid from</dt><dd>${esc(o.pay_sender)} (${esc(o.pay_bank || "")})</dd></div>` : ""}
        <div><dt>Status</dt><dd>${pill(o.status)}</dd></div>
      </dl>
      ${o.status === "payment_sent" ? `<p class="hint" style="margin:0">Check that ${ngn(o.total)} from ${esc(o.pay_sender)} arrived in your account before confirming.</p>` : ""}
      ${o.status === "awaiting_payment" ? `<p class="hint" style="margin:0">The buyer hasn't said they've paid yet. Only confirm if the money is in your account.</p>` : ""}
      ${actions.length ? `<div class="row-btns">${actions.map(([x, t, c]) => `<button class="btn ${c}" type="button" data-act="${x}">${t}</button>`).join("")}</div>` : ""}`);
    $("#cpO", box).addEventListener("click", () => copy(o.code));
    $$("[data-act]", box).forEach((b) =>
      b.addEventListener("click", () =>
        busy(b, async () => {
          const action = b.dataset.act;
          let note = "";
          if (action === "cancel") {
            note = prompt("Why are you cancelling? The buyer will see this.") || "";
            if (!note) return;
          }
          if (action === "confirm_payment" && !confirm(`Confirm that ${ngn(o.total)} is in your account?`)) return;
          try {
            await POST("aipay/sales", { code: o.code, action, note });
            toast("Order updated");
            closeModal();
            render();
          } catch (e) {
            toast(e.message);
          }
        }),
      ),
    );
  }

  // ------------------------------------------------------------ merchant: products (Market Place)
  const MP = { q: "", category: "" };
  async function viewProducts() {
    storeShell(
      "products",
      "Market Place",
      "Look at what is happening with your business",
      `<div class="loading-inline"><div class="spin" role="status" aria-label="Loading"></div></div>`,
    );
    const r = await GET("aipay/my-products");
    const q = MP.q.toLowerCase();
    const list = r.items.filter(
      (p) => (!MP.category || p.category === MP.category) && (!q || p.name.toLowerCase().includes(q)),
    );
    $("#main .loading-inline").outerHTML = `<div class="tools">
        <div class="filter"><label class="sr" for="mcat">Category</label><select id="mcat"><option value="">All products</option>${r.categories.map((c) => `<option ${c === MP.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
        <span style="flex:1"></span>
        <div class="search">${ic("search")}<label class="sr" for="mq">Search products</label><input id="mq" type="search" placeholder="Search" value="${esc(MP.q)}" /></div>
        <a class="btn" href="#/products/new">Add Product ${ic("plus")}</a>
      </div>
      ${!storeLive() && r.items.length ? `<p class="alert alert--info">Your products will show on the AiPay Store once your account is live.</p>` : ""}
      ${
        list.length
          ? `<div class="pgrid pgrid--4">${list
              .map(
                (p) =>
                  `<article class="pcard"><a class="pcard__img" href="#/products/edit/${p.id}" aria-label="Edit ${esc(p.name)}">${p.image_id ? `<img src="${esc(img(p.image_id))}" alt="" loading="lazy" />` : ic("bag")}<span class="pcard__edit">${ic("edit")}</span></a><div class="pcard__body"><h3>${esc(p.name)}</h3><div class="pcard__meta"><span>${p.digital ? "Type" : "Quantity"}</span><b>${p.digital ? esc(p.format) + " download" : p.stock + " pcs"}</b><span>Price</span><b>${ngn(p.price)}</b></div>${!p.digital && p.stock < 5 ? `<small class="low">${p.stock ? "Low on stock" : "Out of stock"}</small>` : ""}</div></article>`,
              )
              .join("")}</div>`
          : `<div class="card empty">${ic("bag")}<p style="margin:0">Nothing is here</p><a class="btn btn--sm" href="#/products/new">Add Product</a></div>`
      }`;
    $("#mcat").addEventListener("change", (e) => ((MP.category = e.target.value), viewProducts()));
    $("#mq").addEventListener("change", (e) => ((MP.q = e.target.value), viewProducts()));
  }
  async function viewProductForm(id) {
    const r = await GET("aipay/my-products");
    const p = id ? r.items.find((x) => x.id === id) : null;
    if (id && !p) return go("#/products");
    storeShell(
      "products",
      "Market Place",
      "Look at what is happening with your business",
      `<form id="pF" novalidate>
        <div class="actions"><a class="btn btn--line" href="#/products">Cancel</a>${p ? `<button class="btn btn--line" type="button" id="delP">Remove</button>` : ""}<button class="btn" type="submit">Save</button></div>
        <div class="setup">
          <section class="card setup__main"><h2>${p ? "Edit Product Details" : "Add Product"}</h2>
            ${field("name", "Name of product", p ? p.name : "", 'required maxlength="80" placeholder="Chicken burger"')}
            <label class="check"><input type="checkbox" id="isDigital" ${p && p.digital ? "checked" : ""} />This is a digital download (e-book or audiobook)</label>
            <div class="grid2">${field("price", "Product price (NGN)", p ? p.price : "", 'inputmode="numeric" required placeholder="NGN 2,000"')}<div id="stockWrap" ${p && p.digital ? "hidden" : ""}>${field("stock", "Quantity of product", p && !p.digital ? p.stock : "", 'inputmode="numeric" placeholder="20"')}</div></div>
            <div id="bookWrap" class="card" style="padding:14px;display:grid;gap:8px" ${p && p.digital ? "" : "hidden"}>
              <b>E-book or audiobook file</b>
              <small class="hint" style="margin:0">PDF, EPUB, MOBI, AZW3, MP3, M4A or M4B. It is kept privately on AiPay's server, not on your device, and each buyer can download it from their order once you confirm their payment.</small>
              <div id="bookFile">${p && p.file ? `${ic("doc")} <b>${esc(p.file.name)}</b> · ${mb(p.file.size)} · <a href="${esc(downloadUrl("", p.id))}">Download your copy</a>` : "No file yet"}</div>
              <label class="btn btn--sm btn--line" style="justify-self:start">${p && p.file ? "Replace file" : "Choose file"}<input type="file" id="bookIn" accept="${BOOK_TYPES}" class="sr" /></label>
              <input type="hidden" name="file_id" value="${p && p.file ? p.file.id : ""}" />
            </div>
            ${select("category", "Category", r.categories, p ? p.category : (ME.store && ME.store.category) || "", "Select category")}
            <label class="field"><span>Description of product</span><textarea name="description" maxlength="600" placeholder="Enter product description">${esc(p ? p.description || "" : "")}</textarea></label>
          </section>
          <section class="card setup__logo"><h2>Upload Product Image</h2>${uploadBox("pImgBox", p && p.image_id, "Product picture")}<input type="hidden" name="image_id" value="${p && p.image_id ? p.image_id : ""}" /></section>
        </div></form>`,
    );
    bindUpload("#pImgBox", "image_id", "Product picture");
    const f = $("#pF");
    let bookBusy = false;
    $("#isDigital").addEventListener("change", (e) => {
      $("#bookWrap").hidden = !e.target.checked;
      $("#stockWrap").hidden = e.target.checked;
    });
    $("#bookIn").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      bookBusy = true;
      $("#bookFile").textContent = `Uploading ${file.name}: 0%`;
      try {
        const saved = await uploadBook(file, (pc) => ($("#bookFile").textContent = `Uploading ${file.name}: ${pc}%`));
        f.file_id.value = saved.id;
        $("#bookFile").innerHTML = `${ic("doc")} <b>${esc(saved.name)}</b> · ${mb(saved.size)} · uploaded`;
      } catch (er) {
        $("#bookFile").textContent = "Not uploaded: " + er.message;
        toast(er.message);
      }
      bookBusy = false;
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = values(f);
      const digital = $("#isDigital").checked;
      if (bookBusy) return toast("Wait for the file to finish uploading");
      if (digital && !v.file_id) return toast("Upload the e-book or audiobook file first");
      const body = {
        id: p ? p.id : 0,
        name: v.name,
        category: v.category,
        price: +String(v.price).replace(/[^\d]/g, "") || 0,
        stock: +String(v.stock).replace(/[^\d]/g, "") || 0,
        description: v.description,
        image_id: v.image_id ? +v.image_id : 0,
        file_id: digital ? +v.file_id : 0,
      };
      submit(f, async () => {
        await POST("aipay/my-products", body);
        history.replaceState(null, "", "#/products");
        await viewProducts();
        modal(
          `<div class="done-ico">${ic("check")}</div><h2 class="mh center">${p ? "Edited Successfully" : "Product Added Successfully"}</h2><p class="sub">“${esc(body.name)}” ${p ? "has been updated." : "has been added to your Market Place."}</p><button class="btn btn--sm" type="button" data-close>Continue</button>`,
          "modal--small",
        );
      });
    });
    const del = $("#delP");
    if (del)
      del.addEventListener("click", async () => {
        if (!confirm(`Remove ${p.name} from your store?`)) return;
        await POST("aipay/my-products/delete", { id: p.id });
        go("#/products");
      });
  }

  // ------------------------------------------------------------ merchant: profile
  async function viewStoreProfile() {
    const u = SESSION.user;
    const s = ME.store;
    if (!s) return go("#/setup");
    const dash = s.live ? await GET("aipay/dashboard").catch(() => null) : null;
    const rows = [
      ["Business name", s.business_name],
      ["Industry", s.category],
      ["Email", s.email],
      ["Phone", s.phone],
      ["Address", [s.street, s.city, s.state].filter(Boolean).join(", ")],
      ["Bank", [s.bank_name, s.account_name, s.account_number].filter(Boolean).join(" · ")],
      ...(s.social ? [["Social", s.social]] : []),
    ];
    storeShell(
      "profile",
      "Profile",
      "Look at what is happening with your business",
      `<section class="banner ${s.live ? "" : "banner--wait"}"><span class="banner__badge">${ic("check")}</span><span class="banner__txt">${s.live ? "Your account is verified" : "Your account is under review"}</span></section>
      <section class="card pfhead"><span class="av av--xl">${s.logo_id ? `<img src="${esc(img(s.logo_id))}" alt="" />` : esc(initials(s.business_name))}</span>
        <div><b>${esc(u.full_name)}</b><small>${esc(s.business_name)}</small></div><a class="btn btn--sm" href="#/setup?edit=1">Edit Profile</a></section>
      ${s.about ? `<p class="hint" style="margin:14px 2px">${esc(s.about)}</p>` : ""}
      <div class="two" style="margin-top:20px">
        <section class="card"><h2>Store details</h2><dl class="dl dl--plain">${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b || "—")}</dd></div>`).join("")}</dl></section>
        <section class="card"><h2>Change Your Password</h2>
          <form class="grid" id="pwF" style="gap:12px" novalidate>
            ${field("current_password", "Current password", "", 'type="password" autocomplete="current-password" required')}
            ${field("new_password", "New password", "", 'type="password" autocomplete="new-password" required', "At least 10 characters.")}
            ${field("confirm", "Confirm new password", "", 'type="password" autocomplete="new-password" required')}
            <button class="btn" type="submit">Change password</button>
          </form></section>
      </div>
      ${
        dash
          ? `<div class="two two--rev" style="margin-top:20px"><section class="card"><h2>Statistics</h2><div class="grid" style="gap:10px">${stat("wallet", "Total Balance", ngn(dash.seller.spent), dash.seller.delta)}${stat("users", "Total Visitors", dash.views.toLocaleString("en-NG"), null, "")}${stat("bag", "Products", dash.products.toLocaleString("en-NG"), null, dash.low_stock ? dash.low_stock + " low on stock" : "")}</div></section><section class="card"><h2>Sales Report</h2>${barChart(dash.monthly, dash.year)}</section></div>`
          : ""
      }`,
    );
    $("#pwF").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = values(e.target);
      if (v.new_password !== v.confirm)
        return fieldErrors(e.target, { fields: { confirm: "The passwords don't match." } });
      submit(e.target, async () => {
        await POST("me/password", { current_password: v.current_password, new_password: v.new_password });
        e.target.reset();
        modal(
          `<div class="done-ico">${ic("check")}</div><h2 class="mh center">Password Reset Successful</h2><p class="sub">Your password was changed. Other devices were signed out.</p><button class="btn btn--sm" type="button" data-close>Close</button>`,
          "modal--small",
        );
      });
    });
  }

  // ------------------------------------------------------------ shared: notifications and settings
  let onlyNew = false;
  async function viewNotifications(shell) {
    const r = await GET("aipay/notes");
    ME.unread = r.items.filter((n) => !n.read_at).length;
    const list = onlyNew ? r.items.filter((n) => !n.read_at) : r.items;
    const html = `${shell === "shop" ? `<a class="back" href="#/store">${ic("back")}Back</a><h1 class="page-h">Your Notifications</h1>` : ""}
      <div class="tools"><button class="btn btn--sm ${onlyNew ? "" : "btn--line"}" type="button" id="onlyNew" aria-pressed="${onlyNew}">${ME.unread} New</button><span style="flex:1"></span>
        <button class="btn btn--sm btn--line" type="button" id="readAll" ${ME.unread ? "" : "disabled"}>Mark all as read</button>
        <button class="btn btn--sm btn--line" type="button" id="clearAll" ${r.items.length ? "" : "disabled"}>Clear all</button></div>
      <h2 style="font-size:17px;margin:0 0 12px">Recent Activities</h2>
      ${
        list.length
          ? `<div class="notes">${list
              .map(
                (n) =>
                  `<article class="note ${n.read_at ? "is-read" : ""}" data-note="${n.id}"><span class="note__ico">${ic(n.kind === "pay" ? "wallet" : n.kind === "order" ? "cart" : "doc")}</span><div><p>${esc(n.text)}</p><time datetime="${esc(n.created_at)}">${ago(n.created_at)}</time></div><button class="note__x" type="button" data-del="${n.id}" aria-label="Delete notification">${ic("x")}</button></article>`,
              )
              .join("")}</div>`
          : `<div class="card empty">${ic("bell")}<p style="margin:0">${onlyNew ? "No new notifications." : "You're all caught up."}</p></div>`
      }`;
    if (shell === "shop") shopShell("notifications", html, { plain: true });
    else storeShell("notifications", "Your Notifications", "Look at what is happening with your business", html);
    const again = () => viewNotifications(shell);
    $("#onlyNew").addEventListener("click", () => ((onlyNew = !onlyNew), again()));
    $("#readAll").addEventListener("click", async () => (await POST("aipay/notes", { action: "read" }), again()));
    $("#clearAll").addEventListener("click", async () => {
      if (!confirm("Clear all notifications?")) return;
      await POST("aipay/notes", { action: "delete" });
      again();
    });
    $$("[data-note]").forEach((el) =>
      el.addEventListener("click", async (e) => {
        await POST("aipay/notes", { action: e.target.closest("[data-del]") ? "delete" : "read", id: +el.dataset.note });
        again();
      }),
    );
  }

  const SETTINGS = {
    Dashboard: [["dashWeekly", "Weekly summary", "You will get a summary of your sales every week"]],
    Sales: [
      ["orderNew", "Order Confirmation", "You will be notified when an order is made for your product"],
      ["orderPaid", "Payment Completed", "You will be notified when payment is done on any of your product"],
      ["orderStatus", "Order Status", "You will be notified when a buyer receives an order"],
    ],
    Product: [
      ["productLow", "Product Out-of Store", "You will be notified when a product is running out"],
      ["productSold", "Product Sold", "You will be notified when a product sells"],
    ],
    Notification: [
      ["screen", "On-store Notification", "Receive notification on your store"],
      ["email", "Email Notification", "Receive notification through your mail"],
    ],
  };
  function viewSettings(shell) {
    const s = { ...ME.settings };
    const groups = shell === "shop" ? ["Notification"] : Object.keys(SETTINGS);
    const group = (title) =>
      `<section><h2 style="font-size:17px;margin:0 0 12px">${title}</h2><div class="toggles">${SETTINGS[title]
        .map(
          ([k, label, sub]) =>
            `<div class="tg"><div><b id="lb-${k}">${label}</b><small>${sub}</small></div><span class="sw"><input type="checkbox" role="switch" data-k="${k}" aria-labelledby="lb-${k}" ${s[k] ? "checked" : ""} /><span></span></span></div>`,
        )
        .join("")}</div></section>`;
    const html = `${shell === "shop" ? `<a class="back" href="#/store">${ic("back")}Back</a><h1 class="page-h">Settings</h1>` : ""}
      <div class="actions"><button class="btn btn--line" type="button" id="cancel">Cancel</button><button class="btn" type="button" id="saveS">Save</button></div>
      <div class="card"><div class="pf">${groups.map(group).join("")}</div></div>`;
    if (shell === "shop") shopShell("settings", html, { plain: true });
    else storeShell("settings", "Settings", "Look at what is happening with your business", html);
    $$("[data-k]").forEach((c) => c.addEventListener("change", () => (s[c.dataset.k] = c.checked)));
    $("#cancel").addEventListener("click", () => viewSettings(shell));
    $("#saveS").addEventListener("click", (e) =>
      busy(e.currentTarget, async () => {
        ME.settings = (await POST("aipay/prefs", { settings: s })).settings;
        toast("Settings saved");
      }),
    );
  }

  // ------------------------------------------------------------ menus, logout, cart
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-menu]")) {
      const a = $(".app");
      const open = !a.classList.contains("nav-open");
      a.classList.toggle("nav-open", open);
      const b = $(".menu-btn");
      if (b) b.setAttribute("aria-expanded", String(open));
    }
    const sm = e.target.closest("[data-shopmenu]");
    if (sm) {
      const d = $(".shop__drawer");
      d.hidden = !d.hidden;
      sm.setAttribute("aria-expanded", String(!d.hidden));
    }
    if (e.target.closest("[data-logout]")) RH.logout(location.pathname);
    if (e.target.closest("[data-cart]")) cartModal();
    const v = e.target.closest("[data-view]");
    if (v) {
      VIEW = v.dataset.view;
      store.set("aipay-view", VIEW);
    }
  });

  // ------------------------------------------------------------ router
  const STORE_PAGES = ["dashboard", "sales", "products", "setup", "welcome", "profile", "notifications", "settings"];
  async function render() {
    closeModal();
    const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
    const params = new URLSearchParams(query || "");
    const [page, a1, a2] = path.split("/");
    const user = SESSION && SESSION.user;
    document.title = (page ? page[0].toUpperCase() + page.slice(1) + " · " : "") + "AiPay";
    try {
      if (page === "s" && a1) {
        if (user && !ME) await refreshMe();
        VIEW = "shop";
        return await viewShop(parseInt(a1, 10) || 0);
      }
      if (!user) {
        if (page === "store") {
          await viewStore();
          if (params.get("cart") === "1") cartModal();
          return;
        }
        return viewWelcome();
      }
      if (!ME) await refreshMe();
      if (["dashboard", "sales", "products", "setup", "welcome"].includes(page)) VIEW = "store";
      if (["store", "orders"].includes(page)) VIEW = "shop";
      if (!isMerchant()) VIEW = "shop";
      store.set("aipay-view", VIEW);
      if (VIEW === "store") {
        if (!ME.store && page !== "setup") return go("#/setup");
        if (!STORE_PAGES.includes(page)) return go("#/dashboard");
        if (page === "setup") return viewSetup(params.get("edit") === "1");
        if (page === "welcome") return viewCongrats();
        if (page === "dashboard") return await viewDashboard();
        if (page === "sales") return await viewSales();
        if (page === "products")
          return a1 === "new"
            ? await viewProductForm(0)
            : a1 === "edit"
              ? await viewProductForm(+a2)
              : await viewProducts();
        if (page === "profile") return await viewStoreProfile();
        if (page === "notifications") return await viewNotifications("store");
        return viewSettings("store");
      }
      if (page === "store") {
        await viewStore();
        if (params.get("cart") === "1") cartModal();
        return;
      }
      if (page === "orders") return await viewOrders();
      if (page === "profile") return viewBuyerProfile(params.get("edit") === "1");
      if (page === "notifications") return await viewNotifications("shop");
      if (page === "settings") return viewSettings("shop");
      return go("#/store");
    } catch (e) {
      if (e && e.code === "not_signed_in") return (location.href = RH.loginUrl(location.pathname + location.hash));
      app.innerHTML = `<div class="loading" style="padding:20px"><div class="alert" role="alert">${esc((e && e.message) || "Something went wrong.")} <a href="">Try again</a></div></div>`;
    }
  }
  window.addEventListener("hashchange", render);

  (async () => {
    try {
      SESSION = await RH.session(true);
    } catch (e) {
      SESSION = { user: null };
      return viewWelcome(e.message);
    }
    VIEW = store.get("aipay-view", "shop");
    if (!location.hash || location.hash === "#/") {
      if (SESSION.user) {
        try {
          await refreshMe();
        } catch (e) {}
        history.replaceState(
          null,
          "",
          isMerchant() && VIEW === "store" ? "#/dashboard" : isMerchant() && !(ME && ME.store) ? "#/setup" : "#/store",
        );
      }
    }
    render();
  })();
})();
