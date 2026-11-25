/* AiMove web app.
   Built from the "upgrade Aimove" Figma screens and the AiMove Android app
   (screens, PricingEngine.kt, statuses, rider dashboard, admin dashboard).
   Sign-in, sign-up, approvals and roles use the shared Rehohub account system (/api, via
   rh-auth.js): the server decides who may use the customer, rider and operations sides.
   Deliveries, wallet and payouts are still saved per account on this device. */
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
    String(n)
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
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const stars = (r) =>
    `<span class="stars" aria-label="${r} out of 5">${[1, 2, 3, 4, 5].map((k) => `<svg class="i ${k <= Math.round(r) ? "" : "off"}" aria-hidden="true"><use href="#i-star"/></svg>`).join("")}</span>`;

  // ------------------------------------------------------------ pricing (PricingEngine.kt)
  const BASE = 800,
    PEAK = 350,
    EXPRESS = 300;
  const TIERS = [
    [5, 120, "light parcel"],
    [20, 160, "medium cargo"],
    [50, 220, "heavy freight"],
    [Infinity, 300, "extra heavy"],
  ];
  const isPeak = (h) => (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
  function fare({ kg, km, type, hour }) {
    const w = kg > 0 ? kg : 5,
      d = km > 0 ? km : 1;
    const [, rate, label] = TIERS.find(([max]) => w <= max);
    const distance = Math.round(d * rate);
    const peak = isPeak(hour) ? PEAK : 0;
    const express = type === "INSTANT" ? EXPRESS : 0;
    return { base: BASE, rate, label, km: d, distance, peak, express, total: BASE + distance + peak + express };
  }
  // No maps service yet: a stable estimate from the two addresses (same state 3–29 km, otherwise 120–800 km).
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

  // Riders from the Figma "Book a Ride" list; vehicles and trip counts other than Chinoso James's are illustrative.
  const RIDERS = [
    {
      id: "r1",
      name: "Chinoso James",
      vehicle: "Honda Accord",
      kind: "Car",
      plate: "R-359-224G",
      gender: "M",
      rating: 4.9,
      trips: 142,
      km: 2.8,
    },
    {
      id: "r2",
      name: "John Joshua",
      vehicle: "TVS Motorcycle",
      kind: "Motorcycle",
      plate: "R-456-223U",
      gender: "M",
      rating: 4.8,
      trips: 96,
      km: 1.6,
    },
    {
      id: "r3",
      name: "Saviour Bill",
      vehicle: "Bajaj Boxer",
      kind: "Motorcycle",
      plate: "R-432-723K",
      gender: "M",
      rating: 4.6,
      trips: 73,
      km: 3.4,
    },
    {
      id: "r4",
      name: "Raph Ron",
      vehicle: "Toyota Hiace",
      kind: "Van",
      plate: "R-890-245N",
      gender: "M",
      rating: 4.7,
      trips: 58,
      km: 5.1,
    },
    {
      id: "r5",
      name: "Joy Ezekiel",
      vehicle: "Suzuki Address",
      kind: "Motorcycle",
      plate: "R-434-221C",
      gender: "F",
      rating: 4.9,
      trips: 121,
      km: 2.2,
    },
    {
      id: "r6",
      name: "Wonder Obi",
      vehicle: "Toyota Corolla",
      kind: "Car",
      plate: "R-345-267V",
      gender: "M",
      rating: 4.5,
      trips: 44,
      km: 4.0,
    },
    {
      id: "r7",
      name: "Amara Chidi",
      vehicle: "Honda Ace",
      kind: "Motorcycle",
      plate: "R-673-651B",
      gender: "F",
      rating: 4.8,
      trips: 87,
      km: 3.1,
    },
    {
      id: "r8",
      name: "Suleman Adebayo",
      vehicle: "Ford Transit",
      kind: "Van",
      plate: "R-556-226U",
      gender: "M",
      rating: 4.6,
      trips: 39,
      km: 6.7,
    },
    {
      id: "r9",
      name: "Musa Francis",
      vehicle: "Bajaj Boxer",
      kind: "Motorcycle",
      plate: "R-486-267X",
      gender: "M",
      rating: 4.4,
      trips: 31,
      km: 4.8,
    },
    {
      id: "r10",
      name: "John Kalu",
      vehicle: "Toyota Camry",
      kind: "Car",
      plate: "R-136-323U",
      gender: "M",
      rating: 4.7,
      trips: 64,
      km: 7.3,
    },
  ];
  const REVIEWS = {
    r1: [
      ["Mrs Bimbo", 4, "Right on time"],
      ["Gentle Jack", 5, "Calls with update on location"],
    ],
  };
  const ME_RIDER = {
    id: "me",
    name: "Alex Rider",
    vehicle: "Honda Ace",
    kind: "Motorcycle",
    plate: "R-210-118K",
    gender: "M",
    rating: 4.9,
    trips: 214,
    km: 0,
  };
  const riderById = (id) => (id === "me" ? ME_RIDER : RIDERS.find((r) => r.id === id));

  const H = 3600e3,
    DAY = 24 * H;
  function mkPkg(o) {
    const f = fare({ kg: o.kg, km: o.km, type: o.type, hour: new Date(o.at).getHours() });
    return {
      id: o.id,
      tracking: o.tracking,
      items: o.items,
      kg: o.kg,
      worth: o.worth,
      km: o.km,
      type: o.type,
      slot: o.slot || "",
      when: o.when || null,
      origin: o.origin,
      dest: o.dest,
      fare: f,
      status: o.status,
      rider: o.rider || null,
      pin: o.pin,
      by: o.by || "me",
      byName: o.byName || "Ken Nwaeze",
      paid: o.paid || "wallet",
      history: o.history,
      rating: o.rating || null,
      created: o.at,
    };
  }
  function seed() {
    const t = now();
    const packages = [
      mkPkg({
        id: "p1",
        tracking: "R-7458-4567-4434-5854",
        items: "Books and stationery, garri",
        kg: 10,
        worth: 25000,
        km: 14.5,
        type: "INSTANT",
        at: t - 2.6 * H,
        origin: { addr: "12 Admiralty Way, Lekki Phase 1", state: "Lagos", phone: "+234 707 644 8065", note: "" },
        dest: {
          addr: "19 Ademola Alabi Close, Surulere",
          state: "Lagos",
          phone: "+234 803 112 4570",
          name: "Ngozi Eze",
          note: "",
        },
        status: "IN_TRANSIT",
        rider: "r1",
        pin: "4821",
        history: [
          ["REQUESTED", t - 2.6 * H],
          ["ASSIGNED", t - 2.5 * H],
          ["PICKED_UP", t - 2.1 * H],
          ["IN_TRANSIT", t - 0.4 * H],
        ],
      }),
      mkPkg({
        id: "p2",
        tracking: "R-6120-3391-8805-1147",
        items: "Phone accessories",
        kg: 2,
        worth: 18000,
        km: 8.2,
        type: "SAME_DAY",
        at: t - 6 * DAY,
        origin: { addr: "Computer Village, Ikeja", state: "Lagos", phone: "+234 707 644 8065", note: "" },
        dest: {
          addr: "34 Herbert Macaulay Way, Yaba",
          state: "Lagos",
          phone: "+234 802 555 0192",
          name: "Tobi Adeyemi",
          note: "",
        },
        status: "DELIVERED",
        rider: "r2",
        pin: "3307",
        rating: { stars: 5, tags: ["On time"], note: "" },
        history: [
          ["REQUESTED", t - 6 * DAY],
          ["ASSIGNED", t - 6 * DAY + 0.2 * H],
          ["PICKED_UP", t - 6 * DAY + 0.7 * H],
          ["IN_TRANSIT", t - 6 * DAY + H],
          ["DELIVERED", t - 6 * DAY + 2 * H],
        ],
      }),
      mkPkg({
        id: "p3",
        tracking: "R-2289-7714-0036-5520",
        items: "Event flyers and banners",
        kg: 5,
        worth: 40000,
        km: 11,
        type: "SCHEDULED",
        at: t - 3 * H,
        when: new Date(t + DAY).toISOString().slice(0, 10),
        slot: SLOTS[1],
        origin: { addr: "Print House, 5 Akoka Road, Yaba", state: "Lagos", phone: "+234 707 644 8065", note: "" },
        dest: {
          addr: "Eko Hotel, Adetokunbo Ademola St, Victoria Island",
          state: "Lagos",
          phone: "+234 809 400 2210",
          name: "Events desk",
          note: "",
        },
        status: "SCHEDULED",
        pin: "9154",
        history: [["SCHEDULED", t - 3 * H]],
      }),
      mkPkg({
        id: "p4",
        tracking: "R-3011-5582-7409-2236",
        items: "Food delivery",
        kg: 1,
        worth: 9500,
        km: 4.3,
        type: "INSTANT",
        at: t - 0.2 * H,
        by: "other",
        byName: "Funke's Kitchen",
        origin: { addr: "Admiralty Road, Lekki Phase 1", state: "Lagos", phone: "+234 816 220 1180", note: "" },
        dest: { addr: "Ikate Elegushi, Lekki", state: "Lagos", phone: "+234 813 777 4002", name: "Seyi", note: "" },
        status: "REQUESTED",
        pin: "6610",
        history: [["REQUESTED", t - 0.2 * H]],
      }),
      mkPkg({
        id: "p5",
        tracking: "R-8840-1203-6657-3398",
        items: "Signed documents",
        kg: 1,
        worth: 0,
        km: 18,
        type: "SAME_DAY",
        at: t - 0.5 * H,
        by: "other",
        byName: "Kora Partners",
        origin: { addr: "Allen Avenue, Ikeja", state: "Lagos", phone: "+234 701 300 9921", note: "" },
        dest: {
          addr: "Broad Street, Lagos Island",
          state: "Lagos",
          phone: "+234 703 881 2290",
          name: "Legal desk",
          note: "",
        },
        status: "REQUESTED",
        pin: "2275",
        history: [["REQUESTED", t - 0.5 * H]],
      }),
      mkPkg({
        id: "p6",
        tracking: "R-5562-9071-3318-4405",
        items: "Spare parts",
        kg: 35,
        worth: 120000,
        km: 9,
        type: "SAME_DAY",
        at: t - 0.8 * H,
        by: "other",
        byName: "Apapa Motors",
        origin: { addr: "Creek Road, Apapa", state: "Lagos", phone: "+234 805 410 6633", note: "" },
        dest: { addr: "23 Road, Festac Town", state: "Lagos", phone: "+234 806 922 7741", name: "Musa", note: "" },
        status: "REQUESTED",
        pin: "8043",
        history: [["REQUESTED", t - 0.8 * H]],
      }),
    ];
    return {
      v: 1,
      session: null,
      user: {
        name: "Ken Nwaeze",
        email: "ken.nwaeze@example.com",
        phone: "+234 707 644 8065",
        address: "12 Admiralty Way, Lekki Phase 1, Lagos",
        business: "Nwaeze Stores",
        rc: "RC 1840562",
        vehicle: "Motorcycle",
        plate: "R-210-118K",
        licence: "LAG-28311-AA",
      },
      wallet: 18712,
      hideBal: false,
      cards: [{ id: "c1", brand: "Visa", type: "Debit", last4: "3323", exp: "08/28", def: true }],
      bank: null,
      tx: [
        {
          id: "t1",
          title: "Delivery fee",
          sub: "R-7458-4567-4434-5854",
          amt: -packages[0].fare.total,
          at: t - 2.6 * H,
        },
        { id: "t2", title: "Top up", sub: "Card •••• 3323", amt: 10000, at: t - 3 * DAY },
        {
          id: "t3",
          title: "Delivery fee",
          sub: "R-6120-3391-8805-1147",
          amt: -packages[1].fare.total,
          at: t - 6 * DAY,
        },
        { id: "t4", title: "Top up", sub: "Bank transfer", amt: 5000, at: t - 8 * DAY },
        { id: "t5", title: "Delivery fee", sub: "Same-day delivery", amt: -4000, at: t - 12 * DAY },
        { id: "t6", title: "Refund", sub: "Overcharge dispute #REF-88", amt: 1500, at: t - 15 * DAY },
      ],
      packages,
      rider: { online: true, balance: 24800, today: 14, acceptance: 96, payouts: [] },
      notes: [
        {
          id: "n1",
          t: "Your package is in transit",
          s: "Chinoso James is on the way to Surulere.",
          at: t - 0.4 * H,
          read: false,
          link: "#/track/p1",
        },
        {
          id: "n2",
          t: "Pickup scheduled for tomorrow",
          s: "Event flyers and banners, " + SLOTS[1] + ".",
          at: t - 3 * H,
          read: false,
          link: "#/track/p3",
        },
        {
          id: "n3",
          t: "Top-up successful",
          s: "₦10,000 was added to your wallet.",
          at: t - 3 * DAY,
          read: true,
          link: "#/wallet",
        },
        {
          id: "n4",
          t: "Love & Resolution Offer",
          s: "20% off dispatch this week.",
          at: t - 4 * DAY,
          read: true,
          link: "#/home",
        },
      ],
      chats: {
        support: [
          ["in", "Hello, how can I be of assistance today?", t - DAY],
          ["out", "Hi, my name is Chisom. I need to clarify a payment dispute.", t - DAY + 60e3],
          ["in", "Alright, kindly upload your ID and the tracking number.", t - DAY + 120e3],
        ],
        r1: [
          ["out", "Hello, please check your phone, I just booked you to deliver my stuff.", t - 2.5 * H],
          ["in", "Alright, I will be waiting.", t - 2.5 * H + 60e3],
          ["in", "Thank you for contacting me. I am already on my way to the pickup venue.", t - 2.4 * H],
        ],
      },
      prefs: { orders: true, promos: true, messages: true, location: true, dark: false, bio: false },
      logs: [
        {
          m: "POST",
          e: "/api/v1/deliveries/create",
          c: 201,
          p: '{"tracking":"R-7458-4567-4434-5854","weight":10}',
          r: '{"status":"CREATED","id":"p1"}',
          at: t - 2.6 * H,
        },
        {
          m: "GET",
          e: "/api/v1/deliveries/R-7458-4567-4434-5854/track",
          c: 200,
          p: "{}",
          r: '{"status":"IN_TRANSIT","eta":"12 mins"}',
          at: t - 0.3 * H,
        },
        {
          m: "POST",
          e: "/api/v1/webhooks/status_update",
          c: 200,
          p: '{"id":"p1","status":"IN_TRANSIT"}',
          r: '{"status":"ACKNOWLEDGED"}',
          at: t - 0.4 * H,
        },
      ],
      draft: null,
    };
  }
  // Saved per account on this device until AiMove bookings are connected to the server.
  const KEY = "aimove-app-v1";
  let STORE = KEY;
  let S = seed();
  let ACCOUNT = null; // the signed-in Rehohub account (from the server)
  let MYROLES = []; // AiMove roles the server has approved for this account
  function loadFor(account) {
    STORE = KEY + ":" + account.id;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE));
    } catch (e) {}
    if (saved && saved.v === 1) {
      S = saved;
      return;
    }
    // A new account starts with an empty wallet and no deliveries of its own.
    S = seed();
    S.packages = S.packages.filter((p) => p.by !== "me");
    S.wallet = 0;
    S.tx = [];
    S.cards = [];
    S.bank = null;
    S.rider = { online: false, balance: 0, today: 0, acceptance: 100, payouts: [] };
    S.notes = [];
    S.user = { ...S.user, business: "", rc: "", address: "", vehicle: "", plate: "", licence: "" };
  }
  const save = () => {
    if (!ACCOUNT) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(S));
    } catch (e) {}
  };
  const pkgById = (id) => S.packages.find((p) => p.id === id);
  const mine = () => S.packages.filter((p) => p.by === "me");
  const newTracking = () => "R-" + [0, 0, 0, 0].map(() => rnd(1000, 9999)).join("-");
  function log(m, e, c, p, r) {
    S.logs.unshift({ m, e, c, p, r, at: now() });
    S.logs = S.logs.slice(0, 40);
  }
  function note(t, s, link) {
    S.notes.unshift({ id: "n" + now(), t, s, at: now(), read: false, link });
  }
  function setStatus(p, st) {
    p.status = st;
    p.history.push([st, now()]);
    log(
      "POST",
      "/api/v1/webhooks/status_update",
      200,
      JSON.stringify({ id: p.id, status: st }),
      '{"status":"ACKNOWLEDGED"}',
    );
    if (p.by === "me") note(`Package ${LABEL[st].toLowerCase()}`, `${p.items} · ${p.tracking}`, "#/track/" + p.id);
    if (st === "DELIVERED" && p.rider === "me") {
      S.rider.balance += p.fare.total;
      S.rider.today += 1;
      ME_RIDER.trips += 1;
    }
  }

  // ------------------------------------------------------------ UI primitives
  const view = () => $("#app");
  function toast(msg) {
    const t = $(".toast");
    t.querySelector("span").textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("on"), 2800);
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

  function mapSvg(p) {
    const at = MAPAT[p.status] ?? 50;
    const moving = ["ASSIGNED", "IN_TRANSIT"].includes(p.status);
    const eta = p.status === "IN_TRANSIT" ? Math.max(3, Math.round(p.km * 0.9)) : p.status === "ASSIGNED" ? 8 : null;
    return `<div class="map">
      <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-label="Map showing the rider's route from pickup to drop-off">
        <g class="roads" fill="none" stroke-width="9"><path d="M-10 60 L410 90"/><path d="M-10 170 L410 150"/><path d="M90 -10 L120 240"/><path d="M250 -10 L230 240"/><path d="M330 -10 L360 240"/></g>
        <g class="roads" fill="none" stroke-width="3"><path d="M-10 120 L410 118"/><path d="M170 -10 L180 240"/><path d="M40 -10 L55 240"/><path d="M-10 205 L410 195"/></g>
        <path class="route" d="M60 150 C120 120 130 70 200 64 S300 40 340 30" fill="none" stroke="#0256FF" stroke-width="4" stroke-linecap="round"/>
        <circle cx="60" cy="150" r="9" fill="#0256FF"/><circle cx="60" cy="150" r="4" fill="#fff"/>
        <path d="M340 14c-7 0-11 5-11 10 0 8 11 17 11 17s11-9 11-17c0-5-4-10-11-10z" fill="#FF6B1A"/><circle cx="340" cy="24" r="4" fill="#fff"/>
        ${p.status === "DELIVERED" || p.status === "SCHEDULED" || p.status === "CANCELLED" ? "" : `<g class="rider ${moving ? "moving" : ""}" style="--at:${at}%"><circle r="11" fill="#fff"/><circle r="8" fill="#FF6B1A"/></g>`}
      </svg>
      <span class="map__live">● ${p.status === "DELIVERED" ? "DELIVERED" : "LIVE"}</span>
      ${eta ? `<div class="map__eta"><small>Estimated arrival</small><b>${eta} mins away</b></div>` : ""}
    </div>`;
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
    )}${p.status === "CANCELLED" ? `<li class="done"><b>Cancelled</b><small>Refunded to your wallet</small></li>` : ""}</ol>`;
  }
  function charges(f, extra = "") {
    return `<dl class="kv">
      <div><dt>Base booking fee</dt><dd>${naira(f.base)}</dd></div>
      <div><dt>Distance (${f.km} km × ${naira(f.rate)}/km, ${f.label})</dt><dd>${naira(f.distance)}</dd></div>
      <div><dt>Peak-hour surge</dt><dd>${naira(f.peak)}</dd></div>
      <div><dt>Instant express</dt><dd>${naira(f.express)}</dd></div>
      <div class="tot"><dt>Package total</dt><dd><b>${naira(f.total)}</b></dd></div>${extra}
    </dl>`;
  }
  function pkgRow(p, href) {
    return `<a class="pkg" href="${href || "#/track/" + p.id}"><span class="pkg__ico">${ic("box")}</span><b>${esc(p.items)}</b>${chip(p.status)}
      <small>${esc(p.tracking)} · ${esc(p.dest.addr)}</small></a>`;
  }

  // ------------------------------------------------------------ auth screens
  const ONB = [
    ["bike", "Quick delivery at your doorstep", "Enjoy quick pick-up and delivery to your destination."],
    [
      "wallet",
      "Flexible payment",
      "Different modes of payment, from your wallet or card, with the price shown before you book.",
    ],
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
          <ul class="auth__points"><li>${ic("bike")}Instant, same-day and scheduled delivery</li><li>${ic("shield")}Verified riders and PIN-confirmed drop-off</li><li>${ic("wallet")}Wallet, card or bank transfer</li></ul></div>
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
      ["#/profile", "user", "Profile"],
    ],
    admin: [
      ["#/ops", "chart", "Operations"],
      ["#/ops/api", "code", "API & webhooks"],
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
      ["#/ops/api", "code", "API"],
      ["#/profile", "user", "Profile"],
    ],
  };
  const role = () => (S.session && S.session.role) || "customer";
  const ROLE_NAME = { customer: "Business customer", rider: "Rider", admin: "Operations" };
  function shell(path, v) {
    const r = role();
    const unread = S.notes.filter((n) => !n.read).length;
    const activeN = mine().filter((p) => ACTIVE.includes(p.status)).length;
    const cur = (h) =>
      path === h || (h !== "#/home" && h !== "#/rider" && h !== "#/ops" && path.startsWith(h + "/"))
        ? ' aria-current="page"'
        : "";
    const who = ACCOUNT ? ACCOUNT.full_name : S.user.name;
    const nav = NAV[r]
      .map(
        ([h, i, t]) =>
          `<li><a href="${h}"${cur(h)}>${ic(i)}<span>${t}</span>${h === "#/notifications" && unread ? `<span class="n">${unread}</span>` : h === "#/track" && activeN ? `<span class="n">${activeN}</span>` : ""}</a></li>`,
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
              ? `<label class="rolebox"><small>Your roles</small><select class="inp" data-act="role" aria-label="Switch between your roles">${MYROLES.map(
                  (k) => `<option value="${k}" ${k === r ? "selected" : ""}>${ROLE_NAME[k]}</option>`,
                ).join("")}</select></label>`
              : ""
          }
          <a class="link" href="${esc(RH.url("account/index.html"))}" style="font-size:13px;display:inline-block;margin:6px 4px 10px">My Rehohub account</a>
          <div class="me"><span class="ava ${r === "rider" ? "ava--o" : ""}">${initials(who)}</span><div><b>${esc(who)}</b><small>${ROLE_NAME[r]}</small></div></div>
        </div>
      </aside>
      <main class="main" id="main">
        <div class="top">${v.back ? `<a class="back" href="${v.back}" aria-label="Back">${ic("chev-left")}</a>` : ""}<h1>${v.title}</h1>
          ${r === "customer" ? `<a class="ibtn" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<span class="dot">${unread}</span>` : ""}</a>` : ""}</div>
        <p class="preview-note" style="margin:0 0 16px;padding:10px 14px;border-radius:12px;background:#fff7ed;color:#7c2d12;font-size:13px">Preview: deliveries, wallet and payouts are saved on this device only, and no money moves, until AiMove bookings go live.</p>
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
      ["box", "Send a package", "Request a driver to pick up or deliver your package for you.", "#/send", true],
      ["bike", "Book a rider", "Search for available riders within your area.", "#/riders"],
      ["wallet", "Fund your wallet", "Top up by bank, transfer or card in seconds.", "#/wallet?topup=1"],
      ["calendar", "Schedule a delivery", "Set a date and time slot for an upcoming pickup.", "#/send?type=SCHEDULED"],
      ["headset", "Customer care", "Open 8–9pm weekdays and 9–5 weekends.", "#/chat/support"],
      ["gift", "Refer and earn", "Invite a friend and earn ₦500.", "#/profile?open=refer"],
    ];
    return {
      title: "Home",
      html: `<div class="cols"><div class="stack">
      <div class="hello"><div><h2>Hello ${esc(S.user.name.split(" ")[0])}</h2><p>We trust you are having a great time.</p></div></div>
      <label class="search"><span class="sr-only">Search services</span>${ic("search")}<input class="inp" type="search" placeholder="Search services" data-act="tile-search"></label>
      ${act.length ? `<section class="card"><div class="live"><span class="pulse"></span><div><b>${act.length === 1 ? "Package in transit" : act.length + " active deliveries"}</b><p class="mute">${esc(act[0].rider ? `Your rider (${riderById(act[0].rider).name}) is ${act[0].status === "ASSIGNED" ? "heading to pickup" : "on the way to your destination"}.` : "We're finding a rider near your pickup.")}</p></div><a class="btn btn--sm" href="#/track/${act[0].id}">Track my item</a></div></section>` : ""}
      <section><h2 class="h h--p">What would you like to do</h2><div class="tiles" data-tiles>${tiles.map(([i, t, d, h, on]) => `<a class="tile ${on ? "tile--on" : ""}" href="${h}">${ic(i)}<b>${t}</b><span>${d}</span></a>`).join("")}</div></section>
      <section><h2 class="h h--p">Special for you</h2><div class="promos"><div class="promo promo--o"><small>DISPATCH PROMO</small><b>Love &amp; Resolution Offer</b><em>20% OFF</em></div><div class="promo"><small>EVENT</small><b>Tech Meetup coming soon</b></div></div></section>
    </div>
    <div class="stack">
      <section class="bal"><small>Wallet balance</small><strong>${naira(S.wallet, 2)}</strong><a class="btn btn--sm" href="#/wallet?topup=1">${ic("plus")}Top up</a></section>
      <section class="card"><div class="row row--sb"><h2 class="h">Scheduled deliveries</h2><a class="link" href="#/send?type=SCHEDULED">Schedule</a></div>
        ${sched.length ? sched.map((p) => pkgRow(p)).join("") : `<p class="mute">No scheduled pickups.</p>`}</section>
      <section class="card"><div class="row row--sb"><h2 class="h">Recent activity</h2><a class="link" href="#/wallet">View all</a></div>
        <ul class="list">${S.tx.slice(0, 4).map(txRow).join("")}</ul></section>
    </div></div>`,
    };
  };
  const txRow = (t) =>
    `<li><span class="ava ava--soft">${ic(t.amt < 0 ? "box" : "plus")}</span><div class="grow"><b>${esc(t.title)}</b><small>${esc(fmtDate(t.at))} · ${esc(t.sub)}</small></div><span class="amt ${t.amt < 0 ? "amt--neg" : ""}">${t.amt > 0 ? "+" : ""}${naira(t.amt, 2)}</span></li>`;

  V.send = (q) => {
    const d = S.draft || {};
    const pre = q.get("rider") || d.rider || "";
    const type = q.get("type") || d.type || "INSTANT";
    const o = d.origin || {
      addr: S.user.address.replace(/, Lagos$/, ""),
      state: "Lagos",
      phone: S.user.phone,
      note: "",
    };
    const de = d.dest || { addr: "", state: "Lagos", phone: "", name: "", note: "" };
    const stateSel = (n, v) =>
      `<select class="inp" name="${n}">${STATES.map((s) => `<option ${s === v ? "selected" : ""}>${s}</option>`).join("")}</select>`;
    const tomorrow = new Date(now() + DAY).toISOString().slice(0, 10);
    const r = pre ? riderById(pre) : null;
    return {
      title: "Send a package",
      back: "#/home",
      html: `<form class="cols" data-form="send" novalidate>
      <div class="stack">
        ${r ? `<div class="card card--flat riderc"><span class="ava">${initials(r.name)}</span><div><b>Booking ${esc(r.name)}</b><small>${esc(r.vehicle)} · ${esc(r.plate)}</small></div><a class="link" href="#/send" data-act="clear-rider">Change</a><input type="hidden" name="rider" value="${esc(pre)}"></div>` : ""}
        <section class="card stack"><h2 class="h row">${ic("target")}Origin details</h2>
          <label class="field"><span>Pickup address</span><input class="inp" name="oAddr" value="${esc(o.addr)}" required></label>
          <div class="grid2"><label class="field"><span>State</span>${stateSel("oState", o.state)}</label><label class="field"><span>Phone number</span><input class="inp" name="oPhone" type="tel" value="${esc(o.phone)}" required></label></div>
          <label class="field"><span>Other details (optional)</span><input class="inp" name="oNote" value="${esc(o.note)}" placeholder="Landmark, gate code…"></label></section>
        <section class="card stack"><h2 class="h row">${ic("pin")}Destination details</h2>
          <label class="field"><span>Drop-off address</span><input class="inp" name="dAddr" value="${esc(de.addr)}" required></label>
          <div class="grid2"><label class="field"><span>State</span>${stateSel("dState", de.state)}</label><label class="field"><span>Recipient phone</span><input class="inp" name="dPhone" type="tel" value="${esc(de.phone)}" required></label></div>
          <label class="field"><span>Recipient name</span><input class="inp" name="dName" value="${esc(de.name)}" required></label></section>
        <section class="card stack"><h2 class="h row">${ic("box")}Package details</h2>
          <label class="field"><span>Package items</span><input class="inp" name="items" value="${esc(d.items || "")}" placeholder="e.g. Books and stationery" required></label>
          <div class="grid2"><label class="field"><span>Weight of items (kg)</span><input class="inp" name="kg" type="number" min="0.1" step="0.1" value="${esc(d.kg || "")}" required></label>
          <label class="field"><span>Worth of items (₦)</span><input class="inp" name="worth" type="number" min="0" step="100" value="${esc(d.worth ?? "")}" required></label></div></section>
        <section class="card stack"><h2 class="h">Select delivery type</h2>
          <div class="seg" role="radiogroup" aria-label="Delivery type">
            <label><input type="radio" name="type" value="INSTANT" ${type === "INSTANT" ? "checked" : ""}><span>${ic("clock")}Instant<small>+₦300 express</small></span></label>
            <label><input type="radio" name="type" value="SAME_DAY" ${type === "SAME_DAY" ? "checked" : ""}><span>${ic("bike")}Same-day<small>Standard rate</small></span></label>
            <label><input type="radio" name="type" value="SCHEDULED" ${type === "SCHEDULED" ? "checked" : ""}><span>${ic("calendar")}Scheduled<small>Pick a slot</small></span></label></div>
          <div class="grid2" data-when ${type === "SCHEDULED" ? "" : "hidden"}><label class="field"><span>Pickup date</span><input class="inp" type="date" name="when" min="${tomorrow}" value="${esc(d.when || tomorrow)}"></label>
            <label class="field"><span>Time slot</span><select class="inp" name="slot">${SLOTS.map((s) => `<option ${s === d.slot ? "selected" : ""}>${s}</option>`).join("")}</select></label></div></section>
      </div>
      <aside class="stack" style="position:sticky;top:20px">
        <section class="card stack" aria-live="polite"><div class="row row--sb"><h2 class="h" style="margin:0">Automated upfront fare</h2><span class="guar">${ic("shield")}Guaranteed</span></div><div data-quote></div></section>
        <p class="err" data-err hidden></p>
        <button class="btn btn--block">Calculate &amp; review ${ic("chev-right")}</button>
      </aside></form>`,
    };
  };
  function readSend(f) {
    const v = (n) => (f.elements[n] ? f.elements[n].value.trim() : "");
    const d = {
      rider: v("rider"),
      type: f.querySelector("[name=type]:checked").value,
      when: v("when"),
      slot: v("slot"),
      origin: { addr: v("oAddr"), state: v("oState"), phone: v("oPhone"), note: v("oNote") },
      dest: { addr: v("dAddr"), state: v("dState"), phone: v("dPhone"), name: v("dName"), note: "" },
      items: v("items"),
      kg: parseFloat(v("kg")) || 0,
      worth: parseFloat(v("worth")) || 0,
    };
    d.km = d.origin.addr && d.dest.addr ? estKm(d.origin, d.dest) : 14.5;
    const hour = d.type === "SCHEDULED" ? parseInt(d.slot, 10) : new Date().getHours();
    d.fare = fare({ kg: d.kg, km: d.km, type: d.type, hour });
    return d;
  }
  function quote(f) {
    const d = readSend(f);
    $("[data-quote]").innerHTML =
      `${charges(d.fare)}<p class="mute" style="font-size:13px;margin-top:10px">${d.origin.addr && d.dest.addr ? `Estimated distance ${d.km} km.` : "Add both addresses to estimate the distance (14.5 km shown)."} Peak hours are 7–10am and 5–8pm.</p>`;
    $("[data-when]").hidden = d.type !== "SCHEDULED";
  }

  V.review = () => {
    const d = S.draft;
    if (!d) return go("#/send");
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
          <div><dt>Delivery type</dt><dd>${d.type === "SCHEDULED" ? `Scheduled · ${esc(fmtDate(d.when))}, ${esc(d.slot)}` : d.type === "INSTANT" ? "Instant express" : "Same-day"}</dd></div>
          ${r ? `<div><dt>Rider</dt><dd>${esc(r.name)} · ${esc(r.plate)}</dd></div>` : ""}</dl>
        <h2 class="h h--p" style="margin-top:8px">Charges</h2>${charges(d.fare)}
      </section>
      <aside class="stack"><section class="card stack"><span class="guar">${ic("shield")}Guaranteed price</span><p class="mute">This is the price you pay. It won't change after booking.</p>
        <a class="btn btn--block" href="#/pay">Proceed to pay ${naira(d.fare.total)}</a><a class="btn btn--line btn--block" href="#/send">${ic("edit")}Edit package</a></section></aside></div>`,
    };
  };
  V.pay = () => {
    const d = S.draft;
    if (!d) return go("#/send");
    const low = S.wallet < d.fare.total;
    return {
      title: "Make payment",
      back: "#/review",
      html: `<form class="cols" data-form="pay" novalidate><section class="card stack">
        <h2 class="h">Add payment method</h2><p class="mute">Complete the payment using your preferred method.</p>
        <div class="stack" role="radiogroup" aria-label="Payment method">
          <label class="card card--flat row"><input type="radio" name="m" value="wallet" ${low ? "disabled" : "checked"} style="accent-color:var(--p);width:18px;height:18px"><span class="ava ava--soft">${ic("wallet")}</span><span class="grow"><b>Pay with wallet</b><br><small class="mute">Balance ${naira(S.wallet, 2)}${low ? " · not enough for this delivery" : ""}</small></span>${low ? `<a class="btn btn--sm" href="#/wallet?topup=1">Top up</a>` : ""}</label>
          ${S.cards.map((c, i) => `<label class="card card--flat row"><input type="radio" name="m" value="card:${c.id}" ${low && i === 0 ? "checked" : ""} style="accent-color:var(--p);width:18px;height:18px"><span class="ava ava--soft">${ic("card")}</span><span class="grow"><b>${esc(c.brand)} ${esc(c.type)} card</b><br><small class="mute">•••• •••• •••• ${esc(c.last4)}</small></span></label>`).join("")}
          <button type="button" class="btn btn--ghost" data-act="add-card">${ic("plus")}Add a card</button>
        </div></section>
      <aside class="stack"><section class="card stack"><dl class="kv"><div class="tot"><dt>Total</dt><dd><b>${naira(d.fare.total)}</b></dd></div></dl>
        <p class="err" data-err hidden></p><button class="btn btn--block">Proceed to pay</button></section></aside></form>`,
    };
  };
  V.done = (q, id) => {
    const p = pkgById(id);
    if (!p) return go("#/home");
    const r = p.rider ? riderById(p.rider) : null;
    return {
      title: "Transaction successful",
      html: `<section class="card stack center" style="max-width:560px;margin:0 auto">
      <div class="big-ok">${ic("check")}</div><h2>Transaction successful</h2>
      <p class="mute">${p.status === "SCHEDULED" ? `Your pickup is scheduled for ${esc(fmtDate(p.when))}, ${esc(p.slot)}.` : r ? `Your rider, ${esc(r.name)}, is on the way to your pickup.` : "We're finding a rider near your pickup."}</p>
      <dl class="kv" style="text-align:left"><div><dt>Tracking number</dt><dd><button class="link" data-act="copy" data-v="${esc(p.tracking)}">${esc(p.tracking)} ${ic("copy")}</button></dd></div><div><dt>Total paid</dt><dd>${naira(p.fare.total)}</dd></div></dl>
      <div class="pin"><span>Share this PIN with the recipient. The rider asks for it on delivery.</span><strong>${p.pin}</strong></div>
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
    if (!p) return go("#/track");
    const r = p.rider ? riderById(p.rider) : null;
    const canCancel = ["REQUESTED", "ASSIGNED", "SCHEDULED"].includes(p.status);
    const next = FLOW[FLOW.indexOf(p.status) + 1];
    return {
      title: "Tracking package",
      back: "#/track",
      html: `<div class="cols"><div class="stack">
      ${mapSvg(p)}
      <section class="card stack"><div class="row row--sb wrap"><div><small class="mute">Tracking number</small><p class="h h--p" style="margin:0">${esc(p.tracking)}</p></div>${chip(p.status)}</div>
        <h2 class="h" style="margin:4px 0 0">Package status</h2>${timeline(p)}</section>
      ${p.status === "DELIVERED" ? (p.rating ? `<section class="card row"><span class="big-ok" style="width:48px;height:48px;margin:0">${ic("check")}</span><div class="grow"><b>Delivery successful</b><br><small class="mute">You rated ${esc(r ? r.name : "the rider")} ${p.rating.stars}/5</small></div>${stars(p.rating.stars)}</section>` : `<section class="card row wrap"><div class="grow"><b>Package delivered</b><br><small class="mute">Rate your rider or report a missing item.</small></div><button class="btn btn--line btn--sm" data-act="report" data-id="${p.id}">Report</button><button class="btn btn--sm" data-act="rate" data-id="${p.id}">Rate rider</button></section>`) : ""}
    </div>
    <div class="stack">
      ${
        r
          ? `<section class="card stack"><h2 class="h" style="margin:0">Your rider</h2><div class="riderc"><span class="ava">${initials(r.name)}</span><div><b>${esc(r.name)}</b><small>${esc(r.vehicle)} · ${esc(r.plate)}</small><br>${stars(r.rating)} <small>${r.rating} (${r.trips} deliveries)</small></div></div>
        <div class="grid2"><a class="btn btn--sm" href="#/chat/${r.id}">${ic("chat")}Message</a><button class="btn btn--o btn--sm" data-act="call" data-name="${esc(r.name)}">${ic("phone")}Call rider</button></div></section>`
          : p.status === "SCHEDULED"
            ? ""
            : `<section class="card stack"><h2 class="h" style="margin:0">Finding a rider</h2><p class="mute">Nearby riders can see your request now.</p><a class="btn btn--line btn--sm" href="#/riders">Choose a rider yourself</a></section>`
      }
      ${["DELIVERED", "CANCELLED"].includes(p.status) ? "" : `<div class="pin"><span>Recipient's delivery PIN</span><strong>${p.pin}</strong></div>`}
      <section class="card stack"><h2 class="h" style="margin:0">Package info</h2>
        <dl class="kv"><div><dt>From</dt><dd>${esc(p.origin.addr)}</dd></div><div><dt>To</dt><dd>${esc(p.dest.addr)}</dd></div><div><dt>Recipient</dt><dd>${esc(p.dest.name)} · ${esc(p.dest.phone)}</dd></div><div><dt>Items</dt><dd class="o">${esc(p.items)}, ${p.kg} kg</dd></div><div class="tot"><dt>Total charge</dt><dd><b>${naira(p.fare.total)}</b></dd></div></dl>
        ${canCancel ? `<button class="btn btn--danger btn--sm" data-act="cancel" data-id="${p.id}">Cancel delivery</button>` : ""}</section>
    </div></div>`,
    };
  };

  V.riders = (q) => {
    const k = q.get("k") || "All";
    const list = RIDERS.filter((r) => k === "All" || r.kind === k).sort((a, b) => a.km - b.km);
    return {
      title: "Book a rider",
      back: "#/home",
      html: `<div class="stack">
      <label class="search"><span class="sr-only">Search riders</span>${ic("search")}<input class="inp" type="search" placeholder="Search for a rider by name or plate number" data-act="rider-search"></label>
      <div class="chips" role="group" aria-label="Vehicle">${["All", "Motorcycle", "Car", "Van"].map((x) => `<a class="chip" href="#/riders?k=${x}" aria-pressed="${x === k}">${x}</a>`).join("")}</div>
      <div class="riders" data-riders>${list
        .map(
          (
            r,
          ) => `<div class="rcard" data-q="${esc((r.name + " " + r.plate).toLowerCase())}"><div class="riderc"><span class="ava ${r.gender === "F" ? "ava--o" : ""}">${initials(r.name)}</span><div><b>${esc(r.name)}</b><small>${esc(r.vehicle)} · ${esc(r.plate)}</small></div></div>
        <div class="meta"><span>${stars(r.rating)} ${r.rating}</span><span>${r.km} km away</span></div>
        <div class="grid2"><a class="btn btn--line btn--sm" href="#/riders/${r.id}">Profile</a><a class="btn btn--sm" href="#/send?rider=${r.id}">Book</a></div></div>`,
        )
        .join("")}</div>
      <p class="mute" style="font-size:13px">Riders and distances are sample data until live locations are connected.</p></div>`,
    };
  };
  V.rider = (q, id) => {
    const r = riderById(id);
    if (!r) return go("#/riders");
    const rv = REVIEWS[id] || [];
    return {
      title: "Rider profile",
      back: "#/riders",
      html: `<div class="cols"><section class="card prof"><span class="ava ava--lg ${r.gender === "F" ? "ava--o" : ""}">${initials(r.name)}</span><h2>${esc(r.name)}</h2>${stars(r.rating)}<p class="mute">${r.rating} rating · ${r.trips} completed deliveries · ${r.km} km away</p>
        <dl class="facts"><div><dt>Car model</dt><dd>${esc(r.vehicle)}</dd></div><div><dt>Registration number</dt><dd>${esc(r.plate)}</dd></div><div><dt>Gender</dt><dd>${r.gender}</dd></div></dl>
        <div class="grid2" style="width:100%"><a class="btn" href="#/chat/${r.id}">${ic("chat")}Send message</a><button class="btn btn--line" data-act="call" data-name="${esc(r.name)}">${ic("phone")}Call rider</button></div>
        <a class="btn btn--o btn--block" href="#/send?rider=${r.id}">Book this rider</a></section>
      <section class="stack"><h2 class="h">Customer reviews</h2>${rv.length ? rv.map(([n, s, t]) => `<div class="review"><span class="ava ava--soft">${initials(n)}</span><div><b>${esc(n)}</b><small class="mute">${esc(t)}</small></div>${stars(s)}</div>`).join("") : `<div class="card empty"><b>No written reviews yet</b>Ratings appear after deliveries.</div>`}</section></div>`,
    };
  };

  V.wallet = (q) => {
    const credits = S.tx.filter((t) => t.amt > 0).reduce((a, t) => a + t.amt, 0);
    const debits = S.tx.filter((t) => t.amt < 0).reduce((a, t) => a + t.amt, 0);
    if (q.get("topup")) setTimeout(() => topup(), 0);
    return {
      title: "Wallet",
      html: `<div class="cols"><div class="stack">
      <section class="bal"><div class="row row--sb"><small>${esc(S.user.name)} · current balance</small><button class="ibtn" style="background:rgba(255,255,255,.16);border:0;color:#fff;width:36px;height:36px" data-act="hide-bal" aria-label="${S.hideBal ? "Show" : "Hide"} balance">${ic(S.hideBal ? "eye" : "eye-off")}</button></div><strong>${S.hideBal ? "₦ ••••••" : naira(S.wallet, 2)}</strong></section>
      <section class="card stack"><h2 class="h center" style="margin:0">Top up</h2><div class="topup"><button data-act="topup" data-m="bank">${ic("bank")}Bank</button><button data-act="topup" data-m="transfer">${ic("swap")}Transfer</button><button data-act="topup" data-m="card">${ic("card")}Card</button></div></section>
      <section class="card"><div class="row row--sb wrap" style="margin-bottom:8px"><h2 class="h" style="margin:0">Transaction history</h2><button class="btn btn--ghost btn--sm" data-act="csv">${ic("download")}Statement</button></div>
        <div class="grid2" style="margin:8px 0"><div class="card card--flat"><small class="mute">Total credits</small><b class="amt" style="display:block">+${naira(credits, 2)}</b></div><div class="card card--flat"><small class="mute">Total debits</small><b class="amt amt--neg" style="display:block">${naira(debits, 2)}</b></div></div>
        <label class="search"><span class="sr-only">Search transactions</span>${ic("search")}<input class="inp" type="search" placeholder="Search title, date or reference" data-act="tx-search"></label>
        <ul class="list" data-tx>${S.tx.map(txRow).join("")}</ul></section>
    </div>
    <div class="stack"><section class="card stack"><h2 class="h" style="margin:0">Cards</h2>
      <ul class="list">${S.cards.map((c) => `<li><span class="ava ava--soft">${ic("card")}</span><div class="grow"><b>${esc(c.brand)} ${esc(c.type)} •••• ${esc(c.last4)}</b><small>Expires ${esc(c.exp)}${c.def ? " · Default" : ""}</small></div>${c.def ? "" : `<button class="btn btn--ghost btn--sm" data-act="def-card" data-id="${c.id}">Make default</button>`}<button class="btn btn--danger btn--sm" data-act="del-card" data-id="${c.id}" aria-label="Delete card ending ${esc(c.last4)}">${ic("trash")}</button></li>`).join("") || `<li class="mute">No saved cards.</li>`}</ul>
      <button class="btn btn--line" data-act="add-card">${ic("plus")}Add debit or credit card</button></section></div></div>`,
    };
  };

  V.chats = () => {
    const threads = Object.keys(S.chats).filter((k) => (role() === "rider" ? /^cp/.test(k) : !/^cp/.test(k)));
    const base = role() === "rider" ? [] : ["support"];
    const all = [...new Set([...base, ...threads])];
    return {
      title: "Messages",
      html: `<section class="card" style="max-width:760px"><ul class="list">${
        all
          .map((k) => {
            const last = (S.chats[k] || []).slice(-1)[0];
            const name =
              k === "support"
                ? "Customer assistance"
                : /^cp/.test(k)
                  ? `Customer · ${pkgById(k.slice(1))?.byName || ""}`
                  : riderById(k)?.name;
            return `<li><span class="ava ${k === "support" ? "ava--o" : ""}">${k === "support" ? ic("headset") : initials(name)}</span><a class="grow" href="#/chat/${k}"><b>${esc(name)}</b><small>${esc(last ? last[1] : "Start a conversation")}</small></a>${last ? `<small class="mute">${esc(fmtDay(last[2]))}</small>` : ""}</li>`;
          })
          .join("") || `<li class="mute">No conversations yet.</li>`
      }</ul></section>`,
    };
  };
  V.chat = (q, k) => {
    const name =
      k === "support"
        ? "Customer assistance"
        : /^cp/.test(k)
          ? `Customer · ${pkgById(k.slice(1))?.byName || ""}`
          : riderById(k)?.name;
    if (!name) return go("#/chat");
    const msgs = S.chats[k] || [];
    return {
      title: "Messages",
      back: "#/chat",
      html: `<section class="card chat" style="max-width:760px">
      <div class="chat__head"><span class="ava ${k === "support" ? "ava--o" : ""}">${k === "support" ? ic("headset") : initials(name)}</span><div><b>${esc(name)}</b><br><small>Online</small></div>${k !== "support" ? `<button class="ibtn" data-act="call" data-name="${esc(name)}" aria-label="Call">${ic("phone")}</button>` : ""}</div>
      <div class="chat__body" data-msgs aria-live="polite">${msgs.map(([w, t, at]) => `<p class="msg ${w === "out" ? "msg--me" : ""}">${esc(t)}<small>${esc(fmtTime(at))}</small></p>`).join("")}</div>
      <form class="chat__form" data-form="msg" data-k="${esc(k)}" novalidate><label class="sr-only" for="m">Message</label><input class="inp" id="m" name="m" placeholder="Enter message" autocomplete="off"><button class="btn" aria-label="Send">${ic("send")}</button></form></section>`,
      after: () => {
        const b = $("[data-msgs]");
        b.scrollTop = b.scrollHeight;
      },
    };
  };

  V.notes = () => {
    const html = `<section class="card" style="max-width:760px">${S.notes.length ? `<ul class="list">${S.notes.map((n) => `<li><span class="ava ${n.read ? "ava--soft" : ""}">${ic("bell")}</span><a class="grow" href="${n.link}"><b>${esc(n.t)}</b><small>${esc(n.s)} · ${esc(fmtDay(n.at))}</small></a></li>`).join("")}</ul>` : `<div class="empty"><b>Notification</b>You have no notifications.</div>`}</section>`;
    S.notes.forEach((n) => (n.read = true));
    save();
    return { title: "Notifications", back: "#/home", html };
  };

  V.profile = (q) => {
    const open = q.get("open") || "";
    const r = role();
    const pp = (key, icon, title, sub, body) =>
      `<li><button data-act="panel" data-p="${key}" aria-expanded="${open === key}">${ic(icon)}<span class="grow"><b>${title}</b><small>${sub}</small></span>${ic(open === key ? "chev-down" : "chev-right")}</button>${open === key ? `<div class="panel">${body}</div>` : ""}</li>`;
    const tog = (k, t, s) =>
      `<div class="toggle-row"><div><b>${t}</b><small class="mute">${s}</small></div><label class="switch"><input type="checkbox" data-act="pref" data-k="${k}" ${S.prefs[k] ? "checked" : ""} aria-label="${t}"><span></span></label></div>`;
    const name = r === "rider" ? ME_RIDER.name : S.user.name;
    return {
      title: "Profile",
      html: `<div class="cols"><section class="card"><ul class="menu">
      ${pp("edit", "user", "Edit profile", "Name, phone number, address, email", `<form class="stack" data-form="profile" novalidate><label class="field"><span>Full name</span><input class="inp" name="name" value="${esc(S.user.name)}"></label><div class="grid2"><label class="field"><span>Email</span><input class="inp" name="email" type="email" value="${esc(S.user.email)}"></label><label class="field"><span>Phone number</span><input class="inp" name="phone" value="${esc(S.user.phone)}"></label></div><label class="field"><span>Default pickup address</span><input class="inp" name="address" value="${esc(S.user.address)}"></label><button class="btn btn--sm">Save changes</button></form>`)}
      ${
        r === "rider"
          ? pp(
              "vehicle",
              "bike",
              "Vehicle and licence",
              "Vehicle type, plate number, driver's licence",
              `<form class="stack" data-form="vehicle" novalidate><div class="grid3"><label class="field"><span>Vehicle</span><input class="inp" name="vehicle" value="${esc(S.user.vehicle)}"></label><label class="field"><span>Plate</span><input class="inp" name="plate" value="${esc(S.user.plate)}"></label><label class="field"><span>Licence</span><input class="inp" name="licence" value="${esc(S.user.licence)}"></label></div><button class="btn btn--sm">Save</button></form>`,
            )
          : pp(
              "biz",
              "briefcase",
              "Business details",
              "Business name and CAC / RC number",
              `<form class="stack" data-form="biz" novalidate><div class="grid2"><label class="field"><span>Business name</span><input class="inp" name="business" value="${esc(S.user.business)}"></label><label class="field"><span>RC number</span><input class="inp" name="rc" value="${esc(S.user.rc)}"></label></div><button class="btn btn--sm">Save</button></form>`,
            )
      }
      ${pp("statements", "file", "Statements and reports", "Download transactions and deliveries", `<div class="row wrap"><button class="btn btn--sm" data-act="csv">${ic("download")}Transactions (CSV)</button><button class="btn btn--line btn--sm" data-act="csv-pkg">${ic("download")}Deliveries (CSV)</button></div>`)}
      ${pp("notify", "bell", "Notification settings", "Mute, unmute, location and tracking", `${tog("orders", "Order updates", "Status changes for your deliveries")}${tog("messages", "Rider messages", "Chats from riders and support")}${tog("promos", "Promotions", "Offers like the Love & Resolution Offer")}${tog("location", "Location and tracking", "Share live location during deliveries")}`)}
      <li><a href="#/wallet">${ic("card")}<span class="grow"><b>Cards and bank accounts</b><small>Change cards, delete card details</small></span>${ic("chev-right")}</a></li>
      ${pp("refer", "gift", "Refer and earn", "Check friends invited and earn", `<p class="mute">Share your code. You both get <b>₦500</b> when your friend completes a first delivery.</p><div class="row wrap"><code class="chip" style="font-size:15px">KEN-AM500</code><button class="btn btn--sm" data-act="copy" data-v="KEN-AM500">${ic("copy")}Copy code and link</button></div><dl class="kv"><div><dt>Friends invited</dt><dd>3</dd></div><div><dt>Bonus earned</dt><dd>${naira(1500)}</dd></div></dl>`)}
      ${pp("security", "lock", "Privacy and security", "Biometric login and data", `${tog("bio", "Biometric login", "Fingerprint or Face ID in the AiMove mobile app")}<p class="mute" style="font-size:13px">Your data is used only to run your deliveries.</p>`)}
      <li><div class="toggle-row" style="padding:14px 4px;border-bottom:1px solid var(--line)"><div class="row">${ic("moon")}<b>Enable dark mode</b></div><label class="switch"><input type="checkbox" data-act="pref" data-k="dark" ${S.prefs.dark ? "checked" : ""} aria-label="Dark mode"><span></span></label></div></li>
      ${pp("about", "info", "About us", "Know more about us, terms and conditions", `<p class="mute">AiMove is a Rehohub product. Deliveries are run by RehoTrans, Rehohub's logistics company.</p><a class="link" href="../services/rehotrans.html">About RehoTrans</a>`)}
      <li><button class="danger" data-act="logout">${ic("logout")}<span class="grow"><b>Log out</b></span></button></li></ul></section>
      <aside class="stack"><section class="card prof"><span class="ava ava--lg ${r === "rider" ? "ava--o" : ""}">${initials(name)}</span><h2>${esc(name)}</h2><p class="mute">${r === "rider" ? `${esc(S.user.vehicle)} · ${esc(S.user.plate)}` : esc(S.user.business)}</p><span class="st st--REQUESTED">${ROLE_NAME[r]}</span></section>
        <section class="card stack"><h2 class="h" style="margin:0">Need help?</h2><p class="mute">Customer care is open 8–9pm on weekdays and 9–5 at weekends.</p><a class="btn btn--line btn--sm" href="#/chat/support">${ic("headset")}Chat with us</a></section></aside></div>`,
    };
  };

  // ------------------------------------------------------------ rider views
  V.riderHome = (q) => {
    const f = q.get("f") || "all";
    const task = S.packages.find((p) => p.rider === "me" && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(p.status));
    let open = S.packages.filter((p) => p.status === "REQUESTED" && !p.rider);
    if (f === "high") open = open.filter((p) => p.fare.total > 3500);
    if (f === "express") open = open.filter((p) => p.type === "INSTANT");
    const step =
      task &&
      {
        ASSIGNED: ["Confirm pickup", "PICKED_UP"],
        PICKED_UP: ["Start transit", "IN_TRANSIT"],
        IN_TRANSIT: ["Complete delivery (PIN)", "POD"],
      }[task.status];
    return {
      title: "Rider home",
      html: `<div class="cols"><div class="stack">
      <section class="earn"><div class="row row--sb wrap"><div><b style="font-size:20px">${esc(ME_RIDER.name)}</b><br><small>${ME_RIDER.rating} rating · ${esc(S.user.vehicle)}</small></div>
        <label class="online">${S.rider.online ? "ONLINE" : "OFFLINE"}<span class="switch"><input type="checkbox" data-act="online" ${S.rider.online ? "checked" : ""} aria-label="Go online"><span></span></span></label></div>
        <small style="display:block;margin-top:14px">Available earnings</small><strong>${naira(S.rider.balance)}</strong>
        <div class="earn__stats"><div><b>${S.rider.today}</b><small>Trips today</small></div><div><b>${S.rider.acceptance}%</b><small>Acceptance</small></div><div><b>${ME_RIDER.rating} ★</b><small>Rating</small></div></div></section>
      ${
        task
          ? `<section class="job job--active"><div class="row row--sb wrap"><b>Active delivery · TASK ${esc(task.tracking)}</b>${chip(task.status)}</div>
          <ul class="route-mini"><li>${ic("target")}<span><b>Pickup</b><br>${esc(task.origin.addr)} · ${esc(task.byName)} (${esc(task.origin.phone)})</span></li><li>${ic("pin")}<span><b>Drop-off</b><br>${esc(task.dest.addr)} · ${esc(task.dest.name)} (${esc(task.dest.phone)})</span></li></ul>
          <div class="row row--sb wrap"><span class="mute">${esc(task.items)} · ${task.kg} kg · ${task.km} km</span><span class="pay">${naira(task.fare.total)}</span></div>
          <div class="grid3"><button class="btn btn--o" data-act="rider-step" data-id="${task.id}" data-next="${step[1]}">${step[0]}</button><a class="btn btn--line" href="#/chat/c${task.id}">${ic("chat")}Chat customer</a><button class="btn btn--ghost" data-act="nav" data-id="${task.id}">${ic("navigation")}GPS nav</button></div></section>`
          : ""
      }
      <section class="stack"><div class="row row--sb wrap"><h2 class="h" style="margin:0">Available orders nearby</h2><div class="chips">${[
        ["all", `All (${S.packages.filter((p) => p.status === "REQUESTED" && !p.rider).length})`],
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
                    ) => `<article class="job"><div class="row row--sb wrap"><span class="st ${p.type === "INSTANT" ? "st--CANCELLED" : "st--REQUESTED"}">${p.type === "INSTANT" ? "Express" : "Same day"}</span><span class="pay">${naira(p.fare.total)}</span></div>
            <b>${esc(p.items)}</b><ul class="route-mini"><li>${ic("target")}<span>${esc(p.origin.addr)}</span></li><li>${ic("pin")}<span>${esc(p.dest.addr)}</span></li></ul>
            <div class="row row--sb wrap"><span class="mute">${p.km} km · ${p.kg} kg · worth ${naira(p.worth)}</span><button class="btn btn--sm" data-act="accept" data-id="${p.id}">Accept order &amp; start pickup</button></div></article>`,
                  )
                  .join("")
              : `<div class="card empty"><b>No matching pickup requests</b>Check back shortly or change your filter.</div>`
        }</section></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Today</h2><dl class="kv"><div><dt>Trips</dt><dd>${S.rider.today}</dd></div><div><dt>Online</dt><dd>${S.rider.online ? "Yes" : "No"}</dd></div><div><dt>Payout account</dt><dd>${S.bank ? esc(S.bank.bank + " •••• " + S.bank.acct.slice(-4)) : "Not set"}</dd></div></dl><a class="btn btn--line btn--sm" href="#/rider/earnings">Earnings and payout</a></section>
        <section class="card stack"><h2 class="h" style="margin:0">Proof of delivery</h2><p class="mute">Ask the recipient for their 4-digit PIN before you complete a delivery. It protects you in disputes.</p></section></aside></div>`,
    };
  };
  V.riderEarn = () => {
    const done = S.packages.filter((p) => p.rider === "me" && p.status === "DELIVERED");
    return {
      title: "Earnings",
      html: `<div class="cols"><div class="stack">
      <section class="earn"><small>Available earnings balance</small><strong>${naira(S.rider.balance)}</strong><button class="btn btn--o btn--sm" data-act="withdraw" ${S.rider.balance <= 0 ? "disabled" : ""}>${ic("bank")}Withdraw to bank</button></section>
      <section class="card"><h2 class="h">Completed deliveries</h2>${done.length ? `<ul class="list">${done.map((p) => `<li><span class="ava ava--soft">${ic("box")}</span><div class="grow"><b>${esc(p.items)}</b><small>${esc(p.tracking)} · ${esc(fmtDay(p.history.slice(-1)[0][1]))}</small></div><span class="amt">+${naira(p.fare.total)}</span></li>`).join("")}</ul>` : `<p class="mute">Deliveries you complete in this app appear here.</p>`}</section>
      <section class="card"><h2 class="h">Payouts</h2>${S.rider.payouts.length ? `<ul class="list">${S.rider.payouts.map((w) => `<li><span class="ava ava--soft">${ic("bank")}</span><div class="grow"><b>Withdrawal</b><small>${esc(w.to)} · ${esc(fmtDay(w.at))}</small></div><span class="amt amt--neg">−${naira(w.amt)}</span></li>`).join("")}</ul>` : `<p class="mute">No payouts yet.</p>`}</section></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Payout account</h2>${S.bank ? `<p><b>${esc(S.bank.bank)}</b><br><span class="mute">${esc(S.bank.acct)} · ${esc(S.bank.name)}</span></p>` : `<p class="mute">Add the bank account your earnings go to.</p>`}<button class="btn btn--line btn--sm" data-act="bank">${S.bank ? "Change account" : "Add bank account"}</button></section></aside></div>`,
    };
  };

  // ------------------------------------------------------------ operations views
  V.ops = () => {
    const P = S.packages;
    const rev = P.filter((p) => p.status !== "CANCELLED").reduce((a, p) => a + p.fare.total, 0);
    const all = [ME_RIDER, ...RIDERS];
    const coords = (r) => {
      const h = hash(r.id + Math.floor(now() / 60000));
      return [(6.43 + (h % 180) / 1000).toFixed(4), (3.33 + ((h >> 8) % 200) / 1000).toFixed(4), 40 + (h % 60)];
    };
    return {
      title: "Operations",
      html: `<div class="stack">
      <div class="kpis">${[
        ["Packages", P.length],
        ["Active", P.filter((p) => ACTIVE.includes(p.status)).length],
        ["Delivered", P.filter((p) => p.status === "DELIVERED").length],
        ["Revenue", naira(rev)],
        ["Riders online", RIDERS.length + (S.rider.online ? 1 : 0)],
      ]
        .map(([k, v]) => `<div class="card kpi"><small>${k}</small><b>${v}</b></div>`)
        .join("")}</div>
      <section class="card tbl"><div class="row row--sb wrap" style="padding:8px 0"><h2 class="h" style="margin:0">Shipments</h2><button class="btn btn--ghost btn--sm" data-act="print">${ic("download")}Export report (PDF)</button></div><table><thead><tr><th>Tracking</th><th>Customer</th><th>Route</th><th>Fare</th><th>Status</th><th>Rider</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>
        ${P.slice()
          .sort((a, b) => b.created - a.created)
          .map(
            (
              p,
            ) => `<tr><td class="mono">${esc(p.tracking)}</td><td>${esc(p.byName)}</td><td>${esc(p.origin.addr.split(",")[0])} → ${esc(p.dest.addr.split(",")[0])}</td><td>${naira(p.fare.total)}</td><td>${chip(p.status)}</td>
          <td><select data-act="assign" data-id="${p.id}" aria-label="Assign rider for ${esc(p.tracking)}" ${["DELIVERED", "CANCELLED"].includes(p.status) ? "disabled" : ""}><option value="">Unassigned</option>${all.map((r) => `<option value="${r.id}" ${p.rider === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></td>
          <td>${FLOW.indexOf(p.status) > -1 && p.status !== "DELIVERED" ? `<button class="btn btn--ghost btn--sm" data-act="advance" data-id="${p.id}">Advance</button>` : ""}</td></tr>`,
          )
          .join("")}</tbody></table></section>
      <section class="card tbl"><h2 class="h" style="padding-top:8px">Rider fleet · live GPS</h2><table><thead><tr><th>Rider</th><th>Vehicle</th><th>Plate</th><th>Rating</th><th>Location</th><th>Battery</th><th>Last ping</th></tr></thead><tbody>
        ${all
          .map((r) => {
            const [la, lo, b] = coords(r);
            return `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.vehicle)}</td><td class="mono">${esc(r.plate)}</td><td>${r.rating}</td><td class="mono">${la}° N, ${lo}° E</td><td>${b}% · GPS active</td><td>${esc(fmtTime(now()))}</td></tr>`;
          })
          .join("")}</tbody></table>
        <p class="mute" style="font-size:13px;padding:8px 0">Locations are simulated until the rider app streams GPS.</p></section></div>`,
    };
  };
  V.api = () => ({
    title: "API & webhooks",
    html: `<div class="cols"><section class="card stack">
      <h2 class="h" style="margin:0">API request sandbox</h2><p class="mute">Embed AiMove deliveries in existing business systems. Requests here are simulated.</p>
      <form class="stack" data-form="api" novalidate><div class="grid2"><label class="field"><span>Method</span><select class="inp" name="m"><option>POST</option><option>GET</option></select></label><label class="field"><span>Endpoint path</span><input class="inp mono" name="e" value="/api/v1/deliveries/create"></label></div>
      <label class="field"><span>JSON payload body</span><textarea class="inp mono" name="p">{"origin":"Lagos","dest":"Abuja","weight":5.0}</textarea></label><p class="err" data-err hidden></p><button class="btn">${ic("send")}Execute API request</button></form>
      <h2 class="h" style="margin:8px 0 0">Real-time system API logs</h2><ul class="logs">${S.logs.map((l) => `<li class="mono"><b>${esc(l.m)} ${esc(l.e)}</b> · <span style="color:var(--g)">${l.c}</span> · ${esc(fmtTime(l.at))}<br><span class="mute">Payload: ${esc(l.p)}</span><br>Response: ${esc(l.r)}</li>`).join("")}</ul></section>
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Credentials</h2><dl class="kv"><div><dt>API key</dt><dd class="mono">live_sk_••••••••</dd></div><div><dt>Webhook</dt><dd class="mono">/v1/webhook</dd></div><div><dt>Events</dt><dd>status_update</dd></div></dl></section>
      <section class="card stack"><h2 class="h" style="margin:0">Endpoints</h2><pre class="code mono">POST /api/v1/deliveries/create
GET  /api/v1/deliveries/{tracking}/track
POST /api/v1/webhooks/status_update</pre></section></aside></div>`,
  });

  // ------------------------------------------------------------ modals
  function topup(m = "card") {
    modal(`<h2>Fund your wallet</h2><p class="mute">Select or enter an amount to top up.</p>
      <form class="stack" data-form="topup" novalidate><div class="chips">${[1000, 2000, 5000, 10000, 20000].map((v) => `<button type="button" class="chip" data-act="preset" data-v="${v}">${naira(v)}</button>`).join("")}</div>
      <label class="field"><span>Amount (₦)</span><input class="inp" name="amt" type="number" min="100" step="100" inputmode="numeric" required></label>
      <label class="field"><span>Payment source</span><select class="inp" name="src">${S.cards.map((c) => `<option value="card:${c.id}" ${m === "card" && c.def ? "selected" : ""}>${esc(c.brand)} •••• ${esc(c.last4)}</option>`).join("")}<option value="transfer" ${m === "transfer" ? "selected" : ""}>Bank transfer</option><option value="bank" ${m === "bank" ? "selected" : ""}>Bank (direct debit)</option></select></label>
      <p class="mute" style="font-size:13px">Payments aren't connected yet: nothing is charged, and the balance shown is kept on this device.</p>
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Confirm top up</button></div></form>`);
  }
  function addCard() {
    modal(`<h2>Add debit or credit card</h2><form class="stack" data-form="card" novalidate>
      <label class="field"><span>Cardholder name</span><input class="inp" name="name" autocomplete="cc-name" value="${esc(S.user.name)}" required></label>
      <label class="field"><span>Card number</span><input class="inp" name="num" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="16 digits" required></label>
      <div class="grid2"><label class="field"><span>Expiry (MM/YY)</span><input class="inp" name="exp" autocomplete="cc-exp" placeholder="08/28" maxlength="5" required></label><label class="field"><span>Card type</span><select class="inp" name="type"><option>Debit</option><option>Credit</option></select></label></div>
      <p class="mute" style="font-size:13px">Only the last four digits are kept on this device.</p>
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Save card</button></div></form>`);
  }
  function rateModal(id) {
    const p = pkgById(id);
    const r = riderById(p.rider);
    modal(`<h2 class="center">Rate your rider</h2><p class="mute center">Delivery completed · ${esc(p.tracking)}</p>
      <div class="riderc" style="justify-content:center"><span class="ava">${initials(r.name)}</span><b>${esc(r.name)}</b></div>
      <form class="stack" data-form="rate" data-id="${id}" novalidate><div class="rate" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((k) => `<button type="button" data-act="star" data-v="${k}" aria-label="${k} star${k > 1 ? "s" : ""}" class="${k <= 5 ? "on" : ""}">${ic("star")}</button>`).join("")}</div><input type="hidden" name="stars" value="5">
      <p class="field"><span>What went well?</span></p><div class="chips">${["On time", "Friendly", "Careful with package", "Good communication"].map((t) => `<button type="button" class="chip" data-act="tag" aria-pressed="false">${t}</button>`).join("")}</div>
      <label class="field"><span>Additional feedback (optional)</span><textarea class="inp" name="note" placeholder="Write a quick note for the dispatch manager…"></textarea></label>
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
    modal(`<h2>${withdraw ? "Earnings payout" : "Payout bank account"}</h2><form class="stack" data-form="${withdraw ? "withdraw" : "bank"}" novalidate>
      ${
        withdraw && S.bank
          ? `<p class="mute">Paying to <b>${esc(S.bank.bank)}</b> •••• ${esc(S.bank.acct.slice(-4))}</p><label class="field"><span>Amount (₦)</span><input class="inp" name="amt" type="number" min="100" max="${S.rider.balance}" value="${S.rider.balance}"></label>`
          : `<label class="field"><span>Bank name</span><select class="inp" name="bank">${["Access Bank", "First Bank", "GTBank", "Kuda", "Opay", "UBA", "Wema Bank", "Zenith Bank"].map((b) => `<option>${b}</option>`).join("")}</select></label>
           <label class="field"><span>10-digit account number</span><input class="inp" name="acct" inputmode="numeric" maxlength="10" required></label><label class="field"><span>Account holder name</span><input class="inp" name="name" value="${esc(ME_RIDER.name)}" required></label>`
      }
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">${withdraw && S.bank ? "Withdraw" : "Save account"}</button></div></form>`);
  }
  const callModal = (name) =>
    modal(
      `<div class="center stack"><span class="ava ava--lg" style="margin:0 auto">${initials(name)}</span><h2>${esc(name)}</h2><p class="mute">Calling…</p><p class="mute" style="font-size:13px">In-app calling isn't connected yet; on the mobile app this opens your phone dialer.</p><button class="btn btn--danger" data-close>${ic("phone")}End call</button></div>`,
    );
  function downloadCsv(name, rows) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
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
  const AUTH = {
    welcome: A.welcome,
    start: A.start,
  };
  const ROUTES = [
    [/^\/home$/, V.home, "customer"],
    [/^\/send$/, V.send, "customer"],
    [/^\/review$/, V.review, "customer"],
    [/^\/pay$/, V.pay, "customer"],
    [/^\/done\/(\w+)$/, V.done, "customer"],
    [/^\/track$/, V.track, "customer"],
    [/^\/track\/(\w+)$/, V.trackOne, "customer"],
    [/^\/riders$/, V.riders, "customer"],
    [/^\/riders\/(\w+)$/, V.rider, "customer"],
    [/^\/wallet$/, V.wallet, "customer"],
    [/^\/chat$/, V.chats],
    [/^\/chat\/(\w+)$/, V.chat],
    [/^\/notifications$/, V.notes, "customer"],
    [/^\/profile$/, V.profile],
    [/^\/rider$/, V.riderHome, "rider"],
    [/^\/rider\/earnings$/, V.riderEarn, "rider"],
    [/^\/ops$/, V.ops, "admin"],
    [/^\/ops\/api$/, V.api, "admin"],
  ];
  const HOME = { customer: "#/home", rider: "#/rider", admin: "#/ops" };
  function render() {
    document.body.classList.toggle("dark", !!S.prefs.dark);
    closeModal();
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
      return go(localStorage.getItem("am-seen-intro") ? "#/start" : "#/welcome");
    }
    const m = ROUTES.map(([re, fn, r]) => [path.match(re), fn, r]).find((x) => x[0]);
    if (!m) return go(HOME[role()]);
    if (m[2] && m[2] !== role()) return go(HOME[role()]);
    const v = m[1](q, m[0][1]);
    if (!v) return;
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
  window.addEventListener("hashchange", render);

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
      try {
        localStorage.setItem("am-seen-intro", "1");
      } catch (e) {}
      go("#/start");
    }
    if (a === "copy") {
      (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.v) : Promise.reject()).then(
        () => toast("Copied"),
        () => toast(b.dataset.v),
      );
    }
    if (a === "call") callModal(b.dataset.name);
    if (a === "hide-bal") {
      S.hideBal = !S.hideBal;
      save();
      render();
    }
    if (a === "topup") topup(b.dataset.m);
    if (a === "preset") {
      const i = $("[name=amt]", b.closest("form"));
      i.value = b.dataset.v;
      i.focus();
    }
    if (a === "add-card") addCard();
    if (a === "def-card") {
      S.cards.forEach((c) => (c.def = c.id === id));
      save();
      render();
      toast("Default card updated");
    }
    if (a === "del-card") {
      S.cards = S.cards.filter((c) => c.id !== id);
      if (S.cards.length && !S.cards.some((c) => c.def)) S.cards[0].def = true;
      save();
      render();
      toast("Card deleted");
    }
    if (a === "csv")
      downloadCsv("aimove-transactions.csv", [
        ["Date", "Title", "Reference", "Amount (NGN)"],
        ...S.tx.map((t) => [fmtDate(t.at), t.title, t.sub, t.amt]),
      ]);
    if (a === "csv-pkg")
      downloadCsv("aimove-deliveries.csv", [
        ["Date", "Tracking", "Items", "From", "To", "Status", "Fare (NGN)"],
        ...mine().map((p) => [
          fmtDate(p.created),
          p.tracking,
          p.items,
          p.origin.addr,
          p.dest.addr,
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
    if (a === "report") {
      go("#/chat/support");
      setTimeout(() => {
        const i = $("#m");
        if (i) {
          i.value = "I want to report a missing item for " + pkgById(id).tracking + ".";
          i.focus();
        }
      }, 50);
    }
    if (a === "star") {
      const v = +b.dataset.v;
      $$("[data-act=star]", b.parentElement).forEach((x) => x.classList.toggle("on", +x.dataset.v <= v));
      b.closest("form").elements.stars.value = v;
    }
    if (a === "tag") b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    if (a === "cancel") {
      const p = pkgById(id);
      if (!confirm("Cancel this delivery? The fare goes back to your wallet.")) return;
      setStatus(p, "CANCELLED");
      S.wallet += p.fare.total;
      S.tx.unshift({ id: "t" + now(), title: "Refund", sub: p.tracking, amt: p.fare.total, at: now() });
      save();
      render();
      toast("Delivery cancelled and refunded");
    }
    if (a === "advance") {
      const p = pkgById(id);
      if (p.status === "SCHEDULED") setStatus(p, "REQUESTED");
      else {
        const nx = FLOW[FLOW.indexOf(p.status) + 1];
        if (nx === "ASSIGNED" && !p.rider) p.rider = RIDERS.slice().sort((x, y) => x.km - y.km)[0].id;
        if (nx) setStatus(p, nx);
      }
      save();
      render();
    }
    if (a === "accept") {
      if (S.packages.some((p) => p.rider === "me" && ["ASSIGNED", "PICKED_UP", "IN_TRANSIT"].includes(p.status)))
        return toast("Finish your active delivery first.");
      const p = pkgById(id);
      p.rider = "me";
      setStatus(p, "ASSIGNED");
      save();
      render();
      toast("Order accepted. Head to the pickup.");
    }
    if (a === "rider-step") {
      const p = pkgById(id);
      if (b.dataset.next === "POD") pinModal(id);
      else {
        setStatus(p, b.dataset.next);
        save();
        render();
      }
    }
    if (a === "nav") toast("Navigation opens in Google Maps in the rider mobile app.");
    if (a === "withdraw") bankModal(true);
    if (a === "bank") bankModal(false);
    if (a === "print") window.print();
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    const a = t.dataset.act;
    if (a === "role" && MYROLES.includes(t.value)) {
      S.session = { role: t.value };
      save();
      go(HOME[t.value]);
    }
    if (a === "pref") {
      S.prefs[t.dataset.k] = t.checked;
      save();
      document.body.classList.toggle("dark", !!S.prefs.dark);
      toast("Saved");
    }
    if (a === "online") {
      S.rider.online = t.checked;
      save();
      render();
    }
    if (a === "assign") {
      const p = pkgById(t.dataset.id);
      p.rider = t.value || null;
      if (p.rider && ["REQUESTED", "SCHEDULED"].includes(p.status)) setStatus(p, "ASSIGNED");
      if (!p.rider && p.status === "ASSIGNED") setStatus(p, "REQUESTED");
      save();
      render();
      toast("Rider assignment updated");
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains("bad") && t.value.trim()) t.classList.remove("bad");
    const f = t.closest("[data-form=send]");
    if (f) quote(f);
    const a = t.dataset.act;
    const v = (t.value || "").toLowerCase().trim();
    if (a === "tile-search")
      $$("[data-tiles] .tile").forEach((x) => (x.hidden = v && !x.textContent.toLowerCase().includes(v)));
    if (a === "rider-search") $$("[data-riders] .rcard").forEach((x) => (x.hidden = v && !x.dataset.q.includes(v)));
    if (a === "tx-search")
      $$("[data-tx] li").forEach((x) => (x.hidden = v && !x.textContent.toLowerCase().includes(v)));
    if (t.matches("[data-otp]") && t.value) {
      const n = t.nextElementSibling;
      if (n) n.focus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Backspace" && e.target.matches("[data-otp]") && !e.target.value) {
      const p = e.target.previousElementSibling;
      if (p) p.focus();
    }
  });
  document.addEventListener("paste", (e) => {
    if (!e.target.matches("[data-otp]")) return;
    const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!d) return;
    e.preventDefault();
    $$("[data-otp]").forEach((x, i) => (x.value = d[i] || ""));
  });

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
      S.draft = d;
      save();
      go("#/review");
    },
    pay(f) {
      const d = S.draft,
        m = (f.querySelector("[name=m]:checked") || {}).value;
      if (!m) return err(f, "Choose a payment method.");
      if (m === "wallet" && S.wallet < d.fare.total)
        return err(f, "Your wallet balance is too low. Top up or pay by card.");
      const id = "p" + now();
      const sched = d.type === "SCHEDULED";
      const st = sched ? "SCHEDULED" : d.rider ? "ASSIGNED" : "REQUESTED";
      const p = mkPkg({
        id,
        tracking: newTracking(),
        items: d.items,
        kg: d.kg,
        worth: d.worth,
        km: d.km,
        type: d.type,
        when: d.when,
        slot: d.slot,
        at: now(),
        origin: d.origin,
        dest: d.dest,
        status: st,
        rider: d.rider || null,
        pin: String(rnd(1000, 9999)),
        paid: m,
        history: sched
          ? [["SCHEDULED", now()]]
          : d.rider
            ? [
                ["REQUESTED", now()],
                ["ASSIGNED", now()],
              ]
            : [["REQUESTED", now()]],
      });
      p.fare = d.fare;
      S.packages.unshift(p);
      if (m === "wallet") {
        S.wallet -= d.fare.total;
        S.tx.unshift({ id: "t" + now(), title: "Delivery fee", sub: p.tracking, amt: -d.fare.total, at: now() });
      }
      log(
        "POST",
        "/api/v1/deliveries/create",
        201,
        JSON.stringify({ tracking: p.tracking, items: p.items, weight: p.kg }),
        JSON.stringify({ status: "CREATED", id }),
      );
      note("Transaction successful", `${p.items} · ${p.tracking}`, "#/track/" + id);
      if (d.rider) {
        const k = d.rider;
        S.chats[k] = S.chats[k] || [];
      }
      S.draft = null;
      save();
      go("#/done/" + id);
    },
    find(f) {
      const v = f.t.value.trim().toUpperCase();
      const p = S.packages.find((x) => x.tracking === v && x.by === "me");
      if (!/^R(-\d{4}){4}$/.test(v)) return err(f, "Tracking numbers look like R-7458-4567-4434-5854.");
      if (!p) return err(f, `We couldn't find ${v} on your account.`);
      go("#/track/" + p.id);
    },
    topup(f) {
      const amt = Math.round(+f.amt.value);
      if (!(amt >= 100)) return err(f, "Enter at least ₦100.");
      const src = f.src.value;
      const c = src.startsWith("card:") ? S.cards.find((x) => "card:" + x.id === src) : null;
      S.wallet += amt;
      S.tx.unshift({
        id: "t" + now(),
        title: "Top up",
        sub: c ? `Card •••• ${c.last4}` : src === "transfer" ? "Bank transfer" : "Bank",
        amt,
        at: now(),
      });
      note("Top-up successful", `${naira(amt)} was added to your wallet.`, "#/wallet");
      save();
      closeModal();
      if (location.hash.includes("topup")) go("#/wallet");
      else render();
      toast(`${naira(amt)} added to your wallet`);
    },
    card(f) {
      const num = f.num.value.replace(/\D/g, "");
      if (num.length !== 16) return err(f, "Card numbers have 16 digits.");
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp.value)) return err(f, "Use MM/YY for the expiry date.");
      const brand = /^4/.test(num) ? "Visa" : /^5/.test(num) ? "Mastercard" : "Verve";
      S.cards.push({
        id: "c" + now(),
        brand,
        type: f.type.value,
        last4: num.slice(-4),
        exp: f.exp.value,
        def: !S.cards.length,
      });
      save();
      closeModal();
      render();
      toast("Card saved");
    },
    rate(f) {
      const p = pkgById(f.dataset.id);
      p.rating = {
        stars: +f.stars.value,
        tags: $$("[data-act=tag][aria-pressed=true]", f).map((x) => x.textContent),
        note: f.note.value.trim(),
      };
      save();
      closeModal();
      render();
      toast("Rating submitted. Thank you!");
    },
    pod(f) {
      const p = pkgById(f.dataset.id);
      if (f.pin.value !== p.pin) return err(f, "That PIN doesn't match. Ask the recipient again.");
      setStatus(p, "DELIVERED");
      save();
      closeModal();
      render();
      toast(`Delivered. ${naira(p.fare.total)} added to your earnings.`);
    },
    bank(f) {
      if (!/^\d{10}$/.test(f.acct.value)) return err(f, "Account numbers have 10 digits.");
      if (!f.name.value.trim()) return err(f, "Enter the account holder's name.");
      S.bank = { bank: f.bank.value, acct: f.acct.value, name: f.name.value.trim() };
      save();
      closeModal();
      render();
      toast("Payout account saved");
    },
    withdraw(f) {
      if (!S.bank) return FORMS.bank(f);
      const amt = Math.round(+f.amt.value);
      if (!(amt >= 100) || amt > S.rider.balance)
        return err(f, `Enter an amount between ₦100 and ${naira(S.rider.balance)}.`);
      S.rider.balance -= amt;
      S.rider.payouts.unshift({ amt, to: `${S.bank.bank} •••• ${S.bank.acct.slice(-4)}`, at: now() });
      save();
      closeModal();
      render();
      toast(`${naira(amt)} is on its way to your bank`);
    },
    msg(f) {
      const t = f.m.value.trim();
      if (!t) return;
      const k = f.dataset.k;
      (S.chats[k] = S.chats[k] || []).push([role() === "rider" ? "out" : "out", t, now()]);
      save();
      render();
      const replies =
        k === "support"
          ? [
              "Thanks for the details. An agent will look into this and reply here shortly.",
              "Got it. Is there anything else we can help with?",
            ]
          : /^cp/.test(k)
            ? ["Okay, thank you.", "Please call when you arrive."]
            : ["Alright, I will be waiting.", "I'm on my way.", "Noted, thank you."];
      const body = $("[data-msgs]");
      if (body) {
        const ty = document.createElement("p");
        ty.className = "typing";
        ty.textContent = "typing…";
        body.appendChild(ty);
        body.scrollTop = body.scrollHeight;
      }
      setTimeout(() => {
        (S.chats[k] = S.chats[k] || []).push(["in", replies[S.chats[k].length % replies.length], now()]);
        save();
        if (location.hash === "#/chat/" + k) render();
      }, 1200);
    },
    profile(f) {
      Object.assign(S.user, Object.fromEntries(new FormData(f)));
      save();
      render();
      toast("Profile updated");
    },
    biz(f) {
      Object.assign(S.user, Object.fromEntries(new FormData(f)));
      save();
      render();
      toast("Business details saved");
    },
    vehicle(f) {
      Object.assign(S.user, Object.fromEntries(new FormData(f)));
      ME_RIDER.vehicle = S.user.vehicle;
      save();
      render();
      toast("Vehicle details saved");
    },
    api(f) {
      let body;
      try {
        body = f.p.value.trim() ? JSON.parse(f.p.value) : {};
      } catch (x) {
        return err(f, "The payload isn't valid JSON.");
      }
      if (!f.e.value.startsWith("/api/")) return err(f, "Endpoints start with /api/.");
      log(
        f.m.value,
        f.e.value,
        200,
        JSON.stringify(body),
        JSON.stringify({ status: "SUCCESS", message: "API execution completed", timestamp: new Date().toISOString() }),
      );
      save();
      render();
      toast("Request executed (simulated)");
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
    loadFor(ACCOUNT);
    S.user.name = ACCOUNT.full_name;
    S.user.email = ACCOUNT.email;
    if (ACCOUNT.phone) S.user.phone = ACCOUNT.phone;
    const rider = ACCOUNT.memberships.find(
      (m) => m.product === "aimove" && m.role === "rider" && m.status === "approved",
    );
    ME_RIDER.name = ACCOUNT.full_name;
    if (rider) {
      const d = rider.details || {};
      S.user.vehicle =
        S.user.vehicle || (d.vehicle_type ? d.vehicle_type[0].toUpperCase() + d.vehicle_type.slice(1) : "");
      S.user.plate = S.user.plate || d.plate_number || "";
      S.user.licence = S.user.licence || d.licence_number || "";
      ME_RIDER.vehicle = S.user.vehicle;
      ME_RIDER.plate = S.user.plate;
    }
    const keep = S.session && MYROLES.includes(S.session.role) ? S.session.role : MYROLES[0];
    S.session = { role: keep };
    save();
    if (S.prefs.dark) document.body.classList.add("dark");
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
