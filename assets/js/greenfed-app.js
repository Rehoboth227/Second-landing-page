/* GreenFed web app.
   Built from the "GreenFed USERS DESIGN" Figma file and the GreenFed requirements
   (customer, employee and administrator sides). Sign-in, sign-up, approvals and roles use
   the shared Rehohub account system (/api, via rh-auth.js): the server decides who may use
   which side. Households, health records, meal plans, grocery orders, staff work and
   communities are stored on the server (api/lib/greenfed.php). Prices are in naira and set by
   GreenFed administrators; customers pay by bank transfer and an administrator confirms it.
   Only the shopping cart and the chosen role are kept on this device. */
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
  const money = (n) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
  const initials = (n) =>
    String(n)
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const now = () => Date.now();
  const H = 3600e3,
    DAY = 24 * H;
  const fmtDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtTime = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ago = (t) => {
    const m = Math.round((now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? "hr ago" : "hrs ago");
    return Math.round(h / 24) + "d ago";
  };
  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n));
  const api = (path, body) => RH.call(path, body === undefined ? {} : { method: "POST", body });

  // ------------------------------------------------------------ catalogue and meals
  const ALLERGENS = ["Milk", "Egg", "Wheat", "Peanuts", "Fish", "Soy"];
  const MEALS = ["Breakfast", "Brunch", "Lunch", "Snacks", "Dinner"];
  const CATS = [
    ["Fruits", "apple", "#fde8e8", "#dc2626"],
    ["Veges", "leaf", "#e6f4ea", "#15803d"],
    ["Snacks", "cookie", "#fef3c7", "#b45309"],
    ["Breads", "bread", "#fdf0e1", "#a16207"],
    ["Drinks", "cup", "#e0f2fe", "#0369a1"],
    ["Proteins", "fish", "#ede9fe", "#6d28d9"],
    ["Grains", "wheat", "#f5f0e6", "#854d0e"],
  ];
  const CAT = Object.fromEntries(CATS.map(([n, i, t, c]) => [n, { i, t, c }]));
  // Grocery items and their naira prices come from the server (set by GreenFed administrators).
  let ITEMS = [];
  const item = (id) => ITEMS.find((x) => x.id === id);
  const priceOf = (it) => it.now;

  // Meal library: [meal, dish, allergens, grocery item ids]
  const LIB = [
    ["Breakfast", "Oatmeal with almond milk, cinnamon and mixed berries.", [], ["oats", "almondmilk", "berries"]],
    [
      "Breakfast",
      "Scrambled eggs with spinach on whole-wheat toast.",
      ["Egg", "Wheat"],
      ["eggs", "spinach", "wwbread"],
    ],
    ["Breakfast", "Akara (bean fritters) with pap.", [], ["beans"]],
    [
      "Breakfast",
      "Greek yoghurt parfait with granola and banana.",
      ["Milk", "Wheat"],
      ["yoghurt", "granola", "bananas"],
    ],
    ["Breakfast", "Boiled yam with tomato and spinach sauce.", [], ["yam", "tomatoes", "spinach"]],
    ["Brunch", "Fruit salad: apples, banana and mixed berries.", [], ["apples", "bananas", "berries"]],
    [
      "Brunch",
      "Green smoothie: spinach, banana, oats and almond milk.",
      [],
      ["spinach", "bananas", "oats", "almondmilk"],
    ],
    ["Brunch", "Smashed avocado on whole-wheat toast.", ["Wheat"], ["avocado", "wwbread"]],
    ["Brunch", "Plantain and egg frittata.", ["Egg"], ["plantain", "eggs"]],
    [
      "Lunch",
      "Quinoa salad with cherry tomatoes, cucumber and feta.",
      ["Milk"],
      ["quinoa", "tomatoes", "cucumber", "feta"],
    ],
    [
      "Lunch",
      "Brown jollof rice with grilled chicken and salad.",
      [],
      ["brownrice", "chicken", "tomatoes", "cucumber"],
    ],
    ["Lunch", "Beans and fried plantain.", [], ["beans", "plantain"]],
    ["Lunch", "Grilled salmon wrap with spinach.", ["Fish", "Wheat"], ["salmon", "wwbread", "spinach"]],
    ["Lunch", "Quinoa and roasted sweet potato bowl with avocado.", [], ["quinoa", "sweetpotato", "avocado"]],
    ["Snacks", "Carrot and cucumber sticks with hummus.", [], ["carrots", "cucumber", "hummus"]],
    ["Snacks", "Roasted groundnuts.", ["Peanuts"], ["groundnuts"]],
    ["Snacks", "Air-popped popcorn.", [], ["popcorn"]],
    ["Snacks", "Tiger nut drink and an apple.", [], ["tigernut", "apples"]],
    ["Snacks", "Boiled egg.", ["Egg"], ["eggs"]],
    ["Dinner", "Grilled salmon with sweet potato and greens.", ["Fish"], ["salmon", "sweetpotato", "spinach"]],
    ["Dinner", "Okra soup with turkey and a small portion of yam.", [], ["okra", "turkey", "yam"]],
    ["Dinner", "Stir-fried vegetables with tofu and brown rice.", ["Soy"], ["tofu", "carrots", "brownrice"]],
    ["Dinner", "Chicken pepper soup with yam.", [], ["chicken", "yam"]],
    ["Dinner", "Turkey stew with brown rice and carrots.", [], ["turkey", "tomatoes", "brownrice", "carrots"]],
  ];
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  function genDay(dayIdx, meals, allergies) {
    return meals.map((m) => {
      const safe = LIB.filter((x) => x[0] === m && !x[2].some((a) => allergies.includes(a)));
      const pick = safe.length
        ? safe[(dayIdx + m.length) % safe.length]
        : [m, "Nutritionist to advise (no safe option in library).", [], []];
      return { meal: m, dish: pick[1], items: pick[3] };
    });
  }
  const PRICE_PP_WEEK = () => (S.settings && S.settings.plan_price) || 0; // naira, set by administrators
  const planPrice = (persons, weeks) => persons * weeks * PRICE_PP_WEEK();
  // Starting points for a new plan. Your nutritionist still tailors every plan to your household.
  const POPULAR = [
    {
      key: "family",
      name: "Family plan",
      meals: ["Breakfast", "Lunch", "Dinner"],
      allergies: [],
      who: "families sharing one menu",
    },
    {
      key: "personal",
      name: "Personal plan",
      meals: ["Breakfast", "Lunch", "Snacks", "Dinner"],
      allergies: [],
      who: "one person",
    },
    {
      key: "kiddies",
      name: "Kiddies plan",
      meals: ["Breakfast", "Snacks", "Lunch", "Dinner"],
      allergies: ["Peanuts"],
      who: "school-age children, peanut-free",
    },
    {
      key: "aged",
      name: "Aged plan",
      meals: ["Breakfast", "Lunch", "Dinner"],
      allergies: [],
      who: "older adults: softer, lower-salt meals",
    },
  ];

  const PLAN_FLOW = ["PAID", "PICKED", "IN_PROGRESS", "DELIVERED"];
  const GROC_FLOW = ["PAID", "GATHERING", "QA", "PACKAGED", "EN_ROUTE", "DELIVERED"];
  const LABEL = {
    AWAITING_PAYMENT: "Waiting for your transfer",
    PAYMENT_SENT: "Confirming your payment",
    CANCELLED: "Cancelled",
    PAID: "Payment confirmed",
    PICKED: "Picked by nutritionist",
    IN_PROGRESS: "Work in progress",
    DELIVERED: "Delivered",
    GATHERING: "Order gathering",
    QA: "Quality assurance",
    PACKAGED: "Packaged",
    EN_ROUTE: "Delivery en route",
  };
  const SHORT = {
    AWAITING_PAYMENT: "Pay now",
    PAYMENT_SENT: "Confirming payment",
    CANCELLED: "Cancelled",
    PAID: "Paid",
    PICKED: "Picked",
    IN_PROGRESS: "In progress",
    DELIVERED: "Delivered",
    GATHERING: "Gathering",
    QA: "Quality check",
    PACKAGED: "Packaged",
    EN_ROUTE: "On the way",
    ACTIVE: "Active",
    WARNING: "Warning",
    BANNED: "Banned",
    DEACTIVATED: "Deactivated",
    OPEN: "Open",
    RESOLVED: "Resolved",
  };
  const chip = (s) => `<span class="st st--${s}">${SHORT[s] || s}</span>`;

  // Employee types from the requirements, which work queue each one sees, and how they are paid.
  // Nutritionists are paid per delivered meal plan; suppliers are partners paid per delivery
  // contract and the rest are salaried, both outside the app, so their meter only counts tasks.
  const EMP = {
    nutritionist: { name: "Nutritionist", queue: "Meal plans", pay: "task" },
    supply: { name: "Supply manager", queue: "Grocery orders: gathering", pay: "salary" },
    qa: { name: "Quality assurance", queue: "Grocery orders: quality check", pay: "salary" },
    delivery: { name: "Packaging & delivery", queue: "Grocery orders: pack and deliver", pay: "salary" },
    health: { name: "Health specialist", queue: "Community", pay: "salary" },
    supplier: { name: "Supplier", queue: "Grocery supply requests", pay: "contract" },
  };
  const RATE = () => (S.settings && S.settings.nutritionist_rate) || 0;

  // ------------------------------------------------------------ state (a cache of the server)
  const blank = () => ({
    session: null,
    settings: { plan_price: 0, nutritionist_rate: 0, bank: {}, slots: [] },
    user: {
      name: "",
      email: "",
      phone: "",
      address: "",
      occupation: "",
      marital: "",
      height: 0,
      weight: 0,
      goal: "",
      goalNote: "",
      setupDone: true,
    },
    members: [{ id: "", name: "", rel: "You", age: 0, sex: "", allergies: [], conditions: [] }],
    records: [],
    orders: [],
    cart: {},
    favs: [],
    communities: [],
    posts: [],
    notes: [],
    prefs: { email: true, push: true, promos: true, community: true, dark: false },
    emp: { type: "", name: "", tasks: 0, allTasks: 0, paid: [], bank: null, complaints: [] },
    staff: [],
    complaints: [],
    conflicts: [],
    leaders: [],
    leader: null,
    draft: null,
  });
  let S = blank();
  let ACCOUNT = null; // the signed-in Rehohub account (from the server)
  let MYROLES = []; // GreenFed roles the server has approved for this account
  const ROLEMAP = { customer: "user", employee: "employee", admin: "admin" };
  // On this device: only the cart and the side you last used.
  const local = (key, val) => {
    const kk = "greenfed-" + key + ":" + (ACCOUNT ? ACCOUNT.id : "");
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(kk));
      localStorage.setItem(kk, JSON.stringify(val));
    } catch (e) {}
    return null;
  };
  const save = () => local("cart", S.cart);
  async function sync() {
    lastSync = Date.now();
    const r = await api("greenfed/state?role=" + role());
    S.settings = r.settings;
    ITEMS = r.items || [];
    Object.assign(S.user, r.user || {}, { name: ACCOUNT.full_name, email: ACCOUNT.email, phone: ACCOUNT.phone || "" });
    S.prefs = { ...S.prefs, ...(r.prefs || {}) };
    S.notes = r.notes || [];
    S.communities = r.communities || [];
    S.posts = r.posts || [];
    S.orders = r.orders || [];
    S.leader = r.leader;
    if (r.members) S.members = r.members;
    S.records = r.records || [];
    S.favs = r.favs || [];
    S.conflicts = r.conflicts || [];
    if (r.emp) S.emp = r.emp;
    S.staff = r.staff || [];
    S.complaints = r.complaints || [];
    S.leaders = r.leaders || [];
    // Drop cart lines for items that are no longer sold.
    Object.keys(S.cart).forEach((id) => item(id) || delete S.cart[id]);
  }
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
  const order = (id) => S.orders.find((o) => o.id === id);
  const memberName = (id) => (S.members.find((m) => m.id === id) || {}).name || "";
  const myOrders = () => S.orders.filter((o) => !o.owner);
  const persons = (o) => o.persons || o.members.length || 1;
  const cartCount = () => Object.values(S.cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(S.cart).reduce((a, [id, q]) => a + (item(id) ? priceOf(item(id)) * q : 0), 0);
  const lineName = (l) => (item(l[0]) || {}).name || l[3] || l[0];
  const isLive = (o) => !["DELIVERED", "CANCELLED"].includes(o.status);
  const paidOrder = (o) => !["AWAITING_PAYMENT", "PAYMENT_SENT", "CANCELLED"].includes(o.status);

  // ------------------------------------------------------------ UI primitives
  const view = () => $("#app");
  function toast(msg) {
    const t = $(".toast");
    t.querySelector("span").textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("on"), 2800);
  }
  function modal(html) {
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
    return m;
  }
  function closeModal() {
    const m = $(".modal");
    if (m) {
      m.remove();
      if (modal.last && modal.last.focus) modal.last.focus();
    }
  }
  const go = (h) => {
    if (location.hash === h) render();
    else location.hash = h;
  };
  const err = (form, msg) => {
    const e = $("[data-err]", form);
    if (e) {
      e.textContent = msg;
      e.hidden = !msg;
    }
  };
  const art = (it, size) => {
    const c = CAT[it.cat];
    return `<div class="prod__art" style="--tint:${c.t};--ink2:${c.c}${size ? ";aspect-ratio:1;width:" + size + "px;margin:0" : ""}">${ic(c.i)}</div>`;
  };

  function timeline(o) {
    const flow = o.kind === "plan" ? PLAN_FLOW : GROC_FLOW;
    const idx = flow.indexOf(o.status);
    if (o.status === "CANCELLED") return `<p class="mute">This order was cancelled.</p>`;
    const waiting = o.status === "AWAITING_PAYMENT" || o.status === "PAYMENT_SENT";
    const payName = o.status === "AWAITING_PAYMENT" ? "Waiting for your bank transfer" : "Confirming your payment";
    const names =
      o.kind === "plan"
        ? {
            PAID: waiting ? payName : "Payment confirmed",
            PICKED: `Picked by ${o.staff.nutritionist || "a nutritionist"}`,
            IN_PROGRESS: "Work in progress",
            DELIVERED: "Plan delivered to your email and app",
          }
        : {
            PAID: waiting ? payName : "Payment confirmed",
            GATHERING: `Order gathering${o.staff.supply ? " · " + o.staff.supply : ""}`,
            QA: `Quality assurance${o.staff.qa ? " · " + o.staff.qa : ""}`,
            PACKAGED: "Packaged",
            EN_ROUTE: `Delivery en route${o.staff.delivery ? " · " + o.staff.delivery : ""}`,
            DELIVERED: "Delivered",
          };
    return `<ol class="tl">${flow
      .map((st, i) => {
        const h = waiting && st === "PAID" ? o.history[o.history.length - 1] : o.history.find((x) => x[0] === st);
        const cls = waiting
          ? st === "PAID"
            ? "now"
            : ""
          : i < idx || (i === idx && st === "DELIVERED")
            ? "done"
            : i === idx
              ? "now"
              : "";
        const rev =
          o.kind === "grocery" && h && st !== "PAID" && !waiting
            ? `<span class="stars" style="margin-left:8px">${[1, 2, 3, 4, 5].map((v) => `<button class="link" style="padding:0" data-act="stage-rate" data-id="${o.id}" data-st="${st}" data-v="${v}" aria-label="Rate ${LABEL[st]} ${v} out of 5"><svg class="i ${v <= (o.reviews[st] || 0) ? "" : "off"}" aria-hidden="true"><use href="#i-star"/></svg></button>`).join("")}</span>`
            : "";
        return `<li class="${cls}"><b>${esc(names[st])}</b>${h ? `<small>${fmtDate(h[1])} · ${fmtTime(h[1])}</small>${rev}` : ""}</li>`;
      })
      .join("")}</ol>`;
  }

  // ------------------------------------------------------------ auth (design: launch screens, welcome, login, sign up, reset, verify)
  const ONB = [
    ["heart", "Healthy lifestyle", "Less worry about health issues with a complete, balanced diet."],
    ["plan", "Good meal planning", "Quality nutritional meal planning for family and friends."],
    ["user-check", "Best nutritionist service", "Nutritionists make sure your meals are in order for every need."],
    ["truck", "Grocery delivery & tracking", "Farm-fresh groceries delivered weekly. Monitor your order to your door."],
  ];
  function authShell(inner) {
    return `<div class="auth">
      <aside class="auth__art">
        <a class="logo-gf" href="#/welcome"><img src="../assets/img/greenfed/logo-white.png" alt="GreenFed: Fresh food. Smarter you." width="900" height="517"></a>
        <div><h2>Fresh food. Real nutrition. Delivered.</h2><p>Meal plans built around your family's health, farm-fresh groceries every week, and a community that eats well together.</p>
          <ul class="auth__points"><li>${ic("plan")}Meal plans from nutritionists, in under 48 hours</li><li>${ic("truck")}Weekly grocery delivery you can track</li><li>${ic("users")}Communities for allergies, diet and more</li></ul></div>
        <small style="opacity:.75">A Rehohub product · <a href="../index.html" style="text-decoration:underline">rehohub.com</a></small>
      </aside>
      <main class="auth__main" id="main"><div class="auth__box">${inner}</div></main></div>`;
  }
  const A = {};
  A.welcome = (q) => {
    const i = Math.min(3, Math.max(0, Number(q.get("s")) || 0));
    const [icon, t, d] = ONB[i];
    return authShell(`<div class="onb"><div class="onb__art">${ic(icon)}</div><h1>${t}</h1><p class="mute">${d}</p>
      <div class="dots">${ONB.map((_, n) => `<i class="${n === i ? "on" : ""}"></i>`).join("")}</div></div>
      <div class="row row--sb"><button class="btn btn--ghost btn--sm" data-act="skip">Skip</button>
      ${i < 3 ? `<a class="btn btn--sm" href="#/welcome?s=${i + 1}">Next ${ic("chev-right")}</a>` : `<a class="btn btn--sm" href="#/start">Get started ${ic("chev-right")}</a>`}</div>`);
  };
  A.start = () =>
    authShell(`<div class="onb"><img src="../assets/img/greenfed/badge.png" alt="" width="160" height="160" style="width:140px;border-radius:50%"><h1>Welcome!</h1><p class="mute">Fresh food. Smarter you.</p></div>
    <a class="btn btn--block" href="${esc(RH.loginUrl(location.pathname))}">Sign in</a><a class="btn btn--line btn--block" href="${esc(RH.url("account/register.html?product=greenfed&role=customer"))}">Create an account</a>
    <p class="auth__alt">One Rehohub account works for GreenFed, AiPay, AiMove and AiRise.<br>Working with us? <a class="link" href="${esc(RH.url("account/register.html?product=greenfed&role=employee"))}">Apply as GreenFed staff</a></p>`);
  A.setup = () =>
    authShell(`<p class="auth__step">One last step</p><h1>Tell us about you</h1><p>Your nutritionist uses this to plan your meals. You can change it any time.</p>
    <form class="stack" data-form="setup" novalidate>
      <div class="grid2"><label class="field"><span>Age</span><input class="inp" name="age" type="number" min="1" max="120"></label><label class="field"><span>Sex</span><select class="inp" name="sex"><option>Female</option><option>Male</option></select></label></div>
      <label class="field"><span>Marital status</span><select class="inp" name="marital"><option>Single</option><option>Married</option><option>Prefer not to say</option></select></label>
      <fieldset class="field" style="border:0;padding:0;margin:0"><span>Allergies</span><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}"><span>${a}</span></label>`).join("")}</div></fieldset>
      <label class="field"><span>Health status</span><input class="inp" name="health" placeholder="e.g. none, diabetes, high blood pressure"></label>
      <p class="mute" style="font-size:13px">Add your family after this, from Profile → Family members.</p>
      <p class="err" data-err hidden></p><button class="btn btn--block">Save and continue</button></form>`);

  // ------------------------------------------------------------ app shell
  const NAV = {
    user: [
      ["#/home", "home", "Home"],
      ["#/plans", "plan", "Meal plan"],
      ["#/grocery", "bag", "Grocery"],
      ["#/orders", "truck", "Track orders"],
      ["#/community", "users", "Community"],
      ["#/health", "heart", "Health records"],
      ["#/notifications", "bell", "Notifications"],
      ["#/profile", "user", "Profile"],
    ],
    employee: [
      ["#/work", "clipboard", "My work"],
      ["#/work/earnings", "wallet", "Work meter"],
      ["#/work/complaints", "flag", "Complaints"],
      ["#/notifications", "bell", "Notifications"],
      ["#/profile", "user", "Profile"],
    ],
    admin: [
      ["#/admin", "chart", "Overview"],
      ["#/admin/settings", "wallet", "Prices and bank"],
      ["#/admin/users", "users", "Users"],
      ["#/admin/conflicts", "flag", "Conflicts"],
      ["#/community", "chat", "Community"],
      ["#/notifications", "bell", "Notifications"],
      ["#/profile", "user", "Profile"],
    ],
  };
  // Design's bottom tabs: Profile, Meal plan, Grocery, Community, Notification
  const TABS = {
    user: [
      ["#/home", "user", "Profile"],
      ["#/plans", "plan", "Meal plan"],
      ["#/grocery", "bag", "Grocery"],
      ["#/community", "users", "Community"],
      ["#/notifications", "bell", "Alerts"],
    ],
    employee: [
      ["#/work", "clipboard", "Work"],
      ["#/work/earnings", "wallet", "Meter"],
      ["#/work/complaints", "flag", "Complaints"],
      ["#/profile", "user", "Profile"],
    ],
    admin: [
      ["#/admin", "chart", "Overview"],
      ["#/admin/settings", "wallet", "Prices"],
      ["#/admin/conflicts", "flag", "Conflicts"],
      ["#/notifications", "bell", "Alerts"],
      ["#/profile", "user", "Profile"],
    ],
  };
  const ROLE = { user: "Customer", employee: "Employee", admin: "Administrator" };
  const role = () => (S.session && S.session.role) || "user";
  const HOME = { user: "#/home", employee: "#/work", admin: "#/admin" };
  function shell(path, v) {
    const r = role();
    const unread = S.notes.filter((n) => !n.read).length;
    const homes = ["#/home", "#/work", "#/admin"];
    const cur = (h) => (path === h || (!homes.includes(h) && path.startsWith(h + "/")) ? ' aria-current="page"' : "");
    const who = ACCOUNT ? ACCOUNT.full_name : S.user.name;
    const navList = NAV[r].slice();
    if (r === "employee" && S.emp.type === "health") navList.splice(1, 0, ["#/community", "users", "Community"]);
    const nav = navList
      .map(
        ([h, i, t]) =>
          `<li><a href="${h}"${cur(h)}>${ic(i)}<span>${t}</span>${h === "#/notifications" && unread ? `<span class="n">${unread}</span>` : ""}</a></li>`,
      )
      .join("");
    const tabs = TABS[r].map(([h, i, t]) => `<a href="${h}"${cur(h)}>${ic(i)}<span>${t}</span></a>`).join("");
    const cartN = cartCount();
    const cartBtn =
      r === "user"
        ? `<a class="ibtn cartbtn" href="#/cart" aria-label="Cart, ${cartN} items">${ic("cart")}${cartN ? `<span class="dot">${cartN}</span>` : ""}</a>`
        : "";
    return `<div class="app">
      <aside class="side" aria-label="GreenFed navigation">
        <a class="logo-gf" href="${HOME[r]}"><img src="../assets/img/greenfed/logo.png" alt="GreenFed" width="900" height="517"></a>
        <nav class="nav" aria-label="Main"><h2>${r === "user" ? "Menu" : ROLE[r]}</h2><ul>${nav}</ul></nav>
        <div class="side__foot">
          ${
            MYROLES.length > 1
              ? `<label class="rolebox"><small>Your roles</small><select class="inp" data-act="role" aria-label="Switch between your roles">${MYROLES.map(
                  (kk) => `<option value="${kk}" ${kk === r ? "selected" : ""}>${ROLE[kk]}</option>`,
                ).join("")}</select></label>`
              : ""
          }
          <a class="link" href="${esc(RH.url("account/index.html"))}" style="font-size:13px">My Rehohub account</a>
          <div class="me"><span class="ava">${initials(who)}</span><div><b>${esc(who)}</b><small>${r === "employee" ? esc(S.emp.name) : ROLE[r]}</small></div></div>
        </div>
      </aside>
      <main class="main" id="main">
        <div class="gf-head"><a href="#/profile" aria-label="Profile"><span class="ava">${initials(who)}</span></a><h1>${v.title}</h1>${cartBtn || "<span></span>"}</div>
        <div class="top top--gf">${v.back ? `<a class="back" href="${v.back}" aria-label="Back">${ic("chev-left")}</a>` : ""}<h1>${v.title}</h1>${cartBtn}
          ${r ? `<a class="ibtn" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<span class="dot">${unread}</span>` : ""}</a>` : ""}</div>
        ${v.back ? `<div class="gf-head" style="justify-content:flex-start"><a class="back" href="${v.back}" aria-label="Back">${ic("chev-left")}</a></div>` : ""}
        ${v.html}
      </main>
      <nav class="tabs" style="--n:${TABS[r].length}" aria-label="Tabs">${tabs}</nav></div>`;
  }

  // ------------------------------------------------------------ user views
  const V = {};
  V.home = () => {
    const delivered = myOrders().filter((o) => o.kind === "plan" && o.status === "DELIVERED" && o.days);
    const plan = delivered[0];
    const di = (new Date().getDay() + 6) % 7;
    const active = myOrders().filter(isLive);
    const recs = S.records;
    return {
      title: "Home",
      html: `<div class="cols"><div class="stack">
      <section class="welcome"><small>Welcome,</small><h2>${esc(S.user.name.split(" ")[0])}</h2><p>${S.members.length} ${S.members.length === 1 ? "person" : "people"} in your household · ${S.members.reduce((a, m) => a + m.allergies.length, 0)} allergies on record. Your nutritionist plans around them.</p></section>
      ${
        plan
          ? `<section class="card stack"><div class="row row--sb wrap"><h2 class="h" style="margin:0">Today's meals · ${DAYS[di]}</h2><a class="link" href="#/plans/${plan.id}?d=${di}">Full plan</a></div>
        <div class="today">${plan.days[di].map((m) => `<div><b>${m.meal.toUpperCase()}</b><p>${esc(m.dish)}</p></div>`).join("")}</div>
        <a class="btn btn--line btn--sm" href="#/grocery?tab=plan">${ic("bag")}Shop groceries for this plan</a></section>`
          : `<section class="card stack"><h2 class="h" style="margin:0">No meal plan yet</h2><p class="mute">Get a plan built around your family's needs.</p><a class="btn btn--sm" href="#/plans/new">Get new plan</a></section>`
      }
      <section><h2 class="h">Active orders</h2>${active.length ? active.map(orderRow).join("") : `<div class="card empty"><b>Nothing on the way</b>Your meal plans and groceries will show here.</div>`}</section>
    </div>
    <div class="stack">
      <section class="card stack"><div class="row row--sb"><h2 class="h" style="margin:0">My health record</h2><a class="link" href="#/health">Reports</a></div>
        <div class="stat-row" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><b>${recs.length}</b><small>Total records</small></div><div><b>${recs.filter((r) => r.type === "Allergy").length}</b><small>Allergies</small></div></div>
        <div class="stack">${S.members.map((m) => `<div class="member"><span class="ava ${m.rel === "You" ? "" : "ava--soft"}">${initials(m.name)}</span><div><b>${esc(m.name)}</b><small>${esc(m.rel)}${m.age ? " · " + m.age + " yrs" : ""}${m.allergies.length ? " · allergic to " + esc(m.allergies.join(", ").toLowerCase()) : ""}</small></div></div>`).join("")}</div>
        <a class="btn btn--line btn--sm" href="#/family">${ic("plus")}Add family member</a></section>
      <section class="card stack"><div class="row row--sb"><h2 class="h" style="margin:0">Your communities</h2><a class="link" href="#/community">See all</a></div>
        ${
          S.communities
            .filter((c) => c.joined)
            .map(
              (c) =>
                `<a class="member" href="#/community/${c.id}"><span class="ava ava--soft">${ic("users")}</span><div><b>${esc(c.name)}</b><small>${esc(c.last)}</small></div></a>`,
            )
            .join("") || `<p class="mute">You haven't joined a community yet.</p>`
        }</section>
    </div></div>`,
    };
  };
  function orderRow(o) {
    const title =
      o.kind === "plan"
        ? `${o.name} · meal plan`
        : `Grocery #${o.id} · ${o.items.reduce((a, [, q]) => a + q, 0)} items`;
    const sub =
      o.kind === "plan"
        ? `${persons(o)} ${persons(o) === 1 ? "person" : "persons"} · ${o.weeks} week${o.weeks > 1 ? "s" : ""} · ${money(o.price)}`
        : `${o.slot} · ${money(o.total)}`;
    return `<a class="plan" href="#/${o.status === "AWAITING_PAYMENT" ? "pay?id=" : "orders/"}${o.id}"><span class="plan__ico">${ic(o.kind === "plan" ? "plan" : "bag")}</span><b>${esc(title)}</b><div class="plan__side">${chip(o.status)}</div><small>${esc(sub)}</small></a>`;
  }

  V.plans = () => {
    const mine = myOrders()
      .filter((o) => o.kind === "plan")
      .sort((a, b) => b.created - a.created);
    return {
      title: "Meal plan",
      html: `<div class="cols"><div class="stack">
      <div class="row row--sb"><h2 class="h" style="margin:0;color:var(--mute)">MY PLANS</h2><a class="btn btn--sm" href="#/plans/new">${ic("plus")}Get new plan</a></div>
      <div>${
        mine
          .map(
            (
              o,
            ) => `<div class="plan"><span class="plan__ico">${ic(o.fav ? "check-sq" : "plan")}</span><a href="#/${o.status === "DELIVERED" ? "plans/" : o.status === "AWAITING_PAYMENT" ? "pay?id=" : "orders/"}${o.id}"><b>${esc(o.name)}</b></a>
          <div class="plan__side"><span>${fmtTime(o.created)}</span><div class="plan__acts"><button data-act="fav-plan" data-id="${o.id}" aria-pressed="${!!o.fav}" aria-label="Favourite">${ic("heart")}</button><button data-act="download" data-id="${o.id}" aria-label="Download" ${o.days ? "" : "disabled"}>${ic("download")}</button><button data-act="share" data-what="${esc(o.name)} meal plan" aria-label="Share">${ic("share")}</button></div></div>
          <small>${fmtDate(o.created)} · <span class="tag">${persons(o)} ${persons(o) === 1 ? "Person" : "Persons"}</span> ${o.status === "DELIVERED" ? "" : chip(o.status)}</small></div>`,
          )
          .join("") || `<div class="card empty"><b>No plans yet</b>Request your first meal plan.</div>`
      }</div>
      <h2 class="h" style="margin:8px 0 0;color:var(--mute)">START FROM A PLAN</h2>
      <div class="popular">${POPULAR.map((p) => `<a class="pop" href="#/plans/popular/${p.key}"><b>${p.name}</b><em>${p.meals.length} Meals</em><small>${p.allergies.length ? "No " + p.allergies.join(", ").toLowerCase() : "No allergies"}</small></a>`).join("")}</div>
      <a class="btn btn--block" href="#/plans/new">Get new plan</a></div>
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">How it works</h2><ol class="tl"><li class="done"><b>Tell us who it's for</b><small>Members, allergies and meals</small></li><li class="done"><b>Pay by bank transfer</b><small>${money(PRICE_PP_WEEK())} per person per week</small></li><li class="now"><b>A nutritionist picks it up</b><small>You'll see their name</small></li><li><b>Your plan arrives in under 48 hours</b><small>By email and in the app</small></li></ol></section></aside></div>`,
    };
  };
  V.popular = (q, key) => {
    const p = POPULAR.find((x) => x.key === key);
    if (!p) return go("#/plans");
    const day = genDay(0, p.meals, p.allergies);
    return {
      title: p.name,
      back: "#/plans",
      html: `<div class="cols"><section class="card stack"><div class="sumbar"><span>${p.meals.length} MEALS</span><span>${p.allergies.length ? "NO " + p.allergies.join(", ").toUpperCase() : "NO ALLERGIES"}</span></div>
      <p class="mute">Built for ${esc(p.who)}. Here's a sample day; your own plan is tailored to your household.</p>
      ${day.map(mealCard).join("")}</section>
      <aside class="stack"><section class="card stack"><b>Start from this plan</b><p class="mute">We'll pre-fill the meals; you choose who it's for.</p><a class="btn btn--block" href="#/plans/new?from=${p.key}">Use this plan</a><button class="btn btn--ghost btn--block" data-act="share" data-what="${esc(p.name)}">${ic("share")}Share</button></section></aside></div>`,
    };
  };
  const MEAL_IC = { Breakfast: "sun", Brunch: "coffee", Lunch: "bowl", Snacks: "apple", Dinner: "moon" };
  const mealCard = (m) =>
    `<div class="meal"><span class="meal__ico">${ic(MEAL_IC[m.meal])}</span><b>${m.meal.toUpperCase()}</b><p>${esc(m.dish)}</p></div>`;

  V.newPlan = (q) => {
    const from = POPULAR.find((x) => x.key === q.get("from"));
    const d = S.draft || {};
    const sel = d.members || S.members.map((m) => m.id);
    const meals = d.meals || (from ? from.meals : ["Breakfast", "Lunch", "Dinner"]);
    const memberAl = [...new Set(S.members.filter((m) => sel.includes(m.id)).flatMap((m) => m.allergies))];
    const als = d.allergies || [...new Set([...(from ? from.allergies : []), ...memberAl])];
    return {
      title: "New plan",
      back: "#/plans",
      html: `<form class="cols" data-form="plan" novalidate><div class="stack">
      <section class="card stack"><h2 class="h" style="margin:0">Plan for</h2>
        <div class="stack">${S.members.map((m) => `<label class="member"><input type="checkbox" name="mem" value="${m.id}" ${sel.includes(m.id) ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--p)"><span class="ava ava--soft">${initials(m.name)}</span><div><b>${esc(m.name)}</b><small>${esc(m.rel)}${m.age ? " · " + m.age + " yrs" : ""}${m.allergies.length ? " · " + esc(m.allergies.join(", ")) : ""}</small></div></label>`).join("")}</div>
        <a class="link" href="#/family">${ic("plus")} Add family member</a></section>
      <section class="card stack"><label class="field"><span>Plan name</span><input class="inp" name="name" value="${esc(d.name || (from ? from.name : "Plan " + String(myOrders().filter((o) => o.kind === "plan").length + 1).padStart(3, "0")))}"></label>
        <label class="field"><span>Duration</span><select class="inp" name="weeks">${[1, 2, 4].map((w) => `<option value="${w}" ${Number(d.weeks || 1) === w ? "selected" : ""}>${w} week${w > 1 ? "s" : ""}</option>`).join("")}</select></label>
        <fieldset class="field" style="border:0;padding:0;margin:0"><span>Include</span><div class="checks">${MEALS.map((m) => `<label><input type="checkbox" name="meal" value="${m}" ${meals.includes(m) ? "checked" : ""}><span>${m}</span></label>`).join("")}</div></fieldset>
        <fieldset class="field" style="border:0;padding:0;margin:0"><span>Allergies</span><small>Pre-filled from your household's records.</small><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}" ${als.includes(a) ? "checked" : ""}><span>${a}</span></label>`).join("")}</div></fieldset>
        <label class="field"><span>Additional info</span><textarea class="inp" name="info" placeholder="Leave us a message: goals, dislikes, health needs">${esc(d.info || "")}</textarea></label></section></div>
      <aside class="stack" style="position:sticky;top:20px"><section class="card stack" aria-live="polite" data-plan-sum></section><p class="err" data-err hidden></p><button class="btn btn--block">Submit</button></aside></form>`,
    };
  };
  function planSum(f) {
    const mem = $$("[name=mem]:checked", f).length;
    const weeks = Number(f.weeks.value);
    const meals = $$("[name=meal]:checked", f).length;
    const al = $$("[name=al]:checked", f).length;
    $("[data-plan-sum]").innerHTML =
      `<h2 class="h" style="margin:0">Review</h2><div class="sumbar"><span>${weeks} WEEK PLAN</span><span>${mem} PERSONS</span><span>${al} ALLERGIES</span><span>${meals} MEALS</span></div>
      <dl class="kv"><div><dt>${mem} × ${weeks} week × ${money(PRICE_PP_WEEK())}</dt><dd>${money(planPrice(mem, weeks))}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(planPrice(mem, weeks))}</b></dd></div></dl>`;
  }
  V.review = () => {
    const d = S.draft;
    if (!d || d.kind !== "plan") return go("#/plans/new");
    const self = (S.members.find((m) => m.rel === "You") || {}).id;
    const others = d.members.length - 1;
    return {
      title: "Review",
      back: "#/plans/new",
      html: `<section class="card stack center" style="max-width:560px;margin:0 auto">
      <h2 class="title-g" style="font-size:26px">HEY ${esc(S.user.name.split(" ")[0].toUpperCase())}!</h2>
      <p>Your ${d.weeks} week meal plan for ${d.members.includes(self) ? "yourself" + (others > 0 ? ` and ${others} member${others > 1 ? "s" : ""}` : "") : d.members.length + " members"} costs <b>${money(d.price)}</b> only.</p>
      <div class="sumbar" style="justify-content:center"><span>${d.weeks} WEEK PLAN</span><span>${d.members.length} PERSONS</span><span>${d.allergies.length} ALLERGIES</span><span>${d.meals.length} MEALS</span></div>
      <dl class="kv" style="text-align:left"><div><dt>Plan for</dt><dd>${esc(d.members.map(memberName).join(", "))}</dd></div><div><dt>Meals</dt><dd>${esc(d.meals.join(", "))}</dd></div><div><dt>Allergies</dt><dd>${esc(d.allergies.join(", ") || "None")}</dd></div>${d.info ? `<div><dt>Additional info</dt><dd>${esc(d.info)}</dd></div>` : ""}</dl>
      <p class="mute" style="font-size:13px">Next you'll see GreenFed's bank account. Pay by transfer; a nutritionist starts once we confirm the money arrived.</p>
      <button class="btn btn--block" data-act="place-plan">Proceed to payment</button><a class="btn btn--ghost btn--block" href="#/plans/new">Edit</a></section>`,
    };
  };
  V.planOne = (q, id) => {
    const o = order(id);
    if (!o || o.kind !== "plan") return go("#/plans");
    if (!o.days) return go("#/orders/" + id);
    const d = Math.min(6, Number(q.get("d")) || 0);
    const who = q.get("m") || "all";
    const member = S.members.find((m) => m.id === who);
    const meals = o.days[d] || [];
    return {
      title: o.name,
      back: "#/plans",
      html: `<div class="cols"><div class="stack">
      <div class="sumbar"><span>${o.weeks} WEEK PLAN</span><span>${persons(o)} PERSONS</span><span>${o.allergies.length} ALLERGIES</span><span>${o.meals.length} MEALS</span></div>
      <div class="daytabs noprint" role="group" aria-label="Day">${DAYS.map((n, i) => `<button data-act="day" data-d="${i}" aria-pressed="${i === d}">${n.slice(0, 3).toUpperCase()}</button>`).join("")}</div>
      <div class="utabs noprint" role="group" aria-label="Person"><a href="#/plans/${o.id}?d=${d}" aria-current="${who === "all"}">Everybody</a>${o.members.map((m) => `<a href="#/plans/${o.id}?d=${d}&m=${m}" aria-current="${who === m}">${esc((memberName(m) || o.memberNames[o.members.indexOf(m)] || "").split(" ")[0])}</a>`).join("")}</div>
      <h2 class="h" style="margin:4px 0 0">${DAYS[d]}${member ? " · " + esc(member.name) : ""}</h2>
      ${member ? `<p class="mute">${member.allergies.length ? "Allergies: " + esc(member.allergies.join(", ")) + ". Your nutritionist planned around the allergies you listed for this plan." : "No allergies on record for " + esc(member.name.split(" ")[0]) + "."}</p>` : ""}
      <div>${meals.map(mealCard).join("")}</div>
      <p class="mute">Prepared by: ${esc(o.staff.nutritionist || "GreenFed")} · GreenFed ${new Date(o.created).getFullYear()}</p></div>
      <aside class="stack noprint"><section class="card stack"><a class="btn btn--block" href="#/grocery?tab=plan&plan=${o.id}">${ic("bag")}Shop grocery</a><button class="btn btn--line btn--block" data-act="print">${ic("download")}Download plan</button><button class="btn btn--ghost btn--block" data-act="share" data-what="${esc(o.name)} meal plan">${ic("share")}Share</button></section>
        <section class="card stack">${o.review ? `<b>Your review</b><span class="stars">${[1, 2, 3, 4, 5].map((v) => `<svg class="i ${v <= o.review.stars ? "" : "off"}" aria-hidden="true"><use href="#i-star"/></svg>`).join("")}</span><p class="mute">${esc(o.review.note)}</p>` : `<b>How was your plan?</b><button class="btn btn--sm" data-act="review-plan" data-id="${o.id}">Give review</button>`}</section></aside></div>`,
    };
  };

  V.pay = (q) => {
    const o = order(q.get("id"));
    if (!o || o.owner) return go("#/orders");
    if (!["AWAITING_PAYMENT", "PAYMENT_SENT"].includes(o.status)) return go("#/orders/" + o.id);
    const b = S.settings.bank || {};
    const ref = "GF-" + o.id;
    const sent = o.status === "PAYMENT_SENT";
    return {
      title: "Pay by bank transfer",
      back: o.kind === "plan" ? "#/plans" : "#/orders",
      html: `<div class="cols"><section class="card stack">
      <div class="paycard"><div class="row row--sb"><b>BANK TRANSFER</b>${ic("wallet")}</div><span class="num">${esc(b.account_number || "")}</span><div class="row row--sb"><div><small>Bank</small><b>${esc(b.bank_name || "")}</b></div><div><small>Account name</small><b>${esc(b.account_name || "")}</b></div></div></div>
      <div class="row wrap"><button class="btn btn--line btn--sm" data-act="copy" data-v="${esc(b.account_number || "")}">${ic("link")}Copy account number</button><button class="btn btn--line btn--sm" data-act="copy" data-v="${esc(ref)}">${ic("link")}Copy reference ${esc(ref)}</button></div>
      <ol class="tl"><li class="${sent ? "done" : "now"}"><b>Transfer exactly ${money(o.total)}</b><small>From any Nigerian bank app. Put ${esc(ref)} in the narration if you can.</small></li><li class="${sent ? "now" : ""}"><b>Tell us you've paid</b><small>We check the account and confirm, usually within a few hours.</small></li><li><b>${o.kind === "plan" ? "A nutritionist picks up your plan" : "We gather, check and pack your groceries"}</b><small>You'll see each step here and in Notifications.</small></li></ol>
      ${o.note ? `<div class="pin" style="background:var(--r-soft)"><span><b>We couldn't confirm your last transfer:</b> ${esc(o.note)}</span></div>` : ""}
      ${
        sent
          ? `<div class="pin"><span><b>Thanks.</b> You told us you paid from ${esc(o.paySender)} (${esc(o.payBank)}). We're confirming it now.</span></div>`
          : `<form class="stack" data-form="paid" data-id="${o.id}" novalidate><h2 class="h" style="margin:0">I've sent the money</h2><div class="grid2"><label class="field"><span>Name on the account you paid from</span><input class="inp" name="sender" autocomplete="name" value="${esc(S.user.name)}"></label><label class="field"><span>Your bank</span><input class="inp" name="bank" list="gf-banks" placeholder="e.g. GTBank, OPay"></label></div><datalist id="gf-banks">${["Access Bank", "First Bank", "GTBank", "Kuda", "Moniepoint", "OPay", "PalmPay", "UBA", "Wema Bank", "Zenith Bank"].map((x) => `<option value="${x}">`).join("")}</datalist><p class="err" data-err hidden></p><button class="btn btn--block">I've sent ${money(o.total)}</button></form>`
      }</section>
      <aside class="stack"><section class="card stack"><dl class="kv"><div><dt>${o.kind === "plan" ? esc(o.name) + " · meal plan" : "Grocery items"}</dt><dd>${money(o.total)}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(o.total)}</b></dd></div></dl>
        <p class="mute" style="font-size:13px">Pay only into the ${esc(b.bank_name || "")} account above. GreenFed will never ask for your card PIN or a code by phone.</p>
        <button class="btn btn--ghost btn--block" data-act="cancel-order" data-id="${o.id}">Cancel this order</button></section></aside></div>`,
    };
  };
  V.success = (q) => {
    const o = order(q.get("id"));
    if (!o) return go("#/home");
    return {
      title: "Thank you",
      html: `<section class="card stack center" style="max-width:520px;margin:0 auto"><div class="big-ok">${ic("check")}</div><h2 class="title-g" style="font-size:26px">Thank you</h2>
      <p>We're confirming your transfer of <b>${money(o.total)}</b> for ${o.kind === "plan" ? "your meal plan. Once it's confirmed, a nutritionist picks it up and you'll get your plan within 48 hours." : "your grocery items. Once it's confirmed, we gather, check and pack your order before it heads to you."}</p>
      <a class="btn btn--block" href="#/orders/${o.id}">${o.kind === "plan" ? "Track meal plan" : "Track grocery"}</a><a class="btn btn--ghost btn--block" href="#/home">Go back</a></section>`,
    };
  };
  V.grocery = (q) => {
    const tab = q.get("tab") || "popular";
    const cat = q.get("cat") || "";
    const planId = q.get("plan");
    const planO = planId ? order(planId) : myOrders().find((o) => o.kind === "plan" && o.days);
    let list = ITEMS;
    let note2 = "";
    if (tab === "plan") {
      if (planO && planO.days) {
        const ids = [...new Set(planO.days.flat().flatMap((m) => m.items))];
        list = ids.map(item).filter(Boolean);
        note2 = `${list.length} items from ${esc(planO.name)}.`;
      } else {
        list = [];
        note2 = "You don't have a delivered meal plan yet.";
      }
    } else if (tab === "offers") list = ITEMS.filter((i) => i.off);
    else if (tab === "new") list = ITEMS.filter((i) => i.neu);
    else if (tab === "favs") list = ITEMS.filter((i) => S.favs.includes(i.id));
    else if (tab === "recent") {
      const ids = [
        ...new Set(
          myOrders()
            .filter((o) => o.kind === "grocery")
            .flatMap((o) => o.items.map(([id]) => id)),
        ),
      ];
      list = ids.map(item).filter(Boolean);
    } else if (tab === "popular" && !cat) list = ITEMS.filter((i) => i.pop).concat(ITEMS.filter((i) => !i.pop));
    if (cat) list = list.filter((i) => i.cat === cat);
    const tabs = [
      ["popular", "Popular"],
      ["plan", "From plans"],
      ["recent", "Recents"],
      ["offers", "Offers"],
      ["new", "What's new"],
      ["favs", "Favorites"],
    ];
    return {
      title: "Menu",
      html: `<div class="stack">
      <label class="search"><span class="sr-only">Search groceries</span>${ic("search")}<input class="inp" type="search" placeholder="What are you looking for?" data-act="gsearch"></label>
      ${(() => {
        const top = Math.max(0, ...ITEMS.map((i) => i.disc || 0));
        return top
          ? `<a class="promo-g" href="#/grocery?tab=offers"><span class="art">${ic("bowl")}</span><div><small>Get up to</small><b>${top}% Discount</b><small>On selected groceries this week. See Offers.</small></div></a>`
          : "";
      })()}
      <div class="row row--sb"><h2 class="h" style="margin:0">Categories</h2>${cat ? `<a class="link" href="#/grocery?tab=${tab}">See all</a>` : ""}</div>
      <div class="cats" role="group" aria-label="Categories">${CATS.map(([n, i]) => `<a class="cat" href="#/grocery?tab=${tab}&cat=${n}" aria-pressed="${cat === n}"><span>${ic(i)}</span>${n}</a>`).join("")}</div>
      <div class="utabs" role="group" aria-label="Lists">${tabs.map(([kk, n]) => `<a href="#/grocery?tab=${kk}${cat ? "&cat=" + cat : ""}" aria-current="${tab === kk}">${n}</a>`).join("")}</div>
      ${note2 ? `<div class="row row--sb wrap"><p class="mute">${note2}</p>${tab === "plan" && list.length ? `<button class="btn btn--sm" data-act="add-plan" data-ids="${list.map((i) => i.id).join(",")}">${ic("plus")}Add all to cart</button>` : ""}</div>` : ""}
      <p class="mute" style="font-size:13px">${list.length} grocery found</p>
      <div class="prods" data-prods>${list.map(prodCard).join("") || `<div class="card empty" style="grid-column:1/-1"><b>No items here</b><a class="link" href="#/grocery">Browse all groceries</a></div>`}</div></div>`,
    };
  };
  function prodCard(it) {
    const q = S.cart[it.id] || 0;
    return `<article class="prod" data-q="${esc((it.name + " " + it.cat).toLowerCase())}"><div class="prod__art" style="--tint:${CAT[it.cat].t};--ink2:${CAT[it.cat].c}">${ic(CAT[it.cat].i)}${it.off ? `<span class="prod__off">−${it.disc}%</span>` : ""}</div>
      <button class="fav" data-act="fav" data-id="${it.id}" aria-pressed="${S.favs.includes(it.id)}" aria-label="Favourite ${esc(it.name)}">${ic("heart")}</button>
      <b>${esc(it.name)}</b><small>${esc(it.unit)}${it.al.length ? " · contains " + esc(it.al.join(", ").toLowerCase()) : ""}</small>
      <div class="prod__row"><span class="price">${money(priceOf(it))}${it.off ? `<s>${money(it.price)}</s>` : ""}</span>${q ? `<span class="qty"><button data-act="qty" data-id="${it.id}" data-d="-1" aria-label="Remove one">−</button><b>${q}</b><button data-act="qty" data-id="${it.id}" data-d="1" aria-label="Add one">+</button></span>` : `<button class="addbtn" data-act="qty" data-id="${it.id}" data-d="1" aria-label="Add ${esc(it.name)} to cart">${ic("plus")}</button>`}</div></article>`;
  }
  V.cart = () => {
    const rows = Object.entries(S.cart).filter(([id]) => item(id));
    const allAl = [...new Set(S.members.flatMap((m) => m.allergies))];
    const warn = rows.map(([id]) => item(id)).filter((it) => it.al.some((a) => allAl.includes(a)));
    return {
      title: "My cart",
      back: "#/grocery",
      html: rows.length
        ? `<form class="cols" data-form="checkout" novalidate><div class="stack">
      <section class="card"><div class="row row--sb"><h2 class="h" style="margin:0">${rows.length} items</h2><button type="button" class="link" data-act="clear-cart">Clear cart</button></div>
        <ul class="list">${rows
          .map(([id, q]) => {
            const it = item(id);
            return `<li>${art(it, 54)}<div class="grow"><b>${esc(it.name)}</b><small>${esc(it.unit)} · ${money(priceOf(it))}</small></div><span class="qty"><button type="button" data-act="qty" data-id="${id}" data-d="-1" aria-label="Remove one">−</button><b>${q}</b><button type="button" data-act="qty" data-id="${id}" data-d="1" aria-label="Add one">+</button></span><b style="min-width:64px;text-align:right">${money(priceOf(it) * q)}</b></li>`;
          })
          .join("")}</ul></section>
      ${warn.length ? `<div class="pin" style="background:var(--r-soft)"><span><b>Allergy check:</b> ${esc(warn.map((w) => w.name).join(", "))} contain${warn.length === 1 ? "s" : ""} ${esc([...new Set(warn.flatMap((w) => w.al.filter((a) => allAl.includes(a))))].join(", ").toLowerCase())}, which someone in your household is allergic to.</span></div>` : ""}
      <section class="card stack"><h2 class="h" style="margin:0">Delivery</h2>
        <label class="field"><span>Delivery address</span><input class="inp" name="address" value="${esc(S.user.address)}"></label>
        <label class="field"><span>Delivery slot</span><select class="inp" name="slot">${(S.settings.slots || []).map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>
        <div class="toggle-row"><div><b>Deliver every week</b><small class="mute">Farm-fresh produce on the same day each week</small></div><label class="switch"><input type="checkbox" name="weekly" checked aria-label="Deliver every week"><span></span></label></div></section></div>
      <aside class="stack" style="position:sticky;top:20px"><section class="card stack"><dl class="kv"><div><dt>Subtotal</dt><dd>${money(rows.reduce((a, [id, q]) => a + item(id).price * q, 0))}</dd></div><div><dt>Offers</dt><dd style="color:var(--p)">−${money(rows.reduce((a, [id, q]) => a + (item(id).price - priceOf(item(id))) * q, 0))}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(cartTotal())}</b></dd></div></dl>
        <p class="mute" style="font-size:13px">You'll pay by bank transfer to GreenFed on the next screen.</p><p class="err" data-err hidden></p><button class="btn btn--block">Checkout</button></section></aside></form>`
        : `<div class="card empty"><b>Your cart is empty</b><a class="btn btn--sm" href="#/grocery" style="margin-top:10px">Shop grocery</a></div>`,
    };
  };

  V.orders = (q) => {
    const f = q.get("f") || "active";
    const list = myOrders()
      .filter((o) => (f === "active" ? isLive(o) : f === "done" ? o.status === "DELIVERED" : true))
      .sort((a, b) => b.created - a.created);
    return {
      title: "Track orders",
      html: `<div class="stack" style="max-width:820px"><div class="utabs" role="group" aria-label="Filter">${[
        ["active", "On the way"],
        ["done", "Delivered"],
        ["all", "All"],
      ]
        .map(([kk, n]) => `<a href="#/orders?f=${kk}" aria-current="${f === kk}">${n}</a>`)
        .join("")}</div>
      <div>${list.map(orderRow).join("") || `<div class="card empty"><b>No orders here</b></div>`}</div></div>`,
    };
  };
  V.orderOne = (q, id) => {
    const o = order(id);
    if (!o || o.owner) return go("#/orders");
    const isG = o.kind === "grocery";
    const flow = isG ? GROC_FLOW : PLAN_FLOW;
    const conflict = S.conflicts.find((c) => c.order === o.id);
    const payBox =
      o.status === "AWAITING_PAYMENT"
        ? `<section class="card stack"><b>Waiting for your payment</b><p class="mute">${o.note ? esc(o.note) : "Transfer " + money(o.total) + " to GreenFed to start this order."}</p><a class="btn btn--sm" href="#/pay?id=${o.id}">Pay now</a></section>`
        : o.status === "PAYMENT_SENT"
          ? `<section class="card stack"><b>Confirming your payment</b><p class="mute">You told us you paid from ${esc(o.paySender)} (${esc(o.payBank)}). We'll let you know as soon as it's confirmed.</p></section>`
          : "";
    return {
      title: isG ? "Tracking order" : "Meal plan request",
      back: "#/orders",
      html: `<div class="cols"><div class="stack">
      ${isG && o.status === "EN_ROUTE" ? `<div class="map"><svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-label="Map of the delivery route"><g class="roads" fill="none" stroke-width="9"><path d="M-10 60 L410 90"/><path d="M-10 170 L410 150"/><path d="M90 -10 L120 240"/><path d="M250 -10 L230 240"/></g><path class="route" d="M60 150 C120 120 130 70 200 64 S300 40 340 30" fill="none" stroke="#27A844" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="150" r="9" fill="#27A844"/><path d="M340 14c-7 0-11 5-11 10 0 8 11 17 11 17s11-9 11-17c0-5-4-10-11-10z" fill="#F59E0B"/><g class="rider moving" style="--at:60%"><circle r="11" fill="#fff"/><circle r="8" fill="#27A844"/></g></svg><span class="map__live" style="color:var(--p)">● Your order is on the way</span><div class="map__eta"><small>${esc(o.staff.delivery || "GreenFed delivery")}</small><b>${esc(o.slot)}</b></div></div>` : ""}
      <section class="card stack"><div class="row row--sb wrap"><div><small class="mute">${isG ? "Grocery order" : "Meal plan"}</small><p class="h" style="margin:0">${isG ? "#" + esc(o.id) : esc(o.name)}</p></div>${chip(o.status)}</div>${timeline(o)}
        ${isG && paidOrder(o) && o.status !== "PAID" ? `<p class="mute" style="font-size:13px">Tap the stars to review each stage.</p>` : ""}</section>
      ${payBox}
      ${o.kind === "plan" && o.status === "DELIVERED" ? `<a class="btn" href="#/plans/${o.id}">View my plan</a>` : ""}</div>
    <div class="stack">
      <section class="card stack"><h2 class="h" style="margin:0">Details</h2>${
        isG
          ? `<ul class="list">${o.items.map((l) => `<li><div class="grow"><b>${esc(lineName(l))}</b><small>${l[1]} × ${money(l[2])}</small></div><span>${money(l[2] * l[1])}</span></li>`).join("")}</ul><dl class="kv"><div><dt>Deliver to</dt><dd>${esc(o.address)}</dd></div><div><dt>Slot</dt><dd>${esc(o.slot)}${o.weekly ? " · weekly" : ""}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(o.total)}</b></dd></div></dl>`
          : `<dl class="kv"><div><dt>For</dt><dd>${esc(o.memberNames.join(", "))}</dd></div><div><dt>Meals</dt><dd>${esc(o.meals.join(", "))}</dd></div><div><dt>Allergies</dt><dd>${esc(o.allergies.join(", ") || "None")}</dd></div><div><dt>Nutritionist</dt><dd>${esc(o.staff.nutritionist || "Not picked yet")}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(o.price)}</b></dd></div></dl>`
      }</section>
      ${["AWAITING_PAYMENT", "PAYMENT_SENT"].includes(o.status) ? `<button class="btn btn--ghost btn--sm" data-act="cancel-order" data-id="${o.id}">Cancel this order</button>` : ""}
      ${isG && paidOrder(o) ? (conflict ? `<section class="card stack"><b>Problem reported</b><p class="mute">${esc(conflict.type)} · ${chip(conflict.status)}${conflict.resolution ? "<br>" + esc(conflict.resolution) : ""}</p></section>` : `<section class="card stack"><b>Something wrong?</b><div class="grid2"><button class="btn btn--line btn--sm" data-act="conflict" data-id="${o.id}" data-t="Late delivery">Late delivery</button><button class="btn btn--line btn--sm" data-act="conflict" data-id="${o.id}" data-t="Poor quality">Poor quality</button></div></section>`) : ""}

    </div></div>`,
    };
  };

  V.community = (q) => {
    const tab = q.get("tab") || "mine";
    const qcat = q.get("cat") || "";
    let list = S.communities;
    if (tab === "mine") list = list.filter((c) => c.joined);
    if (tab === "foryou") list = list.filter((c) => !c.joined);
    if (qcat) list = list.filter((c) => c.cat === qcat);
    const cats = [...new Set(S.communities.map((c) => c.cat))];
    return {
      title: "Community",
      html: `<div class="cols"><div class="stack">
      <label class="search"><span class="sr-only">Search communities</span>${ic("search")}<input class="inp" type="search" placeholder="Search" data-act="csearch"></label>
      <div class="utabs" role="group" aria-label="Communities">${[
        ["mine", "My communities"],
        ["foryou", "For you"],
        ["all", "All"],
      ]
        .map(([kk, n]) => `<a href="#/community?tab=${kk}" aria-current="${tab === kk}">${n}</a>`)
        .join("")}</div>
      <div class="chips">${cats.map((c) => `<a class="chip" href="#/community?tab=${tab}${qcat === c ? "" : "&cat=" + encodeURIComponent(c)}" aria-pressed="${qcat === c}">${esc(c)}</a>`).join("")}</div>
      <div data-comms>${list.map((c) => `<a class="comm" href="#/community/${c.id}" data-q="${esc((c.name + " " + c.cat + " " + c.desc).toLowerCase())}"><span class="comm__ico">${ic(c.pub ? "users" : "lock")}</span><b>${esc(c.name)}</b><span class="comm__side"><span>${c.members} member${c.members === 1 ? "" : "s"}</span>${c.joined ? chip("ACTIVE").replace("Active", "Joined") : c.pending ? chip("PICKED").replace("Picked", "Requested") : `<span class="link">Join</span>`}</span><small>${c.pub ? "" : "Private · "}${esc(c.last)}</small></a>`).join("") || `<div class="card empty"><b>No communities here</b></div>`}</div></div>
      <aside class="stack">${canCreate() ? `<section class="card stack"><b>Start a community</b><p class="mute">Public or private, around any food or health topic.</p><a class="btn btn--block" href="#/community/new">${ic("plus")}Create community</a></section>` : ""}
        ${role() !== "user" ? "" : `<section class="card stack"><b>Health professional?</b><p class="mute">Sign up as a handler or community leader to guide members.</p>${S.leader ? `<p>${chip("PICKED").replace("Picked", "Application pending")}</p>` : `<button class="btn btn--line btn--block" data-act="leader">Apply to lead</button>`}</section>`}
        <p class="mute" style="font-size:13px">Communities are open to everyone, including people who don't use meal plans or grocery delivery.</p></aside></div>`,
    };
  };
  V.newComm = () => ({
    title: "New community",
    back: "#/community",
    html: `<form class="card stack" data-form="comm" style="max-width:640px" novalidate>
    <div class="seg" role="radiogroup" aria-label="Visibility"><label><input type="radio" name="pub" value="1" checked><span>${ic("globe")}Public<small>Anyone can join</small></span></label><label><input type="radio" name="pub" value="0"><span>${ic("lock")}Private<small>You approve who joins</small></span></label></div>
    <label class="field"><span>Community name</span><input class="inp" name="name" placeholder="Give your community a name"></label>
    <label class="field"><span>Description</span><textarea class="inp" name="desc" placeholder="What is the community about?"></textarea></label>
    <label class="field"><span>Category</span><select class="inp" name="cat">${["Allergies", "Health issues", "Nutrition", "Food & craft", "Rehabilitation", "Other"].map((c) => `<option>${c}</option>`).join("")}</select></label>
    <fieldset class="field" style="border:0;padding:0;margin:0"><span>Permissions</span><div class="seg"><label><input type="radio" name="perms" value="anyone" checked><span>Anyone can post</span></label><label><input type="radio" name="perms" value="admins"><span>Only you and health specialists post</span></label></div></fieldset>
    <p class="err" data-err hidden></p><button class="btn">Create</button></form>`,
  });
  V.commOne = (q, id) => {
    const c = S.communities.find((x) => x.id === id);
    if (!c) return go("#/community");
    const posts = S.posts.filter((p) => p.c === id).sort((a, b) => b.at - a.at);
    const spec = isSpec();
    const canPost = c.joined && (c.perms === "anyone" || c.mod || spec);
    const canSee = c.pub || c.joined || role() === "admin";
    return {
      title: c.name,
      back: "#/community",
      html: `<div class="cols"><div class="stack">
      <div class="cover">${ic(c.pub ? "users" : "lock")}</div>
      <div class="row row--sb wrap"><div><h2 class="h" style="margin:0">${esc(c.name)}</h2><small class="mute">${esc(c.cat)} · ${c.members} members · ${c.pub ? "Public" : "Private"}</small></div>
        <div class="row">${c.joined ? `<button class="btn btn--ghost btn--sm" data-act="leave" data-id="${c.id}">Leave</button>` : c.pending ? `<button class="btn btn--ghost btn--sm" disabled>Request sent</button>` : `<button class="btn btn--sm" data-act="join" data-id="${c.id}">${c.pub ? "Join" : "Request to join"}</button>`}<button class="btn btn--line btn--sm" data-act="share" data-what="${esc(c.name)} community">${ic("share")}Invite</button></div></div>
      <p class="mute">${esc(c.desc)}</p>
      ${
        canPost
          ? `<form class="card stack" data-form="post" data-c="${c.id}" novalidate><label class="field"><span>Topic</span><input class="inp" name="title" placeholder="Topic being discussed"></label><label class="field"><span>Type your post</span><textarea class="inp" name="body"></textarea></label><p class="err" data-err hidden></p><button class="btn btn--sm" style="justify-self:start">${ic("send")}Send post</button></form>`
          : `<p class="card mute">${c.joined ? "Only the community's leaders and health specialists start posts here. You can reply to posts." : c.pub ? "Join to post and reply." : "This is a private community. Ask to join to read and post."}</p>`
      }
      ${c.requests && c.requests.length ? `<section class="card stack"><b>Asking to join</b><ul class="list">${c.requests.map((r) => `<li><span class="ava ava--soft">${initials(r.name)}</span><div class="grow"><b>${esc(r.name)}</b></div><button class="btn btn--sm" data-act="comm-approve" data-id="${c.id}" data-u="${r.id}">Approve</button><button class="btn btn--ghost btn--sm" data-act="comm-decline" data-id="${c.id}" data-u="${r.id}">Decline</button></li>`).join("")}</ul></section>` : ""}
      <div>${canSee ? posts.map((p) => postCard(p, c)).join("") || `<div class="card empty"><b>No posts yet</b>Be the first to start a conversation.</div>` : ""}</div></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">About</h2><dl class="kv"><div><dt>Creator</dt><dd>${esc(c.by)}</dd></div><div><dt>Category</dt><dd>${esc(c.cat)}</dd></div><div><dt>Who can post</dt><dd>${c.perms === "anyone" ? "Any member" : "Leaders and health specialists"}</dd></div></dl></section></aside></div>`,
    };
  };
  const replyTree = (rs, pid, c) =>
    rs
      .map(
        (r) =>
          `<div class="reply"><div class="post__by"><span class="ava ava--soft" style="width:30px;height:30px;font-size:11px">${initials(r.by)}</span><b>${esc(r.by)}</b>${r.role ? `<span class="st st--PAID">${esc(r.role)}</span>` : ""}<span>· ${ago(r.at)}</span></div><p>${esc(r.body)}</p>${canReply(c) ? `<button class="link" style="justify-self:start;font-size:13px" data-act="reply" data-p="${pid}" data-r="${r.id}"${isSpec() ? ' data-as="specialist"' : ""}>Reply</button>` : ""}${replyTree(r.replies, pid, c)}</div>`,
      )
      .join("");
  const postCard = (
    p,
    c,
  ) => `<article class="post"><div class="post__by"><span class="ava">${initials(p.by)}</span><div><b>${esc(p.by)}</b> · ${ago(p.at)}</div></div><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p>
    <div class="post__acts"><button data-act="like" data-id="${p.id}" aria-pressed="${p.liked}">${ic("heart")}${k(p.likes)}</button>${canReply(c) ? `<button data-act="reply" data-p="${p.id}"${isSpec() ? ' data-as="specialist"' : ""}>${ic("chat")}Reply</button>` : `<span>${ic("chat")}${p.replies.length}</span>`}<button data-act="share" data-what="this post">${ic("share")}Share</button>${p.mine || c.mod ? `<button data-act="del-post" data-id="${p.id}">${ic("trash")}Remove</button>` : ""}</div>
    ${replyTree(p.replies, p.id, c)}</article>`;

  const isSpec = () => (role() === "employee" && S.emp.type === "health") || role() === "admin";
  const canReply = (c) => c.joined || isSpec() || (c.pub && role() === "user");
  const canCreate = () => role() === "user" || role() === "admin" || (role() === "employee" && S.emp.type === "health");

  V.notes = (q) => {
    const f = q.get("f") || "All";
    const list = S.notes.filter((n) => f === "All" || n.cat === f);
    return {
      title: "Notification",
      html: `<div class="stack" style="max-width:820px"><div class="row row--sb wrap"><div class="utabs">${["All", ...new Set(S.notes.map((n) => n.cat))].map((c) => `<a href="#/notifications?f=${encodeURIComponent(c)}" aria-current="${f === c}">${c}</a>`).join("")}</div><button class="link" data-act="read-all">Mark all as read</button></div>
      <section class="card">${list.length ? `<ul class="list">${list.map((n) => `<li><span class="ava ${n.read ? "ava--soft" : ""}">${ic({ Grocery: "bag", "Meal Plan": "plan", Payment: "wallet", Community: "users", Conflict: "flag", Staff: "clipboard" }[n.cat] || "user")}</span><a class="grow" href="${n.link}" data-act="open-note" data-id="${n.id}"><b>${esc(n.t)}</b><small>${esc(n.s)}<br>${ago(n.at)} · ${esc(n.cat)}</small></a></li>`).join("")}</ul>` : `<div class="empty"><b>You're all caught up</b></div>`}</section></div>`,
    };
  };

  V.health = (q) => {
    const tab = q.get("t") || "All";
    const types = ["Allergy", "Diagnosis", "Family history", "Symptom", "Medication", "DNA test"];
    const list = S.records.filter((r) => tab === "All" || r.type === tab);
    return {
      title: "Health records",
      back: "#/home",
      html: `<div class="stack">
      <div class="stat-row">${[
        ["Total records", S.records.length],
        ["Allergies", S.records.filter((r) => r.type === "Allergy").length],
        ["Diagnoses", S.records.filter((r) => r.type === "Diagnosis").length],
        ["Family history", S.records.filter((r) => r.type === "Family history").length],
      ]
        .map(([n, v]) => `<div><b>${v}</b><small>${n}</small></div>`)
        .join("")}</div>
      <div class="row wrap"><label class="search" style="flex:1;min-width:200px"><span class="sr-only">Search your report</span>${ic("search")}<input class="inp" type="search" placeholder="Search your report" data-act="hsearch"></label><button class="btn" data-act="add-rec">${ic("plus")}Add record</button></div>
      <div class="utabs">${["All", ...types].map((t) => `<a href="#/health?t=${encodeURIComponent(t)}" aria-current="${tab === t}">${t === "All" ? "All records" : t}</a>`).join("")}</div>
      <section class="card"><p class="mute" style="font-size:13px">${list.length} records found · ID: ${String(ACCOUNT ? ACCOUNT.id : "").padStart(7, "0")}</p><div class="recs" data-recs>${list.map((r) => `<div class="rec" data-q="${esc((r.name + " " + r.type + " " + memberName(r.member)).toLowerCase())}"><span class="rec__ico">${ic(r.type === "Allergy" ? "alert" : r.type === "Medication" ? "pill" : "heart")}</span><b>${esc(r.name)}</b><button class="btn btn--danger btn--sm" data-act="del-rec" data-id="${r.id}" aria-label="Delete record ${esc(r.name)}">${ic("trash")}</button><small class="mute">${esc(r.type)} · ${esc(memberName(r.member))} · ${fmtDate(r.date)} · ${esc(r.by)} · <span class="sev sev--${r.sev}">${r.sev}</span></small></div>`).join("") || `<p class="mute">No records in this list.</p>`}</div></section>
      <p class="mute" style="font-size:13px">Only you can see these records. GreenFed staff see the allergies you put on a meal plan, nothing else, and records are never shared in communities.</p></div>`,
    };
  };

  V.profile = (q) => {
    const r = role();
    const open = q.get("open") || "";
    const pp = (key, icon, title, sub, body) =>
      `<li><button data-act="panel" data-p="${key}" aria-expanded="${open === key}">${ic(icon)}<span class="grow"><b>${title}</b><small>${sub}</small></span>${ic(open === key ? "chev-down" : "chev-right")}</button>${open === key ? `<div class="panel">${body}</div>` : ""}</li>`;
    const tog = (kk, t, s) =>
      `<div class="toggle-row"><div><b>${t}</b><small class="mute">${s}</small></div><label class="switch"><input type="checkbox" data-act="pref" data-k="${kk}" ${S.prefs[kk] ? "checked" : ""} aria-label="${t}"><span></span></label></div>`;
    const u = S.user;
    const name = u.name;
    const me = S.members[0] || {};
    return {
      title: "Profile",
      html: `<div class="cols"><section class="card"><ul class="menu">
      ${
        r === "user"
          ? pp(
              "personal",
              "user",
              "Personal information",
              "Sex, age, address, occupation",
              `<form class="stack" data-form="profile" novalidate><p class="mute" style="font-size:13px">Your name and phone number are part of your Rehohub account. <a class="link" href="${esc(RH.url("account/index.html"))}">Change them there.</a></p><div class="grid2"><label class="field"><span>Sex</span><select class="inp" name="sex">${["", "Female", "Male"].map((s) => `<option ${me.sex === s ? "selected" : ""} value="${s}">${s || "Choose"}</option>`).join("")}</select></label><label class="field"><span>Age</span><input class="inp" name="age" type="number" min="0" max="120" value="${me.age || ""}"></label></div>
        <label class="field"><span>Marital status</span><input class="inp" name="marital" value="${esc(u.marital)}"></label>
        <label class="field"><span>Address</span><input class="inp" name="address" value="${esc(u.address)}"></label><label class="field"><span>Occupation</span><input class="inp" name="occupation" value="${esc(u.occupation)}"></label><button class="btn btn--sm">Update</button></form>`,
            )
          : ""
      }
      ${
        r === "user"
          ? pp(
              "health",
              "heart",
              "Health status",
              "Height, body goal, allergies",
              `<form class="stack" data-form="healthst" novalidate><div class="grid2"><label class="field"><span>Height (cm)</span><input class="inp" name="height" type="number" value="${u.height || ""}"></label><label class="field"><span>Weight (kg)</span><input class="inp" name="weight" type="number" value="${u.weight || ""}"></label></div>
        <label class="field"><span>Body goal</span><select class="inp" name="goal">${["", "Lose weight", "Maintain a healthy weight", "Gain weight", "Build muscle", "Manage a health condition"].map((g) => `<option value="${g}" ${u.goal === g ? "selected" : ""}>${g || "Choose"}</option>`).join("")}</select></label><label class="field"><span>Goal description</span><input class="inp" name="goalNote" value="${esc(u.goalNote)}"></label>
        <fieldset class="field" style="border:0;padding:0;margin:0"><span>My allergies</span><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}" ${me.allergies.includes(a) ? "checked" : ""}><span>${a}</span></label>`).join("")}</div></fieldset><button class="btn btn--sm">Save</button></form>`,
            )
          : ""
      }
      ${r === "user" ? `<li><a href="#/family">${ic("users")}<span class="grow"><b>Family members</b><small>${S.members.length - 1} added · add husband, wife or kids</small></span>${ic("chev-right")}</a></li><li><a href="#/health">${ic("clipboard")}<span class="grow"><b>My health record</b><small>Allergies, diagnoses, reports</small></span>${ic("chev-right")}</a></li><li><a href="../assets/media/greenfed/greenfed-tour.mp4" download="GreenFed-quick-tour.mp4">${ic("download")}<span class="grow"><b>How to use GreenFed</b><small>Download the 2-minute video tour</small></span>${ic("chev-right")}</a></li>` : ""}
      ${pp("notify", "bell", "Notification", "Email and app alerts", `${tog("email", "Email", "Meal plan delivery and order updates")}${tog("push", "In-app", "Every stage of your orders")}${tog("community", "Community", "Replies and mentions")}${tog("promos", "Offers", "New plans and grocery discounts")}`)}
      ${pp("account", "lock", "Account", "Email, password, delete account", `<dl class="kv"><div><dt>Email</dt><dd>${esc(u.email)}</dd></div><div><dt>Status</dt><dd>${chip("ACTIVE")}</dd></div></dl><a class="btn btn--line btn--sm" href="${esc(RH.url("account/index.html"))}">Email, password and roles</a>`)}
      <li><div class="toggle-row" style="padding:14px 4px;border-bottom:1px solid var(--line)"><div class="row">${ic("moon")}<b>Dark mode</b></div><label class="switch"><input type="checkbox" data-act="pref" data-k="dark" ${S.prefs.dark ? "checked" : ""} aria-label="Dark mode"><span></span></label></div></li>
      <li><button class="danger" data-act="logout">${ic("logout")}<span class="grow"><b>Log out</b></span></button></li></ul></section>
      <aside class="stack"><section class="card prof"><span class="ava ava--lg">${initials(name)}</span><h2>${esc(name)}</h2><p class="mute">${esc(r === "employee" ? S.emp.name : r === "admin" ? "Administrator" : u.email)}</p>${r === "user" ? `<dl class="facts"><div><dt>Age</dt><dd>${me.age || "—"}</dd></div><div><dt>Height</dt><dd>${u.height ? u.height + " cm" : "—"}</dd></div><div><dt>Goal</dt><dd>${esc(u.goal || "—")}</dd></div></dl>` : ""}</section></aside></div>`,
    };
  };
  V.family = () => ({
    title: "Add family member",
    back: "#/profile",
    html: `<div class="cols"><form class="card stack" data-form="member" novalidate>
      <fieldset class="field" style="border:0;padding:0;margin:0"><span>Select family member</span><div class="seg">${["Husband", "Wife", "Child", "Parent", "Other"].map((x, i) => `<label><input type="radio" name="rel" value="${x}" ${i === 0 ? "checked" : ""}><span>${x}</span></label>`).join("")}</div></fieldset>
      <div class="grid2"><label class="field"><span>Name</span><input class="inp" name="name"></label><label class="field"><span>Age</span><input class="inp" name="age" type="number" min="0" max="120"></label></div>
      <label class="field"><span>Sex</span><select class="inp" name="sex"><option>Female</option><option>Male</option></select></label>
      <fieldset class="field" style="border:0;padding:0;margin:0"><span>Allergies</span><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}"><span>${a}</span></label>`).join("")}</div></fieldset>
      <label class="field"><span>Health status</span><input class="inp" name="cond" placeholder="e.g. none, diabetes"></label>
      <p class="err" data-err hidden></p><button class="btn">Continue</button></form>
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Your household</h2>${S.members.map((m) => `<div class="member"><span class="ava ava--soft">${initials(m.name)}</span><div><b>${esc(m.name)}</b><small>${esc(m.rel)}${m.age ? " · " + m.age + " yrs" : ""}${m.allergies.length ? " · " + esc(m.allergies.join(", ")) : ""}</small></div>${m.rel === "You" ? "" : `<button class="btn btn--danger btn--sm" data-act="del-mem" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">${ic("trash")}</button>`}</div>`).join("")}</section></aside></div>`,
  });

  // ------------------------------------------------------------ employee views
  function queueFor(type) {
    const O = S.orders;
    if (type === "nutritionist") return O.filter((o) => o.kind === "plan" && o.status === "PAID");
    if (type === "supply") return O.filter((o) => o.kind === "grocery" && o.status === "PAID");
    if (type === "supplier") return O.filter((o) => o.kind === "grocery" && ["PAID", "GATHERING"].includes(o.status));
    if (type === "qa") return O.filter((o) => o.kind === "grocery" && o.status === "GATHERING" && o.gathered);
    if (type === "delivery") return O.filter((o) => o.kind === "grocery" && o.status === "QA" && o.passed);
    return [];
  }
  const mine = (o, key) => (o.staffMine || []).includes(key);
  function activeFor(type) {
    const O = S.orders;
    if (type === "nutritionist")
      return O.find(
        (o) => o.kind === "plan" && ["PICKED", "IN_PROGRESS"].includes(o.status) && mine(o, "nutritionist"),
      );
    if (type === "supply")
      return O.find((o) => o.kind === "grocery" && o.status === "GATHERING" && !o.gathered && mine(o, "supply"));
    if (type === "qa") return O.find((o) => o.kind === "grocery" && o.status === "QA" && !o.passed && mine(o, "qa"));
    if (type === "delivery")
      return O.find((o) => o.kind === "grocery" && ["PACKAGED", "EN_ROUTE"].includes(o.status) && mine(o, "delivery"));
    return null;
  }
  const owner = (o) => o.owner || S.user.name;
  const linesText = (o) => o.items.map((l) => l[1] + " × " + lineName(l)).join(", ");
  // The nutritionist's 7-day draft: generated from the meal library around the plan's allergies, then edited.
  const DRAFTS = {};
  function planEditor(o) {
    const gen = (DRAFTS[o.id] = DRAFTS[o.id] || DAYS.map((_, i) => genDay(i, o.meals, o.allergies)));
    return `<form class="stack" data-form="deliver" data-id="${o.id}" novalidate><b>7-day plan</b><p class="mute" style="font-size:13px">Drafted from the GreenFed meal library, avoiding ${o.allergies.length ? esc(o.allergies.join(", ").toLowerCase()) : "nothing (no allergies listed)"}. Edit any dish before you deliver.</p>
      ${DAYS.map(
        (dn, d) =>
          `<details ${d === 0 ? "open" : ""}><summary><b>${dn}</b></summary><div class="stack" style="margin-top:8px">${gen[
            d
          ]
            .map(
              (m, i) =>
                `<label class="field"><span>${m.meal}</span><textarea class="inp" name="d${d}m${i}" rows="2" maxlength="300">${esc(m.dish)}</textarea></label>`,
            )
            .join("")}</div></details>`,
      ).join("")}
      <p class="err" data-err hidden></p><button class="btn btn--o">Deliver plan to client</button></form>`;
  }
  const payLine = () => {
    const t = EMP[S.emp.type] || {};
    if (t.pay === "task") return `${money(RATE())} per delivered meal plan`;
    if (t.pay === "contract") return "Paid per delivery contract with GreenFed, outside the app";
    return "Salaried. Your salary is paid outside the app";
  };
  V.work = () => {
    const t = S.emp.type,
      e = EMP[t] || { name: S.emp.name, queue: "" };
    const act = activeFor(t);
    const queue = queueFor(t);
    let actHtml = "";
    if (act) {
      const isP = act.kind === "plan";
      const step = isP
        ? act.status === "PICKED"
          ? ["Start working on plan", "start"]
          : null
        : t === "supply"
          ? ["Mark as gathered", "gathered"]
          : t === "qa"
            ? ["Pass quality check", "passed"]
            : act.status === "PACKAGED"
              ? ["Out for delivery", "out"]
              : ["Mark delivered", "delivered"];
      actHtml = `<section class="job job--active"><div class="row row--sb wrap"><b>Current order · ${esc(isP ? act.name : "#" + act.id)}</b>${chip(act.status)}</div>
        <dl class="kv"><div><dt>Client</dt><dd>${esc(owner(act))}</dd></div>${isP ? `<div><dt>Persons</dt><dd>${persons(act)}</dd></div><div><dt>Weeks</dt><dd>${act.weeks}</dd></div><div><dt>Meals</dt><dd>${esc(act.meals.join(", "))}</dd></div><div><dt>Allergies</dt><dd>${esc(act.allergies.join(", ") || "None")}</dd></div>${act.info ? `<div><dt>Notes</dt><dd>${esc(act.info)}</dd></div>` : ""}` : `<div><dt>Items</dt><dd>${esc(linesText(act))}</dd></div><div><dt>Deliver to</dt><dd>${esc(act.address)}</dd></div><div><dt>Slot</dt><dd>${esc(act.slot)}</dd></div>`}</dl>
        ${isP && act.status === "IN_PROGRESS" ? planEditor(act) : ""}
        ${step ? `<button class="btn btn--o" data-act="emp-step" data-id="${act.id}" data-s="${step[1]}">${step[0]}</button>` : ""}</section>`;
    }
    const health = t === "health";
    return {
      title: `My work · ${e.name}`,
      html: `<div class="cols"><div class="stack">
      <div class="card" style="padding:14px"><small class="mute">Your role</small><br /><b>${esc(e.name)}</b></div>
      ${actHtml}
      ${
        health
          ? `<section class="stack"><h2 class="h" style="margin:0">Community: recent posts</h2>${
              S.posts
                .slice()
                .sort((a, b) => b.at - a.at)
                .map((p) => {
                  const c = S.communities.find((x) => x.id === p.c) || { name: "" };
                  return `<article class="post"><div class="post__by"><b>${esc(p.by)}</b> in <a class="link" href="#/community/${p.c}">${esc(c.name)}</a> · ${ago(p.at)}</div><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p><button class="btn btn--sm" style="justify-self:start" data-act="reply" data-p="${p.id}" data-as="specialist">Reply as health specialist</button></article>`;
                })
                .join("") ||
              `<div class="card empty"><b>No posts yet</b>Posts from GreenFed communities appear here.</div>`
            }</section>`
          : `<section class="stack"><h2 class="h" style="margin:0">${esc(e.queue)} · waiting</h2>${
              queue.length
                ? queue
                    .map(
                      (
                        o,
                      ) => `<article class="job"><div class="row row--sb wrap"><b>${esc(o.kind === "plan" ? o.name + " · " + persons(o) + " persons" : "Grocery #" + o.id)}</b>${chip(o.status)}</div><small class="mute">${esc(owner(o))} · ${ago(o.created)}${o.kind === "plan" ? " · " + esc(o.meals.join(", ")) : " · " + o.items.length + " items · " + esc(o.slot)}</small>
            ${t === "supplier" ? `<p class="mute">${esc(linesText(o))}</p><button class="btn btn--sm" style="justify-self:start" data-act="supplied" data-id="${o.id}" ${o.supplied ? "disabled" : ""}>${o.supplied ? "Supplied" : "Mark items supplied"}</button>` : `<button class="btn btn--sm" style="justify-self:start" data-act="emp-pick" data-id="${o.id}" ${act ? "disabled" : ""}>Pick this order</button>`}</article>`,
                    )
                    .join("")
                : `<div class="card empty"><b>Queue is empty</b>New orders appear here once GreenFed confirms the client's payment.</div>`
            }
            ${act && queue.length && t !== "supplier" ? `<p class="mute" style="font-size:13px">You can hold one order at a time. Finish your current order to pick another.</p>` : ""}</section>`
      }</div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Work meter</h2><b style="font-size:28px;color:var(--p)">${S.emp.tasks} task${S.emp.tasks === 1 ? "" : "s"}</b><div class="meter"><i style="width:${Math.min(100, S.emp.tasks * 2)}%"></i></div><p class="mute">${EMP[t] && EMP[t].pay === "task" ? `Due to you: <b>${money(S.emp.tasks * RATE())}</b> (${money(RATE())} per plan)` : esc(payLine())}</p><a class="btn btn--line btn--sm" href="#/work/earnings">Details</a></section>
        <section class="card stack"><b>Order chain</b><p class="mute" style="font-size:13px">Supply manager → Quality assurance → Packaging &amp; delivery. Each stage is visible to the client.</p></section></aside></div>`,
    };
  };
  V.earnings = () => {
    const perTask = EMP[S.emp.type] && EMP[S.emp.type].pay === "task";
    return {
      title: "Work meter",
      html: `<div class="cols"><div class="stack">
      <section class="welcome"><small>Tasks completed since the last ${perTask ? "payment" : "reset"}</small><h2>${S.emp.tasks}</h2><p>${perTask ? `Due to you: <b>${money(S.emp.tasks * RATE())}</b> at ${money(RATE())} per delivered meal plan. GreenFed pays you by transfer and marks it paid here.` : esc(payLine()) + ". The meter counts your work so GreenFed can see it."}</p></section>
      <section class="card"><h2 class="h">${perTask ? "Payments" : "Meter resets"}</h2>${S.emp.paid.length ? `<ul class="list">${S.emp.paid.map((p) => `<li><div class="grow"><b>${perTask ? money(p.amt) : p.tasks + " tasks"}</b><small>${perTask ? p.tasks + " plans · " : ""}${fmtDate(p.at)}</small></div>${chip("RESOLVED").replace("Resolved", perTask ? "Paid" : "Counted")}</li>`).join("")}</ul>` : `<p class="mute">Nothing yet. ${perTask ? "The counter resets after each payment." : "An administrator resets the counter each cycle."}</p>`}</section></div>
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">${perTask ? "Payout details" : "Salary details"}</h2>${S.emp.bank ? `<p><b>${esc(S.emp.bank.bank)}</b><br><span class="mute">${esc(S.emp.bank.acct)} · ${esc(S.emp.bank.name)}</span></p>` : `<p class="mute">Add the account GreenFed pays you into.</p>`}
      <form class="stack" data-form="salary" novalidate><label class="field"><span>Bank</span><select class="inp" name="bank">${["Access Bank", "First Bank", "GTBank", "Kuda", "Moniepoint", "OPay", "UBA", "Wema Bank", "Zenith Bank"].map((b) => `<option ${S.emp.bank && S.emp.bank.bank === b ? "selected" : ""}>${b}</option>`).join("")}</select></label><label class="field"><span>Account number</span><input class="inp" name="acct" inputmode="numeric" maxlength="10" value="${esc(S.emp.bank ? S.emp.bank.acct : "")}"></label><label class="field"><span>Account name</span><input class="inp" name="name" value="${esc(S.emp.bank ? S.emp.bank.name : S.user.name)}"></label><p class="err" data-err hidden></p><button class="btn btn--sm">Save details</button></form></section></aside></div>`,
    };
  };
  V.complaints = () => ({
    title: "Complaints",
    html: `<div class="cols"><form class="card stack" data-form="complaint" novalidate>
      <label class="field"><span>What is it about?</span><select class="inp" name="type">${["An order", "Salary delay", "Counter error", "Price change", "Client review"].map((x) => `<option>${x}</option>`).join("")}</select></label>
      <label class="field"><span>Details</span><textarea class="inp" name="body" placeholder="Tell us what happened"></textarea></label><p class="err" data-err hidden></p><button class="btn">Log complaint</button></form>
    <section class="card"><h2 class="h">My complaints</h2>${S.emp.complaints.length ? `<ul class="list">${S.emp.complaints.map((c) => `<li><div class="grow"><b>${esc(c.type)}</b><small>${esc(c.body)} · ${ago(c.at)}</small></div>${chip(c.status)}</li>`).join("")}</ul>` : `<p class="mute">No complaints logged.</p>`}</section></div>`,
  });

  // ------------------------------------------------------------ admin views
  V.admin = () => {
    const O = S.orders;
    const rev = O.filter(paidOrder).reduce((a, o) => a + o.total, 0);
    const toConfirm = O.filter((o) => o.status === "PAYMENT_SENT");
    const waiting = O.filter((o) => o.status === "AWAITING_PAYMENT").length;
    return {
      title: "Company overview",
      html: `<div class="stack">
      <div class="kpis">${[
        ["Payments to confirm", toConfirm.length],
        ["Meal plans", O.filter((o) => o.kind === "plan" && paidOrder(o)).length],
        ["Grocery orders", O.filter((o) => o.kind === "grocery" && paidOrder(o)).length],
        ["Revenue received", money(rev)],
        ["Open conflicts", S.conflicts.filter((c) => c.status === "OPEN").length],
      ]
        .map(([n, v]) => `<div class="card kpi"><small>${n}</small><b>${v}</b></div>`)
        .join("")}</div>
      <section class="card stack"><div class="row row--sb wrap"><h2 class="h" style="margin:0">Payments to confirm</h2><small class="mute">Into ${esc(S.settings.bank.bank_name || "")} ${esc(S.settings.bank.account_number || "")}${waiting ? ` · ${waiting} order${waiting === 1 ? "" : "s"} not paid yet` : ""}</small></div>
        ${toConfirm.length ? `<ul class="list">${toConfirm.map((o) => `<li><div class="grow"><b>${money(o.total)} · ${esc(owner(o))}</b><small>${o.kind === "plan" ? esc(o.name) + " meal plan" : "Grocery #" + esc(o.id)} · ref GF-${esc(o.id)} · from ${esc(o.paySender)} (${esc(o.payBank)}) · ${ago(o.history[o.history.length - 1][1])}</small></div><button class="btn btn--sm" data-act="pay-ok" data-id="${o.id}">Money received</button><button class="btn btn--ghost btn--sm" data-act="pay-no" data-id="${o.id}">Not received</button></li>`).join("")}</ul>` : `<p class="mute">Nothing to confirm. When a customer says they've paid, it shows here. Check your bank app before you confirm.</p>`}</section>
      <section class="card tbl"><h2 class="h" style="padding-top:8px">All orders</h2><table><thead><tr><th>Order</th><th>Ordered by</th><th>Staff</th><th>Progress</th><th>Amount</th></tr></thead><tbody>
        ${
          O.map(
            (o) =>
              `<tr><td><b>${esc(o.kind === "plan" ? o.name : "Grocery #" + o.id)}</b><br><small class="mute">${o.kind === "plan" ? "Meal plan" : "Grocery"}</small></td><td>${esc(owner(o))}</td><td>${esc(Object.values(o.staff).join(", ") || "—")}</td><td>${chip(o.status)}</td><td>${money(o.total)}</td></tr>`,
          ).join("") || `<tr><td colspan="5" class="mute">No orders yet.</td></tr>`
        }</tbody></table></section>
      <section class="card tbl"><div class="row row--sb wrap" style="padding:8px 0"><h2 class="h" style="margin:0">Staff work meters</h2><small class="mute">Nutritionists: ${money(RATE())} per plan. Others are salaried or contracted outside the app.</small></div><table><thead><tr><th>Staff</th><th>Type</th><th>Tasks</th><th>Due</th><th>Pay into</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${
        S.staff
          .map(
            (st) =>
              `<tr><td>${esc(st.name)}</td><td>${esc(st.typeName)}</td><td>${st.tasks}</td><td>${st.due === null ? "Outside the app" : money(st.due)}</td><td>${esc(st.bank || "—")}</td><td>${st.tasks ? (st.due === null ? `<button class="btn btn--ghost btn--sm" data-act="reset-meter" data-u="${st.id}">Reset counter</button>` : `<button class="btn btn--sm" data-act="pay-staff" data-u="${st.id}" data-amt="${st.due}" data-n="${esc(st.name)}">Mark ${money(st.due)} paid</button>`) : ""}</td></tr>`,
          )
          .join("") ||
        `<tr><td colspan="6" class="mute">No approved staff yet. Approve GreenFed staff in the Rehohub admin console.</td></tr>`
      }</tbody></table></section>
      <section class="card"><h2 class="h">Employee complaints</h2>${S.complaints.length ? `<ul class="list">${S.complaints.map((c) => `<li><div class="grow"><b>${esc(c.type)} · ${esc(c.by)}</b><small>${esc(c.body)} · ${ago(c.at)}</small></div>${c.status === "OPEN" ? `<button class="btn btn--sm" data-act="close-complaint" data-id="${c.id}">Resolve</button>` : chip(c.status)}</li>`).join("")}</ul>` : `<p class="mute">No complaints.</p>`}</section>
      <section class="card"><h2 class="h">Community leader applications</h2>${S.leaders.length ? `<ul class="list">${S.leaders.map((l) => `<li><div class="grow"><b>${esc(l.name)}</b><small>${esc(l.email)} · applied ${fmtDate(l.at)}</small></div></li>`).join("")}</ul><p class="mute" style="font-size:13px">Check their licence, then invite them as a GreenFed health specialist from the Rehohub admin console.</p>` : `<p class="mute">No applications.</p>`}</section></div>`,
    };
  };
  V.settings = () => {
    const st = S.settings,
      b = st.bank || {};
    return {
      title: "Prices and bank",
      html: `<div class="cols"><div class="stack">
      <form class="card stack" data-form="settings" novalidate><h2 class="h" style="margin:0">Prices</h2>
        <div class="grid2"><label class="field"><span>Meal plan: per person per week (₦)</span><input class="inp" name="plan_price" type="number" min="0" value="${st.plan_price}"></label><label class="field"><span>Nutritionist pay per plan (₦)</span><input class="inp" name="nutritionist_rate" type="number" min="0" value="${st.nutritionist_rate}"></label></div>
        <h2 class="h" style="margin:0">Bank account customers pay into</h2>
        <div class="grid2"><label class="field"><span>Bank</span><input class="inp" name="bank_name" value="${esc(b.bank_name)}"></label><label class="field"><span>Account number</span><input class="inp" name="account_number" inputmode="numeric" maxlength="10" value="${esc(b.account_number)}"></label></div>
        <label class="field"><span>Account name</span><input class="inp" name="account_name" value="${esc(b.account_name)}"></label>
        <p class="mute" style="font-size:13px">New prices apply to new orders. Orders already placed keep their price.</p><p class="err" data-err hidden></p><button class="btn btn--sm" style="justify-self:start">Save</button></form>
      <section class="card tbl"><div class="row row--sb wrap" style="padding:8px 0"><h2 class="h" style="margin:0">Grocery items</h2><button class="btn btn--sm" data-act="item-edit">${ic("plus")}Add item</button></div><table><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Discount</th><th>Status</th><th><span class="sr-only">Edit</span></th></tr></thead><tbody>${ITEMS.map(
        (it) =>
          `<tr><td><b>${esc(it.name)}</b><br><small class="mute">${esc(it.unit)}${it.al.length ? " · " + esc(it.al.join(", ")) : ""}</small></td><td>${esc(it.cat)}</td><td>${money(it.price)}${it.off ? `<br><small class="mute">now ${money(it.now)}</small>` : ""}</td><td>${it.disc ? it.disc + "%" : "—"}</td><td>${it.active ? chip("ACTIVE") : chip("DEACTIVATED").replace("Deactivated", "Hidden")}</td><td><button class="btn btn--ghost btn--sm" data-act="item-edit" data-id="${it.id}">Edit</button></td></tr>`,
      ).join("")}</tbody></table></section></div>
      <aside class="stack"><section class="card stack"><b>How customers pay</b><p class="mute" style="font-size:13px">Customers transfer to the account here and tell GreenFed they've paid. Confirm the money arrived from Overview → Payments to confirm. Staff only see an order after you confirm it.</p></section></aside></div>`,
    };
  };
  V.users = () => ({
    title: "Users",
    html: `<section class="card stack" style="max-width:640px"><h2 class="h" style="margin:0">Users and approvals</h2>
      <p class="mute">Sign-ups, staff approvals, invitations and account status (active, warning, suspended, banned, deactivated) are managed in the Rehohub admin console, so the same rules apply to every product.</p>
      <a class="btn" href="${esc(RH.url("account/admin.html"))}">Open the admin console</a></section>`,
  });
  V.conflicts = () => ({
    title: "Conflicts",
    html: `<div class="stack" style="max-width:900px"><p class="mute">Late delivery: waive the next delivery. Poor quality: recall and resupply. The customer is told when you resolve it.</p>
    ${S.conflicts.length ? S.conflicts.map((c) => `<article class="job"><div class="row row--sb wrap"><b>${esc(c.type)} · order #${esc(c.order)}</b>${chip(c.status)}</div><small class="mute">${esc(c.by)} · ${ago(c.at)}</small>${c.status === "OPEN" ? `<button class="btn btn--sm" style="justify-self:start" data-act="resolve" data-id="${c.id}">${c.type === "Late delivery" ? "Waive next delivery" : "Recall and resupply"}</button>` : `<p class="mute">${esc(c.resolution)}</p>`}</article>`).join("") : `<div class="card empty"><b>No conflicts</b>Customers report late or poor-quality deliveries from their order page.</div>`}</div>`,
  });

  // ------------------------------------------------------------ modals
  function shareModal(what) {
    const url = location.href;
    modal(
      `<h2>Share ${esc(what)}</h2><div class="share">${[
        ["link", "Copy link"],
        ["facebook", "Facebook"],
        ["chat", "WhatsApp"],
        ["at", "Twitter"],
        ["more", "More"],
      ]
        .map(([i, n]) => `<button data-act="share-to" data-n="${n}" data-url="${esc(url)}">${ic(i)}${n}</button>`)
        .join("")}</div><button class="btn btn--ghost" data-close>Close</button>`,
    );
  }
  function recModal() {
    modal(`<h2>Add record</h2><form class="stack" data-form="rec" novalidate>
      <div class="grid2"><label class="field"><span>Type</span><select class="inp" name="type">${["Allergy", "Diagnosis", "Family history", "Symptom", "Medication", "DNA test"].map((x) => `<option>${x}</option>`).join("")}</select></label><label class="field"><span>For</span><select class="inp" name="member">${S.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></label></div>
      <label class="field"><span>Name</span><input class="inp" name="name" placeholder="e.g. Peanuts, Diabetes"></label>
      <div class="grid2"><label class="field"><span>Severity</span><select class="inp" name="sev"><option>Mild</option><option>Moderate</option><option>Severe</option></select></label><label class="field"><span>Recorded by</span><input class="inp" name="by" value="Self-reported"></label></div>
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Add</button></div></form>`);
  }
  function replyModal(pid, rid, asSpec) {
    modal(
      `<h2>${rid ? "Reply to the reply" : "Reply to this post"}</h2><form class="stack" data-form="reply" data-p="${pid}" data-r="${rid || ""}" data-as="${asSpec ? "1" : ""}" novalidate><label class="field"><span>Your comment</span><textarea class="inp" name="body"></textarea></label><p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Post</button></div></form>`,
    );
  }
  function itemModal(id) {
    const it = item(id) || {
      id: "",
      name: "",
      cat: "Veges",
      price: "",
      unit: "",
      al: [],
      disc: 0,
      pop: false,
      neu: false,
      active: true,
    };
    modal(`<h2>${id ? "Edit item" : "Add item"}</h2><form class="stack" data-form="item" data-id="${esc(it.id)}" novalidate>
      <div class="grid2"><label class="field"><span>Name</span><input class="inp" name="name" value="${esc(it.name)}"></label><label class="field"><span>Category</span><select class="inp" name="cat">${CATS.map(([n]) => `<option ${it.cat === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <div class="grid2"><label class="field"><span>Price (₦)</span><input class="inp" name="price" type="number" min="1" value="${it.price}"></label><label class="field"><span>Unit</span><input class="inp" name="unit" placeholder="e.g. 1 kg" value="${esc(it.unit)}"></label></div>
      <label class="field"><span>Discount (%)</span><input class="inp" name="discount" type="number" min="0" max="90" value="${it.disc || 0}"></label>
      <fieldset class="field" style="border:0;padding:0;margin:0"><span>Contains</span><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}" ${it.al.includes(a) ? "checked" : ""}><span>${a}</span></label>`).join("")}</div></fieldset>
      <div class="checks"><label><input type="checkbox" name="popular" ${it.pop ? "checked" : ""}><span>Popular</span></label><label><input type="checkbox" name="new" ${it.neu ? "checked" : ""}><span>What's new</span></label><label><input type="checkbox" name="active" ${it.active ? "checked" : ""}><span>On sale</span></label></div>
      <p class="err" data-err hidden></p><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Save</button></div></form>`);
  }
  function rejectModal(id) {
    modal(
      `<h2>Payment not received</h2><form class="stack" data-form="reject" data-id="${id}" novalidate><p class="mute">The customer is asked to check and tell you again. The order stays on hold.</p><label class="field"><span>Message to the customer</span><textarea class="inp" name="note">We couldn't find your transfer in our account.</textarea></label><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Send</button></div></form>`,
    );
  }
  function reviewModal(id) {
    modal(
      `<h2>Review your plan</h2><form class="stack" data-form="review" data-id="${id}" novalidate><div class="rate">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-act="star" data-v="${v}" class="on" aria-label="${v} star${v > 1 ? "s" : ""}">${ic("star")}</button>`).join("")}</div><input type="hidden" name="stars" value="5"><label class="field"><span>Comment (optional)</span><textarea class="inp" name="note"></textarea></label><div class="grid2"><button type="button" class="btn btn--ghost" data-close>Cancel</button><button class="btn">Submit</button></div></form>`,
    );
  }

  // ------------------------------------------------------------ router
  const AUTH = {
    welcome: A.welcome,
    start: A.start,
    setup: A.setup,
  };
  // Which sides may open a route. "community" is open to customers, administrators and health specialists.
  const ROUTES = [
    [/^\/home$/, V.home, "user"],
    [/^\/plans$/, V.plans, "user"],
    [/^\/plans\/new$/, V.newPlan, "user"],
    [/^\/plans\/review$/, V.review, "user"],
    [/^\/plans\/popular\/(\w+)$/, V.popular, "user"],
    [/^\/plans\/(\w+)$/, V.planOne, "user"],
    [/^\/pay$/, V.pay, "user"],
    [/^\/success$/, V.success, "user"],
    [/^\/grocery$/, V.grocery, "user"],
    [/^\/cart$/, V.cart, "user"],
    [/^\/orders$/, V.orders, "user"],
    [/^\/orders\/(\w+)$/, V.orderOne, "user"],
    [/^\/community$/, V.community, "community"],
    [/^\/community\/new$/, V.newComm, "community"],
    [/^\/community\/(\w+)$/, V.commOne, "community"],
    [/^\/notifications$/, V.notes],
    [/^\/health$/, V.health, "user"],
    [/^\/family$/, V.family, "user"],
    [/^\/profile$/, V.profile],
    [/^\/work$/, V.work, "employee"],
    [/^\/work\/earnings$/, V.earnings, "employee"],
    [/^\/work\/complaints$/, V.complaints, "employee"],
    [/^\/admin$/, V.admin, "admin"],
    [/^\/admin\/settings$/, V.settings, "admin"],
    [/^\/admin\/users$/, V.users, "admin"],
    [/^\/admin\/conflicts$/, V.conflicts, "admin"],
  ];
  const mayOpen = (need) =>
    !need || need === role() || (need === "community" && (role() !== "employee" || S.emp.type === "health"));
  function render() {
    document.body.classList.toggle("dark", !!S.prefs.dark);
    closeModal();
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = raw.split("?");
    const q = new URLSearchParams(qs || "");
    const key = path.replace(/^\//, "");
    if (["login", "signup", "verify", "forgot", "code", "reset"].includes(key)) {
      location.href =
        key === "signup"
          ? RH.url("account/register.html?product=greenfed&role=customer")
          : key === "forgot"
            ? RH.url("account/forgot.html")
            : RH.loginUrl(location.pathname);
      return;
    }
    if (AUTH[key]) {
      if (S.session && key !== "setup") return go(HOME[role()]);
      view().innerHTML = AUTH[key](q);
      document.title = "GreenFed";
      return;
    }
    if (!S.session) {
      try {
        sessionStorage.setItem("gf-after", "#" + raw);
      } catch (e) {}
      let seen = null;
      try {
        seen = localStorage.getItem("gf-seen-intro");
      } catch (e) {}
      return go(seen ? "#/start" : "#/welcome");
    }
    const m = ROUTES.map(([re, fn, r]) => [path.match(re), fn, r]).find((x) => x[0]);
    if (!m || !mayOpen(m[2])) return go(HOME[role()]);
    const v = m[1](q, m[0][1]);
    if (!v) return;
    view().innerHTML = shell("#" + path, v);
    document.title = `${v.title} | GreenFed`;
    if (path === "/plans/new") planSum($("[data-form=plan]"));
    if (render.last !== path) {
      const h1 = $(".main h1");
      if (h1 && render.last) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    }
    render.last = path;
  }
  // Keep the screen current: refresh from the server when moving between pages and every 30 seconds,
  // but never while someone is typing or has a dialog open.
  let lastSync = 0;
  const busy = () => $(".modal") || (document.activeElement && document.activeElement.matches("input,textarea,select"));
  function refresh(force) {
    if (!S.session || (!force && Date.now() - lastSync < 4000)) return;
    lastSync = Date.now();
    sync().then(
      () => busy() || render(),
      () => {},
    );
  }
  window.addEventListener("hashchange", async () => {
    // Data older than a few seconds is refreshed before the new page is drawn (pages redirect on missing data).
    if (S.session && Date.now() - lastSync > 4000) {
      try {
        await Promise.race([sync(), new Promise((r) => setTimeout(r, 4000))]);
      } catch (e) {}
    }
    render();
  });
  setInterval(() => document.visibilityState === "visible" && refresh(true), 30000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());

  // ------------------------------------------------------------ events
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act,
      id = b.dataset.id;
    if (["role", "pref", "gsearch", "csearch", "hsearch"].includes(a)) return;
    if (b.tagName === "BUTTON" && b.closest("form") && b.type !== "submit") e.preventDefault();
    if (a === "skip") {
      try {
        localStorage.setItem("gf-seen-intro", "1");
      } catch (e) {}
      go("#/start");
    }
    if (a === "panel") {
      const open = b.getAttribute("aria-expanded") === "true";
      go("#/profile" + (open ? "" : "?open=" + b.dataset.p));
    }
    if (a === "logout") RH.logout(RH.url("account/login.html"));
    if (a === "fav") act(api("greenfed/fav", { item: id }), "Saved");
    if (a === "qty") {
      const n = (S.cart[id] || 0) + Number(b.dataset.d);
      if (n <= 0) delete S.cart[id];
      else S.cart[id] = Math.min(50, n);
      save();
      render();
      if (Number(b.dataset.d) > 0 && n === 1) toast(`${item(id).name} added to cart`);
    }
    if (a === "add-plan") {
      b.dataset.ids.split(",").forEach((x) => item(x) && (S.cart[x] = (S.cart[x] || 0) + 1));
      save();
      toast("Plan groceries added to cart");
      go("#/cart");
    }
    if (a === "clear-cart") {
      S.cart = {};
      save();
      render();
    }
    if (a === "fav-plan") act(api("greenfed/order/act", { id, action: "fav" }), "Saved");
    if (a === "download") go("#/plans/" + id);
    if (a === "print") window.print();
    if (a === "share") shareModal(b.dataset.what || "this");
    if (a === "share-to") {
      const n = b.dataset.n;
      if (n === "Copy link") {
        (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.url) : Promise.reject()).then(
          () => toast("Link copied"),
          () => toast(b.dataset.url),
        );
      } else toast(`Sharing to ${n} opens in the mobile app.`);
      closeModal();
    }
    if (a === "copy") {
      (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.v) : Promise.reject()).then(
        () => toast("Copied " + b.dataset.v),
        () => toast(b.dataset.v),
      );
    }
    if (a === "day") {
      const h = location.hash.replace(/([?&])d=\d/, "$1").replace(/[?&]$/, "");
      const sep = h.includes("?") ? "&" : "?";
      go(h + sep + "d=" + b.dataset.d);
    }
    if (a === "review-plan") reviewModal(id);
    if (a === "star") {
      const v = +b.dataset.v;
      $$("[data-act=star]", b.parentElement).forEach((x) => x.classList.toggle("on", +x.dataset.v <= v));
      b.closest("form").elements.stars.value = v;
    }
    if (a === "stage-rate")
      act(
        api("greenfed/order/act", { id, action: "rate", stage: b.dataset.st, stars: +b.dataset.v }),
        `Thanks: ${LABEL[b.dataset.st].toLowerCase()} rated ${b.dataset.v}/5`,
      );
    if (a === "conflict") act(api("greenfed/order/act", { id, action: "conflict", type: b.dataset.t }));
    if (a === "place-plan") {
      const d = S.draft;
      if (!d) return go("#/plans/new");
      b.disabled = true;
      act(api("greenfed/order", { kind: "plan", ...d }), "Order placed", (r) => {
        S.draft = null;
        go("#/pay?id=" + r.id);
      }).then(() => (b.disabled = false));
    }
    if (a === "cancel-order") {
      if (!confirm("Cancel this order?")) return;
      act(api("greenfed/order/act", { id, action: "cancel" }), "Order cancelled", () => go("#/orders?f=all"));
    }
    if (a === "join" || a === "leave") act(api("greenfed/community", { action: a, id }));
    if (a === "comm-approve" || a === "comm-decline")
      act(
        api("greenfed/community", { action: a.slice(5), id, user_id: +b.dataset.u }),
        a === "comm-approve" ? "Approved" : "Declined",
      );
    if (a === "like") act(api("greenfed/post", { kind: "like", id }), " ");
    if (a === "del-post") {
      if (!confirm("Remove this post and its replies?")) return;
      act(api("greenfed/post", { kind: "delete", id }));
    }
    if (a === "reply") replyModal(b.dataset.p, b.dataset.r, b.dataset.as === "specialist");
    if (a === "leader") act(api("greenfed/misc", { action: "leader" }));
    if (a === "read-all") act(api("greenfed/misc", { action: "read" }), "All caught up");
    if (a === "open-note") {
      const n = S.notes.find((x) => x.id === id);
      if (n && !n.read) {
        n.read = true;
        api("greenfed/misc", { action: "read", id }).catch(() => {});
      }
    }
    if (a === "add-rec") recModal();
    if (a === "del-rec") {
      if (!confirm("Delete this record?")) return;
      act(api("greenfed/record", { delete: id }));
    }
    if (a === "del-mem") {
      if (!confirm("Remove this family member?")) return;
      act(api("greenfed/member", { delete: id }));
    }
    if (a === "emp-pick")
      act(api("greenfed/work", { id, action: "pick" }), "Order picked. The client can see your name.");
    if (a === "emp-step") act(api("greenfed/work", { id, action: b.dataset.s }), "Updated");
    if (a === "supplied") act(api("greenfed/work", { id, action: "supplied" }), "Marked as supplied");
    if (a === "pay-ok") {
      if (!confirm("Only confirm once you've seen the money in GreenFed's bank account. Confirm?")) return;
      act(api("greenfed/admin", { action: "confirm_payment", id }));
    }
    if (a === "pay-no") rejectModal(id);
    if (a === "pay-staff") {
      if (!confirm(`Have you paid ${b.dataset.n} ${money(b.dataset.amt)}? This records it and resets their counter.`))
        return;
      act(api("greenfed/admin", { action: "pay_staff", user_id: +b.dataset.u }));
    }
    if (a === "reset-meter") {
      if (!confirm("Reset this counter for the new cycle?")) return;
      act(api("greenfed/admin", { action: "reset_meter", user_id: +b.dataset.u }));
    }
    if (a === "close-complaint") act(api("greenfed/admin", { action: "resolve_complaint", id: +id }), "Resolved");
    if (a === "resolve") act(api("greenfed/admin", { action: "resolve_conflict", id: +id }), "Conflict resolved");
    if (a === "item-edit") itemModal(id);
  });
  document.addEventListener("change", (e) => {
    const t = e.target,
      a = t.dataset.act;
    if (a === "role" && MYROLES.includes(t.value)) {
      S.session = { role: t.value };
      local("role", t.value);
      S.cart = local("cart") || {};
      sync().then(
        () => go(HOME[t.value]),
        (er) => toast(er.message),
      );
    }
    if (a === "pref") {
      S.prefs[t.dataset.k] = t.checked;
      document.body.classList.toggle("dark", !!S.prefs.dark);
      api("greenfed/profile", { prefs: { [t.dataset.k]: t.checked } }).then(
        () => toast("Saved"),
        (er) => toast(er.message),
      );
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.classList.contains("bad") && t.value.trim()) t.classList.remove("bad");
    const f = t.closest("[data-form=plan]");
    if (f) planSum(f);
    const a = t.dataset.act,
      v = (t.value || "").toLowerCase().trim();
    const filt = (sel) => $$(sel).forEach((x) => (x.hidden = v && !x.dataset.q.includes(v)));
    if (a === "gsearch") filt("[data-prods] .prod");
    if (a === "csearch") filt("[data-comms] .comm");
    if (a === "hsearch") filt("[data-recs] .rec");
    const df = t.closest("[data-form=deliver]");
    if (df) {
      const mm = t.name.match(/^d(\d)m(\d)$/);
      const dr = DRAFTS[df.dataset.id];
      if (mm && dr) dr[+mm[1]][+mm[2]].dish = t.value;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  const vals = (f, n) => $$(`[name=${n}]:checked`, f).map((x) => x.value);
  /** Sends a form to the server; shows the server's message on the form if it refuses. */
  async function send(f, path, body, okMsg, after) {
    const btn = $("button:not([type=button])", f);
    if (btn) btn.disabled = true;
    try {
      const r = await api(path, body);
      await sync();
      closeModal();
      if (after) after(r);
      else render();
      toast((r && r.message) || okMsg || "Saved");
    } catch (er) {
      err(f, er.message);
      if (btn) btn.disabled = false;
    }
  }
  const FORMS = {
    setup(f) {
      send(
        f,
        "greenfed/profile",
        {
          setup: true,
          age: f.age.value,
          sex: f.sex.value,
          marital: f.marital.value,
          allergies: vals(f, "al"),
          conditions: f.health.value.trim() && !/^none$/i.test(f.health.value.trim()) ? [f.health.value.trim()] : [],
        },
        "Welcome to GreenFed!",
        () => go("#/home"),
      );
    },
    plan(f) {
      const members = vals(f, "mem"),
        meals = vals(f, "meal");
      if (!members.length) return err(f, "Choose who the plan is for.");
      if (!meals.length) return err(f, "Choose at least one meal.");
      const weeks = +f.weeks.value;
      S.draft = {
        kind: "plan",
        name: f.name.value.trim() || "My plan",
        members,
        weeks,
        meals,
        allergies: vals(f, "al"),
        info: f.info.value.trim(),
        price: planPrice(members.length, weeks),
      };
      go("#/plans/review");
    },
    paid(f) {
      if (f.sender.value.trim().length < 2) return err(f, "Enter the name on the account you paid from.");
      if (f.bank.value.trim().length < 2) return err(f, "Enter the bank you paid from.");
      const id = f.dataset.id;
      send(
        f,
        "greenfed/order/act",
        { id, action: "paid", sender: f.sender.value.trim(), bank: f.bank.value.trim() },
        "",
        () => go("#/success?id=" + id),
      );
    },
    checkout(f) {
      if (!f.address.value.trim()) return err(f, "Enter a delivery address.");
      send(
        f,
        "greenfed/order",
        {
          kind: "grocery",
          items: Object.entries(S.cart),
          address: f.address.value.trim(),
          slot: f.slot.value,
          weekly: f.weekly.checked,
        },
        "Order placed",
        (r) => {
          S.cart = {};
          save();
          go("#/pay?id=" + r.id);
        },
      );
    },
    member(f) {
      if (!f.name.value.trim()) return err(f, "Enter a name.");
      if (!(+f.age.value >= 0) || f.age.value === "") return err(f, "Enter an age.");
      send(f, "greenfed/member", {
        name: f.name.value.trim(),
        rel: f.querySelector("[name=rel]:checked").value,
        age: +f.age.value,
        sex: f.sex.value,
        allergies: vals(f, "al"),
        conditions: f.cond.value.trim() && !/^none$/i.test(f.cond.value.trim()) ? [f.cond.value.trim()] : [],
      });
    },
    rec(f) {
      if (!f.name.value.trim()) return err(f, "Enter a name for the record.");
      send(f, "greenfed/record", {
        type: f.type.value,
        name: f.name.value.trim(),
        member: f.member.value,
        sev: f.sev.value,
        by: f.by.value.trim(),
      });
    },
    profile(f) {
      send(
        f,
        "greenfed/profile",
        {
          sex: f.sex.value,
          age: f.age.value,
          marital: f.marital.value,
          address: f.address.value,
          occupation: f.occupation.value,
        },
        "Profile updated",
      );
    },
    healthst(f) {
      send(
        f,
        "greenfed/profile",
        {
          height: f.height.value,
          weight: f.weight.value,
          goal: f.goal.value,
          goalNote: f.goalNote.value,
          allergies: vals(f, "al"),
        },
        "Health status saved",
      );
    },
    comm(f) {
      if (f.name.value.trim().length < 3) return err(f, "Give your community a name.");
      if (f.desc.value.trim().length < 5) return err(f, "Describe what the community is about.");
      send(
        f,
        "greenfed/community",
        {
          action: "create",
          name: f.name.value.trim(),
          cat: f.cat.value,
          desc: f.desc.value.trim(),
          pub: f.querySelector("[name=pub]:checked").value === "1",
          perms: f.querySelector("[name=perms]:checked").value,
        },
        "Community created",
        (r) => go("#/community/" + r.id),
      );
    },
    post(f) {
      if (!f.title.value.trim() || !f.body.value.trim()) return err(f, "Add a topic and your post.");
      send(
        f,
        "greenfed/post",
        { community: f.dataset.c, title: f.title.value.trim(), body: f.body.value.trim() },
        "Posted",
      );
    },
    reply(f) {
      if (!f.body.value.trim()) return err(f, "Write your comment.");
      send(f, "greenfed/post", {
        kind: "reply",
        post: f.dataset.p,
        parent: f.dataset.r,
        body: f.body.value.trim(),
        specialist: f.dataset.as === "1",
      });
    },
    review(f) {
      send(f, "greenfed/order/act", {
        id: f.dataset.id,
        action: "review",
        stars: +f.stars.value,
        note: f.note.value.trim(),
      });
    },
    salary(f) {
      if (!/^\d{10}$/.test(f.acct.value)) return err(f, "Account numbers have 10 digits.");
      send(f, "greenfed/salary", { bank: f.bank.value, acct: f.acct.value, name: f.name.value.trim() });
    },
    complaint(f) {
      if (!f.body.value.trim()) return err(f, "Add some details.");
      send(f, "greenfed/complaint", { type: f.type.value, body: f.body.value.trim() });
    },
    deliver(f) {
      const o = order(f.dataset.id);
      const dr = DRAFTS[f.dataset.id];
      if (!o || !dr) return;
      if (dr.some((day) => day.some((m) => !m.dish.trim()))) return err(f, "Fill in every meal before delivering.");
      if (!confirm("Deliver this 7-day plan to the client now?")) return;
      send(f, "greenfed/work", { id: o.id, action: "deliver", days: dr }, "Plan delivered to the client", () => {
        delete DRAFTS[o.id];
        render();
      });
    },
    settings(f) {
      if (!/^\d{10}$/.test(f.account_number.value.trim())) return err(f, "Account numbers have 10 digits.");
      send(f, "greenfed/admin", {
        action: "settings",
        plan_price: +f.plan_price.value,
        nutritionist_rate: +f.nutritionist_rate.value,
        bank_name: f.bank_name.value.trim(),
        account_name: f.account_name.value.trim(),
        account_number: f.account_number.value.trim(),
      });
    },
    item(f) {
      send(f, "greenfed/admin", {
        action: "item",
        slug: f.dataset.id,
        name: f.name.value.trim(),
        cat: f.cat.value,
        price: +f.price.value,
        unit: f.unit.value.trim(),
        discount: +f.discount.value,
        allergens: vals(f, "al"),
        popular: f.popular.checked,
        new: f.new.checked,
        active: f.active.checked,
      });
    },
    reject(f) {
      send(f, "greenfed/admin", { action: "reject_payment", id: f.dataset.id, note: f.note.value.trim() });
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
        `<h1>Can't reach GreenFed</h1><p>${esc(e.message)}</p><a class="btn btn--block" href="">Try again</a>`,
      );
      return;
    }
    ACCOUNT = s.user;
    if (!ACCOUNT) {
      S.session = null;
      return render();
    }
    MYROLES = RH.rolesIn(ACCOUNT, "greenfed")
      .map((r) => ROLEMAP[r])
      .filter(Boolean);
    if (RH.isAdminFor && RH.isAdminFor(ACCOUNT, "greenfed") && !MYROLES.includes("admin")) MYROLES.push("admin");
    if (!MYROLES.length) {
      await RH.guard("greenfed", ["customer", "employee"]); // explains pending / not added yet
      return;
    }
    const last = local("role");
    S.session = { role: MYROLES.includes(last) ? last : MYROLES[0] };
    S.cart = local("cart") || {};
    try {
      await sync();
    } catch (e) {
      view().innerHTML = authShell(
        `<h1>Can't load GreenFed</h1><p>${esc(e.message)}</p><a class="btn btn--block" href="">Try again</a>`,
      );
      return;
    }
    local("role", role());
    if (S.prefs.dark) document.body.classList.add("dark");
    let after = null;
    try {
      after = sessionStorage.getItem("gf-after");
      sessionStorage.removeItem("gf-after");
    } catch (e) {}
    if (role() === "user" && !S.user.setupDone) return go("#/setup");
    if (after && !/^#\/(welcome|start|login|signup|setup)/.test(after)) return go(after);
    render();
  }
  boot();
})();
