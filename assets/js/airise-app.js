/* AiRise app: shared data, navigation drawer, learner dashboard and course player.
   Progress, certificates, quiz marks and trainer courses come from the server (api/lib/airise.php). */
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

  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
    );
  const ic = (n) => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const thumbClass = (c) =>
    c.phase === 0 ? "thumb--rheti" : c.phase === 2 ? "thumb--p2" : c.phase === 3 ? "thumb--p3" : "";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const initials = (n) =>
    String(n || "")
      .split(/\s+/)
      .map((w) => w[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

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

  // ---------------------------------------------------------------- server data
  // Progress, certificates, quiz results and published trainer courses come from the server
  // (api/lib/airise.php). Nothing about a learner is kept in this browser.
  const api = (path, body) => RH.call(path, body === undefined ? {} : { method: "POST", body });
  const ST = { done: {}, certs: [], quizzes: [], week: [], catalog: [] };
  const lessonCount = (c) => (c.trainer ? c.lessonCount : lessonsFor(c).length);
  const doneCount = (c) => (ST.done[c.key || c.slug] || []).length;
  const pct = (c) => Math.min(100, Math.round((doneCount(c) / Math.max(1, lessonCount(c))) * 100));
  const trainerCard = (x) => ({ ...x, key: x.id, slug: x.id, trainer: x.trainer, phase: -1 });
  const toast = (msg) => {
    let t = $(".ar-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "ar-toast";
      t.setAttribute("role", "status");
      t.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:50;background:#0b1b36;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600;box-shadow:0 12px 30px rgba(0,0,0,.25);max-width:calc(100% - 32px)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), 4200);
  };
  async function loadState() {
    Object.assign(ST, await api("airise/state"));
  }
  const fail = (e) => {
    const m = $("#main");
    if (m && e && e.code !== "not_signed_in")
      m.insertAdjacentHTML(
        "afterbegin",
        `<div class="note" style="margin:16px 0">${esc(e.message || "Could not load AiRise.")}</div>`,
      );
  };

  // ---------------------------------------------------------------- dashboard
  const page = document.body.dataset.page;
  if (page === "dashboard") loadState().then(dashboard, fail);
  function dashboard() {
    const series = COURSES.slice(0, 9);
    const finished = series.filter((c) => pct(c) === 100);
    const totalHours = series.reduce((a, c) => a + c.hours, 0);
    const doneHours = series.reduce((a, c) => a + (c.hours * pct(c)) / 100, 0);
    const current = series.find((c) => pct(c) > 0 && pct(c) < 100) || series.find((c) => pct(c) < 100) || series[8];
    const overall = Math.round((doneHours / totalHours) * 100);
    const extra = ST.catalog.map(trainerCard);

    const h = new Date().getHours();
    const g = $("[data-greet]");
    if (g)
      g.textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${document.body.dataset.firstName || "there"}`;

    $("[data-banner-title]").textContent = `${pct(current) ? "Continue" : "Start"} ${current.title}: “${current.ask}”`;
    $("[data-banner-link]").href = `learn.html?course=${current.slug}`;

    // Quiz average: best score on each graded quiz.
    const best = {};
    ST.quizzes.forEach((q) => (best[q.course] = Math.max(best[q.course] || 0, q.score / q.total)));
    const scores = Object.values(best);
    const lessonsDone = Object.values(ST.done).reduce((a, l) => a + l.length, 0);
    const stats = [
      ["award", `${finished.length}/9 courses`, "Completed"],
      ["clock", `${Math.round(doneHours)}/${totalHours} hrs`, "Study time"],
      [
        "check",
        scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) + "%" : "None yet",
        "Quiz average",
      ],
      ["star", `${ST.certs.length} earned`, "Certificates"],
    ];
    $("[data-stats]").innerHTML = stats
      .map(
        ([i, b, s]) =>
          `<div class="stat card"><span class="stat__ico">${ic(i)}</span><div><small>${s}</small><b>${b}</b></div></div>`,
      )
      .join("");

    const order = [
      ...series.filter((c) => pct(c) > 0 && pct(c) < 100),
      ...extra.filter((c) => pct(c) > 0 && pct(c) < 100),
      ...series.filter((c) => pct(c) === 0),
      COURSES[9],
      ...extra.filter((c) => pct(c) === 0),
      ...series.filter((c) => pct(c) === 100),
      ...extra.filter((c) => pct(c) === 100),
    ];
    $("[data-continue]").innerHTML = order
      .map((c) => {
        const p = pct(c);
        const by = c.trainer
          ? [initials(c.trainer), c.trainer, "AiRise trainer"]
          : c.partner
            ? ["RT", "Rheti", "Rehohub Training Institute"]
            : ["JO", INSTRUCTOR, "AiRise instructor"];
        const tag = c.trainer ? esc(c.track || "Trainer course") : PHASES[c.phase];
        return `<a class="ccard card" href="learn.html?course=${esc(c.slug)}">
          <div class="thumb ${c.trainer ? "thumb--p3" : thumbClass(c)}"${c.trainer && c.cover ? ` style="background-image:url('${RH.url("api/airise/file?id=" + c.cover.id)}');background-size:cover;background-position:center"` : ""}><span class="thumb__n">${c.trainer ? "New" : c.partner ? "Partner" : "Course " + c.n}</span>${c.trainer ? "" : `<span class="thumb__model">${c.model}</span>`}</div>
          <span class="pill ${c.partner ? "pill--navy" : ""}" style="align-self:flex-start">${tag}</span>
          <h3>${esc(c.title)}</h3>
          <div class="ccard__meta"><span>${p === 100 ? "Completed" : p === 0 ? "Not started" : p + "% complete"}</span><span>${doneCount(c)}/${lessonCount(c)} lessons</span></div>
          <div class="bar"><i style="width:${p}%"></i></div>
          <div class="who"><span class="avatar ${c.partner ? "avatar--gold" : c.trainer ? "avatar--blue" : ""}">${esc(by[0])}</span><div><b>${esc(by[1])}</b>${by[2]}</div></div>
        </a>`;
      })
      .join("");

    document.querySelectorAll("[data-scroll]").forEach((b) =>
      b.addEventListener("click", () => {
        const row = $(b.dataset.target);
        row.scrollBy({ left: (b.dataset.scroll === "next" ? 1 : -1) * row.clientWidth * 0.8, behavior: "smooth" });
      }),
    );

    $("[data-ask]").innerHTML = `<b>${esc(current.ask)}</b> ${esc(current.able)}`;

    // Next up: the next unfinished lessons in the courses you have started (or the first course).
    const started = [...series, COURSES[9]].filter((c) => pct(c) > 0 && pct(c) < 100);
    const next = [];
    (started.length ? started : [current]).forEach((c) => {
      const done = new Set(ST.done[c.slug] || []);
      lessonsFor(c).forEach((l, i) => !done.has(i) && next.length < 4 && next.push([c, l, i]));
    });
    const up = $("[data-upcoming]");
    if (up)
      up.innerHTML =
        next
          .map(
            ([c, l, i]) =>
              `<tr><td><div class="who"><span class="avatar ${c.partner ? "avatar--gold" : ""}">${c.partner ? "RT" : "C" + c.n}</span><div><b>${esc(c.title)}</b><small>${c.partner ? "Partner course" : "Course " + c.n}</small></div></div></td><td><span class="pill ${l.kind === "quiz" ? "pill--rose" : l.kind === "practice" ? "" : "pill--navy"}">${l.kind === "quiz" ? "Quiz" : l.kind === "practice" ? "Practice" : "Lesson"}</span></td><td>${esc(l.t)}</td><td>${l.min} mins</td><td><a class="btn btn--ghost btn--sm" href="learn.html?course=${c.slug}&lesson=${i}">Start</a></td></tr>`,
          )
          .join("") || `<tr><td colspan="5">You've finished every lesson. Well done.</td></tr>`;

    $("[data-certs]").innerHTML =
      ST.certs
        .map(
          (c) =>
            `<div class="cert card"><span class="cert__seal">${ic("award")}</span><div><b>${esc(c.title)}</b><small>${esc(c.number)}</small></div></div>`,
        )
        .join("") ||
      `<div class="empty card"><b>No certificates yet</b>Finish every lesson of a course to earn one.</div>`;

    // Talent ranking from the portfolio (server), and courses suggested from it.
    const rk = ST.rank;
    if (rk && $("[data-rank-pos]")) {
      $("[data-rank-label]").textContent = rk.label ? "Talent ranking · " + rk.label : "Talent ranking";
      $("[data-rank-pos]").textContent = rk.position ? `#${rk.position} of ${rk.of}` : "Choose a career path";
      $("[data-rank-score]").textContent = Math.round(rk.score);
      $("[data-rank-score]").title = "Portfolio score out of 100";
    }
    const sg = $("[data-suggest]");
    if (sg)
      sg.innerHTML =
        (ST.suggest || [])
          .map((x) => {
            const c =
              COURSES.find((y) => y.slug === x.course) || ST.catalog.map(trainerCard).find((y) => y.slug === x.course);
            if (!c) return "";
            const p = pct(c);
            return `<a class="ccard card" href="learn.html?course=${esc(c.slug)}">
          <div class="thumb ${c.trainer ? "thumb--p3" : thumbClass(c)}"><span class="thumb__n">${c.trainer ? "Trainer course" : c.partner ? "Partner" : "Course " + c.n}</span>${c.trainer ? "" : `<span class="thumb__model">${c.model}</span>`}</div>
          <span class="pill pill--green" style="align-self:flex-start">${esc(x.why)}</span>
          <h3>${esc(c.title)}</h3>
          <div class="ccard__meta"><span>${p ? p + "% complete" : "Not started"}</span><span>${lessonCount(c)} lessons</span></div>
        </a>`;
          })
          .join("") ||
        `<div class="empty card"><b>Nothing to suggest yet</b><a href="portfolio.html">Add your career path</a> to get suggestions.</div>`;
    void lessonsDone;

    // Study chart: minutes finished on each of the last 7 days.
    const chart = $("[data-chart]");
    if (chart) {
      const days = [...Array(7)].map((_, i) => {
        const d = new Date(Date.now() - (6 - i) * 864e5);
        return {
          key: d.toISOString().slice(0, 10),
          name: d.toLocaleDateString("en-GB", { weekday: "short" }),
          quiz: 0,
          practice: 0,
          video: 0,
        };
      });
      ST.week.forEach((w) => {
        const d = days.find((x) => x.key === w.day);
        if (d) d[w.kind] = (d[w.kind] || 0) + w.min;
      });
      const tot = (d) => d.quiz + d.practice + d.video;
      const max = Math.max(60, ...days.map(tot));
      chart.innerHTML = days
        .map(
          (d) =>
            `<li title="${tot(d)} minutes"><div class="col" style="height:${Math.round((tot(d) / max) * 100)}%"><i style="flex:${d.quiz}"></i><i style="flex:${d.practice}"></i><i style="flex:${d.video}"></i></div><small>${d.name}</small></li>`,
        )
        .join("");
      const sum = days.reduce((a, d) => a + tot(d), 0);
      $("[data-chart-sum]").textContent = `Last 7 days · ${Math.round((sum / 60) * 10) / 10} h`;
    }

    // Mentors: the programme instructor, Rheti, and the trainers of published courses.
    const mentors = $("[data-mentors]");
    if (mentors) {
      const seen = new Set();
      const tr = ST.catalog.filter((c) => !seen.has(c.trainerId) && seen.add(c.trainerId));
      mentors.innerHTML =
        `<li><span class="avatar">JO</span><div><b>${INSTRUCTOR}</b><small>Instructor, AiRise</small></div></li><li><span class="avatar avatar--gold">RT</span><div><b>Rheti trainers</b><small>Entrepreneurship · The Hack</small></div></li>` +
        tr
          .map(
            (c) =>
              `<li><span class="avatar avatar--blue">${esc(initials(c.trainer))}</span><div><b>${esc(c.trainer)}</b><small><a href="learn.html?course=${esc(c.id)}">${esc(c.title)}</a></small></div></li>`,
          )
          .join("");
    }

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
    const key = params.get("course") || "";
    const isT = /^t\d+$/.test(key);
    Promise.all([loadState(), isT ? api("airise/course?id=" + key) : null]).then(
      ([, r]) => player(isT ? fromTrainer(r.course) : COURSES.find((x) => x.slug === key) || COURSES[0]),
      fail,
    );
  }
  // A trainer course in the same shape as a series course.
  function fromTrainer(t) {
    return {
      ...t,
      key: t.id,
      slug: t.id,
      phase: -1,
      model: "",
      steps: [...new Set(t.lessons.map((l) => l.module).filter(Boolean))],
      ask: t.summary,
      able: t.outcomes || t.summary,
      lessonList: t.lessons,
    };
  }
  function player(c) {
    const params = new URLSearchParams(location.search);
    const T = !!c.trainer;
    const lessons = T ? c.lessonList : lessonsFor(c);
    const done = new Set(ST.done[c.slug] || []);
    let cur = params.has("lesson") ? Number(params.get("lesson")) : -1;
    if (!(cur >= 0 && cur < lessons.length)) cur = lessons.findIndex((_, i) => !done.has(i));
    if (cur < 0) cur = 0;

    document.title = `${c.title} | AiRise Learn`;
    $("[data-c-title]").textContent = c.title;
    $("[data-c-sub]").textContent = T
      ? `${c.track || "Course"} · ${c.level || ""} · by ${c.trainer}${c.status && c.status !== "published" ? " · preview (not published)" : ""}`
      : `${PHASES[c.phase]} · Model: ${c.model === "HACK" ? "Idea, Plan, Build, Grow" : c.model}`;
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
        `<li class="note" style="padding:0 4px">${c.n === 10 ? "This partner course has no quiz. Finish the build plan to complete it." : "This course has no quiz."}</li>`;
      const p = Math.round((done.size / lessons.length) * 100);
      $("[data-c-prog]").innerHTML =
        `${done.size} of ${lessons.length} lessons · ${p}%<div class="bar"><i style="width:${p}%"></i></div>`;
    }

    const fileUrl = (f) => RH.url("api/airise/file?id=" + f.id);
    function stageFor(l) {
      if (l.file && /^video\//.test(l.file.mime))
        return `<video controls preload="metadata" src="${esc(fileUrl(l.file))}" style="width:100%;height:100%;border-radius:inherit;background:#000"></video>`;
      if (l.file && /^audio\//.test(l.file.mime))
        return `<div><p class="stage__title">${esc(l.t)}</p><audio controls preload="metadata" src="${esc(fileUrl(l.file))}" style="width:min(420px,100%)"></audio></div>`;
      if (l.file)
        return `<div><p class="stage__title">${esc(l.t)}</p><a class="btn btn--gold" href="${esc(fileUrl(l.file))}" target="_blank" rel="noopener">${ic("file")} Open ${esc(l.file.name)}</a></div>`;
      const letters = T ? [] : c.model === "HACK" ? c.steps.map((s) => s[0]) : c.model.split("");
      return `<div>
          ${letters.length ? `<div class="stage__letters" aria-hidden="true">${letters.map((ch, i) => `<b class="${l.step === i ? "on" : ""}">${ch}</b>`).join("")}</div>` : ""}
          <p class="stage__title">${esc(l.t)}</p>
          <p style="opacity:.8;margin:6px 0 0">${l.kind === "quiz" ? "Answer the questions below." : l.kind === "practice" ? "Practice activity: work through it below, then mark it complete." : T ? "Work through this lesson, then mark it complete." : "The lesson video is being recorded. Use the notes below, then mark it complete."}</p>
        </div>`;
    }
    function quizHtml() {
      const best = ST.quizzes
        .filter((q) => q.course === c.slug)
        .sort((a, b) => b.score / b.total - a.score / a.total)[0];
      return `<form data-quiz class="stack" style="display:grid;gap:14px;margin-top:12px">${c.questions
        .map(
          (q, i) =>
            `<fieldset class="card" style="padding:14px;border:1px solid var(--line,#e5e7eb)" data-qi="${i}"><legend style="font-weight:700;padding:0 4px">Q${i + 1}. ${esc(q.text)}</legend>${q.opts
              .map((o, k) =>
                o
                  ? `<label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="radio" name="q${i}" value="${k}"> ${esc(o)}</label>`
                  : "",
              )
              .join("")}</fieldset>`,
        )
        .join(
          "",
        )}${c.scenario ? `<p><b>Scenario task:</b> ${esc(c.scenario)} <small>(discuss with your trainer; it is not marked here)</small></p>` : ""}
        <p data-quiz-out>${best ? `Your best so far: ${best.score}/${best.total}${best.passed ? " (passed)" : ""}.` : `You need ${c.pass}% to pass. You can try again.`}</p>
        <button class="btn btn--gold" style="justify-self:start">Submit answers</button></form>`;
    }

    function renderLesson() {
      const l = lessons[cur];
      $("[data-stage]").innerHTML = stageFor(l);
      $("[data-l-kind]").textContent = l.kind === "quiz" ? "Assessment" : l.kind === "practice" ? "Practice" : "Lesson";
      $("[data-l-title]").textContent = l.t;
      const stepText = T
        ? l.kind === "quiz"
          ? `Multiple choice, marked by AiRise. Pass with ${c.pass}% to finish the course and earn your certificate.`
          : `Module: <b>${esc(l.module)}</b> · ${esc(l.type)}${l.file ? " · " + esc(l.file.name) : ""}. Work through it, then mark it complete.`
        : l.step !== undefined
          ? `This lesson covers <b>${esc(c.steps[l.step])}</b>, step ${l.step + 1} of ${c.steps.length} in ${c.model === "HACK" ? "The Hack" : c.model}. Watch the lesson, try the practice activity with your accountability partner, then answer the four check questions.`
          : l.kind === "quiz"
            ? "Section A has 10 multiple-choice questions (10 minutes, closed book). Section B asks you to apply the model to a realistic scenario (20 minutes). You need 14 out of 20 to pass; 18 or more is a distinction. Sit it with your instructor, then mark it complete."
            : "Work through this activity on a real situation from your work or study. Keep notes in your journal; you'll use them in your portfolio.";
      $("[data-l-body]").innerHTML = stepText + (T && l.kind === "quiz" ? quizHtml() : "");
      const btn = $("[data-complete]");
      const quizOnly = T && l.kind === "quiz";
      btn.style.display = quizOnly ? "none" : "";
      btn.disabled = quizOnly;
      btn.innerHTML = done.has(cur) ? `${ic("check")} Completed` : `${ic("check")} Mark as complete`;
      btn.classList.toggle("btn--gold", !done.has(cur));
      $("[data-prev]").disabled = cur === 0;
      $("[data-next]").disabled = cur === lessons.length - 1;
      renderList();
    }

    const go = (i) => {
      cur = i;
      history.replaceState(null, "", `?course=${c.slug}&lesson=${i}`);
      renderLesson();
      $("#lesson").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const celebrate = (cert) =>
      cert &&
      !ST.certs.some((x) => x.number === cert) &&
      (ST.certs.push({ number: cert }), toast(`Course complete. Your certificate number is ${cert}.`));
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".lesson[data-i]");
      if (b) go(Number(b.dataset.i));
    });
    $("[data-prev]").addEventListener("click", () => cur > 0 && go(cur - 1));
    $("[data-next]").addEventListener("click", () => cur < lessons.length - 1 && go(cur + 1));
    $("[data-complete]").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const want = !done.has(cur);
      btn.disabled = true;
      try {
        const r = await api("airise/progress", { course: c.slug, lesson: cur, done: want });
        want ? done.add(cur) : done.delete(cur);
        celebrate(r.cert);
        if (want && cur < lessons.length - 1 && !done.has(cur + 1)) go(cur + 1);
        else renderLesson();
      } catch (er) {
        toast(er.message);
      }
      btn.disabled = false;
    });
    document.addEventListener("submit", async (e) => {
      const f = e.target.closest("[data-quiz]");
      if (!f) return;
      e.preventDefault();
      const answers = c.questions.map((_, i) => {
        const x = f.querySelector(`[name=q${i}]:checked`);
        return x ? Number(x.value) : -1;
      });
      if (answers.includes(-1)) return toast("Answer every question first.");
      f.querySelector("button").disabled = true;
      try {
        const r = await api("airise/quiz", { course: c.slug, answers });
        ST.quizzes.unshift({ course: c.slug, score: r.score, total: r.total, passed: r.passed });
        f.querySelectorAll("[data-mark]").forEach((x) => x.remove());
        r.right.forEach((ok, i) => {
          const fs = f.querySelector(`[data-qi="${i}"]`);
          fs.style.borderColor = ok ? "#16a34a" : "#dc2626";
          fs.insertAdjacentHTML(
            "beforeend",
            `<small data-mark style="display:block;margin-top:6px;color:${ok ? "#15803d" : "#b91c1c"}">${ok ? "Correct" : "Not quite"}</small>`,
          );
        });
        f.querySelector("[data-quiz-out]").innerHTML =
          `You scored <b>${r.score}/${r.total}</b>. ${r.passed ? "You passed." : `You need ${c.pass}% to pass. Review the lessons and try again.`}`;
        if (r.passed) {
          done.add(cur);
          celebrate(r.cert);
          renderList();
        } else f.querySelector("button").disabled = false;
      } catch (er) {
        toast(er.message);
        f.querySelector("button").disabled = false;
      }
    });

    $("[data-c-ask]").textContent = `“${c.ask}”`;
    $("[data-c-able]").textContent = c.able;
    $("[data-c-steps]").innerHTML = c.steps
      .map(
        (s, i) =>
          `<li>${ic("check")}<span><b>${T ? esc(s) : c.model === "HACK" ? s : c.model[i]}</b>${T || c.model === "HACK" ? "" : " · " + esc(s)}</span></li>`,
      )
      .join("");
    $("[data-c-by]").innerHTML = T
      ? `<span class="avatar avatar--blue">${esc(initials(c.trainer))}</span><div><b>${esc(c.trainer)}</b><small>AiRise trainer</small></div>`
      : c.partner
        ? `<span class="avatar avatar--gold">RT</span><div><b>Rheti</b><small>Rehohub Training Institute · partner course</small></div>`
        : `<span class="avatar">JO</span><div><b>${INSTRUCTOR}</b><small>Instructor, AiRise Employability Skills Training</small></div>`;
    if (T) {
      const heads = $$(".prose section h2");
      if (heads[1]) heads[1].textContent = "You'll leave able to";
      const q = $(".quote small");
      if (q) q.textContent = "About this course";
      if (heads[2]) heads[2].textContent = "Modules";
    }

    const rel = T
      ? [...ST.catalog.filter((x) => x.id !== c.slug).map(trainerCard), ...COURSES.slice(0, 9)].slice(0, 3)
      : [
          ...COURSES.filter((x) => x.slug !== c.slug && (x.phase === c.phase || x.n === c.n + 1)),
          ...COURSES.filter((x) => x.slug !== c.slug && x.phase !== c.phase && x.n !== c.n + 1),
        ].slice(0, 3);
    $("[data-related]").innerHTML = rel
      .map(
        (x) =>
          `<a class="ccard card" href="learn.html?course=${esc(x.slug)}"><div class="thumb ${x.trainer ? "thumb--p3" : thumbClass(x)}"><span class="thumb__model">${x.trainer ? "" : x.model}</span></div><span class="pill" style="align-self:flex-start">${x.trainer ? esc(x.track || "Course") : PHASES[x.phase]}</span><h3>${esc(x.title)}</h3><div class="ccard__meta"><span>About ${x.hours} ${x.n === 10 ? "days" : "hours"}</span><span>${pct(x)}%</span></div></a>`,
      )
      .join("");

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
