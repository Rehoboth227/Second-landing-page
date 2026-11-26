/* AiRise app: shared data, navigation drawer, learner dashboard and course player.
   Progress is saved in this browser only (localStorage); there is no server yet. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- data
  // The nine courses of the AiRise Employability Skills Series (Programme Overview),
  // plus The Hack, the partner course from Rheti (Rehohub Training Institute).
  const COURSES = [
    {
      n: 1,
      slug: "adaptability",
      title: "Adaptability",
      phase: 1,
      hours: 13,
      model: "SHIFT",
      steps: ["Sense the change", "Hold your reaction", "Investigate", "Fix a plan", "Track and tweak"],
      ask: "How do I cope when things change?",
      able: "Respond to change with a clear method, recover from setbacks and keep learning.",
    },
    {
      n: 2,
      slug: "initiative-and-proactivity",
      title: "Initiative and Proactivity",
      phase: 1,
      hours: 16,
      model: "SPARK",
      steps: [
        "Spot the need",
        "Probe the facts and your authority",
        "Act on a safe first step",
        "Report early",
        "Keep going",
      ],
      ask: "What do I do when nobody tells me what to do?",
      able: "Notice needs and act on them safely, within boundaries, and report early.",
    },
    {
      n: 3,
      slug: "communication-skills",
      title: "Communication Skills",
      phase: 1,
      hours: 20,
      model: "CLEAR",
      steps: ["Context", "Lead with the main point", "Essential details", "Ask", "Read-back"],
      ask: "How do I make sure I am understood?",
      able: "Speak, write, listen and give feedback clearly, and handle difficult conversations.",
    },
    {
      n: 4,
      slug: "problem-solving",
      title: "Problem-Solving",
      phase: 2,
      hours: 19,
      model: "SOLVE",
      steps: ["Spot and define", "Originate the causes", "List options", "Verify and choose", "Execute and evaluate"],
      ask: "How do I find and fix the real problem?",
      able: "Define problems, find root causes, choose and implement solutions, and measure results.",
    },
    {
      n: 5,
      slug: "work-ethics-and-reliability",
      title: "Work Ethics and Reliability",
      phase: 2,
      hours: 21,
      model: "KEEP",
      steps: ["Know what was promised", "Estimate honestly", "Execute and track", "Proactively update and close"],
      ask: "Can people count on me?",
      able: "Keep commitments, act with integrity, own mistakes and earn trust.",
    },
    {
      n: 6,
      slug: "teamwork-and-collaboration",
      title: "Teamwork and Collaboration",
      phase: 2,
      hours: 22,
      model: "BUILD",
      steps: ["Bond", "Unite around goals and roles", "Interact", "Lead and decide together", "Develop"],
      ask: "How do we achieve more together?",
      able: "Build trust, share leadership, decide together and resolve conflict.",
    },
    {
      n: 7,
      slug: "continuous-learning",
      title: "Continuous Learning",
      phase: 3,
      hours: 20,
      model: "LEARN",
      steps: [
        "Locate the gap",
        "Establish goals and a plan",
        "Actively practise",
        "Reflect and get feedback",
        "Nurture the habit",
      ],
      ask: "How do I keep growing?",
      able: "Find skill gaps, plan and practise effectively, and learn from feedback.",
    },
    {
      n: 8,
      slug: "networking-and-interpersonal-skills",
      title: "Networking and Interpersonal Skills",
      phase: 3,
      hours: 21,
      model: "BRIDGE",
      steps: ["Brand", "Reach out", "Interact well", "Deepen", "Go beyond barriers", "Evaluate and sustain"],
      ask: "Who will I grow with, and who will help me?",
      able: "Build honest, lasting professional relationships, online and in person.",
    },
    {
      n: 9,
      slug: "self-awareness",
      title: "Self-Awareness",
      phase: 3,
      hours: 21,
      model: "SELF",
      steps: ["See yourself clearly", "Engage your emotions", "Learn from others' views", "Follow through"],
      ask: "Who am I, and how do I come across?",
      able: "Know your values, strengths, emotions and blind spots, and act on them.",
    },
    {
      n: 10,
      slug: "the-hack",
      title: "The Hack: 10 Days to Build a Business That Lasts",
      phase: 0,
      hours: 10,
      model: "HACK",
      partner: "Rheti",
      steps: ["Idea", "Plan", "Build", "Grow"],
      ask: "Do I actually have a business, or just an idea?",
      able: "Test an idea, plan the customer and money, build it in the right order and grow it to last.",
    },
  ];
  const PHASES = { 0: "Partner course · Rheti", 1: "Phase 1 · Respond", 2: "Phase 2 · Deliver", 3: "Phase 3 · Grow" };
  const INSTRUCTOR = "Joshua D. Obebe";

  // Lessons are built from each course's own structure: the self-assessment, one lesson per
  // letter of its model, then practice, the 90-day plan and the course quiz.
  function lessonsFor(c) {
    const per = Math.min(55, Math.max(20, Math.round((c.hours * 60 * 0.25) / c.steps.length / 5) * 5));
    const out = [
      {
        t: c.n === 10 ? "Before you build: register, spend, build, print?" : "Self-assessment: 12 statements",
        kind: "practice",
        min: 20,
      },
    ];
    c.steps.forEach((s, i) =>
      out.push({
        t: `${c.model === "HACK" ? "Stage" : c.model[i] || "Step"} ${c.model === "HACK" ? i + 1 : ""}: ${s}`.replace(
          /\s+:/,
          ":",
        ),
        kind: "video",
        min: per,
        step: i,
      }),
    );
    out.push({
      t: c.n === 10 ? "Join the Business Builder List" : "Practice: apply the model to a real situation",
      kind: "practice",
      min: 45,
    });
    out.push({ t: c.n === 10 ? "Your 10-day build plan" : "Your 90-day action plan", kind: "practice", min: 30 });
    if (c.n !== 10) out.push({ t: "Course quiz: Section A and B (14/20 to pass)", kind: "quiz", min: 30 });
    return out;
  }

  // Sample learner. Courses 1 to 6 done, Continuous Learning in progress.
  const SEED = { done: { "continuous-learning": [0, 1, 2] } };
  COURSES.slice(0, 6).forEach((c) => (SEED.done[c.slug] = lessonsFor(c).map((_, i) => i)));
  const KEY = "airise-learner-v1";
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.done) return s;
    } catch (e) {}
    return JSON.parse(JSON.stringify(SEED));
  };
  const save = (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
  };
  const state = load();
  const doneCount = (c) => (state.done[c.slug] || []).length;
  const pct = (c) => Math.round((doneCount(c) / lessonsFor(c).length) * 100);

  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
    );
  const ic = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const thumbClass = (c) =>
    c.phase === 0 ? "thumb--rheti" : c.phase === 2 ? "thumb--p2" : c.phase === 3 ? "thumb--p3" : "";
  const $ = (s, r = document) => r.querySelector(s);

  // ---------------------------------------------------------------- shell
  const toggle = $(".menu-btn");
  const scrim = $(".scrim");
  const setNav = (open) => {
    document.body.classList.toggle("nav-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
  };
  if (toggle) toggle.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  if (scrim) scrim.addEventListener("click", () => setNav(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setNav(false));

  // Toggle buttons such as Follow and the heart on course cards
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-toggle]");
    if (!b) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    if (b.dataset.on) b.textContent = on ? b.dataset.on : b.dataset.off;
  });

  window.AiRise = { COURSES, PHASES, INSTRUCTOR, lessonsFor, esc, ic, thumbClass };

  // ---------------------------------------------------------------- dashboard
  const page = document.body.dataset.page;
  if (page === "dashboard") {
    const series = COURSES.slice(0, 9);
    const finished = series.filter((c) => pct(c) === 100);
    const totalHours = series.reduce((a, c) => a + c.hours, 0);
    const doneHours = series.reduce((a, c) => a + (c.hours * pct(c)) / 100, 0);
    const current = series.find((c) => pct(c) < 100) || series[8];
    const overall = Math.round((doneHours / totalHours) * 100);

    // Greeting
    const h = new Date().getHours();
    const g = $("[data-greet]");
    if (g)
      g.textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${document.body.dataset.firstName || "there"}`;

    // Banner
    $("[data-banner-title]").textContent = `Continue ${current.title}: “${current.ask}”`;
    $("[data-banner-link]").href = `learn.html?course=${current.slug}`;

    // Stat cards (pattern: "2/8 Watched · Product Design")
    const stats = [
      ["award", `${finished.length}/9 courses`, "Completed"],
      ["clock", `${Math.round(doneHours)}/${totalHours} hrs`, "Study time"],
      ["check", "17.5/20", "Quiz average"],
      ["star", `${finished.length} earned`, "Certificates"],
    ];
    $("[data-stats]").innerHTML = stats
      .map(
        ([i, b, s]) =>
          `<div class="stat card"><span class="stat__ico">${ic(i)}</span><div><small>${s}</small><b>${b}</b></div></div>`,
      )
      .join("");

    // Continue learning: in-progress first, then the next courses, then the partner course
    const order = [
      ...series.filter((c) => pct(c) > 0 && pct(c) < 100),
      ...series.filter((c) => pct(c) === 0),
      COURSES[9],
      ...finished.slice(-2),
    ];
    $("[data-continue]").innerHTML = order
      .map((c) => {
        const p = pct(c);
        const by = c.partner ? ["RT", "Rheti", "Rehohub Training Institute"] : ["JO", INSTRUCTOR, "AiRise instructor"];
        return `<a class="ccard card" href="learn.html?course=${c.slug}">
          <div class="thumb ${thumbClass(c)}"><span class="thumb__n">${c.partner ? "Partner" : "Course " + c.n}</span><span class="thumb__model">${c.model}</span>
            <button class="thumb__heart" type="button" data-toggle aria-pressed="false" aria-label="Save ${esc(c.title)}" onclick="event.preventDefault()">${ic("heart")}</button></div>
          <span class="pill ${c.partner ? "pill--navy" : ""}" style="align-self:flex-start">${PHASES[c.phase]}</span>
          <h3>${esc(c.title)}</h3>
          <div class="ccard__meta"><span>${p === 100 ? "Completed" : p === 0 ? "Not started" : p + "% complete"}</span><span>${doneCount(c)}/${lessonsFor(c).length} lessons</span></div>
          <div class="bar"><i style="width:${p}%"></i></div>
          <div class="who"><span class="avatar ${c.partner ? "avatar--gold" : ""}">${by[0]}</span><div><b>${by[1]}</b>${by[2]}</div></div>
        </a>`;
      })
      .join("");

    // Scroll arrows
    document.querySelectorAll("[data-scroll]").forEach((b) =>
      b.addEventListener("click", () => {
        const row = $(b.dataset.target);
        row.scrollBy({ left: (b.dataset.scroll === "next" ? 1 : -1) * row.clientWidth * 0.8, behavior: "smooth" });
      }),
    );

    // Ask yourself
    $("[data-ask]").innerHTML = `<b>${esc(current.ask)}</b> ${esc(current.able)}`;

    // Certificates
    $("[data-certs]").innerHTML =
      finished
        .map(
          (c) =>
            `<div class="cert card"><span class="cert__seal">${ic("award")}</span><div><b>${esc(c.title)}</b><small>AIR-C${c.n}-2026-${String(40 + c.n * 7).padStart(3, "0")}</small></div></div>`,
        )
        .join("") ||
      `<div class="empty card"><b>No certificates yet</b>Pass a course quiz to earn your first one.</div>`;

    // Progress ring
    const ring = $("[data-ring]");
    if (ring) {
      const r = 50,
        len = 2 * Math.PI * r;
      const v = ring.querySelector(".val");
      v.style.strokeDasharray = len;
      v.style.strokeDashoffset = len;
      requestAnimationFrame(() => setTimeout(() => (v.style.strokeDashoffset = len * (1 - overall / 100)), 60));
      $("[data-ring-pct]").textContent = overall + "%";
    }

    // Course search filters the continue-learning row
    const q = $("#search");
    if (q)
      q.addEventListener("input", () => {
        const v = q.value.trim().toLowerCase();
        document
          .querySelectorAll("[data-continue] .ccard")
          .forEach((a) => (a.hidden = v && !a.textContent.toLowerCase().includes(v)));
      });
  }

  // ---------------------------------------------------------------- course player
  if (page === "learn") {
    const params = new URLSearchParams(location.search);
    const c = COURSES.find((x) => x.slug === params.get("course")) || COURSES[6];
    const lessons = lessonsFor(c);
    if (!state.done[c.slug]) state.done[c.slug] = [];
    const done = new Set(state.done[c.slug]);
    let cur = params.has("lesson") ? Number(params.get("lesson")) : -1;
    if (!(cur >= 0 && cur < lessons.length)) cur = lessons.findIndex((_, i) => !done.has(i));
    if (cur < 0) cur = 0;

    document.title = `${c.title} | AiRise Learn`;
    $("[data-c-title]").textContent = c.title;
    $("[data-c-sub]").textContent =
      `${PHASES[c.phase]} · Model: ${c.model === "HACK" ? "Idea, Plan, Build, Grow" : c.model}`;
    $("[data-c-hours]").textContent = `About ${c.hours} ${c.n === 10 ? "days" : "hours"}`;
    $("[data-curr-title]").textContent = c.title;

    const list = $("[data-lessons]");
    const quizList = $("[data-quizzes]");
    function renderList() {
      const row = (
        l,
        i,
      ) => `<li><button class="lesson ${l.kind === "practice" ? "lesson--practice" : l.kind === "quiz" ? "lesson--quiz" : ""} ${done.has(i) ? "is-done" : ""}" type="button" data-i="${i}" ${i === cur ? 'aria-current="true"' : ""}>
          ${ic(done.has(i) ? "check-circle" : l.kind === "quiz" ? "help" : l.kind === "practice" ? "edit" : "play-circle")}<span>${esc(l.t)}</span><em>${l.min} mins</em></button></li>`;
      list.innerHTML = lessons.map((l, i) => (l.kind === "quiz" ? "" : row(l, i))).join("");
      quizList.innerHTML =
        lessons.map((l, i) => (l.kind === "quiz" ? row(l, i) : "")).join("") ||
        `<li class="note" style="padding:0 4px">This partner course has no quiz. Finish the build plan to complete it.</li>`;
      const p = Math.round((done.size / lessons.length) * 100);
      $("[data-c-prog]").innerHTML =
        `${done.size} of ${lessons.length} lessons · ${p}%<div class="bar"><i style="width:${p}%"></i></div>`;
    }

    let timer = null;
    function renderLesson() {
      clearInterval(timer);
      const l = lessons[cur];
      const letters = c.model === "HACK" ? c.steps.map((s) => s[0]) : c.model.split("");
      $("[data-stage]").innerHTML = `
        <div>
          <div class="stage__letters" aria-hidden="true">${letters.map((ch, i) => `<b class="${l.step === i ? "on" : ""}">${ch}</b>`).join("")}</div>
          <p class="stage__title">${esc(l.t)}</p>
          <button class="stage__play" type="button" aria-label="Play lesson" data-play>${ic("play")}</button>
        </div>
        <div class="stage__bar"><span data-time>0:00</span><div class="bar"><i data-fill></i></div><span>${l.min}:00</span></div>`;
      $("[data-l-kind]").textContent = l.kind === "quiz" ? "Assessment" : l.kind === "practice" ? "Practice" : "Lesson";
      $("[data-l-title]").textContent = l.t;
      const stepText =
        l.step !== undefined
          ? `This lesson covers <b>${esc(c.steps[l.step])}</b>, step ${l.step + 1} of ${c.steps.length} in ${c.model === "HACK" ? "The Hack" : c.model}. Watch the lesson, try the practice activity with your accountability partner, then answer the four check questions.`
          : l.kind === "quiz"
            ? "Section A has 10 multiple-choice questions (10 minutes, closed book). Section B asks you to apply the model to a realistic scenario (20 minutes). You need 14 out of 20 to pass; 18 or more is a distinction."
            : "Work through this activity on a real situation from your work or study. Keep notes in your journal; you'll use them in your portfolio.";
      $("[data-l-body]").innerHTML = stepText;
      const btn = $("[data-complete]");
      btn.innerHTML = done.has(cur) ? `${ic("check")} Completed` : `${ic("check")} Mark as complete`;
      btn.classList.toggle("btn--gold", !done.has(cur));
      $("[data-prev]").disabled = cur === 0;
      $("[data-next]").disabled = cur === lessons.length - 1;
      renderList();

      // Simulated playback (no video files are attached to the course yet)
      $("[data-play]").addEventListener("click", (e) => {
        const b = e.currentTarget;
        const fill = $("[data-fill]"),
          t = $("[data-time]");
        if (timer) {
          clearInterval(timer);
          timer = null;
          b.innerHTML = ic("play");
          return;
        }
        b.innerHTML = ic("pause");
        let s = 0;
        const total = l.min * 60;
        timer = setInterval(() => {
          s = Math.min(total, s + total / 40);
          fill.style.width = (s / total) * 100 + "%";
          t.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
          if (s >= total) {
            clearInterval(timer);
            timer = null;
            b.innerHTML = ic("check");
          }
        }, 120);
      });
    }

    const go = (i) => {
      cur = i;
      history.replaceState(null, "", `?course=${c.slug}&lesson=${i}`);
      renderLesson();
      $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".lesson[data-i]");
      if (b) go(Number(b.dataset.i));
    });
    $("[data-prev]").addEventListener("click", () => cur > 0 && go(cur - 1));
    $("[data-next]").addEventListener("click", () => cur < lessons.length - 1 && go(cur + 1));
    $("[data-complete]").addEventListener("click", () => {
      done.has(cur) ? done.delete(cur) : done.add(cur);
      state.done[c.slug] = [...done].sort((a, b) => a - b);
      save(state);
      renderLesson();
    });

    // About the course
    $("[data-c-ask]").textContent = `“${c.ask}”`;
    $("[data-c-able]").textContent = c.able;
    $("[data-c-steps]").innerHTML = c.steps
      .map(
        (s, i) =>
          `<li>${ic("check")}<span><b>${c.model === "HACK" ? s : c.model[i]}</b>${c.model === "HACK" ? "" : " · " + esc(s)}</span></li>`,
      )
      .join("");
    $("[data-c-by]").innerHTML = c.partner
      ? `<span class="avatar avatar--gold">RT</span><div><b>Rheti</b><small>Rehohub Training Institute · partner course</small></div>`
      : `<span class="avatar">JO</span><div><b>${INSTRUCTOR}</b><small>Instructor, AiRise Employability Skills Training</small></div>`;

    // Related courses
    const rel = [
      ...COURSES.filter((x) => x.slug !== c.slug && (x.phase === c.phase || x.n === c.n + 1)),
      ...COURSES.filter((x) => x.slug !== c.slug && x.phase !== c.phase && x.n !== c.n + 1),
    ].slice(0, 3);
    $("[data-related]").innerHTML = rel
      .map(
        (x) =>
          `<a class="ccard card" href="learn.html?course=${x.slug}"><div class="thumb ${thumbClass(x)}"><span class="thumb__model">${x.model}</span></div><span class="pill" style="align-self:flex-start">${PHASES[x.phase]}</span><h3>${esc(x.title)}</h3><div class="ccard__meta"><span>About ${x.hours} ${x.n === 10 ? "days" : "hours"}</span><span>${pct(x)}%</span></div></a>`,
      )
      .join("");

    // Mobile: collapsible curriculum
    const ct = $(".curr__toggle");
    if (ct)
      ct.addEventListener("click", () => {
        const lst = $(".curr__list");
        const open = lst.classList.toggle("is-collapsed") === false;
        ct.setAttribute("aria-expanded", String(open));
      });

    renderLesson();
  }
})();
