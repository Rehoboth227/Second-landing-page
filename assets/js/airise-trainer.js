/* AiRise trainer studio: list a trainer's courses and upload a new one in four steps
   (details, curriculum, assessment, review and submit).
   Course details are saved in this browser only. File contents are not uploaded or stored:
   only each file's name, type and size are kept, until a server is connected. */
(() => {
  "use strict";
  const { COURSES, esc, ic } = window.AiRise;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = "airise-trainer-v1";
  const SKILLS = COURSES.slice(0, 9).map((c) => c.title);

  // Sample catalogue for the signed-in trainer
  const SAMPLE = [
    {
      id: "s1",
      title: "Communication Skills",
      track: "Employability skill",
      skills: ["Communication Skills"],
      modules: 7,
      lessons: 14,
      hours: 20,
      status: "published",
      learners: 312,
      updated: "2026-10-02",
    },
    {
      id: "s2",
      title: "Writing a CV that gets interviews",
      track: "Career readiness",
      skills: ["Communication Skills", "Self-Awareness"],
      modules: 3,
      lessons: 9,
      hours: 4,
      status: "review",
      learners: 0,
      updated: "2026-11-18",
    },
    {
      id: "s3",
      title: "Excel for entry-level analysts",
      track: "Technical skill",
      skills: ["Problem-Solving", "Continuous Learning"],
      modules: 5,
      lessons: 16,
      hours: 8,
      status: "draft",
      learners: 0,
      updated: "2026-11-21",
    },
  ];
  const load = () => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(v)) return v;
    } catch (e) {}
    return [];
  };
  const save = (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch (e) {}
  };
  let mine = load();

  const toast = (msg) => {
    const t = $(".toast");
    t.querySelector("span").textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), 3200);
  };
  const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const STATUS = { published: "Published", review: "In review", draft: "Draft", changes: "Changes requested" };

  // ---------------------------------------------------------------- tabs
  const tabs = $$('[role="tab"]');
  const show = (id) => {
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === id)));
    $$(".panel").forEach((p) => (p.hidden = p.id !== id));
    $$(".side__link[data-tab-link]").forEach((a) => a.toggleAttribute("aria-current", a.dataset.tabLink === id));
    if (id === "courses") renderCourses();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-tab-link]");
    if (!a) return;
    e.preventDefault();
    document.body.classList.remove("nav-open");
    show(a.dataset.tabLink);
  });

  // ---------------------------------------------------------------- my courses
  function renderCourses() {
    const all = [...mine, ...SAMPLE];
    const n = (s) => all.filter((c) => c.status === s).length;
    $("[data-kpis]").innerHTML = [
      ["Published", n("published")],
      ["In review", n("review")],
      ["Drafts", n("draft")],
      ["Learners", all.reduce((a, c) => a + (c.learners || 0), 0)],
    ]
      .map(([l, v]) => `<div class="kpi card"><small>${l}</small><b>${v}</b></div>`)
      .join("");
    $("[data-course-rows]").innerHTML = all
      .map(
        (c) => `<tr>
        <td><div class="who"><span class="avatar ${c.status === "published" ? "" : "avatar--soft"}">${esc(c.title.slice(0, 2).toUpperCase())}</span><div><b>${esc(c.title)}</b><small>${esc(c.track)} · ${c.modules} modules · ${c.lessons} lessons</small></div></div></td>
        <td>${c.skills
          .slice(0, 2)
          .map((s) => `<span class="pill pill--navy">${esc(s)}</span>`)
          .join(" ")}</td>
        <td><span class="status status--${c.status}">${STATUS[c.status]}</span></td>
        <td>${c.learners || "—"}</td>
        <td style="white-space:nowrap">${esc(new Date(c.updated + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</td>
        <td>${c.local ? `<button class="btn btn--ghost btn--sm" type="button" data-edit="${c.id}">${c.status === "draft" ? "Continue" : "View"}</button>` : `<span class="pill pill--grey">Sample</span>`}</td>
      </tr>`,
      )
      .join("");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]");
    if (!b) return;
    const c = mine.find((x) => x.id === b.dataset.edit);
    if (c && c.draft) {
      fill(c.draft);
      show("create");
      step(c.status === "draft" ? 0 : 3);
      toast("Draft loaded");
    }
  });

  // ---------------------------------------------------------------- wizard
  const form = $("#course-form");
  const steps = $$(".wstep", form);
  const stepper = $$(".stepper li");
  let at = 0;
  function step(i) {
    at = i;
    steps.forEach((s, k) => (s.hidden = k !== i));
    stepper.forEach((li, k) => {
      li.toggleAttribute("aria-current", k === i);
      if (k === i) li.setAttribute("aria-current", "step");
      li.classList.toggle("is-done", k < i);
    });
    $("[data-back]").disabled = i === 0;
    $("[data-next]").hidden = i === steps.length - 1;
    $("[data-submit]").hidden = i !== steps.length - 1;
    if (i === steps.length - 1) renderSummary();
    $("#create").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Validation per step
  function check(i) {
    let ok = true;
    $$(".field", steps[i]).forEach((f) => f.classList.remove("has-err"));
    const need = (el, cond) => {
      if (!cond) {
        el.closest(".field").classList.add("has-err");
        ok = false;
      }
    };
    if (i === 0) {
      need(form.title, form.title.value.trim().length >= 5);
      need(form.summary, form.summary.value.trim().length >= 30);
      need($('[name="skills"]', form), $$('[name="skills"]:checked', form).length > 0);
      need(form.hours, Number(form.hours.value) > 0);
    }
    if (i === 1) {
      const titled = $$(".lrow [data-l=title]", form).filter((x) => x.value.trim()).length;
      if (!titled) {
        toast("Add at least one lesson with a title");
        ok = false;
      }
    }
    if (i === 2) {
      const qs = $$(".q", form);
      const bad = qs.find((q) => !$("[data-q=text]", q).value.trim() || !$("input[type=radio]:checked", q));
      if (qs.length && bad) {
        toast("Each question needs text and a correct answer");
        bad.scrollIntoView({ block: "center" });
        ok = false;
      }
    }
    if (i === 3) {
      need(
        $("#agree-rights"),
        $$(".checks input", form).every((c) => c.checked),
      );
    }
    if (!ok) {
      const f = $(".has-err", steps[i]);
      if (f) f.scrollIntoView({ block: "center" });
    }
    return ok;
  }
  $("[data-next]").addEventListener("click", () => check(at) && step(at + 1));
  $("[data-back]").addEventListener("click", () => at > 0 && step(at - 1));
  stepper.forEach((li, k) =>
    li.addEventListener("click", () => {
      if (k < at || check(at)) step(k);
    }),
  );

  // Skills chips
  $("[data-skills]").innerHTML = SKILLS.map(
    (s) => `<label class="chip"><input type="checkbox" name="skills" value="${esc(s)}"><span>${esc(s)}</span></label>`,
  ).join("");

  // Drop zones (cover image + lesson files)
  function bindDrop(zone) {
    const input = $("input[type=file]", zone);
    const out = zone.parentElement.querySelector("[data-files]");
    const showFiles = (files) => {
      if (!files.length) return;
      const f = files[0];
      zone.dataset.file = JSON.stringify({ name: f.name, type: f.type, size: f.size });
      if (out)
        out.innerHTML = `<div class="file">${ic(f.type.startsWith("video") ? "play-circle" : f.type.startsWith("image") ? "image" : "file")}<span>${esc(f.name)}</span><em>${size(f.size)}</em></div>`;
      if (zone.hasAttribute("data-preview") && f.type.startsWith("image")) {
        const r = new FileReader();
        r.onload = () => {
          const img =
            $("img.preview", zone) ||
            zone.appendChild(
              Object.assign(document.createElement("img"), { className: "preview", alt: "Cover preview" }),
            );
          img.src = r.result;
        };
        r.readAsDataURL(f);
      }
    };
    input.addEventListener("change", () => showFiles(input.files));
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add("is-over");
      }),
    );
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove("is-over")));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      showFiles(e.dataTransfer.files);
    });
  }
  bindDrop($("[data-cover]"));

  // Curriculum builder
  const modWrap = $("[data-modules]");
  const lessonRow = (l = {}) => `<div class="lrow" draggable="true">
      <span class="grip" title="Drag to reorder">${ic("grip")}</span>
      <input class="inp" data-l="title" type="text" placeholder="Lesson title" value="${esc(l.title || "")}" aria-label="Lesson title">
      <select class="inp" data-l="type" aria-label="Lesson type">${["Video", "Document", "Reading", "Practice activity", "Live session"].map((t) => `<option ${l.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
      <input class="inp" data-l="min" type="number" min="1" placeholder="Mins" value="${esc(l.min || "")}" aria-label="Duration in minutes">
      <button class="x-btn" type="button" data-del-lesson aria-label="Remove lesson">${ic("trash")}</button>
      <div class="lrow__file"><label class="drop">${ic("upload")}<span><b>Upload file</b> · video, PDF, slides or audio</span><input type="file" accept="video/*,audio/*,application/pdf,.ppt,.pptx,.doc,.docx" aria-label="Upload lesson file"></label><div data-files>${l.file ? `<div class="file">${ic("file")}<span>${esc(l.file.name)}</span><em>${size(l.file.size)}</em></div>` : ""}</div></div>
    </div>`;
  function addModule(m = { title: "", lessons: [{}] }) {
    const d = document.createElement("div");
    d.className = "module";
    d.innerHTML = `<div class="module__head"><b data-mnum></b><input class="inp" data-m="title" type="text" placeholder="Module title, e.g. The SHIFT model" value="${esc(m.title)}" aria-label="Module title"><button class="x-btn" type="button" data-del-module aria-label="Remove module">${ic("trash")}</button></div>
      <div class="lessons-edit">${m.lessons.map(lessonRow).join("")}</div>
      <button class="btn btn--ghost btn--sm" type="button" data-add-lesson style="margin-top:12px">${ic("plus")} Add lesson</button>`;
    modWrap.appendChild(d);
    $$(".drop", d).forEach(bindDrop);
    number();
  }
  const number = () => $$("[data-mnum]", modWrap).forEach((b, i) => (b.textContent = `Module ${i + 1}`));
  $("[data-add-module]").addEventListener("click", () => addModule());
  modWrap.addEventListener("click", (e) => {
    if (e.target.closest("[data-add-lesson]")) {
      const wrap = $(".lessons-edit", e.target.closest(".module"));
      wrap.insertAdjacentHTML("beforeend", lessonRow());
      bindDrop($(".lrow:last-child .drop", wrap));
      $(".lrow:last-child [data-l=title]", wrap).focus();
    }
    if (e.target.closest("[data-del-lesson]")) {
      const row = e.target.closest(".lrow");
      if ($$(".lrow", row.parentElement).length > 1) row.remove();
      else toast("A module needs at least one lesson");
    }
    if (e.target.closest("[data-del-module]")) {
      if ($$(".module", modWrap).length > 1) {
        e.target.closest(".module").remove();
        number();
      } else toast("A course needs at least one module");
    }
  });
  // Drag to reorder lessons within a module
  let dragged = null;
  modWrap.addEventListener("dragstart", (e) => {
    const r = e.target.closest(".lrow");
    if (r && !e.target.closest("input,select,label")) {
      dragged = r;
      r.style.opacity = ".5";
    }
  });
  modWrap.addEventListener("dragend", () => {
    if (dragged) dragged.style.opacity = "";
    dragged = null;
  });
  modWrap.addEventListener("dragover", (e) => {
    const over = e.target.closest(".lrow");
    if (!dragged || !over || over === dragged || over.parentElement !== dragged.parentElement) return;
    e.preventDefault();
    const after = e.clientY > over.getBoundingClientRect().top + over.offsetHeight / 2;
    over.parentElement.insertBefore(dragged, after ? over.nextSibling : over);
  });

  // Assessment builder
  const qWrap = $("[data-questions]");
  function addQuestion(q = { text: "", opts: ["", "", "", ""], correct: -1 }) {
    const n = $$(".q", qWrap).length + 1;
    const d = document.createElement("div");
    d.className = "q";
    const name = "c" + Date.now() + Math.random().toString(16).slice(2, 6);
    d.innerHTML = `<div class="q__head"><b>Q${n}</b><input class="inp" data-q="text" type="text" placeholder="Question" value="${esc(q.text)}" aria-label="Question ${n}"><button class="x-btn" type="button" data-del-q aria-label="Remove question">${ic("trash")}</button></div>
      <div class="q__opts">${q.opts.map((o, i) => `<label class="q__opt"><input type="radio" name="${name}" ${q.correct === i ? "checked" : ""} aria-label="Mark option ${"ABCD"[i]} correct"><input class="inp" data-q="opt" type="text" placeholder="Option ${"ABCD"[i]}" value="${esc(o)}"></label>`).join("")}</div>
      <p class="note">Select the circle next to the correct answer.</p>`;
    qWrap.appendChild(d);
    $("[data-qcount]").textContent = $$(".q", qWrap).length;
  }
  $("[data-add-q]").addEventListener("click", () => addQuestion());
  qWrap.addEventListener("click", (e) => {
    if (!e.target.closest("[data-del-q]")) return;
    e.target.closest(".q").remove();
    $$(".q__head b", qWrap).forEach((b, i) => (b.textContent = "Q" + (i + 1)));
    $("[data-qcount]").textContent = $$(".q", qWrap).length;
  });

  // ---------------------------------------------------------------- collect / fill
  function collect() {
    const modules = $$(".module", modWrap).map((m) => ({
      title: $("[data-m=title]", m).value.trim(),
      lessons: $$(".lrow", m).map((r) => ({
        title: $("[data-l=title]", r).value.trim(),
        type: $("[data-l=type]", r).value,
        min: $("[data-l=min]", r).value,
        file: $(".drop", r).dataset.file ? JSON.parse($(".drop", r).dataset.file) : null,
      })),
    }));
    return {
      title: form.title.value.trim(),
      track: form.track.value,
      level: form.level.value,
      hours: form.hours.value,
      summary: form.summary.value.trim(),
      outcomes: form.outcomes.value.trim(),
      skills: $$('[name="skills"]:checked', form).map((c) => c.value),
      cover: $("[data-cover]").dataset.file ? JSON.parse($("[data-cover]").dataset.file) : null,
      modules,
      questions: $$(".q", qWrap).map((q) => ({
        text: $("[data-q=text]", q).value.trim(),
        opts: $$("[data-q=opt]", q).map((o) => o.value.trim()),
        correct: $$("input[type=radio]", q).findIndex((r) => r.checked),
      })),
      scenario: form.scenario.value.trim(),
      pass: form.pass.value,
    };
  }
  function fill(d) {
    form.reset();
    ["title", "track", "level", "hours", "summary", "outcomes", "scenario", "pass"].forEach(
      (k) => d[k] !== undefined && (form[k].value = d[k]),
    );
    $$('[name="skills"]', form).forEach((c) => (c.checked = d.skills.includes(c.value)));
    modWrap.innerHTML = "";
    (d.modules.length ? d.modules : [{ title: "", lessons: [{}] }]).forEach(addModule);
    qWrap.innerHTML = "";
    d.questions.forEach(addQuestion);
    $("[data-qcount]").textContent = d.questions.length;
    editing = d._id || null;
  }
  let editing = null;

  function renderSummary() {
    const d = collect();
    const lessons = d.modules.reduce((a, m) => a + m.lessons.filter((l) => l.title).length, 0);
    const files = d.modules.reduce((a, m) => a + m.lessons.filter((l) => l.file).length, 0);
    const mins = d.modules.reduce((a, m) => a + m.lessons.reduce((b, l) => b + (Number(l.min) || 0), 0), 0);
    $("[data-summary]").innerHTML = [
      ["Course", d.title || "Untitled"],
      ["Track and level", `${d.track} · ${d.level}`],
      ["Mapped to", d.skills.join(", ") || "None selected"],
      ["Structure", `${d.modules.length} modules · ${lessons} lessons`],
      ["Files attached", `${files} of ${lessons} lessons${d.cover ? " · cover image" : ""}`],
      ["Lesson time", `${Math.round((mins / 60) * 10) / 10} hours (estimate: ${d.hours || "?"} hours)`],
      ["Quiz", `${d.questions.length} multiple-choice questions${d.scenario ? " · scenario task" : ""}`],
      ["Pass mark", `${d.pass}%`],
    ]
      .map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`)
      .join("");
  }

  function store(status) {
    const d = collect();
    const id = editing || "c" + Date.now();
    d._id = id;
    const lessons = d.modules.reduce((a, m) => a + m.lessons.filter((l) => l.title).length, 0);
    const rec = {
      id,
      local: true,
      title: d.title || "Untitled course",
      track: d.track,
      skills: d.skills.length ? d.skills : ["Not mapped"],
      modules: d.modules.length,
      lessons,
      hours: d.hours,
      status,
      learners: 0,
      updated: new Date().toISOString().slice(0, 10),
      draft: d,
    };
    mine = [rec, ...mine.filter((x) => x.id !== id)];
    save(mine);
    editing = id;
  }
  $("[data-save-draft]").addEventListener("click", () => {
    if (!form.title.value.trim()) {
      toast("Give the course a title before saving");
      form.title.focus();
      return;
    }
    store("draft");
    toast("Draft saved in this browser");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!check(3)) return;
    store("review");
    toast("Submitted for review. AiRise will reply within 5 working days.");
    editing = null;
    form.reset();
    modWrap.innerHTML = "";
    addModule();
    qWrap.innerHTML = "";
    addQuestion();
    $("[data-qcount]").textContent = 1;
    $("[data-cover]").removeAttribute("data-file");
    const pv = $("[data-cover] img.preview");
    if (pv) pv.remove();
    $("[data-cover-files]").innerHTML = "";
    step(0);
    show("courses");
  });

  // Start
  addModule({ title: "", lessons: [{}, {}] });
  addQuestion();
  step(0);
  renderCourses();
  if (location.hash === "#create") show("create");
})();
