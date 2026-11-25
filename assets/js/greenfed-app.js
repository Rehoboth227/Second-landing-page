/* GreenFed web app.
   Built from the "GreenFed USERS DESIGN" Figma file and the GreenFed requirements
   (customer, employee and administrator sides). Sign-in, sign-up, approvals and roles use
   the shared Rehohub account system (/api, via rh-auth.js): the server decides who may use
   which side. Meal plans, orders and records are still saved per account on this device,
   and card payments are not connected yet. Prices follow the design's currency (US dollars). */
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
  const money = (n) =>
    "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
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
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const uid = (p) => p + now().toString(36) + rnd(10, 99);
  const k = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n));

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
  // Item names follow the design (spinach, tomatoes, oatmeal, almond milk, honey); prices are sample values.
  const ITEMS = [
    ["spinach", "Spinach", "Veges", 3, "1 bunch", { pop: 1 }],
    ["tomatoes", "Tomatoes", "Veges", 4, "1 kg", { pop: 1 }],
    ["cucumber", "Cucumber", "Veges", 2, "2 pcs"],
    ["carrots", "Carrots", "Veges", 2.5, "1 kg"],
    ["okra", "Okra", "Veges", 3, "500 g", { off: 1 }],
    ["sweetpotato", "Sweet potato", "Veges", 3.5, "1 kg"],
    ["berries", "Mixed berries", "Fruits", 6, "250 g", { pop: 1 }],
    ["bananas", "Bananas", "Fruits", 2.5, "1 bunch"],
    ["apples", "Apples", "Fruits", 4, "6 pcs", { off: 1 }],
    ["avocado", "Avocado", "Fruits", 3, "2 pcs", { neu: 1 }],
    ["groundnuts", "Roasted groundnuts", "Snacks", 2.5, "200 g", { al: ["Peanuts"] }],
    ["hummus", "Hummus", "Snacks", 4.5, "250 g", { neu: 1 }],
    ["popcorn", "Popcorn kernels", "Snacks", 3, "500 g"],
    ["oats", "Oatmeal", "Breads", 6, "1 kg", { pop: 1 }],
    ["wwbread", "Whole-wheat bread", "Breads", 3.5, "1 loaf", { al: ["Wheat"] }],
    ["granola", "Granola", "Breads", 5, "500 g", { al: ["Wheat"], off: 1 }],
    ["almondmilk", "Almond milk", "Drinks", 5, "1 L", { pop: 1 }],
    ["tigernut", "Tiger nut drink", "Drinks", 3, "500 ml", { neu: 1 }],
    ["honey", "Honey", "Drinks", 8, "500 g", { pop: 1 }],
    ["yoghurt", "Greek yoghurt", "Drinks", 5, "500 g", { al: ["Milk"] }],
    ["chicken", "Chicken breast", "Proteins", 9, "1 kg"],
    ["salmon", "Salmon fillet", "Proteins", 14, "500 g", { al: ["Fish"] }],
    ["eggs", "Eggs", "Proteins", 5, "12 pcs", { al: ["Egg"] }],
    ["tofu", "Tofu", "Proteins", 4, "400 g", { al: ["Soy"] }],
    ["beans", "Brown beans", "Proteins", 3, "1 kg"],
    ["turkey", "Turkey", "Proteins", 10, "1 kg", { off: 1 }],
    ["brownrice", "Brown rice", "Grains", 6, "2 kg"],
    ["quinoa", "Quinoa", "Grains", 8, "500 g", { neu: 1 }],
    ["yam", "Yam", "Grains", 5, "1 tuber"],
    ["plantain", "Plantain", "Grains", 3, "4 pcs"],
    ["feta", "Feta cheese", "Grains", 6, "200 g", { al: ["Milk"] }],
  ].map(([id, name, cat, price, unit, o = {}]) => ({
    id,
    name,
    cat,
    price,
    unit,
    al: o.al || [],
    pop: !!o.pop,
    off: !!o.off,
    neu: !!o.neu,
  }));
  const item = (id) => ITEMS.find((x) => x.id === id);
  const priceOf = (it) => (it.off ? Math.round(it.price * 0.8 * 100) / 100 : it.price);

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
  const PRICE_PP_WEEK = 37.5; // design: "1 week meal plan for yourself and 3 members costs 150 Dollars"
  const planPrice = (persons, weeks) => persons * weeks * PRICE_PP_WEEK;
  const POPULAR = [
    {
      key: "family",
      name: "Family plan",
      meals: ["Breakfast", "Lunch", "Dinner"],
      allergies: [],
      likes: 2500,
      comments: 212,
      who: "families sharing one menu",
    },
    {
      key: "personal",
      name: "Personal plan",
      meals: ["Breakfast", "Lunch", "Snacks", "Dinner"],
      allergies: [],
      likes: 4500,
      comments: 512,
      who: "one person",
    },
    {
      key: "kiddies",
      name: "Kiddies plan",
      meals: ["Breakfast", "Snacks", "Lunch", "Dinner"],
      allergies: ["Peanuts"],
      likes: 1800,
      comments: 140,
      who: "school-age children, peanut-free",
    },
    {
      key: "aged",
      name: "Aged plan",
      meals: ["Breakfast", "Lunch", "Dinner"],
      allergies: [],
      likes: 1200,
      comments: 96,
      who: "older adults: softer, lower-salt meals",
    },
  ];

  const PLAN_FLOW = ["PAID", "PICKED", "IN_PROGRESS", "DELIVERED"];
  const GROC_FLOW = ["PAID", "GATHERING", "QA", "PACKAGED", "EN_ROUTE", "DELIVERED"];
  const LABEL = {
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

  // Employee types from the requirements, and which work queue each one sees
  const EMP = {
    nutritionist: { name: "Nutritionist", who: "Selina Bryan", queue: "Meal plans" },
    supply: { name: "Supply manager", who: "Musa Bello", queue: "Grocery orders: gathering" },
    qa: { name: "Quality assurance", who: "Ifeoma Obi", queue: "Grocery orders: quality check" },
    delivery: { name: "Packaging & delivery", who: "Jane Smith", queue: "Grocery orders: pack and deliver" },
    health: { name: "Health specialist", who: "Dr. Kunle Ade", queue: "Community" },
    supplier: { name: "Supplier", who: "Ekiti Farms Co-op", queue: "Grocery supply requests" },
  };
  const RATE = 5; // sample earnings per completed task, for the work meter

  // ------------------------------------------------------------ state
  function seed() {
    const t = now();
    const members = [
      { id: "m0", name: "Alex Bush", rel: "You", age: 34, sex: "Female", allergies: [], conditions: [] },
      {
        id: "m1",
        name: "Jude Bush",
        rel: "Husband",
        age: 36,
        sex: "Male",
        allergies: [],
        conditions: ["Pollen allergy"],
      },
      { id: "m2", name: "Ella Bush", rel: "Daughter", age: 8, sex: "Female", allergies: ["Peanuts"], conditions: [] },
      {
        id: "m3",
        name: "Kemi Bush",
        rel: "Mother",
        age: 64,
        sex: "Female",
        allergies: ["Milk"],
        conditions: ["High blood pressure"],
      },
    ];
    const plan = (o) => ({ kind: "plan", review: null, ...o });
    const days = (meals, al) => DAYS.map((_, i) => genDay(i, meals, al));
    const orders = [
      plan({
        id: "o1",
        name: "My fav plan",
        members: ["m0", "m1", "m2", "m3"],
        weeks: 1,
        meals: ["Breakfast", "Lunch", "Snacks", "Dinner"],
        allergies: ["Peanuts", "Milk"],
        info: "Low salt for Mum.",
        price: 150,
        status: "DELIVERED",
        staff: { nutritionist: "Selina Bryan" },
        created: t - 9 * DAY,
        fav: true,
        history: [
          ["PAID", t - 9 * DAY],
          ["PICKED", t - 9 * DAY + 3 * H],
          ["IN_PROGRESS", t - 9 * DAY + 5 * H],
          ["DELIVERED", t - 8 * DAY],
        ],
        days: days(["Breakfast", "Lunch", "Snacks", "Dinner"], ["Peanuts", "Milk"]),
        review: { stars: 5, note: "Clear and easy to follow." },
      }),
      plan({
        id: "o2",
        name: "Plan 001",
        members: ["m0"],
        weeks: 1,
        meals: ["Breakfast", "Lunch", "Dinner"],
        allergies: [],
        info: "",
        price: 37.5,
        status: "IN_PROGRESS",
        staff: { nutritionist: "Selina Bryan" },
        created: t - 20 * H,
        history: [
          ["PAID", t - 20 * H],
          ["PICKED", t - 18 * H],
          ["IN_PROGRESS", t - 16 * H],
        ],
      }),
      {
        kind: "grocery",
        id: "o3",
        items: [
          ["oats", 1],
          ["almondmilk", 2],
          ["berries", 2],
          ["spinach", 3],
          ["tomatoes", 2],
          ["chicken", 1],
        ],
        total: 0,
        address: "14 Admiralty Way, Lekki, Lagos",
        slot: "Saturday, 10:00–12:00",
        weekly: true,
        status: "EN_ROUTE",
        staff: { supply: "Musa Bello", qa: "Ifeoma Obi", delivery: "Jane Smith" },
        created: t - 5 * H,
        reviews: {},
        eta: "1 hr",
        km: 7,
        history: [
          ["PAID", t - 5 * H],
          ["GATHERING", t - 4.5 * H],
          ["QA", t - 3 * H],
          ["PACKAGED", t - 2 * H],
          ["EN_ROUTE", t - 0.5 * H],
        ],
      },
      {
        kind: "grocery",
        id: "o4",
        items: [
          ["honey", 1],
          ["apples", 2],
          ["brownrice", 1],
        ],
        total: 0,
        address: "14 Admiralty Way, Lekki, Lagos",
        slot: "Saturday, 10:00–12:00",
        weekly: false,
        status: "DELIVERED",
        staff: { supply: "Musa Bello", qa: "Ifeoma Obi", delivery: "Jane Smith" },
        created: t - 8 * DAY,
        reviews: { DELIVERED: 5 },
        history: [
          ["PAID", t - 8 * DAY],
          ["GATHERING", t - 8 * DAY + H],
          ["QA", t - 8 * DAY + 2 * H],
          ["PACKAGED", t - 8 * DAY + 3 * H],
          ["EN_ROUTE", t - 8 * DAY + 4 * H],
          ["DELIVERED", t - 8 * DAY + 5 * H],
        ],
      },
      // Requests from other customers, so the employee side has work in its queues
      plan({
        id: "o5",
        name: "Family plan",
        owner: "Tunde Ade",
        members: [],
        persons: 3,
        weeks: 2,
        meals: ["Breakfast", "Lunch", "Dinner"],
        allergies: ["Egg"],
        info: "Diabetic-friendly for Dad.",
        price: 225,
        status: "PAID",
        staff: {},
        created: t - 2 * H,
        history: [["PAID", t - 2 * H]],
      }),
      {
        kind: "grocery",
        id: "o6",
        owner: "Ngozi Eze",
        items: [
          ["tomatoes", 3],
          ["okra", 2],
          ["turkey", 1],
          ["yam", 1],
        ],
        total: 0,
        address: "22 Allen Avenue, Ikeja",
        slot: "Friday, 14:00–16:00",
        weekly: true,
        status: "PAID",
        staff: {},
        created: t - 1 * H,
        reviews: {},
        history: [["PAID", t - 1 * H]],
      },
    ];
    orders
      .filter((o) => o.kind === "grocery")
      .forEach((o) => (o.total = o.items.reduce((a, [id, q]) => a + priceOf(item(id)) * q, 0)));
    return {
      v: 1,
      session: null,
      user: {
        name: "Alex Bush",
        email: "alex.bush@example.com",
        phone: "+234 810 541 2715",
        address: "14 Admiralty Way, Lekki, Lagos",
        occupation: "Pharmacist",
        marital: "Married",
        height: 168,
        weight: 70,
        goal: "Maintain a healthy weight",
        goalNote: "Eat more vegetables and less sugar.",
        status: "ACTIVE",
      },
      members,
      records: [
        {
          id: "h1",
          type: "Allergy",
          name: "Peanuts",
          member: "m2",
          date: t - 400 * DAY,
          sev: "Severe",
          by: "Healthy Family Centre",
        },
        {
          id: "h2",
          type: "Allergy",
          name: "Pollen",
          member: "m1",
          date: t - 250 * DAY,
          sev: "Mild",
          by: "Healthy Family Centre",
        },
        {
          id: "h3",
          type: "Allergy",
          name: "Milk (lactose)",
          member: "m3",
          date: t - 600 * DAY,
          sev: "Moderate",
          by: "Healthy Family Centre",
        },
        {
          id: "h4",
          type: "Diagnosis",
          name: "High blood pressure",
          member: "m3",
          date: t - 300 * DAY,
          sev: "Moderate",
          by: "Healthy Family Centre",
        },
        {
          id: "h5",
          type: "Family history",
          name: "Diabetes",
          member: "m3",
          date: t - 900 * DAY,
          sev: "Mild",
          by: "Self-reported",
        },
        {
          id: "h6",
          type: "Medication",
          name: "Amlodipine 5 mg",
          member: "m3",
          date: t - 120 * DAY,
          sev: "Mild",
          by: "Healthy Family Centre",
        },
      ],
      orders,
      cart: {},
      favs: ["almondmilk", "honey"],
      cards: [{ last4: "6587", name: "Alex Bush", exp: "06/28" }],
      communities: [
        {
          id: "c1",
          name: "Allergies",
          cat: "Allergies",
          desc: "Living well with food allergies: swaps, labels and recipes.",
          members: 214,
          pub: true,
          joined: true,
          perms: "anyone",
          last: "Ella's school now has a nut-free table!",
          lastAt: t - 0.6 * H,
          by: "GreenFed",
        },
        {
          id: "c2",
          name: "Balanced diet",
          cat: "Nutrition",
          desc: "Simple, balanced meals for busy families.",
          members: 512,
          pub: true,
          joined: true,
          perms: "anyone",
          last: "What's your go-to high-fibre breakfast?",
          lastAt: t - 3 * H,
          by: "GreenFed",
        },
        {
          id: "c3",
          name: "Weight",
          cat: "Health issues",
          desc: "Support for healthy weight goals, without crash diets.",
          members: 388,
          pub: true,
          joined: false,
          perms: "anyone",
          last: "Week 3 check-in thread",
          lastAt: t - 5 * H,
          by: "Dr. Kunle Ade",
        },
        {
          id: "c4",
          name: "Diet and diabetes",
          cat: "Health issues",
          desc: "Eating well with diabetes, guided by our health specialists.",
          members: 241,
          pub: true,
          joined: false,
          perms: "admins",
          last: "Low-GI swaps for Nigerian staples",
          lastAt: t - DAY,
          by: "Dr. Kunle Ade",
        },
        {
          id: "c5",
          name: "Food & craft",
          cat: "Food & craft",
          desc: "Cook, preserve and plate: share what you make.",
          members: 167,
          pub: true,
          joined: false,
          perms: "anyone",
          last: "Pickled cucumbers, my way",
          lastAt: t - 2 * DAY,
          by: "GreenFed",
        },
        {
          id: "c6",
          name: "Recovery kitchen",
          cat: "Rehabilitation",
          desc: "Private support for people in addiction recovery and their families.",
          members: 46,
          pub: false,
          joined: false,
          perms: "admins",
          last: "Members only",
          lastAt: t - 3 * DAY,
          by: "Dr. Kunle Ade",
        },
      ],
      posts: [
        {
          id: "p1",
          c: "c1",
          by: "Samdas Fobs",
          at: t - 0.6 * H,
          title: "Understanding consequences of eating above your limits.",
          body: "Allergic reactions can be delayed. Keep a simple food diary for two weeks and share it with your nutritionist before changing your plan.",
          likes: 3500,
          liked: false,
          replies: [
            {
              id: "r1",
              by: "Dr. Kunle Ade",
              role: "Health specialist",
              at: t - 0.4 * H,
              body: "Good advice. Note the time, the food and the symptom, every time.",
              replies: [
                {
                  id: "r2",
                  by: "Alex Bush",
                  at: t - 0.2 * H,
                  body: "This helped us spot Ella's reaction to a snack bar.",
                  replies: [],
                },
              ],
            },
          ],
        },
        {
          id: "p2",
          c: "c1",
          by: "Its voice",
          at: t - 5 * H,
          title: "Reading labels in the supermarket",
          body: "Look for 'may contain' warnings as well as the ingredient list. Here are the ones I check every time.",
          likes: 820,
          liked: true,
          replies: [],
        },
        {
          id: "p3",
          c: "c2",
          by: "Harvacent",
          at: t - 3 * H,
          title: "What's your go-to high-fibre breakfast?",
          body: "Mine is oats with berries. Looking for new ideas for the kids.",
          likes: 410,
          liked: false,
          replies: [{ id: "r3", by: "Fobs", at: t - 2 * H, body: "Akara and pap on weekends!", replies: [] }],
        },
      ],
      notes: [
        {
          id: "n1",
          cat: "Grocery",
          t: "Your grocery is on the move",
          s: "Hi Alex Bush, your grocery is on the move for delivery, check out your tracking.",
          at: t - 0.5 * H,
          read: false,
          link: "#/orders/o3",
        },
        {
          id: "n2",
          cat: "Meal Plan",
          t: "Your meal is being prepared by Selina Bryan",
          s: "Hi Alex Bush, your PLAN 001 meal plan is in progress and will reach you within 48 hours.",
          at: t - 2 * H,
          read: false,
          link: "#/orders/o2",
        },
        {
          id: "n3",
          cat: "Meal Plan",
          t: "Your payment for meal plan confirmed",
          s: "Hi Alex Bush, your payment for PLAN 001 has been confirmed.",
          at: t - 5 * H,
          read: true,
          link: "#/orders/o2",
        },
        {
          id: "n4",
          cat: "Profile",
          t: "Upload a profile photo",
          s: "Help your community recognise you.",
          at: t - 10 * H,
          read: true,
          link: "#/profile",
        },
        {
          id: "n5",
          cat: "Meal Plan",
          t: "Check out our new meal plan",
          s: "Hi Alex Bush, check out our new Kiddies plan, peanut-free by default.",
          at: t - 15 * H,
          read: true,
          link: "#/plans/popular/kiddies",
        },
        {
          id: "n6",
          cat: "Grocery",
          t: "Check out our grocery store",
          s: "Hello Alex Bush, we got new items in our grocery store, check it out.",
          at: t - 18 * H,
          read: true,
          link: "#/grocery?tab=new",
        },
      ],
      prefs: { email: true, push: true, promos: true, community: true, dark: false },
      emp: { type: "nutritionist", tasks: 12, paid: [], bank: null, complaints: [] },
      users: [
        { name: "Alex Bush", email: "alex.bush@example.com", status: "ACTIVE" },
        { name: "Tunde Ade", email: "tunde@example.com", status: "ACTIVE" },
        { name: "Ngozi Eze", email: "ngozi@example.com", status: "ACTIVE" },
        { name: "Samdas Fobs", email: "samdas@example.com", status: "WARNING" },
      ],
      conflicts: [],
      leader: null,
      draft: null,
    };
  }
  // Saved per account on this device until GreenFed ordering is connected to the server.
  const KEY = "greenfed-app-v1";
  let STORE = KEY;
  let S = seed();
  let ACCOUNT = null; // the signed-in Rehohub account (from the server)
  let MYROLES = []; // GreenFed roles the server has approved for this account
  let FRESH = false;
  const ROLEMAP = { customer: "user", employee: "employee", admin: "admin" };
  const EMPMAP = {
    nutritionist: "nutritionist",
    supply_manager: "supply",
    quality_assurance: "qa",
    packaging_delivery: "delivery",
    health_specialist: "health",
    supplier: "supplier",
  };
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
    // A new account starts with its own empty household and history.
    FRESH = true;
    S = seed();
    S.members = [{ ...S.members[0], name: account.full_name, allergies: [], conditions: [] }];
    S.records = [];
    S.orders = S.orders.filter((o) => o.owner);
    S.favs = [];
    S.cards = [];
    S.emp = { type: "nutritionist", tasks: 0, paid: [], bank: null, complaints: [] };
    S.users = [];
    S.notes = [
      {
        id: uid("n"),
        cat: "Profile",
        t: "Welcome to GreenFed",
        s: "Add your household and allergies so your nutritionist can plan around them.",
        at: now(),
        read: false,
        link: "#/family",
      },
    ];
  }
  const save = () => {
    if (!ACCOUNT) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(S));
    } catch (e) {}
  };
  const order = (id) => S.orders.find((o) => o.id === id);
  const memberName = (id) => (S.members.find((m) => m.id === id) || {}).name || "";
  const myOrders = () => S.orders.filter((o) => !o.owner);
  const persons = (o) => o.persons || o.members.length || 1;
  const cartCount = () => Object.values(S.cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(S.cart).reduce((a, [id, q]) => a + priceOf(item(id)) * q, 0);
  function note(cat, t, s, link) {
    S.notes.unshift({ id: uid("n"), cat, t, s, at: now(), read: false, link });
  }
  function setStatus(o, st, staffKey, who) {
    o.status = st;
    o.history.push([st, now()]);
    if (staffKey) o.staff[staffKey] = who;
    if (!o.owner) {
      const nm = o.kind === "plan" ? `${o.name.toUpperCase()} meal plan` : "grocery order";
      note(
        o.kind === "plan" ? "Meal Plan" : "Grocery",
        `${LABEL[st]}`,
        `Hi ${S.user.name}, your ${nm}: ${LABEL[st].toLowerCase()}.`,
        "#/orders/" + o.id,
      );
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
    const names =
      o.kind === "plan"
        ? {
            PAID: "Payment confirmed",
            PICKED: `Picked by ${o.staff.nutritionist || "a nutritionist"}`,
            IN_PROGRESS: "Work in progress",
            DELIVERED: "Plan delivered to your email and app",
          }
        : {
            PAID: "Payment confirmed",
            GATHERING: `Order gathering${o.staff.supply ? " · " + o.staff.supply : ""}`,
            QA: `Quality assurance${o.staff.qa ? " · " + o.staff.qa : ""}`,
            PACKAGED: "Packaged",
            EN_ROUTE: `Delivery en route (30 min)${o.staff.delivery ? " · " + o.staff.delivery : ""}`,
            DELIVERED: "Delivered",
          };
    return `<ol class="tl">${flow
      .map((st, i) => {
        const h = o.history.find((x) => x[0] === st);
        const cls = i < idx || (i === idx && st === "DELIVERED") ? "done" : i === idx ? "now" : "";
        const rev =
          o.kind === "grocery" && h && st !== "PAID"
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
      <div class="grid2"><label class="field"><span>Age</span><input class="inp" name="age" type="number" min="1" max="120" value="34"></label><label class="field"><span>Sex</span><select class="inp" name="sex"><option>Female</option><option>Male</option></select></label></div>
      <div class="grid2"><label class="field"><span>Marital status</span><select class="inp" name="marital"><option>Single</option><option selected>Married</option><option>Prefer not to say</option></select></label><label class="field"><span>Number of persons at home</span><input class="inp" name="persons" type="number" min="1" max="20" value="4"></label></div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><span>Allergies</span><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}"><span>${a}</span></label>`).join("")}</div></fieldset>
      <label class="field"><span>Health status</span><input class="inp" name="health" placeholder="e.g. none, diabetes, high blood pressure"></label>
      <label class="field"><span>Phone number</span><input class="inp" name="phone" type="tel" value="${esc(S.user.phone)}"></label>
      <button class="btn btn--block">Save and continue</button></form>`);

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
      ["#/profile", "user", "Profile"],
    ],
    admin: [
      ["#/admin", "chart", "Overview"],
      ["#/admin/users", "users", "Users"],
      ["#/admin/conflicts", "flag", "Conflicts"],
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
      ["#/admin/users", "users", "Users"],
      ["#/admin/conflicts", "flag", "Conflicts"],
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
    const nav = NAV[r]
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
          <div class="me"><span class="ava">${initials(who)}</span><div><b>${esc(who)}</b><small>${r === "employee" ? EMP[S.emp.type].name : ROLE[r]}</small></div></div>
        </div>
      </aside>
      <main class="main" id="main">
        <div class="gf-head"><a href="#/profile" aria-label="Profile"><span class="ava">${initials(who)}</span></a><h1>${v.title}</h1>${cartBtn || "<span></span>"}</div>
        <div class="top top--gf">${v.back ? `<a class="back" href="${v.back}" aria-label="Back">${ic("chev-left")}</a>` : ""}<h1>${v.title}</h1>${cartBtn}
          ${r === "user" ? `<a class="ibtn" href="#/notifications" aria-label="Notifications${unread ? ", " + unread + " unread" : ""}">${ic("bell")}${unread ? `<span class="dot">${unread}</span>` : ""}</a>` : ""}</div>
        ${v.back ? `<div class="gf-head" style="justify-content:flex-start"><a class="back" href="${v.back}" aria-label="Back">${ic("chev-left")}</a></div>` : ""}
        <p class="preview-note">Preview: meal plans, orders and records are saved on this device only, and no payment is taken, until GreenFed ordering goes live.</p>
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
    const active = myOrders().filter((o) => o.status !== "DELIVERED");
    const recs = S.records;
    return {
      title: "Home",
      html: `<div class="cols"><div class="stack">
      <section class="welcome"><small>Welcome,</small><h2>${esc(S.user.name.split(" ")[0])}</h2><p>${S.members.length} ${S.members.length === 1 ? "person" : "people"} in your household · ${recs.filter((r) => r.type === "Allergy").length} allergies on record. Your nutritionist plans around them.</p></section>
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
        <div class="stack">${S.members.map((m) => `<div class="member"><span class="ava ${m.rel === "You" ? "" : "ava--soft"}">${initials(m.name)}</span><div><b>${esc(m.name)}</b><small>${esc(m.rel)} · ${m.age} yrs${m.allergies.length ? " · allergic to " + esc(m.allergies.join(", ").toLowerCase()) : ""}</small></div></div>`).join("")}</div>
        <a class="btn btn--line btn--sm" href="#/family">${ic("plus")}Add family member</a></section>
      <section class="card stack"><div class="row row--sb"><h2 class="h" style="margin:0">Your communities</h2><a class="link" href="#/community">See all</a></div>
        ${S.communities
          .filter((c) => c.joined)
          .map(
            (c) =>
              `<a class="member" href="#/community/${c.id}"><span class="ava ava--soft">${ic("users")}</span><div><b>${esc(c.name)}</b><small>${esc(c.last)}</small></div></a>`,
          )
          .join("")}</section>
    </div></div>`,
    };
  };
  function orderRow(o) {
    const title =
      o.kind === "plan" ? `${o.name} · meal plan` : `Grocery · ${o.items.reduce((a, [, q]) => a + q, 0)} items`;
    const sub =
      o.kind === "plan"
        ? `${persons(o)} ${persons(o) === 1 ? "person" : "persons"} · ${o.weeks} week${o.weeks > 1 ? "s" : ""} · ${money(o.price)}`
        : `${o.slot} · ${money(o.total)}`;
    return `<a class="plan" href="#/orders/${o.id}"><span class="plan__ico">${ic(o.kind === "plan" ? "plan" : "bag")}</span><b>${esc(title)}</b><div class="plan__side">${chip(o.status)}</div><small>${esc(sub)}</small></a>`;
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
            ) => `<div class="plan"><span class="plan__ico">${ic(o.fav ? "check-sq" : "plan")}</span><a href="#/${o.status === "DELIVERED" ? "plans" : "orders"}/${o.id}"><b>${esc(o.name)}</b></a>
          <div class="plan__side"><span>${fmtTime(o.created)}</span><div class="plan__acts"><button data-act="fav-plan" data-id="${o.id}" aria-pressed="${!!o.fav}" aria-label="Favourite">${ic("heart")}</button><button data-act="download" data-id="${o.id}" aria-label="Download" ${o.days ? "" : "disabled"}>${ic("download")}</button><button data-act="share" data-what="${esc(o.name)} meal plan" aria-label="Share">${ic("share")}</button></div></div>
          <small>${fmtDate(o.created)} · <span class="tag">${persons(o)} ${persons(o) === 1 ? "Person" : "Persons"}</span> ${o.status === "DELIVERED" ? "" : chip(o.status)}</small></div>`,
          )
          .join("") || `<div class="card empty"><b>No plans yet</b>Request your first meal plan.</div>`
      }</div>
      <h2 class="h" style="margin:8px 0 0;color:var(--mute)">POPULAR PLANS</h2>
      <div class="popular">${POPULAR.map((p) => `<a class="pop" href="#/plans/popular/${p.key}"><b>${p.name}</b><em>${p.meals.length} Meals</em><small>${p.allergies.length ? "No " + p.allergies.join(", ").toLowerCase() : "No allergies"}</small><span class="social-row"><span>${ic("heart")}${k(p.likes)}</span><span>${ic("chat")}${p.comments}</span></span></a>`).join("")}</div>
      <a class="btn btn--block" href="#/plans/new">Get new plan</a></div>
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">How it works</h2><ol class="tl"><li class="done"><b>Tell us who it's for</b><small>Members, allergies and meals</small></li><li class="done"><b>Pay</b><small>${money(PRICE_PP_WEEK)} per person per week</small></li><li class="now"><b>A nutritionist picks it up</b><small>You'll see their name</small></li><li><b>Your plan arrives in under 48 hours</b><small>By email and in the app</small></li></ol></section></aside></div>`,
    };
  };
  V.popular = (q, key) => {
    const p = POPULAR.find((x) => x.key === key);
    if (!p) return go("#/plans");
    const day = genDay(0, p.meals, p.allergies);
    return {
      title: p.name,
      back: "#/plans",
      html: `<div class="cols"><section class="card stack"><div class="sumbar"><span>${p.meals.length} MEALS</span><span>${p.allergies.length ? "NO " + p.allergies.join(", ").toUpperCase() : "NO ALLERGIES"}</span><span>${k(p.likes)} LIKES</span></div>
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
        <div class="stack">${S.members.map((m) => `<label class="member"><input type="checkbox" name="mem" value="${m.id}" ${sel.includes(m.id) ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--p)"><span class="ava ava--soft">${initials(m.name)}</span><div><b>${esc(m.name)}</b><small>${esc(m.rel)} · ${m.age} yrs${m.allergies.length ? " · " + esc(m.allergies.join(", ")) : ""}</small></div></label>`).join("")}</div>
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
      <dl class="kv"><div><dt>${mem} × ${weeks} week × ${money(PRICE_PP_WEEK)}</dt><dd>${money(planPrice(mem, weeks))}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(planPrice(mem, weeks))}</b></dd></div></dl>`;
  }
  V.review = () => {
    const d = S.draft;
    if (!d || d.kind !== "plan") return go("#/plans/new");
    const others = d.members.length - 1;
    return {
      title: "Review",
      back: "#/plans/new",
      html: `<section class="card stack center" style="max-width:560px;margin:0 auto">
      <h2 class="title-g" style="font-size:26px">HEY ${esc(S.user.name.split(" ")[0].toUpperCase())}!</h2>
      <p>Your ${d.weeks} week meal plan for ${d.members.includes("m0") ? "yourself" + (others > 0 ? ` and ${others} member${others > 1 ? "s" : ""}` : "") : d.members.length + " members"} costs <b>${money(d.price)}</b> only.</p>
      <div class="sumbar" style="justify-content:center"><span>${d.weeks} WEEK PLAN</span><span>${d.members.length} PERSONS</span><span>${d.allergies.length} ALLERGIES</span><span>${d.meals.length} MEALS</span></div>
      <dl class="kv" style="text-align:left"><div><dt>Plan for</dt><dd>${esc(d.members.map(memberName).join(", "))}</dd></div><div><dt>Meals</dt><dd>${esc(d.meals.join(", "))}</dd></div><div><dt>Allergies</dt><dd>${esc(d.allergies.join(", ") || "None")}</dd></div>${d.info ? `<div><dt>Additional info</dt><dd>${esc(d.info)}</dd></div>` : ""}</dl>
      <a class="btn btn--block" href="#/pay">Proceed to payment</a><a class="btn btn--ghost btn--block" href="#/plans/new">Edit</a></section>`,
    };
  };
  V.planOne = (q, id) => {
    const o = order(id);
    if (!o || o.kind !== "plan") return go("#/plans");
    if (!o.days) return go("#/orders/" + id);
    const d = Math.min(6, Number(q.get("d")) || 0);
    const who = q.get("m") || "all";
    const member = S.members.find((m) => m.id === who);
    const meals = member ? genDay(d, o.meals, [...new Set([...o.allergies, ...member.allergies])]) : o.days[d];
    return {
      title: o.name,
      back: "#/plans",
      html: `<div class="cols"><div class="stack">
      <div class="sumbar"><span>${o.weeks} WEEK PLAN</span><span>${persons(o)} PERSONS</span><span>${o.allergies.length} ALLERGIES</span><span>${o.meals.length} MEALS</span></div>
      <div class="daytabs noprint" role="group" aria-label="Day">${DAYS.map((n, i) => `<button data-act="day" data-d="${i}" aria-pressed="${i === d}">${n.slice(0, 3).toUpperCase()}</button>`).join("")}</div>
      <div class="utabs noprint" role="group" aria-label="Person"><a href="#/plans/${o.id}?d=${d}" aria-current="${who === "all"}">Everybody</a>${o.members.map((m) => `<a href="#/plans/${o.id}?d=${d}&m=${m}" aria-current="${who === m}">${esc(memberName(m).split(" ")[0])}</a>`).join("")}</div>
      <h2 class="h" style="margin:4px 0 0">${DAYS[d]}${member ? " · " + esc(member.name) : ""}</h2>
      <div>${meals.map(mealCard).join("")}</div>
      <p class="mute">Prepared by: ${esc(o.staff.nutritionist || "GreenFed")} · GreenFed ${new Date(o.created).getFullYear()}</p></div>
      <aside class="stack noprint"><section class="card stack"><a class="btn btn--block" href="#/grocery?tab=plan&plan=${o.id}">${ic("bag")}Shop grocery</a><button class="btn btn--line btn--block" data-act="print">${ic("download")}Download plan</button><button class="btn btn--ghost btn--block" data-act="share" data-what="${esc(o.name)} meal plan">${ic("share")}Share</button></section>
        <section class="card stack">${o.review ? `<b>Your review</b><span class="stars">${[1, 2, 3, 4, 5].map((v) => `<svg class="i ${v <= o.review.stars ? "" : "off"}" aria-hidden="true"><use href="#i-star"/></svg>`).join("")}</span><p class="mute">${esc(o.review.note)}</p>` : `<b>How was your plan?</b><button class="btn btn--sm" data-act="review-plan" data-id="${o.id}">Give review</button>`}</section></aside></div>`,
    };
  };

  V.pay = () => {
    const d = S.draft;
    if (!d) return go("#/home");
    const c = S.cards[0];
    return {
      title: "Checkout",
      back: d.kind === "plan" ? "#/plans/review" : "#/cart",
      html: `<form class="cols" data-form="pay" novalidate><section class="card stack">
      <div class="paycard"><div class="row row--sb"><b>CREDIT CARD</b>${ic("card")}</div><span class="num" data-cnum>${c ? "•••• •••• •••• " + c.last4 : "1234 5678 8797 6587"}</span><div class="row row--sb"><div><small>Card name</small><b data-cname>${esc(c ? c.name : S.user.name)}</b></div><div><small>Expiry</small><b data-cexp>${esc(c ? c.exp : "06/28")}</b></div></div></div>
      <label class="field"><span>Card number</span><input class="inp" name="num" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="1234 5678 8797 6587"></label>
      <label class="field"><span>Card name</span><input class="inp" name="cname" autocomplete="cc-name" value="${esc(S.user.name)}"></label>
      <div class="grid2"><label class="field"><span>Expiry date</span><input class="inp" name="exp" autocomplete="cc-exp" maxlength="5" placeholder="MM/YY"></label><label class="field"><span>CVV</span><input class="inp" name="cvv" inputmode="numeric" maxlength="4" autocomplete="cc-csc"></label></div>
      <p class="mute" style="font-size:13px">Card payments aren't connected yet: nothing is charged, and only the last four digits are kept on this device.</p></section>
      <aside class="stack"><section class="card stack"><dl class="kv"><div><dt>${d.kind === "plan" ? "Meal plan" : "Grocery items"}</dt><dd>${money(d.kind === "plan" ? d.price : d.total)}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(d.kind === "plan" ? d.price : d.total)}</b></dd></div></dl><p class="err" data-err hidden></p><button class="btn btn--block">Pay now</button></section></aside></form>`,
    };
  };
  V.success = (q) => {
    const o = order(q.get("id"));
    if (!o) return go("#/home");
    const amt = o.kind === "plan" ? o.price : o.total;
    return {
      title: "Success",
      html: `<section class="card stack center" style="max-width:520px;margin:0 auto"><div class="big-ok">${ic("check")}</div><h2 class="title-g" style="font-size:26px">Success</h2>
      <p>Your payment of <b>${money(amt)}</b> has been made successfully for ${o.kind === "plan" ? "your meal plan. A nutritionist will pick it up shortly, and you'll get your plan within 48 hours." : "grocery items. We'll gather, check and pack your order before it heads to you."}</p>
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
      list = ids.map(item);
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
      <div class="promo-g"><span class="art">${ic("bowl")}</span><div><small>Get up to</small><b>20% Discount</b><small>Order selected food from the app and get a discount. See Offers.</small></div></div>
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
    return `<article class="prod" data-q="${esc((it.name + " " + it.cat).toLowerCase())}"><div class="prod__art" style="--tint:${CAT[it.cat].t};--ink2:${CAT[it.cat].c}">${ic(CAT[it.cat].i)}${it.pop ? "<small>100+</small>" : ""}${it.off ? '<span class="prod__off">−20%</span>' : ""}</div>
      <button class="fav" data-act="fav" data-id="${it.id}" aria-pressed="${S.favs.includes(it.id)}" aria-label="Favourite ${esc(it.name)}">${ic("heart")}</button>
      <b>${esc(it.name)}</b><small>${esc(it.unit)}${it.al.length ? " · contains " + esc(it.al.join(", ").toLowerCase()) : ""}</small>
      <div class="prod__row"><span class="price">${money(priceOf(it))}${it.off ? `<s>${money(it.price)}</s>` : ""}</span>${q ? `<span class="qty"><button data-act="qty" data-id="${it.id}" data-d="-1" aria-label="Remove one">−</button><b>${q}</b><button data-act="qty" data-id="${it.id}" data-d="1" aria-label="Add one">+</button></span>` : `<button class="addbtn" data-act="qty" data-id="${it.id}" data-d="1" aria-label="Add ${esc(it.name)} to cart">${ic("plus")}</button>`}</div></article>`;
  }
  V.cart = () => {
    const rows = Object.entries(S.cart);
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
        <label class="field"><span>Delivery slot</span><select class="inp" name="slot">${["Friday, 14:00–16:00", "Saturday, 10:00–12:00", "Saturday, 14:00–16:00", "Sunday, 12:00–14:00"].map((s) => `<option>${s}</option>`).join("")}</select></label>
        <div class="toggle-row"><div><b>Deliver every week</b><small class="mute">Farm-fresh produce on the same day each week</small></div><label class="switch"><input type="checkbox" name="weekly" checked aria-label="Deliver every week"><span></span></label></div></section></div>
      <aside class="stack" style="position:sticky;top:20px"><section class="card stack"><dl class="kv"><div><dt>Subtotal</dt><dd>${money(rows.reduce((a, [id, q]) => a + item(id).price * q, 0))}</dd></div><div><dt>Offers</dt><dd style="color:var(--p)">−${money(rows.reduce((a, [id, q]) => a + (item(id).price - priceOf(item(id))) * q, 0))}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(cartTotal())}</b></dd></div></dl>
        <p class="err" data-err hidden></p><button class="btn btn--block">Checkout</button></section></aside></form>`
        : `<div class="card empty"><b>Your cart is empty</b><a class="btn btn--sm" href="#/grocery" style="margin-top:10px">Shop grocery</a></div>`,
    };
  };

  V.orders = (q) => {
    const f = q.get("f") || "active";
    const list = myOrders()
      .filter((o) => (f === "active" ? o.status !== "DELIVERED" : f === "done" ? o.status === "DELIVERED" : true))
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
    const next = flow[flow.indexOf(o.status) + 1];
    const conflict = S.conflicts.find((c) => c.order === o.id);
    return {
      title: isG ? "Tracking order" : "Meal plan request",
      back: "#/orders",
      html: `<div class="cols"><div class="stack">
      ${isG && o.status === "EN_ROUTE" ? `<div class="map"><svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" aria-label="Map of the delivery route"><g class="roads" fill="none" stroke-width="9"><path d="M-10 60 L410 90"/><path d="M-10 170 L410 150"/><path d="M90 -10 L120 240"/><path d="M250 -10 L230 240"/></g><path class="route" d="M60 150 C120 120 130 70 200 64 S300 40 340 30" fill="none" stroke="#27A844" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="150" r="9" fill="#27A844"/><path d="M340 14c-7 0-11 5-11 10 0 8 11 17 11 17s11-9 11-17c0-5-4-10-11-10z" fill="#F59E0B"/><g class="rider moving" style="--at:60%"><circle r="11" fill="#fff"/><circle r="8" fill="#27A844"/></g></svg><span class="map__live" style="color:var(--p)">● Your order is on the way</span><div class="map__eta"><small>${esc(o.address.split(",").slice(-2, -1)[0] || "Maryland")}</small><b>${o.km || 7} km · ${o.eta || "1 hr"}</b></div></div>` : ""}
      <section class="card stack"><div class="row row--sb wrap"><div><small class="mute">${isG ? "Grocery order" : "Meal plan"}</small><p class="h" style="margin:0">${isG ? "#" + o.id.toUpperCase() : esc(o.name)}</p></div>${chip(o.status)}</div>${timeline(o)}
        ${isG && o.history.length > 1 ? `<p class="mute" style="font-size:13px">Tap the stars to review each stage.</p>` : ""}</section>
      ${o.kind === "plan" && o.status === "DELIVERED" ? `<a class="btn" href="#/plans/${o.id}">View my plan</a>` : ""}</div>
    <div class="stack">
      <section class="card stack"><h2 class="h" style="margin:0">Details</h2>${
        isG
          ? `<ul class="list">${o.items.map(([iid, n]) => `<li><div class="grow"><b>${esc(item(iid).name)}</b><small>${n} × ${money(priceOf(item(iid)))}</small></div><span>${money(priceOf(item(iid)) * n)}</span></li>`).join("")}</ul><dl class="kv"><div><dt>Deliver to</dt><dd>${esc(o.address)}</dd></div><div><dt>Slot</dt><dd>${esc(o.slot)}${o.weekly ? " · weekly" : ""}</dd></div><div class="tot"><dt>Total</dt><dd><b>${money(o.total)}</b></dd></div></dl>`
          : `<dl class="kv"><div><dt>For</dt><dd>${esc(o.members.map(memberName).join(", "))}</dd></div><div><dt>Meals</dt><dd>${esc(o.meals.join(", "))}</dd></div><div><dt>Allergies</dt><dd>${esc(o.allergies.join(", ") || "None")}</dd></div><div><dt>Nutritionist</dt><dd>${esc(o.staff.nutritionist || "Not picked yet")}</dd></div><div class="tot"><dt>Paid</dt><dd><b>${money(o.price)}</b></dd></div></dl>`
      }</section>
      ${isG ? (conflict ? `<section class="card stack"><b>Problem reported</b><p class="mute">${esc(conflict.type)} · ${chip(conflict.status)}${conflict.resolution ? "<br>" + esc(conflict.resolution) : ""}</p></section>` : `<section class="card stack"><b>Something wrong?</b><div class="grid2"><button class="btn btn--line btn--sm" data-act="conflict" data-id="${o.id}" data-t="Late delivery">Late delivery</button><button class="btn btn--line btn--sm" data-act="conflict" data-id="${o.id}" data-t="Poor quality">Poor quality</button></div></section>`) : ""}

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
      <div data-comms>${list.map((c) => `<a class="comm" href="#/community/${c.id}" data-q="${esc((c.name + " " + c.cat + " " + c.desc).toLowerCase())}"><span class="comm__ico">${ic(c.pub ? "users" : "lock")}</span><b>${esc(c.name)}</b><span class="comm__side"><span>${c.members}${c.members > 199 ? "+" : ""} members</span>${c.joined ? chip("ACTIVE").replace("Active", "Joined") : `<span class="link">Join</span>`}</span><small>${c.pub ? "" : "Private · "}${esc(c.last)}</small></a>`).join("") || `<div class="card empty"><b>No communities here</b></div>`}</div></div>
      <aside class="stack"><section class="card stack"><b>Start a community</b><p class="mute">Public or private, around any food or health topic.</p><a class="btn btn--block" href="#/community/new">${ic("plus")}Create community</a></section>
        <section class="card stack"><b>Health professional?</b><p class="mute">Sign up as a handler or community leader to guide members.</p>${S.leader ? `<p>${chip("PICKED").replace("Picked", "Application pending")}</p>` : `<button class="btn btn--line btn--block" data-act="leader">Apply to lead</button>`}</section>
        <p class="mute" style="font-size:13px">Communities are open to everyone, including people who don't use meal plans or grocery delivery.</p></aside></div>`,
    };
  };
  V.newComm = () => ({
    title: "New community",
    back: "#/community",
    html: `<form class="card stack" data-form="comm" style="max-width:640px" novalidate>
    <div class="seg" role="radiogroup" aria-label="Visibility"><label><input type="radio" name="pub" value="1" checked><span>${ic("globe")}Public<small>Anyone can join</small></span></label><label><input type="radio" name="pub" value="0"><span>${ic("lock")}Private<small>Only invited people can join</small></span></label></div>
    <label class="field"><span>Community name</span><input class="inp" name="name" placeholder="Give your community a name"></label>
    <label class="field"><span>Description</span><textarea class="inp" name="desc" placeholder="What is the community about?"></textarea></label>
    <label class="field"><span>Category</span><select class="inp" name="cat">${["Allergies", "Health issues", "Nutrition", "Food & craft", "Rehabilitation", "Weight", "Balanced diet"].map((c) => `<option>${c}</option>`).join("")}</select></label>
    <fieldset class="field" style="border:0;padding:0;margin:0"><span>Permissions</span><div class="seg"><label><input type="radio" name="perms" value="anyone" checked><span>Anyone can post</span></label><label><input type="radio" name="perms" value="admins"><span>Only admins can post</span></label></div></fieldset>
    <label class="field"><span>Cover image (optional)</span><input class="inp" type="file" name="cover" accept="image/*"></label>
    <p class="err" data-err hidden></p><button class="btn">Create</button></form>`,
  });
  V.commOne = (q, id) => {
    const c = S.communities.find((x) => x.id === id);
    if (!c) return go("#/community");
    const posts = S.posts.filter((p) => p.c === id).sort((a, b) => b.at - a.at);
    const canPost = c.joined && c.perms === "anyone";
    return {
      title: c.name,
      back: "#/community",
      html: `<div class="cols"><div class="stack">
      <div class="cover">${ic(c.pub ? "users" : "lock")}</div>
      <div class="row row--sb wrap"><div><h2 class="h" style="margin:0">${esc(c.name)}</h2><small class="mute">${esc(c.cat)} · ${c.members} members · ${c.pub ? "Public" : "Private"}</small></div>
        <div class="row">${c.joined ? `<button class="btn btn--ghost btn--sm" data-act="leave" data-id="${c.id}">Leave</button>` : `<button class="btn btn--sm" data-act="join" data-id="${c.id}">${c.pub ? "Join" : "Request to join"}</button>`}<button class="btn btn--line btn--sm" data-act="share" data-what="${esc(c.name)} community">${ic("share")}Invite</button></div></div>
      <p class="mute">${esc(c.desc)}</p>
      ${
        canPost
          ? `<form class="card stack" data-form="post" data-c="${c.id}" novalidate><label class="field"><span>Topic</span><input class="inp" name="title" placeholder="Topic being discussed"></label><label class="field"><span>Type your post</span><textarea class="inp" name="body"></textarea></label><p class="err" data-err hidden></p><button class="btn btn--sm" style="justify-self:start">${ic("send")}Send post</button></form>`
          : `<p class="card mute">${c.joined ? "Only admins can post here. You can reply to posts." : "Join to post and reply."}</p>`
      }
      <div>${posts.map((p) => postCard(p, c)).join("") || `<div class="card empty"><b>No posts yet</b>Be the first to start a conversation.</div>`}</div></div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">About</h2><dl class="kv"><div><dt>Creator</dt><dd>${esc(c.by)}</dd></div><div><dt>Category</dt><dd>${esc(c.cat)}</dd></div><div><dt>Who can post</dt><dd>${c.perms === "anyone" ? "Anyone" : "Admins only"}</dd></div></dl></section></aside></div>`,
    };
  };
  const replyTree = (rs, pid, c) =>
    rs
      .map(
        (r) =>
          `<div class="reply"><div class="post__by"><span class="ava ava--soft" style="width:30px;height:30px;font-size:11px">${initials(r.by)}</span><b>${esc(r.by)}</b>${r.role ? `<span class="st st--PAID">${esc(r.role)}</span>` : ""}<span>· ${ago(r.at)}</span></div><p>${esc(r.body)}</p>${c.joined ? `<button class="link" style="justify-self:start;font-size:13px" data-act="reply" data-p="${pid}" data-r="${r.id}">Reply</button>` : ""}${replyTree(r.replies, pid, c)}</div>`,
      )
      .join("");
  const postCard = (
    p,
    c,
  ) => `<article class="post"><div class="post__by"><span class="ava">${initials(p.by)}</span><div><b>${esc(p.by)}</b> · ${ago(p.at)}</div></div><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p>
    <div class="post__acts"><button data-act="like" data-id="${p.id}" aria-pressed="${p.liked}">${ic("heart")}${k(p.likes)}</button>${c.joined ? `<button data-act="reply" data-p="${p.id}">${ic("chat")}Reply</button>` : `<span>${ic("chat")}${p.replies.length}</span>`}<button data-act="share" data-what="this post">${ic("share")}Share</button></div>
    ${replyTree(p.replies, p.id, c)}</article>`;

  V.notes = (q) => {
    const f = q.get("f") || "All";
    const list = S.notes.filter((n) => f === "All" || n.cat === f);
    return {
      title: "Notification",
      html: `<div class="stack" style="max-width:820px"><div class="row row--sb wrap"><div class="utabs">${["All", "Meal Plan", "Grocery", "Profile"].map((c) => `<a href="#/notifications?f=${encodeURIComponent(c)}" aria-current="${f === c}">${c}</a>`).join("")}</div><button class="link" data-act="read-all">Mark all as read</button></div>
      <section class="card">${list.length ? `<ul class="list">${list.map((n) => `<li><span class="ava ${n.read ? "ava--soft" : ""}">${ic(n.cat === "Grocery" ? "bag" : n.cat === "Meal Plan" ? "plan" : "user")}</span><a class="grow" href="${n.link}" data-act="open-note" data-id="${n.id}"><b>${esc(n.t)}</b><small>${esc(n.s)}<br>${ago(n.at)} · ${esc(n.cat)}</small></a></li>`).join("")}</ul>` : `<div class="empty"><b>You're all caught up</b></div>`}</section></div>`,
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
      <section class="card"><p class="mute" style="font-size:13px">${list.length} records found · ID: ${String(S.user.email.length).padStart(7, "0")}</p><div class="recs" data-recs>${list.map((r) => `<div class="rec" data-q="${esc((r.name + " " + r.type + " " + memberName(r.member)).toLowerCase())}"><span class="rec__ico">${ic(r.type === "Allergy" ? "alert" : r.type === "Medication" ? "pill" : "heart")}</span><b>${esc(r.name)}</b><button class="btn btn--danger btn--sm" data-act="del-rec" data-id="${r.id}" aria-label="Delete record ${esc(r.name)}">${ic("trash")}</button><small class="mute">${esc(r.type)} · ${esc(memberName(r.member))} · ${fmtDate(r.date)} · ${esc(r.by)} · <span class="sev sev--${r.sev}">${r.sev}</span></small></div>`).join("") || `<p class="mute">No records in this list.</p>`}</div></section>
      <p class="mute" style="font-size:13px">Sample data. Your records are only used to plan meals and are never shared in communities.</p></div>`,
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
    const name = r === "employee" ? EMP[S.emp.type].who : r === "admin" ? "GreenFed admin" : u.name;
    return {
      title: "Profile",
      html: `<div class="cols"><section class="card"><ul class="menu">
      ${pp(
        "personal",
        "user",
        "Personal information",
        "Name, sex, address, occupation, age",
        `<form class="stack" data-form="profile" novalidate><div class="grid2"><label class="field"><span>Name</span><input class="inp" name="name" value="${esc(u.name)}"></label><label class="field"><span>Sex</span><select class="inp" name="sex">${["Female", "Male"].map((s) => `<option ${S.members[0].sex === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
        <div class="grid2"><label class="field"><span>Age</span><input class="inp" name="age" type="number" value="${S.members[0].age}"></label><label class="field"><span>Marital status</span><input class="inp" name="marital" value="${esc(u.marital)}"></label></div>
        <label class="field"><span>Address</span><input class="inp" name="address" value="${esc(u.address)}"></label><div class="grid2"><label class="field"><span>Occupation</span><input class="inp" name="occupation" value="${esc(u.occupation)}"></label><label class="field"><span>Phone</span><input class="inp" name="phone" value="${esc(u.phone)}"></label></div><button class="btn btn--sm">Update</button></form>`,
      )}
      ${
        r === "user"
          ? pp(
              "health",
              "heart",
              "Health status",
              "Height, body goal, allergies",
              `<form class="stack" data-form="healthst" novalidate><div class="grid2"><label class="field"><span>Height (cm)</span><input class="inp" name="height" type="number" value="${u.height}"></label><label class="field"><span>Weight (kg)</span><input class="inp" name="weight" type="number" value="${u.weight}"></label></div>
        <label class="field"><span>Body goal</span><select class="inp" name="goal">${["Lose weight", "Maintain a healthy weight", "Gain weight", "Build muscle", "Manage a health condition"].map((g) => `<option ${u.goal === g ? "selected" : ""}>${g}</option>`).join("")}</select></label><label class="field"><span>Goal description</span><input class="inp" name="goalNote" value="${esc(u.goalNote)}"></label>
        <fieldset class="field" style="border:0;padding:0;margin:0"><span>My allergies</span><div class="checks">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}" ${S.members[0].allergies.includes(a) ? "checked" : ""}><span>${a}</span></label>`).join("")}</div></fieldset><button class="btn btn--sm">Save</button></form>`,
            )
          : ""
      }
      ${r === "user" ? `<li><a href="#/family">${ic("users")}<span class="grow"><b>Family members</b><small>${S.members.length - 1} added · add husband, wife or kids</small></span>${ic("chev-right")}</a></li><li><a href="#/health">${ic("clipboard")}<span class="grow"><b>My health record</b><small>Allergies, diagnoses, reports</small></span>${ic("chev-right")}</a></li>` : ""}
      ${pp("notify", "bell", "Notification", "Email and app alerts", `${tog("email", "Email", "Meal plan delivery and order updates")}${tog("push", "In-app", "Every stage of your orders")}${tog("community", "Community", "Replies and mentions")}${tog("promos", "Offers", "New plans and grocery discounts")}`)}
      ${pp("account", "lock", "Account", "Email, password, delete account", `<dl class="kv"><div><dt>Email</dt><dd>${esc(u.email)}</dd></div><div><dt>Status</dt><dd>${chip(u.status)}</dd></div></dl><a class="btn btn--line btn--sm" href="${esc(RH.url("account/index.html"))}">Email, password and roles</a>`)}
      <li><div class="toggle-row" style="padding:14px 4px;border-bottom:1px solid var(--line)"><div class="row">${ic("moon")}<b>Dark mode</b></div><label class="switch"><input type="checkbox" data-act="pref" data-k="dark" ${S.prefs.dark ? "checked" : ""} aria-label="Dark mode"><span></span></label></div></li>
      <li><button class="danger" data-act="logout">${ic("logout")}<span class="grow"><b>Log out</b></span></button></li></ul></section>
      <aside class="stack"><section class="card prof"><span class="ava ava--lg">${initials(name)}</span><h2>${esc(name)}</h2><p class="mute">${esc(r === "employee" ? EMP[S.emp.type].name : r === "admin" ? "Administrator" : u.email)}</p>${r === "user" ? `<dl class="facts"><div><dt>Age</dt><dd>${S.members[0].age}</dd></div><div><dt>Height</dt><dd>${u.height} cm</dd></div><div><dt>Goal</dt><dd>${esc(u.goal)}</dd></div></dl>` : ""}</section></aside></div>`,
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
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Your household</h2>${S.members.map((m) => `<div class="member"><span class="ava ava--soft">${initials(m.name)}</span><div><b>${esc(m.name)}</b><small>${esc(m.rel)} · ${m.age} yrs${m.allergies.length ? " · " + esc(m.allergies.join(", ")) : ""}</small></div>${m.rel === "You" ? "" : `<button class="btn btn--danger btn--sm" data-act="del-mem" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">${ic("trash")}</button>`}</div>`).join("")}</section></aside></div>`,
  });

  // ------------------------------------------------------------ employee views
  function queueFor(type) {
    const O = S.orders;
    if (type === "nutritionist") return O.filter((o) => o.kind === "plan" && o.status === "PAID");
    if (type === "supply" || type === "supplier") return O.filter((o) => o.kind === "grocery" && o.status === "PAID");
    if (type === "qa") return O.filter((o) => o.kind === "grocery" && o.status === "GATHERING" && o.gathered);
    if (type === "delivery") return O.filter((o) => o.kind === "grocery" && o.status === "QA" && o.passed);
    return [];
  }
  function activeFor(type) {
    const who = EMP[type].who;
    const O = S.orders;
    if (type === "nutritionist")
      return O.find(
        (o) => o.kind === "plan" && ["PICKED", "IN_PROGRESS"].includes(o.status) && o.staff.nutritionist === who,
      );
    if (type === "supply")
      return O.find((o) => o.kind === "grocery" && o.status === "GATHERING" && !o.gathered && o.staff.supply === who);
    if (type === "qa")
      return O.find((o) => o.kind === "grocery" && o.status === "QA" && !o.passed && o.staff.qa === who);
    if (type === "delivery")
      return O.find(
        (o) => o.kind === "grocery" && ["PACKAGED", "EN_ROUTE"].includes(o.status) && o.staff.delivery === who,
      );
    return null;
  }
  const owner = (o) => o.owner || S.user.name;
  V.work = () => {
    const t = S.emp.type,
      e = EMP[t];
    const act = activeFor(t);
    const queue = queueFor(t);
    let actHtml = "";
    if (act) {
      const isP = act.kind === "plan";
      const step = isP
        ? act.status === "PICKED"
          ? ["Start working on plan", "start"]
          : ["Deliver plan to client", "deliver"]
        : t === "supply"
          ? ["Mark as gathered", "gathered"]
          : t === "qa"
            ? ["Pass quality check", "passed"]
            : act.status === "PACKAGED"
              ? ["Out for delivery", "out"]
              : ["Mark delivered", "delivered"];
      actHtml = `<section class="job job--active"><div class="row row--sb wrap"><b>Current order · ${esc(isP ? act.name : "#" + act.id.toUpperCase())}</b>${chip(act.status)}</div>
        <dl class="kv"><div><dt>Client</dt><dd>${esc(owner(act))}</dd></div>${isP ? `<div><dt>Persons</dt><dd>${persons(act)}</dd></div><div><dt>Meals</dt><dd>${esc(act.meals.join(", "))}</dd></div><div><dt>Allergies</dt><dd>${esc(act.allergies.join(", ") || "None")}</dd></div>${act.info ? `<div><dt>Notes</dt><dd>${esc(act.info)}</dd></div>` : ""}` : `<div><dt>Items</dt><dd>${esc(act.items.map(([iid, n]) => n + " × " + item(iid).name).join(", "))}</dd></div><div><dt>Deliver to</dt><dd>${esc(act.address)}</dd></div><div><dt>Slot</dt><dd>${esc(act.slot)}</dd></div>`}</dl>
        ${isP && act.status === "IN_PROGRESS" ? `<div><b>Draft plan · Monday</b>${genDay(0, act.meals, act.allergies).map(mealCard).join("")}<p class="mute" style="font-size:13px;margin-top:8px">The full 7-day plan is generated from the GreenFed meal library, avoiding the client's allergies. Review it before delivering.</p></div>` : ""}
        <button class="btn btn--o" data-act="emp-step" data-id="${act.id}" data-s="${step[1]}">${step[0]}</button></section>`;
    }
    const health = t === "health";
    return {
      title: `My work · ${e.name}`,
      html: `<div class="cols"><div class="stack">
      <div class="card" style="padding:14px"><small class="mute">Your role</small><b>${esc(e.name)}</b></div>
      ${actHtml}
      ${
        health
          ? `<section class="stack"><h2 class="h" style="margin:0">Community: recent posts</h2>${S.posts
              .slice()
              .sort((a, b) => b.at - a.at)
              .map((p) => {
                const c = S.communities.find((x) => x.id === p.c);
                return `<article class="post"><div class="post__by"><b>${esc(p.by)}</b> in ${esc(c.name)} · ${ago(p.at)}</div><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p><button class="btn btn--sm" style="justify-self:start" data-act="reply" data-p="${p.id}" data-as="specialist">Reply as health specialist</button></article>`;
              })
              .join("")}</section>`
          : `<section class="stack"><h2 class="h" style="margin:0">${esc(e.queue)} · waiting</h2>${
              queue.length
                ? queue
                    .map(
                      (
                        o,
                      ) => `<article class="job"><div class="row row--sb wrap"><b>${esc(o.kind === "plan" ? o.name + " · " + persons(o) + " persons" : "Grocery #" + o.id.toUpperCase())}</b>${chip(o.status)}</div><small class="mute">${esc(owner(o))} · ${ago(o.created)}${o.kind === "plan" ? " · " + esc(o.meals.join(", ")) : " · " + o.items.length + " items · " + esc(o.slot)}</small>
            ${t === "supplier" ? `<p class="mute">${esc(o.items.map(([iid, n]) => n + " × " + item(iid).name).join(", "))}</p><button class="btn btn--sm" style="justify-self:start" data-act="supplied" data-id="${o.id}" ${o.supplied ? "disabled" : ""}>${o.supplied ? "Supplied" : "Mark items supplied"}</button>` : `<button class="btn btn--sm" style="justify-self:start" data-act="emp-pick" data-id="${o.id}" ${act ? "disabled" : ""}>Pick this order</button>`}</article>`,
                    )
                    .join("")
                : `<div class="card empty"><b>Queue is empty</b>New orders appear here as clients pay.</div>`
            }
            ${act && queue.length && t !== "supplier" ? `<p class="mute" style="font-size:13px">You can hold one order at a time. Finish your current order to pick another.</p>` : ""}</section>`
      }</div>
      <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Work meter</h2><b style="font-size:28px;color:var(--p)">${S.emp.tasks} tasks</b><div class="meter"><i style="width:${Math.min(100, S.emp.tasks * 2)}%"></i></div><p class="mute">Expected this month: ${money(S.emp.tasks * RATE)} (sample rate ${money(RATE)} per task)</p><a class="btn btn--line btn--sm" href="#/work/earnings">Details</a></section>
        <section class="card stack"><b>Order chain</b><p class="mute" style="font-size:13px">Supply manager → Quality assurance → Packaging &amp; delivery. Each stage is visible to the client.</p></section></aside></div>`,
    };
  };
  V.earnings = () => ({
    title: "Work meter",
    html: `<div class="cols"><div class="stack">
      <section class="welcome"><small>Tasks completed this cycle</small><h2>${S.emp.tasks}</h2><p>Expected withdrawal: <b>${money(S.emp.tasks * RATE)}</b> · paid monthly${S.emp.type === "supplier" ? " (suppliers are paid per supply invoice)" : ""}.</p></section>
      <section class="card"><h2 class="h">Payments</h2>${S.emp.paid.length ? `<ul class="list">${S.emp.paid.map((p) => `<li><div class="grow"><b>${money(p.amt)}</b><small>${p.tasks} tasks · ${fmtDate(p.at)}</small></div>${chip("RESOLVED").replace("Resolved", "Paid")}</li>`).join("")}</ul>` : `<p class="mute">No payments yet. The counter resets after each payment.</p>`}</section></div>
    <aside class="stack"><section class="card stack"><h2 class="h" style="margin:0">Salary details</h2>${S.emp.bank ? `<p><b>${esc(S.emp.bank.bank)}</b><br><span class="mute">${esc(S.emp.bank.acct)} · ${esc(S.emp.bank.name)}</span></p>` : `<p class="mute">Add the account your salary is paid into.</p>`}
      <form class="stack" data-form="salary" novalidate><label class="field"><span>Bank</span><select class="inp" name="bank">${["Access Bank", "First Bank", "GTBank", "Kuda", "UBA", "Wema Bank", "Zenith Bank"].map((b) => `<option>${b}</option>`).join("")}</select></label><label class="field"><span>Account number</span><input class="inp" name="acct" inputmode="numeric" maxlength="10"></label><label class="field"><span>Account name</span><input class="inp" name="name" value="${esc(EMP[S.emp.type].who)}"></label><p class="err" data-err hidden></p><button class="btn btn--sm">Save details</button></form></section></aside></div>`,
  });
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
    const rev = O.reduce((a, o) => a + (o.kind === "plan" ? o.price : o.total), 0);
    return {
      title: "Company overview",
      html: `<div class="stack">
      <div class="kpis">${[
        ["Meal plans", O.filter((o) => o.kind === "plan").length],
        ["Grocery orders", O.filter((o) => o.kind === "grocery").length],
        ["Communities", S.communities.length],
        ["Revenue", money(rev)],
        ["Open conflicts", S.conflicts.filter((c) => c.status === "OPEN").length],
      ]
        .map(([n, v]) => `<div class="card kpi"><small>${n}</small><b>${v}</b></div>`)
        .join("")}</div>
      <section class="card tbl"><h2 class="h" style="padding-top:8px">All orders</h2><table><thead><tr><th>Order</th><th>Ordered by</th><th>Picked by</th><th>Progress</th><th>Amount</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>
        ${O.slice()
          .sort((a, b) => b.created - a.created)
          .map((o) => {
            const flow = o.kind === "plan" ? PLAN_FLOW : GROC_FLOW;
            const nx = flow[flow.indexOf(o.status) + 1];
            return `<tr><td><b>${esc(o.kind === "plan" ? o.name : "Grocery #" + o.id.toUpperCase())}</b><br><small class="mute">${o.kind === "plan" ? "Meal plan" : "Grocery"}</small></td><td>${esc(owner(o))}</td><td>${esc(Object.values(o.staff).join(", ") || "—")}</td><td>${chip(o.status)}</td><td>${money(o.kind === "plan" ? o.price : o.total)}</td><td>${nx ? `<button class="btn btn--ghost btn--sm" data-act="advance" data-id="${o.id}">Advance</button>` : ""}</td></tr>`;
          })
          .join("")}</tbody></table></section>
      <section class="card tbl"><div class="row row--sb wrap" style="padding:8px 0"><h2 class="h" style="margin:0">Staff work meters</h2><button class="btn btn--ghost btn--sm" data-act="pay-staff">Pay staff and reset counters</button></div><table><thead><tr><th>Staff</th><th>Type</th><th>Tasks</th><th>Due</th></tr></thead><tbody>${Object.entries(
        EMP,
      )
        .map(
          ([kk, e]) =>
            `<tr><td>${esc(e.who)}</td><td>${e.name}</td><td>${kk === S.emp.type ? S.emp.tasks : "—"}</td><td>${kk === S.emp.type ? money(S.emp.tasks * RATE) : "—"}</td></tr>`,
        )
        .join("")}</tbody></table></section>
      <section class="card"><h2 class="h">Employee complaints</h2>${S.emp.complaints.length ? `<ul class="list">${S.emp.complaints.map((c, i) => `<li><div class="grow"><b>${esc(c.type)} · ${esc(c.by)}</b><small>${esc(c.body)}</small></div>${c.status === "OPEN" ? `<button class="btn btn--sm" data-act="close-complaint" data-i="${i}">Resolve</button>` : chip(c.status)}</li>`).join("")}</ul>` : `<p class="mute">No complaints.</p>`}</section></div>`,
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
    html: `<div class="stack" style="max-width:900px"><p class="mute">Late delivery: waive the next delivery. Poor quality: recall and resupply.</p>
    ${S.conflicts.length ? S.conflicts.map((c, i) => `<article class="job"><div class="row row--sb wrap"><b>${esc(c.type)} · order #${esc(c.order.toUpperCase())}</b>${chip(c.status)}</div><small class="mute">${esc(c.by)} · ${ago(c.at)}</small>${c.status === "OPEN" ? `<button class="btn btn--sm" style="justify-self:start" data-act="resolve" data-i="${i}">${c.type === "Late delivery" ? "Waive next delivery" : "Recall and resupply"}</button>` : `<p class="mute">${esc(c.resolution)}</p>`}</article>`).join("") : `<div class="card empty"><b>No conflicts</b>Customers report late or poor-quality deliveries from their order page.</div>`}</div>`,
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
    [/^\/community$/, V.community, "user"],
    [/^\/community\/new$/, V.newComm, "user"],
    [/^\/community\/(\w+)$/, V.commOne, "user"],
    [/^\/notifications$/, V.notes, "user"],
    [/^\/health$/, V.health, "user"],
    [/^\/family$/, V.family, "user"],
    [/^\/profile$/, V.profile],
    [/^\/work$/, V.work, "employee"],
    [/^\/work\/earnings$/, V.earnings, "employee"],
    [/^\/work\/complaints$/, V.complaints, "employee"],
    [/^\/admin$/, V.admin, "admin"],
    [/^\/admin\/users$/, V.users, "admin"],
    [/^\/admin\/conflicts$/, V.conflicts, "admin"],
  ];
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
      return go(localStorage.getItem("gf-seen-intro") ? "#/start" : "#/welcome");
    }
    const m = ROUTES.map(([re, fn, r]) => [path.match(re), fn, r]).find((x) => x[0]);
    if (!m) return go(HOME[role()]);
    if (m[2] && m[2] !== role()) return go(HOME[role()]);
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
  window.addEventListener("hashchange", render);

  // ------------------------------------------------------------ events
  const advance = (o) => {
    const flow = o.kind === "plan" ? PLAN_FLOW : GROC_FLOW;
    const nx = flow[flow.indexOf(o.status) + 1];
    if (!nx) return;
    if (o.kind === "plan") {
      if (nx === "PICKED") o.staff.nutritionist = o.staff.nutritionist || EMP.nutritionist.who;
      if (nx === "DELIVERED") o.days = DAYS.map((_, i) => genDay(i, o.meals, o.allergies));
    } else {
      const map = {
        GATHERING: ["supply", EMP.supply.who],
        QA: ["qa", EMP.qa.who],
        EN_ROUTE: ["delivery", EMP.delivery.who],
      };
      if (map[nx]) o.staff[map[nx][0]] = o.staff[map[nx][0]] || map[nx][1];
      if (nx === "QA") o.gathered = true;
      if (nx === "PACKAGED") o.passed = true;
    }
    setStatus(o, nx);
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act,
      id = b.dataset.id;
    if (["role", "pref", "gsearch", "csearch", "hsearch"].includes(a)) return;
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
    if (a === "fav") {
      S.favs = S.favs.includes(id) ? S.favs.filter((x) => x !== id) : [...S.favs, id];
      save();
      render();
    }
    if (a === "qty") {
      const n = (S.cart[id] || 0) + Number(b.dataset.d);
      if (n <= 0) delete S.cart[id];
      else S.cart[id] = n;
      save();
      render();
      if (Number(b.dataset.d) > 0 && n === 1) toast(`${item(id).name} added to cart`);
    }
    if (a === "add-plan") {
      b.dataset.ids.split(",").forEach((x) => (S.cart[x] = (S.cart[x] || 0) + 1));
      save();
      toast("Plan groceries added to cart");
      go("#/cart");
    }
    if (a === "clear-cart") {
      S.cart = {};
      save();
      render();
    }
    if (a === "fav-plan") {
      const o = order(id);
      o.fav = !o.fav;
      save();
      render();
    }
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
    if (a === "stage-rate") {
      const o = order(id);
      o.reviews[b.dataset.st] = +b.dataset.v;
      save();
      render();
      toast(`Thanks: ${LABEL[b.dataset.st].toLowerCase()} rated ${b.dataset.v}/5`);
    }
    if (a === "advance") {
      advance(order(id));
      save();
      render();
    }
    if (a === "conflict") {
      S.conflicts.unshift({ order: id, type: b.dataset.t, by: S.user.name, at: now(), status: "OPEN" });
      save();
      render();
      toast("Reported. Our conflict manager will follow up.");
    }
    if (a === "join" || a === "leave") {
      const c = S.communities.find((x) => x.id === id);
      c.joined = a === "join";
      c.members += a === "join" ? 1 : -1;
      save();
      render();
      toast(a === "join" ? (c.pub ? `Welcome to ${c.name}` : "Request sent") : `You left ${c.name}`);
    }
    if (a === "like") {
      const p = S.posts.find((x) => x.id === id);
      p.liked = !p.liked;
      p.likes += p.liked ? 1 : -1;
      save();
      render();
    }
    if (a === "reply") replyModal(b.dataset.p, b.dataset.r, b.dataset.as === "specialist");
    if (a === "leader") {
      S.leader = { at: now() };
      save();
      render();
      toast("Application sent. We'll verify your licence.");
    }
    if (a === "read-all") {
      S.notes.forEach((n) => (n.read = true));
      save();
      render();
    }
    if (a === "open-note") {
      const n = S.notes.find((x) => x.id === id);
      if (n) {
        n.read = true;
        save();
      }
    }
    if (a === "add-rec") recModal();
    if (a === "del-rec") {
      if (!confirm("Delete this record?")) return;
      S.records = S.records.filter((r) => r.id !== id);
      save();
      render();
      toast("Record deleted");
    }
    if (a === "del-mem") {
      S.members = S.members.filter((m) => m.id !== id);
      save();
      render();
      toast("Family member removed");
    }
    if (a === "emp-pick") {
      const o = order(id),
        t = S.emp.type,
        who = EMP[t].who;
      if (activeFor(t)) return toast("Finish your current order first.");
      if (t === "nutritionist") setStatus(o, "PICKED", "nutritionist", who);
      if (t === "supply") setStatus(o, "GATHERING", "supply", who);
      if (t === "qa") setStatus(o, "QA", "qa", who);
      if (t === "delivery") {
        o.staff.delivery = who;
        setStatus(o, "PACKAGED");
      }
      save();
      render();
      toast("Order picked. The client can see your name.");
    }
    if (a === "emp-step") {
      const o = order(id),
        s = b.dataset.s;
      if (s === "start") setStatus(o, "IN_PROGRESS");
      if (s === "deliver") {
        o.days = DAYS.map((_, i) => genDay(i, o.meals, o.allergies));
        setStatus(o, "DELIVERED");
        S.emp.tasks++;
      }
      if (s === "gathered") {
        o.gathered = true;
        S.emp.tasks++;
      }
      if (s === "passed") {
        o.passed = true;
        S.emp.tasks++;
      }
      if (s === "out") setStatus(o, "EN_ROUTE");
      if (s === "delivered") {
        setStatus(o, "DELIVERED");
        S.emp.tasks++;
      }
      save();
      render();
      toast(s === "deliver" ? "Plan delivered to the client's email and app" : "Updated");
    }
    if (a === "supplied") {
      order(id).supplied = true;
      S.emp.tasks++;
      save();
      render();
      toast("Marked as supplied");
    }
    if (a === "pay-staff") {
      if (S.emp.tasks) {
        S.emp.paid.unshift({ amt: S.emp.tasks * RATE, tasks: S.emp.tasks, at: now() });
        S.emp.tasks = 0;
        save();
        render();
        toast("Staff paid. Counters reset.");
      } else toast("Nothing due.");
    }
    if (a === "close-complaint") {
      S.emp.complaints[+b.dataset.i].status = "RESOLVED";
      save();
      render();
    }
    if (a === "resolve") {
      const c = S.conflicts[+b.dataset.i];
      c.status = "RESOLVED";
      c.resolution =
        c.type === "Late delivery" ? "Next delivery waived for the customer." : "Items recalled and resupplied.";
      save();
      render();
      toast("Conflict resolved");
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target,
      a = t.dataset.act;
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
    if (t.matches("[data-otp]") && t.value) {
      const n = t.nextElementSibling;
      if (n) n.focus();
    }
    const pf = t.closest("[data-form=pay]");
    if (pf) {
      const n = pf.num.value.replace(/\D/g, "");
      $("[data-cnum]").textContent = n ? n.replace(/(.{4})/g, "$1 ").trim() : "1234 5678 8797 6587";
      $("[data-cname]").textContent = pf.cname.value || S.user.name;
      $("[data-cexp]").textContent = pf.exp.value || "MM/YY";
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Backspace" && e.target.matches("[data-otp]") && !e.target.value) {
      const p = e.target.previousElementSibling;
      if (p) p.focus();
    }
  });

  const vals = (f, n) => $$(`[name=${n}]:checked`, f).map((x) => x.value);
  const FORMS = {
    setup(f) {
      const me = S.members[0];
      me.age = +f.age.value || me.age;
      me.sex = f.sex.value;
      me.allergies = vals(f, "al");
      S.user.marital = f.marital.value;
      S.user.phone = f.phone.value;
      if (f.health.value.trim()) me.conditions = [f.health.value.trim()];
      save();
      toast("Welcome to GreenFed!");
      go("#/home");
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
      save();
      go("#/plans/review");
    },
    pay(f) {
      const n = f.num.value.replace(/\D/g, "");
      if (n.length !== 16) return err(f, "Card numbers have 16 digits.");
      if (!f.cname.value.trim()) return err(f, "Enter the name on the card.");
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.exp.value)) return err(f, "Use MM/YY for the expiry date.");
      if (!/^\d{3,4}$/.test(f.cvv.value)) return err(f, "Enter the 3 or 4-digit CVV.");
      const d = S.draft,
        t = now();
      S.cards = [{ last4: n.slice(-4), name: f.cname.value.trim(), exp: f.exp.value }];
      let o;
      if (d.kind === "plan")
        o = {
          kind: "plan",
          id: uid("o"),
          name: d.name,
          members: d.members,
          weeks: d.weeks,
          meals: d.meals,
          allergies: d.allergies,
          info: d.info,
          price: d.price,
          status: "PAID",
          staff: {},
          created: t,
          history: [["PAID", t]],
          review: null,
        };
      else {
        o = {
          kind: "grocery",
          id: uid("o"),
          items: d.items,
          total: d.total,
          address: d.address,
          slot: d.slot,
          weekly: d.weekly,
          status: "PAID",
          staff: {},
          created: t,
          reviews: {},
          history: [["PAID", t]],
          km: 7,
          eta: "1 hr",
        };
        S.cart = {};
      }
      S.orders.unshift(o);
      S.users[0].name = S.user.name;
      note(
        d.kind === "plan" ? "Meal Plan" : "Grocery",
        d.kind === "plan" ? "Your payment for meal plan confirmed" : "Your grocery payment is confirmed",
        `Hi ${S.user.name}, your payment of ${money(d.kind === "plan" ? d.price : d.total)} has been confirmed.`,
        "#/orders/" + o.id,
      );
      S.draft = null;
      save();
      go("#/success?id=" + o.id);
    },
    checkout(f) {
      if (!f.address.value.trim()) return err(f, "Enter a delivery address.");
      S.draft = {
        kind: "grocery",
        items: Object.entries(S.cart),
        total: cartTotal(),
        address: f.address.value.trim(),
        slot: f.slot.value,
        weekly: f.weekly.checked,
      };
      save();
      go("#/pay");
    },
    member(f) {
      if (!f.name.value.trim()) return err(f, "Enter a name.");
      if (!(+f.age.value >= 0) || f.age.value === "") return err(f, "Enter an age.");
      const rel = f.querySelector("[name=rel]:checked").value;
      S.members.push({
        id: uid("m"),
        name: f.name.value.trim(),
        rel,
        age: +f.age.value,
        sex: f.sex.value,
        allergies: vals(f, "al"),
        conditions: f.cond.value.trim() ? [f.cond.value.trim()] : [],
      });
      save();
      render();
      toast("Family member added");
    },
    rec(f) {
      if (!f.name.value.trim()) return err(f, "Enter a name for the record.");
      S.records.unshift({
        id: uid("h"),
        type: f.type.value,
        name: f.name.value.trim(),
        member: f.member.value,
        date: now(),
        sev: f.sev.value,
        by: f.by.value.trim() || "Self-reported",
      });
      if (f.type.value === "Allergy") {
        const m = S.members.find((x) => x.id === f.member.value);
        const match = ALLERGENS.find((a) => f.name.value.toLowerCase().includes(a.toLowerCase().replace(/s$/, "")));
        if (m && match && !m.allergies.includes(match)) m.allergies.push(match);
      }
      save();
      closeModal();
      render();
      toast("Record added");
    },
    profile(f) {
      Object.assign(S.user, {
        name: f.name.value,
        address: f.address.value,
        occupation: f.occupation.value,
        phone: f.phone.value,
        marital: f.marital.value,
      });
      Object.assign(S.members[0], { name: f.name.value, sex: f.sex.value, age: +f.age.value });
      save();
      render();
      toast("Profile updated");
    },
    healthst(f) {
      Object.assign(S.user, {
        height: +f.height.value,
        weight: +f.weight.value,
        goal: f.goal.value,
        goalNote: f.goalNote.value,
      });
      S.members[0].allergies = vals(f, "al");
      save();
      render();
      toast("Health status saved");
    },
    comm(f) {
      if (f.name.value.trim().length < 3) return err(f, "Give your community a name.");
      if (!f.desc.value.trim()) return err(f, "Describe what the community is about.");
      const c = {
        id: uid("c"),
        name: f.name.value.trim(),
        cat: f.cat.value,
        desc: f.desc.value.trim(),
        members: 1,
        pub: f.querySelector("[name=pub]:checked").value === "1",
        joined: true,
        perms: f.querySelector("[name=perms]:checked").value === "anyone" ? "anyone" : "anyone",
        last: "Community created",
        lastAt: now(),
        by: S.user.name,
      };
      S.communities.unshift(c);
      save();
      toast("Community created");
      go("#/community/" + c.id);
    },
    post(f) {
      if (!f.title.value.trim() || !f.body.value.trim()) return err(f, "Add a topic and your post.");
      S.posts.unshift({
        id: uid("p"),
        c: f.dataset.c,
        by: S.user.name,
        at: now(),
        title: f.title.value.trim(),
        body: f.body.value.trim(),
        likes: 0,
        liked: false,
        replies: [],
      });
      const c = S.communities.find((x) => x.id === f.dataset.c);
      c.last = f.title.value.trim();
      c.lastAt = now();
      save();
      render();
      toast("Posted");
    },
    reply(f) {
      if (!f.body.value.trim()) return err(f, "Write your comment.");
      const p = S.posts.find((x) => x.id === f.dataset.p);
      const spec = f.dataset.as === "1";
      const r = {
        id: uid("r"),
        by: spec ? EMP.health.who : S.user.name,
        role: spec ? "Health specialist" : "",
        at: now(),
        body: f.body.value.trim(),
        replies: [],
      };
      const find = (rs) => {
        for (const x of rs) {
          if (x.id === f.dataset.r) return x;
          const y = find(x.replies);
          if (y) return y;
        }
        return null;
      };
      (f.dataset.r ? find(p.replies).replies : p.replies).push(r);
      if (spec) S.emp.tasks++;
      save();
      closeModal();
      render();
      toast("Reply posted");
    },
    review(f) {
      order(f.dataset.id).review = { stars: +f.stars.value, note: f.note.value.trim() };
      save();
      closeModal();
      render();
      toast("Thanks for your review");
    },
    salary(f) {
      if (!/^\d{10}$/.test(f.acct.value)) return err(f, "Account numbers have 10 digits.");
      S.emp.bank = { bank: f.bank.value, acct: f.acct.value, name: f.name.value.trim() };
      save();
      render();
      toast("Salary details saved");
    },
    complaint(f) {
      if (!f.body.value.trim()) return err(f, "Add some details.");
      S.emp.complaints.unshift({
        type: f.type.value,
        body: f.body.value.trim(),
        by: EMP[S.emp.type].who,
        at: now(),
        status: "OPEN",
      });
      save();
      render();
      toast("Complaint logged");
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
    if (!MYROLES.length) {
      await RH.guard("greenfed", ["customer", "employee"]); // explains pending / not added yet
      return;
    }
    loadFor(ACCOUNT);
    S.user.name = ACCOUNT.full_name;
    S.user.email = ACCOUNT.email;
    if (ACCOUNT.phone) S.user.phone = ACCOUNT.phone;
    S.members[0].name = ACCOUNT.full_name;
    const emp = ACCOUNT.memberships.find(
      (m) => m.product === "greenfed" && m.role === "employee" && m.status === "approved",
    );
    if (emp && EMPMAP[emp.details.employee_type]) {
      S.emp.type = EMPMAP[emp.details.employee_type];
      EMP[S.emp.type].who = ACCOUNT.full_name;
    }
    const keep = S.session && MYROLES.includes(S.session.role) ? S.session.role : MYROLES[0];
    S.session = { role: keep };
    save();
    if (S.prefs.dark) document.body.classList.add("dark");
    let after = null;
    try {
      after = sessionStorage.getItem("gf-after");
      sessionStorage.removeItem("gf-after");
    } catch (e) {}
    if (FRESH && keep === "user") return go("#/setup");
    if (after && !/^#\/(welcome|start|login|signup|setup)/.test(after)) return go(after);
    render();
  }
  boot();
})();
