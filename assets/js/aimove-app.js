/* AiMove web app.
   Built from the "upgrade Aimove" Figma screens and the AiMove Android app
   (screens, PricingEngine.kt, statuses, rider dashboard, admin dashboard).
   Sign-in, sign-up, approvals and roles use the shared Rehohub account system (rh-auth.js).
   Deliveries, escrow, wallet, rider earnings, messages and notifications are saved on the
   server (api/lib/aimove.php), which also works out every price. With Google Maps keys in the
   private config file, addresses autocomplete, prices use the real road distance, and the
   customer and operations follow the rider live on a map. */
(() => {
  "use strict";

  // ------------------------------------------------------------ helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const ic = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const naira = (n, dp = 0) =>
    (n < 0 ? "−" : "") +
    "₦" +
    Math.abs(n).toLocaleString("en-NG", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const initials = (n) =>
    String(n || "?")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const now = () => Date.now();
  const fmtTime = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const fmtDay = (t) => {
    const d = new Date(t),
      td = new Date();
    if (d.toDateString() === td.toDateString()) return "Today, " + fmtTime(t);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " + fmtTime(t);
  };
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const stars = (r) =>
    `<span class="stars" aria-label="${r} out of 5">${[1, 2, 3, 4, 5].map((k) => `<svg class="i ${k <= Math.round(r) ? "" : "off"}" aria-hidden="true"><use href="#i-star"/></svg>`).join("")}</span>`;
  const tel = (p) => "tel:" + String(p || "").replace(/[^\d+]/g, "");
  const gmapsLink = (place) =>
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(
      place && place.lat ? place.lat + "," + place.lng : [place.addr, place.state, "Nigeria"].join(", "),
    );
  const gmapsDir = (place) =>
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(
      place && place.lat ? place.lat + "," + place.lng : [place.addr, place.state, "Nigeria"].join(", "),
    );
  const api = (path, body) => RH.call(path, body === undefined ? {} : { method: "POST", body });
  const local = {
    get(k, f) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? f : JSON.parse(v);
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

  // ------------------------------------------------------------ pricing (assets/js/aimove-pricing.js)
  const PRICING = window.AiMovePricing;
  const SERVICES = PRICING.CONFIG.services;
  const serviceName = (t) => (SERVICES[t] ? SERVICES[t].name : "Standard");
  const isFast = (t) => t === "INSTANT" || t === "EXPRESS";
  function fare({ kg, km, type, hour, vehicle, worth }) {
    return PRICING.quote({ km, kg, service: type, hour, vehicle: vehicle || "auto", worth });
  }
  // Without a map service the server estimates the distance the same way, so this preview matches.
  function estKm(o, d) {
    const h = hash((o.addr + o.state + d.addr + d.state).toLowerCase());
    return o.state === d.state ? Math.round((3 + (h % 260) / 10) * 10) / 10 : 120 + (h % 680);
  }

  // ------------------------------------------------------------ data
  const STATES = [
    "Lagos",
    "FCT Abuja",
    "Ogun",
    "Oyo",
    "Rivers",
    "Abia",
    "Enugu",
    "Kano",
    "Kaduna",
    "Edo",
    "Delta",
    "Anambra",
  ];
  const SLOTS = ["08:00–10:00", "10:00–12:00", "12:00–14:00", "14:00–16:00", "16:00–18:00"];
  const LABEL = {
    REQUESTED: "Finding rider",
    ASSIGNED: "Rider assigned",
    PICKED_UP: "Picked up",
    IN_TRANSIT: "In transit",
    DELIVERED: "Delivered",
    SCHEDULED: "Scheduled",
    CANCELLED: "Cancelled",
  };
  const FLOW = ["REQUESTED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];
  const ACTIVE = ["REQUESTED", "ASSIGNED", "PICKED_UP", "IN_TRANSIT"];
  const MAPAT = {
    REQUESTED: 4,
    SCHEDULED: 4,
    ASSIGNED: 16,
    PICKED_UP: 30,
    IN_TRANSIT: 64,
    DELIVERED: 100,
    CANCELLED: 4,
  };
  const BANKS = [
    "Access Bank",
    "First Bank",
    "FCMB",
    "Fidelity Bank",
    "GTBank",
    "Kuda",
    "Moniepoint",
    "OPay",
    "PalmPay",
    "UBA",
    "Wema Bank",
    "Zenith Bank",
  ];

  // S is this screen's copy of what the server sent (GET aimove/state). Nothing here is the source of truth.
  const blank = () => ({
    session: null,
    user: { name: "", email: "", phone: "", address: "", business: "", rc: "", vehicle: "", plate: "", licence: "" },
    wallet: 0,
    hideBal: local.get("am-hide-bal", false),
    tx: [],
    packages: [],
    riders: [],
    rider: { online: false, balance: 0, today: 0, acceptance: 100, payouts: [], card: null },
    notes: [],
    prefs: { orders: true, messages: true, location: true, dark: local.get("am-dark", false) },
    bank: null,
    pending: [],
    kpi: { held: 0, earned: 0 },
    collect: { account_name: "Rehohub Ltd", bank_name: "Moniepoint", account_number: "810512715" },
    draft: null,
  });
  let S = blank();
  let ACCOUNT = null; // the signed-in Rehohub account (from the server)
  let MYROLES = []; // AiMove roles the server has approved for this account
  const role = () => (S.session && S.session.role) || "customer";
  const ME_RIDER = () => {
    const c = S.rider.card || {};
    return {
      id: "me",
      name: ACCOUNT ? ACCOUNT.full_name : "",
      vehicle: S.user.vehicle || c.vehicle || "",
      plate: S.user.plate || c.plate || "",
      rating: c.rating || 5,
      trips: c.trips || 0,
      kind: c.kind || "Motorcycle",
    };
  };
  const pkgById = (id) => S.packages.find((p) => p.id === String(id));
  const mine = () => S.packages.filter((p) => p.by === "me");
  const riderOf = (p) =>
    !p || !p.rider
      ? null
      : p.rider === "me"
        ? ME_RIDER()
        : p.riderInfo || S.riders.find((r) => r.id === p.rider) || null;
  const riderById = (id) => (id === "me" ? ME_RIDER() : S.riders.find((r) => r.id === String(id)) || null);
  const escrowOf = (p) => p.escrow || { state: "HELD", amount: p.fare.total, riderShare: p.fare.riderShare };
  const riderShareOf = (p) => p.fare.riderShare;
  const heldFor = (list) =>
    list
      .filter((p) => escrowOf(p).state === "HELD" && p.status !== "CANCELLED")
      .reduce((a, p) => a + escrowOf(p).amount, 0);

  async function sync() {
    const r = await api("aimove/state?role=" + role());
    const p = r.profile || {};
    Object.assign(S.user, {
      name: ACCOUNT.full_name,
      email: ACCOUNT.email,
      phone: ACCOUNT.phone || "",
      address: p.address || "",
      business: p.business || "",
      rc: p.rc || "",
      vehicle: p.vehicle || "",
      plate: p.plate || "",
      licence: p.licence || "",
    });
    const rider = ACCOUNT.memberships.find(
      (m) => m.product === "aimove" && m.role === "rider" && m.status === "approved",
    );
    if (rider) {
      const d = rider.details || {};
      if (!S.user.vehicle && d.vehicle_type) S.user.vehicle = d.vehicle_type[0].toUpperCase() + d.vehicle_type.slice(1);
      if (!S.user.plate) S.user.plate = d.plate_number || "";
      if (!S.user.licence) S.user.licence = d.licence_number || "";
    }
    S.packages = r.packages || [];
    S.notes = r.notes || [];
    S.prefs = { ...S.prefs, ...(r.prefs || {}) };
    local.set("am-dark", !!S.prefs.dark);
    S.bank = r.bank || null;
    S.collect = r.collect || S.collect;
    if (r.wallet !== undefined) S.wallet = r.wallet;
    if (r.tx) S.tx = r.tx;
    if (r.riders) S.riders = r.riders;
    if (r.rider) S.rider = r.rider;
    if (r.pending) S.pending = r.pending;
    if (r.kpi) S.kpi = r.kpi;
    location_.update();
  }

  // ------------------------------------------------------------ maps (Google Maps, optional)
  const MAPS = { key: "", lib: null };
  function loadMaps() {
    if (!MAPS.key) return Promise.resolve(null);
    if (MAPS.lib) return MAPS.lib;
    MAPS.lib = new Promise((resolve) => {
      window.__amMapsReady = () => resolve(window.google && window.google.maps ? window.google.maps : null);
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS.key)}&v=weekly&libraries=places,geometry&loading=async&callback=__amMapsReady&region=NG`;
      s.async = true;
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      setTimeout(() => resolve(window.google && window.google.maps ? window.google.maps : null), 15000);
    });
    return MAPS.lib;
  }
  // Google calls this when it rejects the key: switch every map on the page back to the illustration.
  window.gm_authFailure = () => {
    MAPS.key = "";
    $$("[data-gmap]").forEach((el) => {
      const p = pkgById(el.dataset.gmap);
      const box = el.closest(".map");
      if (p && box) box.outerHTML = mapSvg(p);
    });
    $$("[data-fleet]").forEach((el) => el.closest("section").remove());
  };
  const PIN_SVG = (color) =>
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44"><path d="M17 43s15-14 15-26A15 15 0 0 0 2 17c0 12 15 26 15 26z" fill="${color}"/><circle cx="17" cy="17" r="6" fill="#fff"/></svg>`,
    );
  const RIDER_SVG =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="13" fill="#fff"/><circle cx="15" cy="15" r="9" fill="#FF6B1A"/></svg>`,
    );
  let liveTimer = null;
  async function drawMap(el, p, riders) {
    const g = await loadMaps();
    if (!g || !g.Map) {
      // The key is set but Google Maps didn't load (wrong key, blocked, offline): use the illustration.
      MAPS.key = "";
      const box = el.isConnected && el.closest(".map");
      if (box) p ? (box.outerHTML = mapSvg(p)) : box.closest("section").remove();
      return false;
    }
    if (!el.isConnected) return false;
    const map = new g.Map(el, {
      zoom: 12,
      center: { lat: 6.5244, lng: 3.3792 },
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
    });
    const bounds = new g.LatLngBounds();
    const mark = (pos, icon, title) => {
      if (!pos) return null;
      const ll = { lat: +pos[0], lng: +pos[1] };
      bounds.extend(ll);
      return new g.Marker({
        position: ll,
        map,
        title,
        icon: { url: icon, scaledSize: new g.Size(icon === RIDER_SVG ? 30 : 30, icon === RIDER_SVG ? 30 : 39) },
      });
    };
    let riderMarker = null;
    if (p) {
      const geo = p.geo || {};
      const from = geo.from || (p.origin.lat ? [p.origin.lat, p.origin.lng] : null);
      const to = geo.to || (p.dest.lat ? [p.dest.lat, p.dest.lng] : null);
      mark(from, PIN_SVG("#0256FF"), "Pickup");
      mark(to, PIN_SVG("#FF6B1A"), "Drop-off");
      if (geo.polyline && g.geometry && g.geometry.encoding) {
        new g.Polyline({
          map,
          path: g.geometry.encoding.decodePath(geo.polyline),
          strokeColor: "#0256FF",
          strokeWeight: 4,
        });
      } else if (from && to) {
        new g.Polyline({
          map,
          path: [
            { lat: from[0], lng: from[1] },
            { lat: to[0], lng: to[1] },
          ],
          strokeColor: "#0256FF",
          strokeOpacity: 0.6,
          strokeWeight: 3,
        });
      }
      const r = riderOf(p);
      if (r && r.loc) riderMarker = mark(r.loc, RIDER_SVG, r.name);
    }
    (riders || []).forEach((r) => r.loc && mark(r.loc, RIDER_SVG, r.name + (r.online ? " (online)" : "")));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 40);
      g.event.addListenerOnce(map, "idle", () => map.getZoom() > 16 && map.setZoom(15));
    } else el.insertAdjacentHTML("beforeend", "");
    return { map, g, riderMarker, bounds };
  }
  function mapSvg(p) {
    const at = MAPAT[p.status] ?? 50;
    const moving = ["ASSIGNED", "IN_TRANSIT"].includes(p.status);
    const eta = p.status === "IN_TRANSIT" ? Math.max(3, Math.round(p.km * 2.2)) : p.status === "ASSIGNED" ? 8 : null;
    const r = riderOf(p);
    const live = r && r.loc;
    if (MAPS.key)
      return `<div class="map map--g"><div class="gmap" data-gmap="${p.id}" role="img" aria-label="Map of the route from pickup to drop-off${live ? " with the rider's live position" : ""}"></div>
        <span class="map__live">● ${p.status === "DELIVERED" ? "DELIVERED" : live ? "LIVE" : LABEL[p.status].toUpperCase()}</span>
        ${eta ? `<div class="map__eta"><small>Estimated arrival</small><b>about ${eta} mins</b></div>` : ""}
        ${live ? `<a class="map__open" href="${esc(gmapsLink({ lat: r.loc[0], lng: r.loc[1] }))}" target="_blank" rel="noopener">${ic("pin")}Open in Google Maps</a>` : ""}</div>`;
    return `<div class="map">
      <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-label="Illustration of the rider's route from pickup to drop-off">
        <g class="roads" fill="none" stroke-width="9"><path d="M-10 60 L410 90"/><path d="M-10 170 L410 150"/><path d="M90 -10 L120 240"/><path d="M250 -10 L230 240"/><path d="M330 -10 L360 240"/></g>
        <g class="roads" fill="none" stroke-width="3"><path d="M-10 120 L410 118"/><path d="M170 -10 L180 240"/><path d="M40 -10 L55 240"/><path d="M-10 205 L410 195"/></g>
        <path class="route" d="M60 150 C120 120 130 70 200 64 S300 40 340 30" fill="none" stroke="#0256FF" stroke-width="4" stroke-linecap="round"/>
        <circle cx="60" cy="150" r="9" fill="#0256FF"/><circle cx="60" cy="150" r="4" fill="#fff"/>
        <path d="M340 14c-7 0-11 5-11 10 0 8 11 17 11 17s11-9 11-17c0-5-4-10-11-10z" fill="#FF6B1A"/><circle cx="340" cy="24" r="4" fill="#fff"/>
        ${p.status === "DELIVERED" || p.status === "SCHEDULED" || p.status === "CANCELLED" ? "" : `<g class="rider ${moving ? "moving" : ""}" style="--at:${at}%"><circle r="11" fill="#fff"/><circle r="8" fill="#FF6B1A"/></g>`}
      </svg>
      <span class="map__live">● ${p.status === "DELIVERED" ? "DELIVERED" : LABEL[p.status].toUpperCase()}</span>
      ${eta ? `<div class="map__eta"><small>Estimated arrival</small><b>about ${eta} mins</b></div>` : ""}
      ${live ? `<a class="map__open" href="${esc(gmapsLink({ lat: r.loc[0], lng: r.loc[1] }))}" target="_blank" rel="noopener">${ic("pin")}See the rider on Google Maps</a>` : ""}
    </div>`;
  }

  // Rider's phone shares its location while online (only if they allow it), so customers can follow.
  const location_ = {
    watch: null,
    last: 0,
    update() {
      const want = ACCOUNT && role() === "rider" && S.rider.online && S.prefs.location && "geolocation" in navigator;
      if (want && this.watch === null) {
        this.watch = navigator.geolocation.watchPosition(
          (pos) => {
            if (now() - this.last < 20000) return;
            this.last = now();
            api("aimove/location", { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
        );
      } else if (!want && this.watch !== null) {
        navigator.geolocation.clearWatch(this.watch);
        this.watch = null;
      }
    },
  };

  // ------------------------------------------------------------ UI primitives
  const view = () => $("#app");
  function toast(msg) {
    const t = $(".toast");
    t.querySelector("span").textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("on"), 3200);
  }
  function modal(html, onReady) {
    closeModal();
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="modal__box" role="dialog" aria-modal="true">${html}</div>`;
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-close]")) closeModal();
    });
    document.body.appendChild(m);
    modal.last = document.activeElement;
    const f = m.querySelector("input,select,textarea,button");
    if (f) f.focus();
    if (onReady) onReady(m);
    return m;
  }
  function closeModal() {
    const m = $(".modal");
    if (m) {
      m.remove();
      if (modal.last && modal.last.focus) modal.last.focus();
    }
  }
  const chip = (st) => `<span class="st st--${st}">${LABEL[st]}</span>`;
  const go = (h) => {
    if (location.hash === h) render();
    else location.hash = h;
  };
  /** Runs a server action, then reloads the data and redraws. */
  async function act(promise, okMsg, after) {
    try {
      const r = await promise;
      await sync();
      if (after) after(r);
      else render();
      toast((r && r.message) || okMsg || "Saved");
      return r;
    } catch (e) {
      toast(e.message);
      return null;
    }
  }

  function timeline(p) {
    if (p.status === "SCHEDULED")
      return `<ol class="tl"><li class="now"><b>Pickup scheduled</b><small>${esc(fmtDate(p.when))}, ${esc(p.slot)}</small></li><li><b>Rider assigned</b></li><li><b>Picked up</b></li><li><b>In transit</b></li><li><b>Delivered</b><small>Confirmed with the recipient's PIN</small></li></ol>`;
    const names = [
      "Courier requested",
      "Rider assigned",
      "Package picked up",
      "Package in transit",
      "Package delivered",
    ];
    const idx = FLOW.indexOf(p.status);
    return `<ol class="tl">${FLOW.map((st, i) => {
      const h = p.history.find((x) => x[0] === st);
      const cls =
        p.status === "CANCELLED"
          ? h
            ? "done"
            : ""
          : i < idx || (i === idx && st === "DELIVERED")
            ? "done"
            : i === idx
              ? "now"
              : "";
      return `<li class="${cls}"><b>${names[i]}</b>${h ? `<small>${esc(fmtDay(h[1]))}</small>` : i === 4 ? "<small>Confirmed with the recipient's 4-digit PIN</small>" : ""}</li>`;
    }).join(
      "",
    )}${p.status === "CANCELLED" ? `<li class="done"><b>Cancelled</b><small>Refunded to the wallet</small></li>` : ""}</ol>`;
  }
  // Customers see only the final price; the line-by-line breakdown stays in aimove-pricing.js.
  function charges(f, extra = "") {
    const sub = f.serviceName ? `${esc(f.serviceName)} · ${esc(f.vehicleName)}` : "";
    return `<dl class="kv">${sub ? `<div><dt>Delivery</dt><dd>${sub}</dd></div>` : ""}
      <div class="tot"><dt>Total price</dt><dd><b>${naira(f.total)}</b></dd></div>${extra}
    </dl>`;
  }
  function pkgRow(p, href) {
    return `<a class="pkg" href="${href || "#/track/" + p.id}"><span class="pkg__ico">${ic("box")}</span><b>${esc(p.items)}</b>${chip(p.status)}
      <small>${esc(p.tracking)} · ${esc(p.dest.addr)}</small></a>`;
  }

  // ------------------------------------------------------------ auth screens
  const ONB = [
    ["bike", "Quick delivery at your doorstep", "Enjoy quick pick-up and delivery to your destination."],
    ["wallet", "Flexible payment", "Pay from your AiMove wallet, with the price shown before you book."],
    [
      "pin",
      "Real-time tracking",
      "Track your packages from the comfort of your home till they reach their destination.",
    ],
  ];
  function authShell(inner) {
    return `<div class="auth">
      <aside class="auth__art">
        <a class="logo" href="#/welcome"><img src="../assets/img/aimove/mark-white.png" alt="" width="399" height="400"><span>AiMove</span></a>
        <div><h2>Send it. Track it. Done.</h2><p>Book verified riders, pay a guaranteed price and follow every delivery live.</p>
          <ul class="auth__points"><li>${ic("bike")}Instant, same-day and scheduled delivery</li><li>${ic("shield")}Verified riders and PIN-confirmed drop-off</li><li>${ic("wallet")}Pay from your wallet; money is held in escrow</li></ul></div>
        <small style="opacity:.75">A Rehohub product, delivered by RehoTrans · <a href="../index.html" style="text-decoration:underline">rehohub.com</a></small>
      </aside>
      <main class="auth__main" id="main"><div class="auth__box">${inner}</div></main>
    </div>`;
  }
  const A = {};
  A.welcome = (q) => {
    const i = Math.min(2, Math.max(0, Number(q.get("s")) || 0));
    const [icon, t, d] = ONB[i];
    return authShell(`<div class="onb"><div class="onb__art">${ic(icon)}</div><h1>${t}</h1><p class="mute">${d}</p>
      <div class="dots">${ONB.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div></div>
      <div class="row row--sb"><button class="btn btn--ghost btn--sm" data-act="skip">Skip</button>
      ${i < 2 ? `<a class="btn btn--sm" href="#/welcome?s=${i + 1}">Next ${ic("chev-right")}</a>` : `<a class="btn btn--sm" href="#/start">Get started ${ic("chev-right")}</a>`}</div>
      <p class="auth__alt">Already have an account? <a class="link" href="${esc(RH.loginUrl(location.pathname))}">Sign in</a></p>`);
  };
  A.start = () =>
    authShell(`<h1>Welcome to AiMove</h1><p>Sign in with your Rehohub account. The same account works for AiPay, GreenFed and AiRise.</p>
      <a class="btn btn--block" href="${esc(RH.loginUrl(location.pathname))}">Sign in</a>
      <a class="btn btn--line btn--block" href="${esc(RH.url("account/register.html?product=aimove&role=customer"))}">Create a business account</a>
      <p class="auth__alt">Want to deliver with AiMove? <a class="link" href="${esc(RH.url("account/register.html?product=aimove&role=rider"))}">Apply as a rider</a></p>`);

  // ------------------------------------------------------------ app shell
  const NAV = {
    customer: [
      ["#/home", "home", "Home"],
      ["#/send", "box", "Send a package"],
      ["#/track", "map", "Track"],
      ["#/riders", "bike", "Book a rider"],
      ["#/wallet", "wallet", "Wallet"],
      ["#/chat", "chat", "Messages"],
      ["#/notifications", "bell", "Notifications"],
      ["#/profile", "user", "Profile"],
    ],
    rider: [
      ["#/rider", "home", "Rider home"],
      ["#/rider/earnings", "wallet", "Earnings"],
      ["#/chat", "chat", "Messages"],
      ["#/notifications", "bell", "Notifications"],
      ["#/profile", "user", "Profile"],
    ],
    admin: [
      ["#/ops", "chart", "Operations"],
      ["#/ops/money", "wallet", "Top-ups & payouts"],
      ["#/notifications", "bell", "Notifications"],
      ["#/profile", "user", "Profile"],
    ],
  };
  const TABS = {
    customer: [
      ["#/home", "home", "Home"],
      ["#/wallet", "wallet", "Wallet"],
      ["#/track", "map", "Track"],
      ["#/profile", "user", "Profile"],
    ],
    rider: [
      ["#/rider", "home", "Home"],
      ["#/rider/earnings", "wallet", "Earnings"],
      ["#/chat", "chat", "Messages"],
      ["#/profile", "user", "Profile"],
    ],
    admin: [
      ["#/ops", "chart", "Operations"],
      ["#/ops/money", "wallet", "Money"],
      ["#/profile", "user", "Profile"],
    ],
  };
  const ROLE_NAME = { customer: "Business customer", rider: "Rider", admin: "Operations" };
  function shell(path, v) {
    const r = role();
    const unread = S.notes.filter((n) => !n.read).length;
    const activeN = mine().filter((p) => ACTIVE.includes(p.status)).length;
    const pendingN = S.pending.length;
    const cur = (h) =>
      path === h || (h !== "#/home" && h !== "#/rider" && h !== "#/ops" && path.startsWith(h + "/"))
        ? ' aria-current="page"'
        : "";
    const who = ACCOUNT ? ACCOUNT.full_name : S.user.name;
    const badge = (h) =>
      h === "#/notifications" && unread
        ? unread
        : h === "#/track" && activeN
          ? activeN
          : h === "#/ops/money" && pendingN
            ? pendingN
            : 0;
    const nav = NAV[r]
      .map(
        ([h, i, t]) =>
          `<li><a href="${h}"${cur(h)}>${ic(i)}<span>${t}</span>${badge(h) ? `<span class="n">${badge(h)}</span>` : ""}</a></li>`,
      )
      .join("");
    const tabs = TABS[r].map(([h, i, t]) => `<a href="${h}"${cur(h)}>${ic(i)}<span>${t}</span></a>`).join("");
    return `<div class="app">
      <aside class="side" aria-label="AiMove navigation">
        <a class="logo" href="${NAV[r][0][0]}"><img src="../assets/img/aimove/mark.png" alt="" width="399" height="400"><span>AiMove</span></a>
        <nav class="nav" aria-label="Main"><h2>${r === "admin" ? "Operations" : r === "rider" ? "Rider" : "Menu"}</h2><ul>${nav}</ul></nav>
        <div class="side__foot">
          ${
            MYROLES.length > 1
              ? `<label class="rolebox"><small>Your roles</small><select class="inp" data-act="role" aria-label="Switch between your roles">${MYROLES.map((k) => `<option value="${k}" ${k === r ? "selected" : ""}>${ROLE_NAME[k]}</option>`).join("")}</select></label>`
              : ""
          }
          ${RH.isAdminFor(ACCOUNT, "aimove") ? `<a class="link" href="${esc(RH.url("account/admin.html"))}" style="font-size:13px;display:inline-block;margin:6px 4px 0">Admin console</a>` : ""}
          <a class="link" href="${esc(RH.url("account/index.html"))}" style="font-size:13px;display:inline-block;margin:6px 4px 10px">My Rehohub account</a>
          <div class="me"><span class="ava ${r === "rider" ? "ava--o" : ""}">${initials(who)}</span><div><b>${esc(who)}</b><small>${ROLE_NAME[r]}</small></div></div>
        </div>
      </aside>
      <main class="main" id="main">
        <div class="top">${v.back ? `<a class="back" href="${v.back}" aria-label="Back">${ic("chev-left")}</a>` : ""}<h1>${v.title}</h1>
          <a class="ibtn" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<span class="dot">${unread}</span>` : ""}</a></div>
        ${v.html}
      </main>
      <nav class="tabs" style="--n:${TABS[r].length}" aria-label="Tabs">${tabs}</nav>
    </div>`;
  }

  // ------------------------------------------------------------ customer views
  const V = {};
  V.home = () => {
    const act = mine().filter((p) => ACTIVE.includes(p.status));
    const sched = mine().filter((p) => p.status === "SCHEDULED");
    const tiles = [
      ["box", "Send a package", "Request a rider to pick up and deliver your package.", "#/send", true],
      ["bike", "Book a rider", "See AiMove's verified riders and book one.", "#/riders"],
      ["wallet", "Fund your wallet", "Top up by bank transfer.", "#/wallet?topup=1"],
      ["calendar", "Schedule a delivery", "Set a date and time slot for an upcoming pickup.", "#/send?type=SCHEDULED"],
      ["headset", "Customer care", "Call, email or WhatsApp the AiMove team.", "#/profile?open=help"],
      ["map", "Track a package", "Follow your deliveries on the map.", "#/track"],
    ];
    const r0 = act[0] && riderOf(act[0]);
    return {
      title: "Home",
      html: `<div class="cols"><div class="stack">
      <div class="hello"><div><h2>Hello ${esc(S.user.name.split(" ")[0])}</h2><p>We trust you are having a great time.</p></div></div>
      <label class="search"><span class="sr-only">Search services</span>${ic("search")}<input class="inp" type="search" placeholder="Search services" data-act="tile-search"></label>
      ${act.length ? `<section class="card"><div class="live"><span class="pulse"></span><div><b>${act.length === 1 ? (act[0].status === "REQUESTED" ? "Finding a rider" : "Package on the move") : act.length + " active deliveries"}</b><p class="mute">${esc(r0 ? `Your rider (${r0.name}) is ${act[0].status === "ASSIGNED" ? "heading to pickup" : "on the way to your destination"}.` : "Riders near your pickup can see your request now.")}</p></div><a class="btn btn--sm" href="#/track/${act[0].id}">Track my item</a></div></section>` : ""}
      <section><h2 class="h h--p">What would you like to do</h2><div class="tiles" data-tiles>${tiles.map(([i, t, d, h, on]) => `<a class="tile ${on ? "tile--on" : ""}" href="${h}">${ic(i)}<b>${t}</b><span>${d}</span></a>`).join("")}</div></section>
    </div>
    <div class="stack">
      <section class="bal"><small>Wallet balance</small><strong>${naira(S.wallet, 2)}</strong>${heldFor(mine()) ? `<small>${naira(heldFor(mine()))} held in escrow</small>` : ""}<a class="btn btn--sm" href="#/wallet?topup=1">${ic("plus")}Top up</a></section>
      <section class="card"><div class="row row--sb"><h2 class="h">Scheduled deliveries</h2><a class="link" href="#/send?type=SCHEDULED">Schedule</a></div>
        ${sched.length ? sched.map((p) => pkgRow(p)).join("") : `<p class="mute">No scheduled pickups.</p>`}</section>
      <section class="card"><div class="row row--sb"><h2 class="h">Recent activity</h2><a class="link" href="#/wallet">View all</a></div>
        ${S.tx.length ? `<ul class="list">${S.tx.slice(0, 4).map(txRow).join("")}</ul>` : `<p class="mute">No wallet activity yet.</p>`}</section>
    </div></div>`,
    };
  };
  const txRow = (t) =>
    `<li><span class="ava ava--soft">${ic(t.amt < 0 ? "box" : "plus")}</span><div class="grow"><b>${esc(t.title)}</b><small>${esc(fmtDate(t.at))} · ${esc(t.sub)}${t.status === "pending" ? ` · <span class="st st--SCHEDULED">Awaiting confirmation</span>` : t.status === "rejected" ? ` · <span class="st st--CANCELLED">Not received</span>` : ""}</small></div><span class="amt ${t.amt < 0 ? "amt--neg" : ""}" ${t.status !== "done" ? 'style="opacity:.55"' : ""}>${t.amt > 0 ? "+" : ""}${naira(t.amt, 2)}</span></li>`;

  V.send = (q) => {
    const d = S.draft || {};
    const pre = q.get("rider") || d.rider || "";
    const type = SERVICES[q.get("type")] ? q.get("type") : d.type || "SAME_DAY";
    const veh = d.vehicle || "auto";
    const o = d.origin || { addr: S.user.address, state: "Lagos", phone: S.user.phone, note: "" };
    const de = d.dest || { addr: "", state: "Lagos", phone: "", name: "", note: "" };
    const stateSel = (n, v) =>
      `<select class="inp" name="${n}">${STATES.map((s) => `<option ${s === v ? "selected" : ""}>${s}</option>`).join("")}</select>`;
    const tomorrow = new Date(now() + 864e5).toISOString().slice(0, 10);
    const r = pre ? riderById(pre) : null;
    const place = (k, label, val) =>
      `<label class="field ac-wrap"><span>${label}</span><input class="inp" name="${k}Addr" value="${esc(val.addr)}" required autocomplete="off" data-place="${k}" ${MAPS.key ? 'aria-autocomplete="list"' : ""}>
       <input type="hidden" name="${k}Lat" value="${esc(val.lat || "")}"><input type="hidden" name="${k}Lng" value="${esc(val.lng || "")}"></label>`;
    return {
      title: "Send a package",
      back: "#/home",
      html: `<form class="cols" data-form="send" novalidate>
      <div class="stack">
        ${r ? `<div class="card card--flat riderc"><span class="ava">${initials(r.name)}</span><div><b>Booking ${esc(r.name)}</b><small>${esc(r.vehicle)} · ${esc(r.plate)}</small></div><a class="link" href="#/send" data-act="clear-rider">Change</a><input type="hidden" name="rider" value="${esc(pre)}"></div>` : ""}
        <section class="card stack"><h2 class="h row">${ic("target")}Origin details</h2>
          ${place("o", "Pickup address", o)}
          <div class="grid2"><label class="field"><span>State</span>${stateSel("oState", o.state)}</label><label class="field"><span>Phone number</span><input class="inp" name="oPhone" type="tel" value="${esc(o.phone)}" required></label></div>
          <label class="field"><span>Other details (optional)</span><input class="inp" name="oNote" value="${esc(o.note)}" placeholder="Landmark, gate code…"></label></section>
        <section class="card stack"><h2 class="h row">${ic("pin")}Destination details</h2>
          ${place("d", "Drop-off address", de)}
          <div class="grid2"><label class="field"><span>State</span>${stateSel("dState", de.state)}</label><label class="field"><span>Recipient phone</span><input class="inp" name="dPhone" type="tel" value="${esc(de.phone)}" required></label></div>
          <label class="field"><span>Recipient name</span><input class="inp" name="dName" value="${esc(de.name)}" required></label></section>
        <section class="card stack"><h2 class="h row">${ic("box")}Package details</h2>
          <label class="field"><span>Package items</span><input class="inp" name="items" value="${esc(d.items || "")}" placeholder="e.g. Books and stationery" required></label>
          <div class="grid2"><label class="field"><span>Weight of items (kg)</span><input class="inp" name="kg" type="number" min="0.1" step="0.1" value="${esc(d.kg || "")}" required></label>
          <label class="field"><span>Worth of items (₦)</span><input class="inp" name="worth" type="number" min="0" step="100" value="${esc(d.worth ?? "")}" required></label></div></section>
        <section class="card stack"><h2 class="h">Select delivery type</h2>
          <div class="seg seg--2x2" role="radiogroup" aria-label="Delivery type">
            ${[
              ["SAME_DAY", "bike"],
              ["EXPRESS", "send"],
              ["INSTANT", "clock"],
              ["SCHEDULED", "calendar"],
            ]
              .map(
                ([k, icon]) =>
                  `<label><input type="radio" name="type" value="${k}" ${type === k ? "checked" : ""}><span>${ic(icon)}${SERVICES[k].name}<small>${SERVICES[k].markup ? "+" + naira(SERVICES[k].markup) + " · " : ""}${SERVICES[k].detail}</small></span></label>`,
              )
              .join("")}</div>
          <label class="field"><span>Vehicle</span><select class="inp" name="vehicle">
            <option value="auto" ${veh === "auto" ? "selected" : ""}>Choose for me by weight</option>
            ${Object.entries(PRICING.CONFIG.vehicles)
              .map(
                ([k, x]) =>
                  `<option value="${k}" ${veh === k ? "selected" : ""}>${x.name} (up to ${x.maxKg.toLocaleString("en-NG")} kg)</option>`,
              )
              .join("")}</select></label>
          <div class="grid2" data-when ${type === "SCHEDULED" ? "" : "hidden"}><label class="field"><span>Pickup date</span><input class="inp" type="date" name="when" min="${tomorrow}" value="${esc(d.when || tomorrow)}"></label>
            <label class="field"><span>Time slot</span><select class="inp" name="slot">${SLOTS.map((s) => `<option ${s === d.slot ? "selected" : ""}>${s}</option>`).join("")}</select></label></div></section>
      </div>
      <aside class="stack" style="position:sticky;top:20px">
        <section class="card stack" aria-live="polite"><div class="row row--sb"><h2 class="h" style="margin:0">Upfront fare</h2><span class="guar">${ic("shield")}Guaranteed</span></div><div data-quote></div></section>
        <p class="err" data-err hidden></p>
        <button class="btn btn--block">Calculate &amp; review ${ic("chev-right")}</button>
      </aside></form>`,
    };
  };
  function readSend(f) {
    const v = (n) => (f.elements[n] ? f.elements[n].value.trim() : "");
    const pl = (k) => (v(k + "Lat") && v(k + "Lng") ? { lat: +v(k + "Lat"), lng: +v(k + "Lng") } : {});
    const d = {
      rider: v("rider"),
      type: f.querySelector("[name=type]:checked").value,
      when: v("when"),
      slot: v("slot"),
      origin: { addr: v("oAddr"), state: v("oState"), phone: v("oPhone"), note: v("oNote"), ...pl("o") },
      dest: { addr: v("dAddr"), state: v("dState"), phone: v("dPhone"), name: v("dName"), note: "", ...pl("d") },
      items: v("items"),
      kg: parseFloat(v("kg")) || 0,
      worth: parseFloat(v("worth")) || 0,
      vehicle: v("vehicle") || "auto",
    };
    d.km = d.origin.addr && d.dest.addr ? estKm(d.origin, d.dest) : 14.5;
    const hour = d.type === "SCHEDULED" ? parseInt(d.slot, 10) : new Date().getHours();
    d.fare = fare({ kg: d.kg, km: d.km, type: d.type, hour, vehicle: d.vehicle, worth: d.worth });
    return d;
  }
  function quote(f) {
    const d = readSend(f);
    $("[data-quote]").innerHTML = `${charges(d.fare)}<p class="mute" style="font-size:13px;margin-top:10px">${
      MAPS.key
        ? "Estimate. The exact price uses the real road distance and is shown on the next step, before you pay."
        : d.origin.addr && d.dest.addr
          ? `Estimated distance ${d.km} km.`
          : "Add both addresses to estimate the distance (14.5 km shown)."
    } ${esc(d.fare.vehicleName)}${d.fare.upgraded ? " (changed to fit the weight)" : ""}. Peak hours are ${PRICING.CONFIG.peak.label}.</p>
      <p class="mute" style="font-size:13px;margin-top:6px">You pay into AiMove escrow. The rider is paid only when the recipient gives them the 4-digit PIN.</p>`;
    $("[data-when]").hidden = d.type !== "SCHEDULED";
  }

  // Address suggestions from Google Places (only when the Google Maps key is set up).
  const AC = { token: null, timer: null, seq: 0 };
  async function suggest(input) {
    const g = await loadMaps();
    if (!g || !g.places || !g.places.AutocompleteSuggestion) return;
    const q = input.value.trim();
    const box = input.closest(".ac-wrap");
    let list = $(".ac", box);
    if (q.length < 3) return list && list.remove();
    const seq = ++AC.seq;
    try {
      AC.token = AC.token || new g.places.AutocompleteSessionToken();
      const { suggestions } = await g.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: q,
        sessionToken: AC.token,
        includedRegionCodes: ["ng"],
      });
      if (seq !== AC.seq || !input.isConnected) return;
      if (!list) {
        list = document.createElement("ul");
        list.className = "ac";
        list.setAttribute("role", "listbox");
        box.appendChild(list);
      }
      list.innerHTML = suggestions
        .slice(0, 5)
        .map(
          (s, i) =>
            `<li><button type="button" role="option" data-i="${i}">${ic("pin")}${esc(s.placePrediction.text.toString())}</button></li>`,
        )
        .join("");
      list.onclick = async (e) => {
        const b = e.target.closest("[data-i]");
        if (!b) return;
        const place = suggestions[+b.dataset.i].placePrediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
        AC.token = null;
        const k = input.dataset.place;
        const f = input.form;
        input.value = place.formattedAddress.replace(/, Nigeria$/, "");
        f.elements[k + "Lat"].value = place.location.lat();
        f.elements[k + "Lng"].value = place.location.lng();
        const st = (place.addressComponents || []).find((c) => c.types.includes("administrative_area_level_1"));
        if (st) {
          const name = /federal capital/i.test(st.longText) ? "FCT Abuja" : st.longText.replace(/ State$/, "");
          if (STATES.includes(name)) f.elements[k + "State"].value = name;
        }
        list.remove();
        quote(f);
      };
    } catch (e) {
      if (list) list.remove();
    }
  }

  V.review = () => {
    const d = S.draft;
    if (!d || !d.qid) return go("#/send");
    const r = d.rider ? riderById(d.rider) : null;
    return {
      title: "Package information",
      back: "#/send",
      html: `<div class="cols"><section class="card stack">
        <h2 class="h h--p">Package information</h2>
        <dl class="kv"><div><dt>Origin</dt><dd>${esc(d.origin.addr)}, ${esc(d.origin.state)}<br><span class="mute">${esc(d.origin.phone)}</span></dd></div>
          <div><dt>Destination</dt><dd>${esc(d.dest.addr)}, ${esc(d.dest.state)}<br><span class="mute">${esc(d.dest.name)} · ${esc(d.dest.phone)}</span></dd></div>
          <div><dt>Package items</dt><dd class="o">${esc(d.items)}</dd></div><div><dt>Weight of items</dt><dd class="o">${d.kg} kg</dd></div>
          <div><dt>Worth of items</dt><dd class="o">${naira(d.worth)}</dd></div>
          <div><dt>Distance</dt><dd>${d.km} km${d.kmSource === "road" ? " by road" : " (estimated)"}</dd></div>
          <div><dt>Delivery type</dt><dd>${d.type === "SCHEDULED" ? `Scheduled · ${esc(fmtDate(d.when))}, ${esc(d.slot)}` : esc(serviceName(d.type))}</dd></div>
          <div><dt>Vehicle</dt><dd>${esc(d.fare.vehicleName || "")}</dd></div>
          ${r ? `<div><dt>Rider</dt><dd>${esc(r.name)} · ${esc(r.plate)}${d.riderOk ? "" : " (not available, any rider can take it)"}</dd></div>` : ""}</dl>
        <h2 class="h h--p" style="margin-top:8px">Price</h2>${charges(d.fare)}
      </section>
      <aside class="stack"><section class="card stack"><span class="guar">${ic("shield")}Guaranteed price</span><p class="mute">This is the price you pay. It won't change after booking. This price is held for 20 minutes.</p><p class="mute" style="font-size:14px">Your payment is held in <b>escrow</b> and released to the rider automatically when the recipient confirms delivery with their 4-digit PIN. Cancel before pickup for a full refund.</p>
        <a class="btn btn--block" href="#/pay">Proceed to pay ${naira(d.fare.total)}</a><a class="btn btn--line btn--block" href="#/send">${ic("edit")}Edit package</a></section></aside></div>`,
    };
  };
  V.pay = () => {
    const d = S.draft;
    if (!d || !d.qid) return go("#/send");
    const low = S.wallet < d.fare.total;
    return {
      title: "Make payment",
      back: "#/review",
      html: `<form class="cols" data-form="pay" novalidate><section class="card stack">
        <h2 class="h">Payment method</h2><p class="mute">Pay from your AiMove wallet. The money is held in escrow until the delivery is confirmed.</p>
        <div class="stack" role="radiogroup" aria-label="Payment method">
          <label class="card card--flat row"><input type="radio" name="m" value="wallet" ${low ? "disabled" : "checked"} style="accent-color:var(--p);width:18px;height:18px"><span class="ava ava--soft">${ic("wallet")}</span><span class="grow"><b>Pay with wallet</b><br><small class="mute">Balance ${naira(S.wallet, 2)}${low ? ` · ${naira(d.fare.total - S.wallet)} more needed` : ""}</small></span>${low ? `<button type="button" class="btn btn--sm" data-act="topup" data-amt="${d.fare.total - S.wallet}">Top up</button>` : ""}</label>
          <div class="card card--flat row" aria-disabled="true" style="opacity:.6"><span class="ava ava--soft">${ic("card")}</span><span class="grow"><b>Card</b><br><small class="mute">Coming soon, when AiMove's payment provider is connected.</small></span></div>
        </div></section>
      <aside class="stack"><section class="card stack"><dl class="kv"><div class="tot"><dt>Total</dt><dd><b>${naira(d.fare.total)}</b></dd></div></dl>
        <p class="err" data-err hidden></p><button class="btn btn--block" ${low ? "disabled" : ""}>Proceed to pay</button></section></aside></form>`,
    };
  };
  V.done = (q, id) => {
    const p = pkgById(id);
    if (!p) return go("#/home");
    const r = riderOf(p);
    return {
      title: "Transaction successful",
      html: `<section class="card stack center" style="max-width:560px;margin:0 auto">
      <div class="big-ok">${ic("check")}</div><h2>Transaction successful</h2>
      <p class="mute">${p.status === "SCHEDULED" ? `Your pickup is scheduled for ${esc(fmtDate(p.when))}, ${esc(p.slot)}.` : r ? `Your rider, ${esc(r.name)}, is on the way to your pickup.` : "Riders near your pickup can see your request now."}</p>
      <dl class="kv" style="text-align:left"><div><dt>Tracking number</dt><dd><button class="link" data-act="copy" data-v="${esc(p.tracking)}">${esc(p.tracking)} ${ic("copy")}</button></dd></div><div><dt>Total paid</dt><dd>${naira(p.fare.total)}</dd></div></dl>
      <div class="pin"><span>Share this PIN with the recipient. The rider asks for it on delivery.</span><strong>${esc(p.pin)}</strong></div>
      <a class="btn btn--block" href="#/track/${p.id}">Track my item</a><a class="btn btn--ghost btn--block" href="#/home">Go back to homepage</a></section>`,
    };
  };

  V.track = (q) => {
    const f = q.get("f") || "active";
    const sets = {
      active: (p) => ACTIVE.includes(p.status),
      scheduled: (p) => p.status === "SCHEDULED",
      delivered: (p) => p.status === "DELIVERED" || p.status === "CANCELLED",
      all: () => true,
    };
    const list = mine()
      .filter(sets[f] || sets.active)
      .sort((a, b) => b.created - a.created);
    return {
      title: "Track",
      html: `<div class="stack" style="max-width:820px">
      <form class="row" data-form="find" novalidate><label class="search" style="flex:1"><span class="sr-only">Tracking number</span>${ic("search")}<input class="inp" name="t" placeholder="Enter a tracking number, e.g. R-7458-4567-4434-5854" autocomplete="off"></label><button class="btn">Track</button></form>
      <p class="err" data-err hidden></p>
      <div class="chips" role="group" aria-label="Filter">${[
        ["active", "Active"],
        ["scheduled", "Scheduled"],
        ["delivered", "Delivered"],
        ["all", "All"],
      ]
        .map(([k, n]) => `<a class="chip" href="#/track?f=${k}" aria-pressed="${k === f}">${n}</a>`)
        .join("")}</div>
      <div>${list.length ? list.map((p) => pkgRow(p)).join("") : `<div class="card empty"><b>Nothing here yet</b>Packages you send will appear here. <a class="link" href="#/send">Send a package</a></div>`}</div></div>`,
    };
  };
  V.trackOne = (q, id) => {
    const p = pkgById(id);
    if (!p) return go(role() === "admin" ? "#/ops" : "#/track");
    const r = riderOf(p);
    const canCancel =
      ["REQUESTED", "ASSIGNED", "SCHEDULED"].includes(p.status) && (p.by === "me" || role() === "admin");
    const active = ACTIVE.includes(p.status);
    return {
      title: "Tracking package",
      back: role() === "admin" ? "#/ops" : "#/track",
      html: `<div class="cols"><div class="stack">
      ${mapSvg(p)}
      <section class="card stack"><div class="row row--sb wrap"><div><small class="mute">Tracking number</small><p class="h h--p" style="margin:0">${esc(p.tracking)}</p></div>${chip(p.status)}</div>
        <h2 class="h" style="margin:4px 0 0">Package status</h2>${timeline(p)}</section>
      ${p.status === "DELIVERED" && p.by === "me" ? (p.rating ? `<section class="card row"><span class="big-ok" style="width:48px;height:48px;margin:0">${ic("check")}</span><div class="grow"><b>Delivery successful</b><br><small class="mute">You rated ${esc(r ? r.name : "the rider")} ${p.rating.stars}/5</small></div>${stars(p.rating.stars)}</section>` : `<section class="card row wrap"><div class="grow"><b>Package delivered</b><br><small class="mute">Rate your rider or report a missing item.</small></div><a class="btn btn--line btn--sm" href="mailto:info@rehohub.com?subject=${encodeURIComponent("AiMove: missing item on " + p.tracking)}">Report</a><button class="btn btn--sm" data-act="rate" data-id="${p.id}">Rate rider</button></section>`) : ""}
    </div>
    <div class="stack">
      ${
        r
          ? `<section class="card stack"><h2 class="h" style="margin:0">${p.status === "DELIVERED" ? "Delivered by" : "Your rider"}</h2><div class="riderc"><span class="ava">${initials(r.name)}</span><div><b>${esc(r.name)}</b><small>${esc(r.vehicle)} · ${esc(r.plate)}</small><br>${stars(r.rating)} <small>${r.rating} (${r.trips} deliveries)</small></div></div>
        ${active ? `<div class="grid2"><a class="btn btn--sm" href="#/chat/${p.id}">${ic("chat")}Message</a>${r.phone ? `<a class="btn btn--o btn--sm" href="${esc(tel(r.phone))}">${ic("phone")}Call rider</a>` : ""}</div>` : ""}
        ${active && r.loc ? `<small class="mute">Location updated ${esc(fmtDay(r.loc[2]))}</small>` : active ? `<small class="mute">The rider's live location appears here while they share it.</small>` : ""}</section>`
          : p.status === "SCHEDULED"
            ? ""
            : p.status === "REQUESTED"
              ? `<section class="card stack"><h2 class="h" style="margin:0">Finding a rider</h2><p class="mute">Riders near your pickup can see your request now.</p></section>`
              : ""
      }
      ${["DELIVERED", "CANCELLED"].includes(p.status) || !p.pin ? "" : `<div class="pin"><span>Recipient's delivery PIN</span><strong>${esc(p.pin)}</strong></div>`}
      <section class="card stack"><h2 class="h" style="margin:0">Package info</h2>
        <dl class="kv"><div><dt>From</dt><dd><a class="link" href="${esc(gmapsLink(p.origin))}" target="_blank" rel="noopener">${esc(p.origin.addr)}</a></dd></div><div><dt>To</dt><dd><a class="link" href="${esc(gmapsLink(p.dest))}" target="_blank" rel="noopener">${esc(p.dest.addr)}</a></dd></div><div><dt>Recipient</dt><dd>${esc(p.dest.name)} · ${esc(p.dest.phone)}</dd></div><div><dt>Items</dt><dd class="o">${esc(p.items)}, ${p.kg} kg</dd></div><div><dt>Distance</dt><dd>${p.km} km${p.kmSource === "road" ? " by road" : ""}</dd></div><div><dt>Payment</dt><dd>${escrowOf(p).state === "HELD" ? (p.status === "CANCELLED" ? "Refunded" : "Held in escrow until the PIN is confirmed") : escrowOf(p).state === "RELEASED" ? "Released to the rider" : "Refunded to the wallet"}</dd></div><div class="tot"><dt>Total charge</dt><dd><b>${naira(p.fare.total)}</b></dd></div></dl>
        ${canCancel ? `<button class="btn btn--danger btn--sm" data-act="cancel" data-id="${p.id}">Cancel delivery</button>` : ""}</section>
    </div></div>`,
      after: () => {
        const el = $("[data-gmap]");
        if (el)
          drawMap(el, p).then((m) => {
            if (!m || !ACTIVE.includes(p.status)) return;
            clearInterval(liveTimer);
            liveTimer = setInterval(async () => {
              if (!el.isConnected) return clearInterval(liveTimer);
              try {
                const { package: np } = await api("aimove/track?id=" + p.id);
                if (np.status !== p.status) {
                  clearInterval(liveTimer);
                  await sync();
                  return render();
                }
                const nr = riderOf(np);
                if (nr && nr.loc) {
                  const ll = { lat: nr.loc[0], lng: nr.loc[1] };
                  if (m.riderMarker) m.riderMarker.setPosition(ll);
                  else
                    m.riderMarker = new m.g.Marker({
                      position: ll,
                      map: m.map,
                      icon: { url: RIDER_SVG, scaledSize: new m.g.Size(30, 30) },
                      title: nr.name,
                    });
                }
              } catch (e) {}
            }, 15000);
          });
      },
    };
  };

  V.riders = (q) => {
    const k = q.get("k") || "All";
    const list = S.riders
      .filter((r) => k === "All" || r.kind === k)
      .sort((a, b) => b.online - a.online || b.trips - a.trips);
    return {
      title: "Book a rider",
      back: "#/home",
      html: `<div class="stack">
      <label class="search"><span class="sr-only">Search riders</span>${ic("search")}<input class="inp" type="search" placeholder="Search for a rider by name or plate number" data-act="rider-search"></label>
      <div class="chips" role="group" aria-label="Vehicle">${["All", "Motorcycle", "Car", "Van"].map((x) => `<a class="chip" href="#/riders?k=${x}" aria-pressed="${x === k}">${x}</a>`).join("")}</div>
      ${
        list.length
          ? `<div class="riders" data-riders>${list
              .map(
                (
                  r,
                ) => `<div class="rcard" data-q="${esc((r.name + " " + r.plate).toLowerCase())}"><div class="riderc"><span class="ava">${initials(r.name)}</span><div><b>${esc(r.name)}</b><small>${esc(r.vehicle)} · ${esc(r.plate)}</small></div></div>
        <div class="meta"><span>${stars(r.rating)} ${r.rating}</span><span>${r.online ? "● Online" : "Offline"}</span></div>
        <div class="grid2"><a class="btn btn--line btn--sm" href="#/riders/${r.id}">Profile</a><a class="btn btn--sm" href="#/send?rider=${r.id}">Book</a></div></div>`,
              )
              .join("")}</div>`
          : `<div class="card empty"><b>No riders yet</b>Verified riders appear here once they are approved.</div>`
      }
      <p class="mute" style="font-size:13px">Booking a rider offers the job to them first. If they don't take it, another rider can.</p></div>`,
    };
  };
  V.rider = (q, id) => {
    const r = riderById(id);
    if (!r) return go("#/riders");
    return {
      title: "Rider profile",
      back: "#/riders",
      html: `<div class="cols"><section class="card prof"><span class="ava ava--lg">${initials(r.name)}</span><h2>${esc(r.name)}</h2>${stars(r.rating)}<p class="mute">${r.rating} rating · ${r.trips} completed deliveries · ${r.online ? "online now" : "offline"}</p>
        <dl class="facts"><div><dt>Vehicle</dt><dd>${esc(r.vehicle)}</dd></div><div><dt>Registration number</dt><dd>${esc(r.plate)}</dd></div><div><dt>Verified</dt><dd>Approved by AiMove</dd></div></dl>
        <a class="btn btn--o btn--block" href="#/send?rider=${r.id}">Book this rider</a></section>
      <section class="stack"><h2 class="h">About booking</h2><div class="card empty"><b>Messages and calls open after booking</b>Once ${esc(r.name.split(" ")[0])} accepts your delivery you can message and call them from the tracking page.</div></section></div>`,
    };
  };

  function escrowCard() {
    const list = mine().slice(0, 8);
    const held = heldFor(mine());
    const label = { HELD: "Held", RELEASED: "Released to rider", REFUNDED: "Refunded" };
    const cls = { HELD: "st--IN_TRANSIT", RELEASED: "st--DELIVERED", REFUNDED: "st--CANCELLED" };
    return `<section class="card stack"><div class="row row--sb wrap"><h2 class="h" style="margin:0">${ic("shield")} Escrow</h2><b>${naira(held)} held</b></div>
      <p class="mute" style="margin:0;font-size:14px">When you pay, the money is held safely by AiMove. It is released to the rider automatically the moment your recipient gives them the 4-digit delivery PIN. Cancel before pickup and it comes straight back to your wallet.</p>
      ${
        list.length
          ? `<ul class="list">${list
              .map((p) => {
                const e = escrowOf(p);
                return `<li><span class="ava ava--soft">${ic("box")}</span><a class="grow" href="#/track/${p.id}"><b>${esc(p.items)}</b><small>${esc(p.tracking)} · ${e.state === "HELD" ? "PIN " + esc(p.pin) + " · release on delivery" : e.state === "RELEASED" ? "released " + esc(fmtDay(e.releasedAt || p.created)) : "refunded to wallet"}</small></a><span class="st ${cls[e.state]}">${label[e.state]}</span><span class="amt">${naira(e.amount)}</span></li>`;
              })
              .join("")}</ul>`
          : `<p class="mute" style="margin:0">Nothing in escrow yet.</p>`
      }</section>`;
  }
  V.wallet = (q) => {
    const done = S.tx.filter((t) => t.status === "done");
    const credits = done.filter((t) => t.amt > 0).reduce((a, t) => a + t.amt, 0);
    const debits = done.filter((t) => t.amt < 0).reduce((a, t) => a + t.amt, 0);
    if (q.get("topup")) setTimeout(() => topup(), 0);
    const c = S.collect;
    return {
      title: "Wallet",
      html: `<div class="cols"><div class="stack">
      <section class="bal"><div class="row row--sb"><small>${esc(S.user.name)} · current balance</small><button class="ibtn" style="background:rgba(255,255,255,.16);border:0;color:#fff;width:36px;height:36px" data-act="hide-bal" aria-label="${S.hideBal ? "Show" : "Hide"} balance">${ic(S.hideBal ? "eye" : "eye-off")}</button></div><strong>${S.hideBal ? "₦ ••••••" : naira(S.wallet, 2)}</strong></section>
      ${escrowCard()}
      <section class="card stack"><h2 class="h center" style="margin:0">Top up</h2><div class="topup"><button data-act="topup">${ic("bank")}Bank transfer</button><button data-act="topup">${ic("swap")}Transfer</button><button data-act="card-soon">${ic("card")}Card</button></div></section>
      <section class="card"><div class="row row--sb wrap" style="margin-bottom:8px"><h2 class="h" style="margin:0">Transaction history</h2><button class="btn btn--ghost btn--sm" data-act="csv">${ic("download")}Statement</button></div>
        <div class="grid2" style="margin:8px 0"><div class="card card--flat"><small class="mute">Total credits</small><b class="amt" style="display:block">+${naira(credits, 2)}</b></div><div class="card card--flat"><small class="mute">Total debits</small><b class="amt amt--neg" style="display:block">${naira(debits, 2)}</b></div></div>
        <label class="search"><span class="sr-only">Search transactions</span>${ic("search")}<input class="inp" type="search" placeholder="Search title, date or reference" data-act="tx-search"></label>
        ${S.tx.length ? `<ul class="list" data-tx>${S.tx.map(txRow).join("")}</ul>` : `<p class="mute">No transactions yet.</p>`}</section>
    </div>
    <div class="stack"><section class="card stack"><h2 class="h" style="margin:0">How to top up</h2>
      <p class="mute" style="margin:0">Transfer from any Nigerian bank app to:</p>
      <dl class="kv"><div><dt>Bank</dt><dd>${esc(c.bank_name)}</dd></div><div><dt>Account name</dt><dd>${esc(c.account_name)}</dd></div><div><dt>Account number</dt><dd><button class="link" data-act="copy" data-v="${esc(c.account_number)}">${esc(c.account_number)} ${ic("copy")}</button></dd></div></dl>
      <p class="mute" style="margin:0;font-size:13px">Then tap <b>Top up</b> and tell us the amount and the account you paid from. Your balance updates once AiMove confirms the transfer.</p>
      <button class="btn btn--line" data-act="topup">${ic("plus")}I've made a transfer</button></section></div></div>`,
    };
  };

  V.chats = async () => {
    const r = await api("aimove/messages");
    const items = r.items;
    return {
      title: "Messages",
      html: `<div class="stack" style="max-width:760px"><section class="card"><ul class="list">${
        items
          .map(
            (t) =>
              `<li><span class="ava">${initials(t.name)}</span><a class="grow" href="#/chat/${t.id}"><b>${esc(t.name)}</b><small>${esc(t.with === "rider" ? "Your rider" : "Customer")} · ${esc(t.items)} · ${esc(t.last || "Start a conversation")}</small></a>${t.at ? `<small class="mute">${esc(fmtDay(t.at))}</small>` : ""}</li>`,
          )
          .join("") ||
        `<li class="mute">No conversations yet. You can message a ${role() === "rider" ? "customer" : "rider"} once a delivery has a rider.</li>`
      }</ul></section>
      <section class="card row wrap"><span class="ava ava--o">${ic("headset")}</span><div class="grow"><b>Customer assistance</b><br><small class="mute">Call or email the AiMove team.</small></div><a class="btn btn--line btn--sm" href="tel:+2348056516548">${ic("phone")}Call</a><a class="btn btn--line btn--sm" href="mailto:info@rehohub.com?subject=AiMove">Email</a></section></div>`,
    };
  };
  let chatTimer = null;
  V.chat = async (q, id) => {
    const p = pkgById(id);
    let r;
    try {
      r = await api("aimove/messages?id=" + encodeURIComponent(id));
    } catch (e) {
      return go("#/chat");
    }
    const other = p ? (p.by === "me" ? riderOf(p) : { name: p.byName }) : { name: "Conversation" };
    const name = (other && other.name) || "Conversation";
    const phone = p ? (p.by === "me" ? (riderOf(p) || {}).phone : p.origin.phone) : "";
    const msgs = (list) =>
      list
        .map(
          ([w, t, at]) =>
            `<p class="msg ${w === "out" ? "msg--me" : ""}">${esc(t)}<small>${esc(fmtTime(at))}</small></p>`,
        )
        .join("") || `<p class="mute center">No messages yet. Say hello.</p>`;
    return {
      title: "Messages",
      back: "#/chat",
      html: `<section class="card chat" style="max-width:760px">
      <div class="chat__head"><span class="ava">${initials(name)}</span><div><b>${esc(name)}</b><br><small>${p ? esc(p.tracking + " · " + p.items) : ""}</small></div>${phone ? `<a class="ibtn" href="${esc(tel(phone))}" aria-label="Call">${ic("phone")}</a>` : ""}</div>
      <div class="chat__body" data-msgs aria-live="polite">${msgs(r.items)}</div>
      <form class="chat__form" data-form="msg" data-k="${esc(id)}" novalidate><label class="sr-only" for="m">Message</label><input class="inp" id="m" name="m" placeholder="Enter message" autocomplete="off" maxlength="1000"><button class="btn" aria-label="Send">${ic("send")}</button></form></section>`,
      after: () => {
        const b = $("[data-msgs]");
        b.scrollTop = b.scrollHeight;
        clearInterval(chatTimer);
        chatTimer = setInterval(async () => {
          const box = $("[data-msgs]");
          if (!box || !location.hash.startsWith("#/chat/" + id)) return clearInterval(chatTimer);
          try {
            const n = await api("aimove/messages?id=" + encodeURIComponent(id));
            if (n.items.length !== box.querySelectorAll(".msg").length) {
              box.innerHTML = msgs(n.items);
              box.scrollTop = box.scrollHeight;
            }
          } catch (e) {}
        }, 8000);
      },
    };
  };

  V.notes = () => {
    const html = `<section class="card" style="max-width:760px">${S.notes.length ? `<ul class="list">${S.notes.map((n) => `<li><span class="ava ${n.read ? "ava--soft" : ""}">${ic("bell")}</span><a class="grow" href="${esc(n.link)}"><b>${esc(n.t)}</b><small>${esc(n.s)} · ${esc(fmtDay(n.at))}</small></a></li>`).join("")}</ul>` : `<div class="empty"><b>Notification</b>You have no notifications.</div>`}</section>`;
    if (S.notes.some((n) => !n.read)) {
      api("aimove/notes", {}).catch(() => {});
      S.notes.forEach((n) => (n.read = true));
    }
    return { title: "Notifications", back: "#" + NAV[role()][0][0].slice(1), html };
  };

  V.profile = (q) => {
    const open = q.get("open") || "";
    const r = role();
    const pp = (key, icon, title, sub, body) =>
      `<li><button data-act="panel" data-p="${key}" aria-expanded="${open === key}">${ic(icon)}<span class="grow"><b>${title}</b><small>${sub}</small></span>${ic(open === key ? "chev-down" : "chev-right")}</button>${open === key ? `<div class="panel">${body}</div>` : ""}</li>`;
    const tog = (k, t, s) =>
      `<div class="toggle-row"><div><b>${t}</b><small class="mute">${s}</small></div><label class="switch"><input type="checkbox" data-act="pref" data-k="${k}" ${S.prefs[k] ? "checked" : ""} aria-label="${t}"><span></span></label></div>`;
    const name = S.user.name;
    return {
      title: "Profile",
      html: `<div class="cols"><section class="card"><ul class="menu">
      ${pp("edit", "user", "Edit profile", "Name, phone number, address", `<form class="stack" data-form="profile" novalidate><label class="field"><span>Full name</span><input class="inp" name="name" value="${esc(S.user.name)}"></label><div class="grid2"><label class="field"><span>Email</span><input class="inp" type="email" value="${esc(S.user.email)}" readonly title="Contact info@rehohub.com to change your email"></label><label class="field"><span>Phone number</span><input class="inp" name="phone" value="${esc(S.user.phone)}"></label></div>${r === "customer" ? `<label class="field"><span>Default pickup address</span><input class="inp" name="address" value="${esc(S.user.address)}"></label>` : ""}<p class="err" data-err hidden></p><button class="btn btn--sm">Save changes</button></form>`)}
      ${
        r === "rider"
          ? pp(
              "vehicle",
              "bike",
              "Vehicle and licence",
              "Vehicle type, plate number, driver's licence",
              `<form class="stack" data-form="vehicle" novalidate><div class="grid3"><label class="field"><span>Vehicle</span><input class="inp" name="vehicle" value="${esc(S.user.vehicle)}"></label><label class="field"><span>Plate</span><input class="inp" name="plate" value="${esc(S.user.plate)}"></label><label class="field"><span>Licence</span><input class="inp" name="licence" value="${esc(S.user.licence)}"></label></div><button class="btn btn--sm">Save</button></form>`,
            )
          : r === "customer"
            ? pp(
                "biz",
                "briefcase",
                "Business details",
                "Business name and CAC / RC number",
                `<form class="stack" data-form="biz" novalidate><div class="grid2"><label class="field"><span>Business name</span><input class="inp" name="business" value="${esc(S.user.business)}"></label><label class="field"><span>RC number</span><input class="inp" name="rc" value="${esc(S.user.rc)}"></label></div><button class="btn btn--sm">Save</button></form>`,
              )
            : ""
      }
      ${r !== "admin" ? pp("statements", "file", "Statements and reports", "Download transactions and deliveries", `<div class="row wrap"><button class="btn btn--sm" data-act="csv">${ic("download")}Transactions (CSV)</button>${r === "customer" ? `<button class="btn btn--line btn--sm" data-act="csv-pkg">${ic("download")}Deliveries (CSV)</button>` : ""}</div>`) : ""}
      ${pp("notify", "bell", "Notification settings", "Order updates, messages and location", `${tog("orders", "Order updates", "Status changes for your deliveries")}${tog("messages", "Messages", "Tell me when a rider or customer messages me")}${r === "rider" ? tog("location", "Share my location while online", "Customers and operations see where you are during a delivery") : ""}`)}
      ${pp("help", "headset", "Customer care", "Call, email or WhatsApp the AiMove team", `<p class="mute">Customer care is open 8am–9pm on weekdays and 9am–5pm at weekends.</p><div class="row wrap"><a class="btn btn--sm" href="tel:+2348056516548">${ic("phone")}Call +234 805 651 6548</a><a class="btn btn--line btn--sm" href="mailto:info@rehohub.com?subject=AiMove">Email info@rehohub.com</a></div>`)}
      <li><div class="toggle-row" style="padding:14px 4px;border-bottom:1px solid var(--line)"><div class="row">${ic("moon")}<b>Enable dark mode</b></div><label class="switch"><input type="checkbox" data-act="pref" data-k="dark" ${S.prefs.dark ? "checked" : ""} aria-label="Dark mode"><span></span></label></div></li>
      ${pp("about", "info", "About us", "Know more about us, terms and conditions", `<p class="mute">AiMove is a Rehohub product. Deliveries are run by RehoTrans, Rehohub's logistics company.</p><a class="link" href="../services/rehotrans.html">About RehoTrans</a>`)}
      <li><button class="danger" data-act="logout">${ic("logout")}<span class="grow"><b>Log out</b></span></button></li></ul></section>
      <aside class="stack"><section class="card prof"><span class="ava ava--lg ${r === "rider" ? "ava--o" : ""}">${initials(name)}</span><h2>${esc(name)}</h2><p class="mute">${r === "rider" ? `${esc(S.user.vehicle)} · ${esc(S.user.plate)}` : esc(S.user.business)}</p><span class="st st--REQUESTED">${ROLE_NAME[r]}</span></section>
        <section class="card stack"><h2 class="h" style="margin:0">Need help?</h2><p class="mute">Customer care is open 8am–9pm on weekdays and 9am–5pm at weekends.</p><a class="btn btn--line btn--sm" href="tel:+2348056516548">${ic("headset")}Call us</a>${r === "customer" ? `<a class="btn btn--ghost btn--sm" href="../assets/media/aimove/aimove-customer-tour.mp4" download="AiMove-customer-tour.mp4">${ic("download")}How to use AiMove (video)</a>` : ""}</section></aside></div>`,
    };
  };

  // ------------------------------------------------------------ rider views
  V.riderHome = (q) => {
    const f = q.get("f") || "all";
    const me = ME_RIDER();
    const task = S.packages.find((p) => p.rider === "me" && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(p.status));
    const allOpen = S.packages.filter((p) => p.status === "REQUESTED" && !p.rider);
    let open = allOpen;
    if (f === "high") open = open.filter((p) => riderShareOf(p) > 3500);
    if (f === "express") open = open.filter((p) => isFast(p.type));
    const step =
      task &&
      {
        ASSIGNED: ["Confirm pickup", "pickup"],
        PICKED_UP: ["Start transit", "transit"],
        IN_TRANSIT: ["Complete delivery (PIN)", "POD"],
      }[task.status];
    const navTo = task ? (task.status === "ASSIGNED" ? task.origin : task.dest) : null;
    return {
      title: "Rider home",
      html: `<div class="cols"><div class="stack">
      <section class="earn"><div class="row row--sb wrap"><div><b style="font-size:20px">${esc(me.name)}</b><br><small>${me.rating} rating · ${esc(S.user.vehicle)}</small></div>
        <label class="online">${S.rider.online ? "ONLINE" : "OFFLINE"}<span class="switch"><input type="checkbox" data-act="online" ${S.rider.online ? "checked" : ""} aria-label="Go online"><span></span></span></label></div>
        <small style="display:block;margin-top:14px">Available earnings</small><strong>${naira(S.rider.balance)}</strong>
        <div class="earn__stats"><div><b>${S.rider.today}</b><small>Trips today</small></div><div><b>${S.rider.acceptance}%</b><small>Acceptance</small></div><div><b>${me.rating} ★</b><small>Rating</small></div></div></section>
      ${
        task
          ? `<section class="job job--active"><div class="row row--sb wrap"><b>Active delivery · ${esc(task.tracking)}</b>${chip(task.status)}</div>
          <ul class="route-mini"><li>${ic("target")}<span><b>Pickup</b><br>${esc(task.origin.addr)} · ${esc(task.byName)} (<a class="link" href="${esc(tel(task.origin.phone))}">${esc(task.origin.phone)}</a>)</span></li><li>${ic("pin")}<span><b>Drop-off</b><br>${esc(task.dest.addr)} · ${esc(task.dest.name)} (<a class="link" href="${esc(tel(task.dest.phone))}">${esc(task.dest.phone)}</a>)</span></li></ul>
          <div class="row row--sb wrap"><span class="mute">${esc(task.items)} · ${task.kg} kg · ${task.km} km</span><span class="pay">You earn ${naira(riderShareOf(task))}</span></div>
          <div class="grid3"><button class="btn btn--o" data-act="rider-step" data-id="${task.id}" data-next="${step[1]}">${step[0]}</button><a class="btn btn--line" href="#/chat/${task.id}">${ic("chat")}Chat customer</a><a class="btn btn--ghost" href="${esc(gmapsDir(navTo))}" target="_blank" rel="noopener">${ic("navigation")}Navigate</a></div></section>`
          : ""
      }
      <section class="stack"><div class="row row--sb wrap"><h2 class="h" style="margin:0">Available orders</h2><div class="chips">${[
        ["all", `All (${allOpen.length})`],
        ["high", "High payout > ₦3.5k"],
        ["express", "Express"],
      ]
        .map(([k, n]) => `<a class="chip" href="#/rider?f=${k}" aria-pressed="${k === f}">${n}</a>`)
        .join("")}</div></div>
        ${
          !S.rider.online
            ? `<div class="card empty"><b>You're offline</b>Go online to receive pickup requests.</div>`
            : open.length
              ? open
                  .map(
                    (
                      p,
                    ) => `<article class="job"><div class="row row--sb wrap"><span class="st ${isFast(p.type) ? "st--CANCELLED" : "st--REQUESTED"}">${esc(serviceName(p.type))}</span>${p.preferred ? `<span class="st st--ASSIGNED">Booked you</span>` : ""}<span class="pay">${naira(riderShareOf(p))}</span></div>
            <b>${esc(p.items)}</b><ul class="route-mini"><li>${ic("target")}<span>${esc(p.origin.addr)}, ${esc(p.origin.state)}</span></li><li>${ic("pin")}<span>${esc(p.dest.addr)}, ${esc(p.dest.state)}</span></li></ul>
            <div class="row row--sb wrap"><span class="mute">${p.km} km · ${p.kg} kg · worth ${naira(p.worth)}</span><button class="btn btn--sm" data-act="accept" data-id="${p.id}" ${task ? "disabled" : ""}>Accept order &amp; start pickup</button></div></article>`,
                  )
                  .join("")
              : `<div class="card empty"><b>No matching pickup requests</b>Check back shortly or change your filter.</div>`
        }</section></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Today</h2><dl class="kv"><div><dt>Trips</dt><dd>${S.rider.today}</dd></div><div><dt>Online</dt><dd>${S.rider.online ? "Yes" : "No"}</dd></div><div><dt>Location sharing</dt><dd>${S.rider.online && S.prefs.location ? "On" : "Off"}</dd></div><div><dt>Payout account</dt><dd>${S.bank ? esc(S.bank.bank + " •••• " + S.bank.acct.slice(-4)) : "Not set"}</dd></div></dl><a class="btn btn--line btn--sm" href="#/rider/earnings">Earnings and payout</a></section>
        <section class="card stack"><h2 class="h" style="margin:0">Proof of delivery</h2><p class="mute">Ask the recipient for their 4-digit PIN before you complete a delivery. Your earnings are released the moment the right PIN is entered.</p></section></aside></div>`,
    };
  };
  V.riderEarn = () => {
    const done = S.packages.filter((p) => p.rider === "me" && p.status === "DELIVERED");
    const pending = S.packages.filter((p) => p.rider === "me" && ACTIVE.includes(p.status));
    const pendingAmt = pending.reduce((a, p) => a + riderShareOf(p), 0);
    const stLabel = { pending: "Being sent", done: "Paid", rejected: "Returned" };
    return {
      title: "Earnings",
      html: `<div class="cols"><div class="stack">
      <section class="card stack"><div class="row row--sb wrap"><h2 class="h" style="margin:0">${ic("shield")} Pending in escrow</h2><b>${naira(pendingAmt)}</b></div><p class="mute" style="margin:0;font-size:14px">Your ${Math.round(PRICING.CONFIG.riderShare * 100)}% share of each active delivery is held in escrow and lands in your balance as soon as you enter the recipient's 4-digit PIN. No approval needed.</p></section>
      <section class="earn"><small>Available earnings balance</small><strong>${naira(S.rider.balance)}</strong><button class="btn btn--o btn--sm" data-act="withdraw" ${S.rider.balance < 100 ? "disabled" : ""}>${ic("bank")}Withdraw to bank</button></section>
      <section class="card"><h2 class="h">Completed deliveries</h2>${done.length ? `<ul class="list">${done.map((p) => `<li><span class="ava ava--soft">${ic("box")}</span><div class="grow"><b>${esc(p.items)}</b><small>${esc(p.tracking)} · ${esc(fmtDay(p.history.slice(-1)[0][1]))}${p.rating ? " · rated " + p.rating.stars + "/5" : ""}</small></div><span class="amt">+${naira(riderShareOf(p))}</span></li>`).join("")}</ul>` : `<p class="mute">Deliveries you complete appear here.</p>`}</section>
      <section class="card"><h2 class="h">Payouts</h2>${S.rider.payouts.length ? `<ul class="list">${S.rider.payouts.map((w) => `<li><span class="ava ava--soft">${ic("bank")}</span><div class="grow"><b>Withdrawal · ${stLabel[w.status]}</b><small>${esc(w.sub)} · ${esc(fmtDay(w.at))}</small></div><span class="amt amt--neg">${naira(w.amt)}</span></li>`).join("")}</ul>` : `<p class="mute">No payouts yet.</p>`}</section></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Payout account</h2>${S.bank ? `<p><b>${esc(S.bank.bank)}</b><br><span class="mute">${esc(S.bank.acct)} · ${esc(S.bank.name)}</span></p>` : `<p class="mute">Add the bank account your earnings go to.</p>`}<button class="btn btn--line btn--sm" data-act="bank">${S.bank ? "Change account" : "Add bank account"}</button><p class="mute" style="font-size:13px;margin:0">Withdrawals are paid by AiMove operations, usually within 1 working day.</p></section></aside></div>`,
    };
  };

  // ------------------------------------------------------------ operations views
  V.ops = () => {
    const P = S.packages;
    const riders = S.riders;
    const online = riders.filter((r) => r.online);
    return {
      title: "Operations",
      html: `<div class="stack">
      <div class="kpis">${[
        ["Packages", P.length],
        ["Active", P.filter((p) => ACTIVE.includes(p.status)).length],
        ["Delivered", P.filter((p) => p.status === "DELIVERED").length],
        ["AiMove earnings", naira(S.kpi.earned)],
        ["Held in escrow", naira(S.kpi.held)],
        ["Riders online", `${online.length} / ${riders.length}`],
      ]
        .map(([k, v]) => `<div class="card kpi"><small>${k}</small><b>${v}</b></div>`)
        .join("")}</div>
      ${S.pending.length ? `<a class="card row" href="#/ops/money" style="background:#fff7ed"><span class="ava ava--o">${ic("wallet")}</span><div class="grow"><b>${S.pending.length} waiting for you</b><br><small class="mute">Top-ups to confirm and payouts to send</small></div>${ic("chev-right")}</a>` : ""}
      ${MAPS.key ? `<section class="card stack"><h2 class="h" style="margin:0">Rider fleet · live map</h2><div class="map map--g"><div class="gmap" data-fleet role="img" aria-label="Map of riders sharing their location"></div></div></section>` : ""}
      <section class="card tbl"><div class="row row--sb wrap" style="padding:8px 0"><h2 class="h" style="margin:0">Shipments</h2><button class="btn btn--ghost btn--sm" data-act="print">${ic("download")}Print report</button></div><table><thead><tr><th>Tracking</th><th>Customer</th><th>Route</th><th>Fare</th><th>Status</th><th>Rider</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>
        ${
          P.map(
            (
              p,
            ) => `<tr><td class="mono"><a class="link" href="#/track/${p.id}">${esc(p.tracking)}</a></td><td>${esc(p.byName)}</td><td>${esc(p.origin.addr.split(",")[0])} → ${esc(p.dest.addr.split(",")[0])}</td><td>${naira(p.fare.total)}</td><td>${chip(p.status)}</td>
          <td><select data-act="assign" data-id="${p.id}" aria-label="Assign rider for ${esc(p.tracking)}" ${["SCHEDULED", "REQUESTED", "ASSIGNED"].includes(p.status) ? "" : "disabled"}><option value="">Unassigned</option>${riders.map((r) => `<option value="${r.id}" ${p.rider === r.id ? "selected" : ""}>${esc(r.name)}${r.online ? " ●" : ""}</option>`).join("")}${p.riderInfo && !riders.some((r) => r.id === p.rider) ? `<option selected>${esc(p.riderInfo.name)}</option>` : ""}</select></td>
          <td>${p.status === "SCHEDULED" ? `<button class="btn btn--ghost btn--sm" data-act="release" data-id="${p.id}">Release now</button>` : ""}${["SCHEDULED", "REQUESTED", "ASSIGNED"].includes(p.status) ? `<button class="btn btn--ghost btn--sm" data-act="cancel" data-id="${p.id}">Cancel &amp; refund</button>` : p.status === "IN_TRANSIT" ? `<small class="mute">Awaiting PIN</small>` : ""}</td></tr>`,
          ).join("") || `<tr><td colspan="7" class="mute">No shipments yet.</td></tr>`
        }</tbody></table></section>
      <section class="card tbl"><h2 class="h" style="padding-top:8px">Rider fleet</h2><table><thead><tr><th>Rider</th><th>Vehicle</th><th>Plate</th><th>Rating</th><th>Trips</th><th>Status</th><th>Location</th></tr></thead><tbody>
        ${
          riders
            .map(
              (r) =>
                `<tr><td><b>${esc(r.name)}</b><br><small class="mute">${esc(r.phone || "")}</small></td><td>${esc(r.vehicle)}</td><td class="mono">${esc(r.plate)}</td><td>${r.rating}</td><td>${r.trips}</td><td>${r.online ? `<span class="st st--DELIVERED">Online</span>` : `<span class="st st--CANCELLED">Offline</span>`}</td><td>${r.loc ? `<a class="link" href="${esc(gmapsLink({ lat: r.loc[0], lng: r.loc[1] }))}" target="_blank" rel="noopener">Open map</a><br><small class="mute">${esc(fmtTime(r.loc[2]))}</small>` : `<small class="mute">Not shared</small>`}</td></tr>`,
            )
            .join("") ||
          `<tr><td colspan="7" class="mute">No approved riders yet. Approve rider applications in the admin console.</td></tr>`
        }</tbody></table></section></div>`,
      after: () => {
        const el = $("[data-fleet]");
        if (el) drawMap(el, null, S.riders);
      },
    };
  };
  V.money = () => {
    const tops = S.pending.filter((t) => t.kind === "topup");
    const pays = S.pending.filter((t) => t.kind === "payout");
    const c = S.collect;
    const row = (t, label) =>
      `<li><span class="ava ava--soft">${ic(t.kind === "topup" ? "plus" : "bank")}</span><div class="grow"><b>${esc(t.who)} · ${naira(Math.abs(t.amt))}</b><small>${esc(t.email)} · ${esc(fmtDay(t.at))}<br>${
        t.kind === "topup"
          ? `Paid from ${esc(t.meta.sender || "")} (${esc(t.meta.bank || "")})`
          : `Send to ${esc(t.meta.bank || "")} ${esc(t.meta.acct || "")} · ${esc(t.meta.name || "")}`
      }</small></div><button class="btn btn--sm" data-act="review" data-id="${esc(t.id)}" data-d="confirm">${label}</button><button class="btn btn--ghost btn--sm" data-act="review" data-id="${esc(t.id)}" data-d="reject">${t.kind === "topup" ? "Not received" : "Return"}</button></li>`;
    return {
      title: "Top-ups & payouts",
      back: "#/ops",
      html: `<div class="cols"><div class="stack">
      <section class="card stack"><h2 class="h" style="margin:0">Wallet top-ups to confirm</h2><p class="mute" style="margin:0;font-size:13px">Check the ${esc(c.bank_name)} account ${esc(c.account_number)} for each transfer before confirming. Confirming adds the money to the customer's wallet.</p>
        ${tops.length ? `<ul class="list list--wrap">${tops.map((t) => row(t, "Confirm received")).join("")}</ul>` : `<p class="mute">Nothing to confirm.</p>`}</section>
      <section class="card stack"><h2 class="h" style="margin:0">Rider payouts to send</h2><p class="mute" style="margin:0;font-size:13px">Transfer the amount to the rider's account, then mark it paid. "Return" puts the money back in their earnings.</p>
        ${pays.length ? `<ul class="list list--wrap">${pays.map((t) => row(t, "Mark paid")).join("")}</ul>` : `<p class="mute">No payouts waiting.</p>`}</section></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">How money moves</h2><p class="mute" style="font-size:14px;margin:0">Customers top up by transfer to ${esc(c.account_name)}. Paying for a delivery moves money from their wallet into escrow. When the rider enters the recipient's PIN, ${Math.round(PRICING.CONFIG.riderShare * 100)}% of the delivery fare goes to the rider's earnings and the rest is AiMove's. Riders withdraw their earnings, and you pay them from the same account.</p></section></aside></div>`,
    };
  };

  // ------------------------------------------------------------ modals
  function topup(amt) {
    const c = S.collect;
    modal(`<h2>Fund your wallet</h2><p class="mute">Transfer from your bank app to the account below, then tell us here.</p>
      <dl class="kv"><div><dt>Bank</dt><dd>${esc(c.bank_name)}</dd></div><div><dt>Account name</dt><dd>${esc(c.account_name)}</dd></div><div><dt>Account number</dt><dd><button class="link" type="button" data-act="copy" data-v="${esc(c.account_number)}">${esc(c.account_number)} ${ic("copy")}</button></dd></div></dl>
      <form class="stack" data-form="topup" novalidate><div class="chips">${[1000, 2000, 5000, 10000, 20000].map((v) => `<button type="button" class="chip" data-act="preset" data-v="${v}">${naira(v)}</button>`).join("")}</div>
      <label class="field"><span>Amount you transferred (₦)</span><input class="inp" name="amt" type="number" min="100" step="1" inputmode="numeric" value="${amt ? Math.ceil(amt) : ""}" required></label>
      <div class="grid2"><label class="field"><span>Name on your account</span><input class="inp" name="sender" value="${esc(S.user.name)}" required></label><label class="field"><span>Your bank</span><select class="inp" name="bank"><option value="">Choose…</option>${BANKS.map((b) => `<option>${b}</option>`).join("")}</select></label></div>
      <p class="mute" style="font-size:13px">Your balance updates as soon as AiMove confirms the transfer.</p>
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">I've sent the money</button></div></form>`);
  }
  function rateModal(id) {
    const p = pkgById(id);
    const r = riderOf(p) || { name: "your rider" };
    modal(`<h2 class="center">Rate your rider</h2><p class="mute center">Delivery completed · ${esc(p.tracking)}</p>
      <div class="riderc" style="justify-content:center"><span class="ava">${initials(r.name)}</span><b>${esc(r.name)}</b></div>
      <form class="stack" data-form="rate" data-id="${id}" novalidate><div class="rate" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((k) => `<button type="button" data-act="star" data-v="${k}" aria-label="${k} star${k > 1 ? "s" : ""}" class="on">${ic("star")}</button>`).join("")}</div><input type="hidden" name="stars" value="5">
      <p class="field"><span>What went well?</span></p><div class="chips">${["On time", "Friendly", "Careful with package", "Good communication"].map((t) => `<button type="button" class="chip" data-act="tag" aria-pressed="false">${t}</button>`).join("")}</div>
      <label class="field"><span>Additional feedback (optional)</span><textarea class="inp" name="note" maxlength="500" placeholder="Write a quick note for the dispatch manager…"></textarea></label>
      <div class="grid2"><button type="button" class="btn btn--ghost" data-close>Not now</button><button class="btn">Submit rating</button></div></form>`);
  }
  function pinModal(id) {
    const p = pkgById(id);
    modal(`<h2>Complete delivery</h2><p class="mute">Ask ${esc(p.dest.name)} for the 4-digit PIN to confirm proof of delivery.</p>
      <form class="stack" data-form="pod" data-id="${id}" novalidate><label class="field"><span>4-digit customer PIN</span><input class="inp" name="pin" inputmode="numeric" maxlength="4" autocomplete="one-time-code" style="font-size:24px;letter-spacing:.4em;text-align:center"></label>
      <p class="err" data-err hidden></p>
      <div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--o">Complete POD</button></div></form>`);
  }
  function bankModal(withdraw) {
    modal(`<h2>${withdraw ? "Earnings payout" : "Payout bank account"}</h2><form class="stack" data-form="${withdraw && S.bank ? "withdraw" : "bank"}" novalidate>
      ${
        withdraw && S.bank
          ? `<p class="mute">Paying to <b>${esc(S.bank.bank)}</b> •••• ${esc(S.bank.acct.slice(-4))}</p><label class="field"><span>Amount (₦)</span><input class="inp" name="amt" type="number" min="100" max="${S.rider.balance}" value="${S.rider.balance}"></label>`
          : `<label class="field"><span>Bank name</span><select class="inp" name="bank">${BANKS.map((b) => `<option ${S.bank && S.bank.bank === b ? "selected" : ""}>${b}</option>`).join("")}</select></label>
           <label class="field"><span>10-digit account number</span><input class="inp" name="acct" inputmode="numeric" maxlength="10" value="${esc(S.bank ? S.bank.acct : "")}" required></label><label class="field"><span>Account holder name</span><input class="inp" name="name" value="${esc(S.bank ? S.bank.name : S.user.name)}" required></label>`
      }
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">${withdraw && S.bank ? "Withdraw" : "Save account"}</button></div></form>`);
  }
  function downloadCsv(name, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast("Statement downloaded");
  }

  // ------------------------------------------------------------ router
  const AUTH = { welcome: A.welcome, start: A.start };
  const ROUTES = [
    [/^\/home$/, V.home, "customer"],
    [/^\/send$/, V.send, "customer"],
    [/^\/review$/, V.review, "customer"],
    [/^\/pay$/, V.pay, "customer"],
    [/^\/done\/(\w+)$/, V.done, "customer"],
    [/^\/track$/, V.track, "customer"],
    [/^\/track\/(\w+)$/, V.trackOne],
    [/^\/riders$/, V.riders, "customer"],
    [/^\/riders\/(\w+)$/, V.rider, "customer"],
    [/^\/wallet$/, V.wallet, "customer"],
    [/^\/chat$/, V.chats],
    [/^\/chat\/(\w+)$/, V.chat],
    [/^\/notifications$/, V.notes],
    [/^\/profile$/, V.profile],
    [/^\/rider$/, V.riderHome, "rider"],
    [/^\/rider\/earnings$/, V.riderEarn, "rider"],
    [/^\/ops$/, V.ops, "admin"],
    [/^\/ops\/money$/, V.money, "admin"],
  ];
  const HOME = { customer: "#/home", rider: "#/rider", admin: "#/ops" };
  let rendering = 0;
  async function render() {
    document.body.classList.toggle("dark", !!S.prefs.dark);
    closeModal();
    clearInterval(liveTimer);
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const q = new URLSearchParams(qs || "");
    const key = path.replace(/^\//, "");
    if (["login", "signup", "signup2", "forgot", "otp", "reset"].includes(key)) {
      location.href =
        key === "signup"
          ? RH.url("account/register.html?product=aimove&role=" + (q.get("role") === "rider" ? "rider" : "customer"))
          : key === "forgot"
            ? RH.url("account/forgot.html")
            : RH.loginUrl(location.pathname);
      return;
    }
    if (AUTH[key]) {
      if (S.session) return go(HOME[role()]);
      view().innerHTML = AUTH[key](q);
      document.title = "AiMove";
      return;
    }
    if (!S.session) {
      try {
        sessionStorage.setItem("am-after", "#" + raw);
      } catch (e) {}
      return go(local.get("am-seen-intro", false) ? "#/start" : "#/welcome");
    }
    const m = ROUTES.map(([re, fn, r]) => [path.match(re), fn, r]).find((x) => x[0]);
    if (!m) return go(HOME[role()]);
    if (m[2] && m[2] !== role()) return go(HOME[role()]);
    const ticket = ++rendering;
    let v;
    try {
      v = await m[1](q, m[0][1]);
    } catch (e) {
      v = {
        title: "Something went wrong",
        html: `<section class="card empty"><b>${esc(e.message)}</b><a class="btn btn--sm" href="">Try again</a></section>`,
      };
    }
    if (!v || ticket !== rendering) return;
    view().innerHTML = shell("#" + path, v);
    document.title = `${v.title.replace(/&amp;/g, "&")} | AiMove`;
    if (path === "/send") quote($("[data-form=send]"));
    if (v.after) v.after();
    if (render.last !== path) {
      const h1 = $(".top h1");
      if (h1 && render.last) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    }
    render.last = path;
  }
  // Every page change reloads the data from the server, so the screen is never out of date.
  window.addEventListener("hashchange", async () => {
    if (S.session && !/^#\/(welcome|start)/.test(location.hash) && !/^#\/(send|review|pay)/.test(location.hash)) {
      try {
        await sync();
      } catch (e) {
        if (e.code === "not_signed_in") return (location.href = RH.loginUrl(location.pathname + location.hash));
      }
    }
    render();
  });

  // ------------------------------------------------------------ events
  const err = (form, msg) => {
    const e = $("[data-err]", form);
    if (e) {
      e.textContent = msg;
      e.hidden = !msg;
    }
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act,
      id = b.dataset.id;
    if (["role", "pref", "online", "assign", "tile-search", "rider-search", "tx-search"].includes(a)) return;
    if (a === "skip") {
      local.set("am-seen-intro", true);
      go("#/start");
    }
    if (a === "copy") {
      (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.v) : Promise.reject()).then(
        () => toast("Copied"),
        () => toast(b.dataset.v),
      );
    }
    if (a === "hide-bal") {
      S.hideBal = !S.hideBal;
      local.set("am-hide-bal", S.hideBal);
      render();
    }
    if (a === "topup") topup(+b.dataset.amt || 0);
    if (a === "card-soon") toast("Card top-ups are coming soon. Please use bank transfer for now.");
    if (a === "preset") {
      const i = $("[name=amt]", b.closest("form"));
      i.value = b.dataset.v;
      i.focus();
    }
    if (a === "csv")
      downloadCsv(
        "aimove-transactions.csv",
        role() === "rider"
          ? [
              ["Date", "Title", "Reference", "Status", "Amount (NGN)"],
              ...S.rider.payouts.map((t) => [fmtDate(t.at), t.title, t.sub, t.status, t.amt]),
            ]
          : [
              ["Date", "Title", "Reference", "Status", "Amount (NGN)"],
              ...S.tx.map((t) => [fmtDate(t.at), t.title, t.sub, t.status, t.amt]),
            ],
      );
    if (a === "csv-pkg")
      downloadCsv("aimove-deliveries.csv", [
        ["Date", "Tracking", "Items", "From", "To", "Distance (km)", "Status", "Fare (NGN)"],
        ...mine().map((p) => [
          fmtDate(p.created),
          p.tracking,
          p.items,
          p.origin.addr,
          p.dest.addr,
          p.km,
          LABEL[p.status],
          p.fare.total,
        ]),
      ]);
    if (a === "panel") {
      const open = b.getAttribute("aria-expanded") === "true";
      go("#/profile" + (open ? "" : "?open=" + b.dataset.p));
    }
    if (a === "logout") RH.logout(RH.url("account/login.html"));
    if (a === "clear-rider") {
      if (S.draft) S.draft.rider = "";
    }
    if (a === "rate") rateModal(id);
    if (a === "star") {
      const v = +b.dataset.v;
      $$("[data-act=star]", b.parentElement).forEach((x) => x.classList.toggle("on", +x.dataset.v <= v));
      b.closest("form").elements.stars.value = v;
    }
    if (a === "tag") b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    if (a === "cancel") {
      if (!confirm("Cancel this delivery? The payment held in escrow goes back to the customer's wallet.")) return;
      act(api("aimove/delivery", { id: +id, action: "cancel" }));
    }
    if (a === "release") act(api("aimove/delivery", { id: +id, action: "release" }));
    if (a === "accept") act(api("aimove/delivery", { id: +id, action: "accept" }));
    if (a === "rider-step") {
      if (b.dataset.next === "POD") pinModal(id);
      else act(api("aimove/delivery", { id: +id, action: b.dataset.next }));
    }
    if (a === "review") {
      const confirmIt = b.dataset.d === "confirm";
      if (
        !confirm(
          confirmIt
            ? "Confirm this? Make sure the money has really moved."
            : "Mark as not received / return the payout?",
        )
      )
        return;
      act(api("aimove/review", { id: b.dataset.id, decision: b.dataset.d }));
    }
    if (a === "withdraw") bankModal(true);
    if (a === "bank") bankModal(false);
    if (a === "print") window.print();
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    const a = t.dataset.act;
    if (a === "role" && MYROLES.includes(t.value)) {
      S.session = { role: t.value };
      local.set("am-role:" + ACCOUNT.id, t.value);
      sync()
        .catch(() => {})
        .then(() => go(HOME[t.value]));
    }
    if (a === "pref") {
      S.prefs[t.dataset.k] = t.checked;
      document.body.classList.toggle("dark", !!S.prefs.dark);
      local.set("am-dark", !!S.prefs.dark);
      api("aimove/profile", { prefs: { [t.dataset.k]: t.checked } }).then(
        () => (location_.update(), toast("Saved")),
        (x) => toast(x.message),
      );
    }
    if (a === "online")
      act(api("aimove/online", { online: t.checked }), t.checked ? "You're online" : "You're offline");
    if (a === "assign") act(api("aimove/delivery", { id: +t.dataset.id, action: "assign", rider_id: +t.value || 0 }));
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains("bad") && t.value.trim()) t.classList.remove("bad");
    if (t.dataset && t.dataset.place) {
      const f = t.form;
      f.elements[t.dataset.place + "Lat"].value = "";
      f.elements[t.dataset.place + "Lng"].value = "";
      if (MAPS.key) {
        clearTimeout(AC.timer);
        AC.timer = setTimeout(() => suggest(t), 300);
      }
    }
    const f = t.closest("[data-form=send]");
    if (f) quote(f);
    const a = t.dataset.act;
    const v = (t.value || "").toLowerCase().trim();
    if (a === "tile-search")
      $$("[data-tiles] .tile").forEach((x) => (x.hidden = v && !x.textContent.toLowerCase().includes(v)));
    if (a === "rider-search") $$("[data-riders] .rcard").forEach((x) => (x.hidden = v && !x.dataset.q.includes(v)));
    if (a === "tx-search")
      $$("[data-tx] li").forEach((x) => (x.hidden = v && !x.textContent.toLowerCase().includes(v)));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      $$(".ac").forEach((x) => x.remove());
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ac-wrap")) $$(".ac").forEach((x) => x.remove());
  });

  // Shows a server error on the form, highlighting the fields it names.
  function formError(f, x, map = {}) {
    err(f, x.message);
    Object.keys(x.fields || {}).forEach((k) => {
      const el = f.elements[map[k] || k];
      if (el && el.classList) el.classList.add("bad");
    });
  }
  async function busy(f, fn) {
    const btn = f.querySelector("button:not([type=button])");
    if (btn) btn.disabled = true;
    try {
      await fn();
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  }
  const FORMS = {
    send(f) {
      const d = readSend(f);
      $$(".inp", f).forEach((x) => x.classList.remove("bad"));
      const need = ["oAddr", "oPhone", "dAddr", "dPhone", "dName", "items", "kg", "worth"].filter(
        (n) => !f.elements[n].value.trim(),
      );
      need.forEach((n) => f.elements[n].classList.add("bad"));
      if (need.length) {
        f.elements[need[0]].focus();
        return err(f, "Please fill in the highlighted fields.");
      }
      if (d.kg <= 0) return err(f, "Enter the package weight.");
      if (d.type === "SCHEDULED" && !d.when) return err(f, "Choose a pickup date.");
      busy(f, async () => {
        try {
          const r = await api("aimove/quote", {
            origin: d.origin,
            dest: d.dest,
            items: d.items,
            kg: d.kg,
            worth: d.worth,
            type: d.type,
            vehicle: d.vehicle,
            when: d.when,
            slot: d.slot,
            rider: +d.rider || 0,
          });
          S.draft = { ...d, qid: r.qid, fare: r.fare, km: r.km, kmSource: r.kmSource, riderOk: r.riderOk };
          go("#/review");
        } catch (x) {
          formError(f, x);
        }
      });
    },
    pay(f) {
      const d = S.draft;
      if (!(f.querySelector("[name=m]:checked") || {}).value)
        return err(f, "Top up your wallet to pay for this delivery.");
      busy(f, async () => {
        try {
          const r = await api("aimove/deliveries", { qid: d.qid });
          S.draft = null;
          await sync();
          go("#/done/" + r.id);
        } catch (x) {
          if (x.code === "quote_expired") {
            S.draft.qid = null;
            toast(x.message);
            return go("#/send");
          }
          err(f, x.message);
        }
      });
    },
    find(f) {
      const v = f.t.value.trim().toUpperCase();
      if (!/^R(-\d{4}){4}$/.test(v)) return err(f, "Tracking numbers look like R-7458-4567-4434-5854.");
      const p = S.packages.find((x) => x.tracking === v && x.by === "me");
      if (!p) return err(f, `We couldn't find ${v} on your account.`);
      go("#/track/" + p.id);
    },
    topup(f) {
      const amt = Math.round(+f.amt.value);
      if (!(amt >= 100)) return err(f, "Enter at least ₦100.");
      if (!f.bank.value) return err(f, "Choose the bank you paid from.");
      busy(f, async () => {
        try {
          const r = await api("aimove/topup", { amount: amt, sender: f.sender.value.trim(), bank: f.bank.value });
          closeModal();
          await sync();
          if (location.hash.includes("topup")) go("#/wallet");
          else render();
          toast(r.message);
        } catch (x) {
          formError(f, x);
        }
      });
    },
    rate(f) {
      busy(f, () =>
        act(
          api("aimove/delivery", {
            id: +f.dataset.id,
            action: "rate",
            stars: +f.stars.value,
            tags: $$("[data-act=tag][aria-pressed=true]", f).map((x) => x.textContent),
            note: f.note.value.trim(),
          }),
        ),
      );
    },
    pod(f) {
      busy(f, async () => {
        try {
          const r = await api("aimove/delivery", { id: +f.dataset.id, action: "deliver", pin: f.pin.value });
          closeModal();
          await sync();
          render();
          toast(r.message);
        } catch (x) {
          err(f, x.message);
        }
      });
    },
    bank(f) {
      if (!/^\d{10}$/.test(f.acct.value)) return err(f, "Account numbers have 10 digits.");
      if (!f.name.value.trim()) return err(f, "Enter the account holder's name.");
      busy(f, () =>
        act(
          api("aimove/profile", { bank_name: f.bank.value, bank_acct: f.acct.value, bank_holder: f.name.value.trim() }),
          "Payout account saved",
        ).then(closeModal),
      );
    },
    withdraw(f) {
      const amt = Math.round(+f.amt.value);
      if (!(amt >= 100) || amt > S.rider.balance)
        return err(f, `Enter an amount between ₦100 and ${naira(S.rider.balance)}.`);
      busy(f, async () => {
        try {
          const r = await api("aimove/payout", { amount: amt });
          closeModal();
          await sync();
          render();
          toast(r.message);
        } catch (x) {
          err(f, x.message);
        }
      });
    },
    msg(f) {
      const t = f.m.value.trim();
      if (!t) return;
      f.m.value = "";
      const box = $("[data-msgs]");
      box.insertAdjacentHTML("beforeend", `<p class="msg msg--me">${esc(t)}<small>${esc(fmtTime(now()))}</small></p>`);
      $$(".mute.center", box).forEach((x) => x.remove());
      box.scrollTop = box.scrollHeight;
      api("aimove/messages", { id: +f.dataset.k, text: t }).catch((x) => toast(x.message));
    },
    profile(f) {
      const v = Object.fromEntries(new FormData(f));
      busy(f, async () => {
        try {
          if (v.name.trim() !== ACCOUNT.full_name || (v.phone || "").trim() !== (ACCOUNT.phone || "")) {
            await api("me/profile", { full_name: v.name.trim(), phone: (v.phone || "").trim() });
            ACCOUNT = (await RH.session(true)).user;
          }
          if ("address" in v) await api("aimove/profile", { address: v.address });
          await sync();
          render();
          toast("Profile updated");
        } catch (x) {
          err(f, x.message);
        }
      });
    },
    biz(f) {
      busy(f, () => act(api("aimove/profile", Object.fromEntries(new FormData(f))), "Business details saved"));
    },
    vehicle(f) {
      busy(f, () => act(api("aimove/profile", Object.fromEntries(new FormData(f))), "Vehicle details saved"));
    },
  };
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-form]");
    if (!f) return;
    e.preventDefault();
    err(f, "");
    FORMS[f.dataset.form](f);
  });

  async function boot() {
    let s;
    try {
      s = await RH.session(true);
    } catch (e) {
      view().innerHTML = authShell(
        `<h1>Can't reach AiMove</h1><p>${esc(e.message)}</p><a class="btn btn--block" href="">Try again</a>`,
      );
      return;
    }
    if (local.get("am-dark", false)) document.body.classList.add("dark");
    ACCOUNT = s.user;
    if (!ACCOUNT) {
      S.session = null;
      return render();
    }
    MYROLES = RH.rolesIn(ACCOUNT, "aimove").filter((r) => ["customer", "rider", "admin"].includes(r));
    if (!MYROLES.length) {
      await RH.guard("aimove", ["customer", "rider"]); // explains pending / not added yet
      return;
    }
    const saved = local.get("am-role:" + ACCOUNT.id, "");
    S.session = { role: MYROLES.includes(saved) ? saved : MYROLES[0] };
    try {
      const cfg = await api("aimove/config");
      MAPS.key = cfg.maps_key || "";
      if (cfg.collect) S.collect = cfg.collect;
      await sync();
    } catch (e) {
      view().innerHTML = authShell(
        `<h1>Can't load AiMove</h1><p>${esc(e.message)}</p><a class="btn btn--block" href="">Try again</a>`,
      );
      return;
    }
    if (MAPS.key) loadMaps();
    let after = null;
    try {
      after = sessionStorage.getItem("am-after");
      sessionStorage.removeItem("am-after");
    } catch (e) {}
    if (after && !/^#\/(welcome|start|login|signup)/.test(after)) return go(after);
    render();
  }
  boot();
})();
