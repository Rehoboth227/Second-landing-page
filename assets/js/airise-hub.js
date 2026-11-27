/* AiRise hub pages. Learners: courses, assessments, certificates, opportunities, classes.
   Trainers: cohorts (classes, live sessions, announcements). Employers: opportunities they post, certificate check.
   All data comes from the server (api/lib/airise.php and api/lib/airise_hub.php). */
(() => {
  "use strict";
  const { COURSES, PHASES, lessonsFor, esc, ic, thumbClass } = window.AiRise;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const api = (path, body) => RH.call(path, body === undefined ? {} : { method: "POST", body });
  const page = document.body.dataset.page;
  const box = () => $("[data-hub]");
  const toast = (msg) => {
    const t = $(".toast");
    if (!t) return alert(msg);
    t.querySelector("span").textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), 3800);
  };
  const fail = (e) => (box().innerHTML = `<div class="note">${esc(e.message || "Could not load this page.")}</div>`);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Dates from the server are written as they are (classes are in Lagos time).
  const day = (d) => {
    if (!d) return "";
    const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number);
    return `${dd} ${MONTHS[m - 1]} ${y}`;
  };
  const when = (t) => {
    const [d, tm] = String(t).split(" ");
    const [y, m, dd] = d.split("-").map(Number);
    const wd = DAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
    return `${wd} ${dd} ${MONTHS[m - 1]} ${y}, ${tm.slice(0, 5)}`;
  };
  const card = (inner, style = "") =>
    `<section class="card" style="padding:20px;display:grid;gap:12px;${style}">${inner}</section>`;
  const sec = (title, inner, extra = "") =>
    `<section class="sec"><div class="sec__head"><h2>${esc(title)}</h2>${extra}</div>${inner}</section>`;
  const field = (label, html, wide) =>
    `<label class="field" ${wide ? 'style="grid-column:1/-1"' : ""}><span>${label}</span>${html}</label>`;
  const busy = async (btn, fn) => {
    if (btn) btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(e.message);
    }
    if (btn) btn.disabled = false;
  };

  // ---------------------------------------------------------------- learners: courses
  async function courses() {
    const st = await api("airise/state");
    const done = st.done || {};
    const pc = (key, n) => Math.min(100, Math.round(((done[key] || []).length / Math.max(1, n)) * 100));
    const certs = new Set((st.certs || []).map((c) => c.course));
    const row = (href, thumb, pill, title, meta, p, cert) =>
      `<a class="ccard card" href="${href}">${thumb}<span class="pill" style="align-self:flex-start">${pill}</span><h3>${esc(title)}</h3>
        <div class="ccard__meta"><span>${cert ? "Certificate earned" : p === 100 ? "Completed" : p ? p + "% complete" : "Not started"}</span><span>${meta}</span></div><div class="bar"><i style="width:${p}%"></i></div></a>`;
    const series = COURSES.map((c) =>
      row(
        `learn.html?course=${c.slug}`,
        `<div class="thumb ${thumbClass(c)}"><span class="thumb__n">${c.partner ? "Partner" : "Course " + c.n}</span><span class="thumb__model">${c.model}</span></div>`,
        PHASES[c.phase],
        c.title,
        `About ${c.hours} ${c.n === 10 ? "days" : "hours"}`,
        pc(c.slug, lessonsFor(c).length),
        certs.has(c.slug),
      ),
    );
    const trainer = (st.catalog || []).map((c) =>
      row(
        `learn.html?course=${c.id}`,
        `<div class="thumb thumb--p3"${c.cover ? ` style="background-image:url('${RH.url("api/airise/file?id=" + c.cover.id)}');background-size:cover"` : ""}><span class="thumb__n">${esc(c.trainer)}</span></div>`,
        esc(c.track || "Trainer course"),
        c.title,
        `${c.lessonCount} lessons`,
        pc(c.id, c.lessonCount),
        certs.has(c.id),
      ),
    );
    box().innerHTML = `<label class="search" style="max-width:420px;margin-bottom:6px"><span class="sr-only">Search courses</span>${ic("search")}<input type="search" placeholder="Search courses…" data-filter /></label>
      ${sec("Employability Skills Series and The Hack", `<div class="related" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))" data-list>${series.join("")}</div>`)}
      ${sec("From AiRise trainers", trainer.length ? `<div class="related" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))" data-list>${trainer.join("")}</div>` : `<div class="empty card"><b>No trainer courses yet</b>New courses appear here once AiRise publishes them.</div>`)}`;
    $("[data-filter]").addEventListener("input", (e) => {
      const v = e.target.value.trim().toLowerCase();
      $$("[data-list] .ccard").forEach((a) => (a.hidden = v && !a.textContent.toLowerCase().includes(v)));
    });
  }

  // ---------------------------------------------------------------- learners: assessments
  async function assessments() {
    const r = await api("airise/assessments");
    const cur = r.current;
    const status = (a) =>
      a.done
        ? `<span class="pill pill--green">${a.result ? "Passed · " + a.result.best + "%" : "Completed"}</span>`
        : a.result
          ? `<span class="pill pill--rose">Best ${a.result.best}% · try again</span>`
          : a.started
            ? `<span class="pill">${a.progress}/${a.of} lessons done</span>`
            : `<span class="pill pill--grey">Not started</span>`;
    box().innerHTML = `${
      cur
        ? card(
            `<small style="text-transform:uppercase;letter-spacing:.08em;color:var(--soft);font-weight:700">Where you left off</small><h2 style="margin:0">${esc(cur.title)}</h2><p style="margin:0">${esc(cur.what)} · ${cur.progress} of ${cur.of} lessons done</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn--gold" href="learn.html?course=${esc(cur.course)}&lesson=${cur.lesson}">Go to the assessment</a><a class="btn btn--ghost" href="learn.html?course=${esc(cur.course)}">Continue the course</a></div>`,
            "border:2px solid var(--gold)",
          )
        : card(
            `<b>No assessment in progress</b><p style="margin:0">Start a course and its assessment will appear here.</p>`,
          )
    }
      ${sec(
        "All assessments",
        `<div class="table card"><table><thead><tr><th scope="col">Course</th><th scope="col">Assessment</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody>${r.items
          .map(
            (a) =>
              `<tr><td><b>${esc(a.title)}</b><br><small>${a.kind === "series" ? "Course " + a.n : "Trainer course"}</small></td><td>${esc(a.what)}</td><td>${status(a)}</td><td><a class="btn btn--ghost btn--sm" href="learn.html?course=${esc(a.course)}&lesson=${a.lesson}">${a.done ? "Review" : "Open"}</a></td></tr>`,
          )
          .join("")}</tbody></table></div>`,
        `<a href="../../services/rheti/assessment.html">How assessments work</a>`,
      )}`;
  }

  // ---------------------------------------------------------------- learners: certificates
  async function certificates() {
    const st = await api("airise/state");
    const certs = st.certs || [];
    const page = RH.url("services/rheti/certificates.html");
    box().innerHTML = certs.length
      ? `<div class="certs" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${certs
          .map(
            (c) =>
              `<div class="cert card" style="align-items:flex-start"><span class="cert__seal">${ic("award")}</span><div style="display:grid;gap:6px"><b>${esc(c.title)}</b><small>${esc(c.number)} · issued ${day(c.at)}</small>
              <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--ghost btn--sm" type="button" data-copy="${esc(c.number)}">Copy number</button><button class="btn btn--ghost btn--sm" type="button" data-copy="${esc(page)}">Copy check link</button></div></div></div>`,
          )
          .join("")}</div>
        <p class="note">Share the number with employers. They can check it on AiRise's certificate page, which shows your name, the course and the date.</p>`
      : `<div class="empty card"><b>No certificates yet</b>Finish every lesson of a course to earn its certificate. <a href="courses.html">See courses</a></div>`;
  }

  // ---------------------------------------------------------------- learners: opportunities
  async function opportunities() {
    const F = { kind: "", q: "" };
    async function load() {
      const r = await api("airise/opportunities?" + new URLSearchParams(F));
      const kinds = Object.entries(r.kinds);
      box().innerHTML = `<form class="card" data-f style="padding:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:end">
          ${field("Type", `<select name="kind"><option value="">All</option>${kinds.map(([k, v]) => `<option value="${k}" ${F.kind === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`)}
          <label class="field" style="flex:1 1 220px"><span>Search</span><input type="text" name="q" value="${esc(F.q)}" placeholder="Title, company or location" /></label>
          <button class="btn btn--gold" style="margin-bottom:16px">Search</button></form>
        ${r.visible ? "" : `<p class="note">To apply with your portfolio, turn on "Show my portfolio to employers" in <a href="portfolio.html">My portfolio</a>.</p>`}
        <div style="display:grid;gap:14px;margin-top:14px">${
          r.items
            .map((o) =>
              card(`<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><span class="pill ${o.kind === "siwes" ? "pill--green" : o.kind === "internship" ? "" : "pill--navy"}">${esc(o.kindLabel)}</span>${o.career && o.career === r.career ? ` <span class="pill pill--rose">Matches your career path</span>` : ""}
                <h3 style="margin:8px 0 2px">${esc(o.title)}</h3><small>${esc(o.company)} · ${esc(o.location)} · ${esc(o.modeLabel)}${o.pay ? " · " + esc(o.pay) : ""}${o.deadline ? " · apply by " + day(o.deadline) : ""}</small></div>
                <div>${o.applied ? `<span class="pill pill--green">${o.applied === "shortlisted" ? "Shortlisted" : o.applied === "declined" ? "Not selected" : "Applied"}</span>` : `<button class="btn btn--gold btn--sm" type="button" data-apply="${o.id}" ${r.visible ? "" : "disabled"}>Apply with my portfolio</button>`}</div></div>
                <p style="margin:0;white-space:pre-line">${esc(o.description)}</p>${o.requirements ? `<details><summary>Requirements</summary><p style="white-space:pre-line">${esc(o.requirements)}</p></details>` : ""}
                ${o.applyUrl ? `<p style="margin:0"><a href="${esc(o.applyUrl)}" target="_blank" rel="noopener noreferrer">Also apply on the company's site</a></p>` : ""}`),
            )
            .join("") ||
          `<div class="empty card"><b>No opportunities right now</b>New SIWES placements, internships and jobs appear here as employers post them.</div>`
        }</div>`;
      $("[data-f]").addEventListener("submit", (e) => {
        e.preventDefault();
        F.kind = e.target.kind.value;
        F.q = e.target.q.value.trim();
        load().catch(fail);
      });
    }
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-apply]");
      if (!b) return;
      const note = prompt("Add a short note for the employer (optional):", "");
      if (note === null) return;
      busy(b, async () => {
        const r = await api("airise/apply", { id: +b.dataset.apply, note });
        toast(r.message);
        await load();
      });
    });
    await load();
  }

  // ---------------------------------------------------------------- learners: classes and notifications
  async function classes() {
    async function load() {
      const r = await api("airise/classes");
      const unread = r.notes.filter((n) => !n.read).length;
      const sess = (s) =>
        `<div class="file" style="flex-wrap:wrap">${ic("calendar")}<span><b>${esc(s.title)}</b><br><small>${when(s.at)} (Lagos time) · ${s.minutes} minutes${s.notes ? " · " + esc(s.notes) : ""}</small></span><em>${
          s.cancelled
            ? `<span class="pill pill--rose">Cancelled</span>`
            : s.past
              ? `<span class="pill pill--grey">Held</span>`
              : s.link
                ? `<a class="btn btn--gold btn--sm" href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">Join class</a>`
                : `<span class="pill">Link coming</span>`
        }</em></div>`;
      box().innerHTML = `${card(`<form data-join style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label class="field" style="margin:0;flex:1 1 200px"><span>Join a class with the code from your trainer</span><input type="text" name="code" maxlength="10" placeholder="e.g. 7K4QX2" style="text-transform:uppercase" /></label><button class="btn btn--gold">Join</button></form>`)}
        ${sec(
          "My classes",
          r.cohorts.length
            ? `<div style="display:grid;gap:14px">${r.cohorts
                .map((c) =>
                  card(`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3 style="margin:0">${esc(c.name)}</h3><small>${esc(c.courseTitle)} · with ${esc(c.trainer)}${c.startsOn ? " · starts " + day(c.startsOn) : ""} · ${c.size} learner${c.size === 1 ? "" : "s"}</small></div><div style="display:flex;gap:8px"><a class="btn btn--ghost btn--sm" href="learn.html?course=${esc(c.course)}">Open the course</a><button class="btn btn--ghost btn--sm" type="button" data-leave="${c.id}">Leave</button></div></div>
                  ${c.about ? `<p style="margin:0">${esc(c.about)}</p>` : ""}
                  <b>Classes</b>${c.sessions.map(sess).join("") || `<p class="note" style="margin:0">No classes scheduled yet.</p>`}
                  ${c.announcements.length ? `<b>Messages from your trainer</b>${c.announcements.map((a) => `<div class="file">${ic("mail")}<span style="white-space:pre-line">${esc(a.body)}<br><small>${day(a.at)}</small></span></div>`).join("")}` : ""}`),
                )
                .join("")}</div>`
            : `<div class="empty card"><b>You're not in a class yet</b>Join with the code your trainer gives you.</div>`,
        )}
        ${sec(
          "Notifications",
          `<div style="display:grid;gap:8px">${
            r.notes
              .map(
                (n) =>
                  `<div class="file" style="${n.read ? "" : "border-left:4px solid var(--gold)"}">${ic("bell")}<span><b>${esc(n.title)}</b><br><small style="white-space:pre-line">${esc(n.body)}</small><br><small>${day(n.at)}</small></span>${n.link && !n.link.startsWith("classes.html") ? `<em><a href="${esc(n.link)}">Open</a></em>` : ""}</div>`,
              )
              .join("") || `<p class="note">No notifications yet.</p>`
          }</div>`,
          unread
            ? `<button class="btn btn--ghost btn--sm" type="button" data-read>Mark all as read (${unread})</button>`
            : "",
        )}`;
      $("[data-join]").addEventListener("submit", (e) => {
        e.preventDefault();
        busy($("[data-join] button"), async () => {
          const res = await api("airise/classes", { action: "join", code: e.target.code.value.trim() });
          toast(res.message);
          await load();
        });
      });
    }
    document.addEventListener("click", (e) => {
      const lv = e.target.closest("[data-leave]");
      if (lv && confirm("Leave this class? You will stop getting its updates."))
        busy(lv, async () => {
          toast((await api("airise/classes", { action: "leave", id: +lv.dataset.leave })).message);
          await load();
        });
      const rd = e.target.closest("[data-read]");
      if (rd)
        busy(rd, async () => {
          await api("airise/classes", { action: "read" });
          await load();
        });
    });
    await load();
  }

  // ---------------------------------------------------------------- trainers: cohorts
  async function cohorts() {
    let R = null;
    async function load() {
      R = await api("airise/cohorts");
      const active = R.cohorts.filter((c) => !c.archived);
      const old = R.cohorts.filter((c) => c.archived);
      box().innerHTML = `${card(`<h2 style="margin:0">New cohort</h2><form data-new class="grid2" novalidate>
          ${field("Course", `<select name="course">${R.courses.map((c) => `<option value="${esc(c.key)}">${esc(c.title)}</option>`).join("")}</select>`)}
          ${field("Cohort name", `<input type="text" name="name" maxlength="100" placeholder="e.g. Saturday class, January" />`)}
          ${field("Starts on (optional)", `<input type="date" name="starts_on" class="inp" />`)}
          ${field("About (optional)", `<input type="text" name="about" maxlength="600" placeholder="Where and when you meet, what to bring" />`)}
          <button class="btn btn--gold" style="justify-self:start">Create cohort</button></form>`)}
        ${sec("Your cohorts", active.length ? `<div style="display:grid;gap:16px">${active.map(cohortCard).join("")}</div>` : `<div class="empty card"><b>No cohorts yet</b>Create one above, then share its code with your learners.</div>`)}
        ${old.length ? sec("Archived", `<div style="display:grid;gap:10px">${old.map((c) => card(`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(c.name)} · ${esc(c.courseTitle)}</b><button class="btn btn--ghost btn--sm" type="button" data-act="archive" data-id="${c.id}">Restore</button></div>`)).join("")}</div>`) : ""}`;
      $("[data-new]").addEventListener("submit", (e) => {
        e.preventDefault();
        const f = e.target;
        busy($("button", f), async () => {
          const r = await api("airise/cohorts", {
            action: "create",
            course: f.course.value,
            name: f.name.value.trim(),
            starts_on: f.starts_on.value,
            about: f.about.value.trim(),
          });
          toast(r.message);
          await load();
        });
      });
    }
    const cohortCard = (c) =>
      card(`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><h3 style="margin:0">${esc(c.name)}</h3><small>${esc(c.courseTitle)}${c.startsOn ? " · starts " + day(c.startsOn) : ""} · ${c.size} learner${c.size === 1 ? "" : "s"}</small></div>
          <div style="text-align:right"><small>Join code</small><br><b style="font-size:22px;letter-spacing:.12em">${esc(c.code)}</b> <button class="btn btn--ghost btn--sm" type="button" data-copy="${esc(c.code)}">Copy</button></div></div>
        <details open><summary><b>Classes</b> (${c.sessions.length})</summary><div style="display:grid;gap:8px;margin-top:10px">${
          c.sessions
            .map(
              (s) =>
                `<div class="file" style="flex-wrap:wrap">${ic("calendar")}<span><b>${esc(s.title)}</b><br><small>${when(s.at)} (Lagos time) · ${s.minutes} min${s.link ? ` · <a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">meeting link</a>` : ""}</small></span><em>${s.cancelled ? `<span class="pill pill--rose">Cancelled</span>` : s.past ? `<span class="pill pill--grey">Held</span>` : `<button class="btn btn--ghost btn--sm" type="button" data-act="cancel" data-id="${c.id}" data-session="${s.id}">Cancel</button>`}</em></div>`,
            )
            .join("") || `<p class="note" style="margin:0">No classes yet.</p>`
        }
          <form data-session-form="${c.id}" class="grid2" style="margin-top:6px" novalidate>
            ${field("Class title", `<input type="text" name="title" maxlength="120" placeholder="e.g. Week 1: the CLEAR model" />`)}
            ${field("Date and time (Lagos)", `<input type="datetime-local" name="starts_at" class="inp" />`)}
            ${field("Length", `<select name="minutes">${[30, 45, 60, 90, 120, 180].map((m) => `<option value="${m}" ${m === 60 ? "selected" : ""}>${m} minutes</option>`).join("")}</select>`)}
            ${field("Live meeting", `<select name="linkType"><option value="jitsi">Create a free Jitsi Meet room</option><option value="own">I'll paste my Zoom / Google Meet link</option><option value="none">In person (no link)</option></select>`)}
            ${field("Meeting link", `<input type="url" name="link" placeholder="https://zoom.us/j/…" />`, true)}
            ${field("Notes for learners (optional)", `<input type="text" name="notes" maxlength="600" placeholder="e.g. Read lesson 2 first" />`, true)}
            <button class="btn btn--gold" style="justify-self:start">Schedule and notify learners</button></form></div></details>
        <details ${c.members.length ? "" : "open"}><summary><b>Learners</b> (${c.members.length})</summary><div style="display:grid;gap:8px;margin-top:10px">
          ${c.members.map((m) => `<div class="file">${ic("users")}<span><b>${esc(m.name)}</b><br><small>${esc(m.email)} · ${m.progress}% of the course</small></span><em><button class="btn btn--ghost btn--sm" type="button" data-act="remove" data-id="${c.id}" data-user="${m.id}">Remove</button></em></div>`).join("") || `<p class="note" style="margin:0">Share the code ${esc(c.code)}, or add learners by email.</p>`}
          <form data-invite="${c.id}" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label class="field" style="margin:0;flex:1 1 220px"><span>Add a learner by email</span><input type="text" name="email" placeholder="learner@example.com" /></label><button class="btn btn--ghost">Add</button></form></div></details>
        <details><summary><b>Message the cohort</b></summary><form data-announce="${c.id}" style="display:grid;gap:10px;margin-top:10px"><label class="field" style="margin:0"><span>Your message (sent in AiRise and by email)</span><textarea name="body" maxlength="1500"></textarea></label><button class="btn btn--ghost" style="justify-self:start">Send to everyone</button></form>
          ${c.announcements.map((a) => `<div class="file">${ic("mail")}<span style="white-space:pre-line">${esc(a.body)}<br><small>${day(a.at)}</small></span></div>`).join("")}</details>
        <div><button class="btn btn--ghost btn--sm" type="button" data-act="archive" data-id="${c.id}">Archive cohort</button></div>`);
    const post = async (body, btn) =>
      busy(btn, async () => {
        toast((await api("airise/cohorts", body)).message);
        await load();
      });
    document.addEventListener("submit", (e) => {
      const f = e.target;
      if (f.dataset.sessionForm) {
        e.preventDefault();
        const type = f.linkType.value;
        if (type === "own" && !/^https:\/\//i.test(f.link.value.trim()))
          return toast("Paste the full meeting link, starting with https://");
        post(
          {
            action: "session",
            id: +f.dataset.sessionForm,
            title: f.title.value.trim(),
            starts_at: f.starts_at.value,
            minutes: +f.minutes.value,
            link: type === "jitsi" ? "jitsi" : type === "own" ? f.link.value.trim() : "",
            notes: f.notes.value.trim(),
          },
          $("button", f),
        );
      }
      if (f.dataset.invite) {
        e.preventDefault();
        post({ action: "invite", id: +f.dataset.invite, email: f.email.value.trim() }, $("button", f));
      }
      if (f.dataset.announce) {
        e.preventDefault();
        post({ action: "announce", id: +f.dataset.announce, body: f.body.value.trim() }, $("button", f));
      }
    });
    document.addEventListener("change", (e) => {
      if (e.target.name === "linkType")
        e.target.closest("form").link.closest("label").hidden = e.target.value !== "own";
    });
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "cancel" && !confirm("Cancel this class? Learners will be told.")) return;
      if (a === "remove" && !confirm("Remove this learner from the cohort?")) return;
      post({ action: a, id: +b.dataset.id, session_id: +b.dataset.session || 0, user_id: +b.dataset.user || 0 }, b);
    });
    await load();
    $$("[name=linkType]").forEach((s) => (s.closest("form").link.closest("label").hidden = s.value !== "own"));
    const obs = new MutationObserver(() =>
      $$("[name=linkType]").forEach((s) => (s.closest("form").link.closest("label").hidden = s.value !== "own")),
    );
    obs.observe(box(), { childList: true });
  }

  // ---------------------------------------------------------------- employers: opportunities
  async function jobs() {
    let R = null;
    async function load() {
      R = await api("airise/jobs");
      box().innerHTML = `${card(`<h2 style="margin:0" data-form-title>Post an opportunity</h2>${jobForm()}`)}
        ${sec(
          "Your opportunities",
          R.items.length
            ? `<div style="display:grid;gap:14px">${R.items
                .map((o) =>
                  card(`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><span class="pill">${esc(o.kindLabel)}</span> ${o.status === "open" ? `<span class="pill pill--green">Open</span>` : `<span class="pill pill--grey">Closed</span>`}<h3 style="margin:8px 0 2px">${esc(o.title)}</h3><small>${esc(o.company)} · ${esc(o.location)} · ${esc(o.modeLabel)}${o.deadline ? " · closes " + day(o.deadline) : ""} · posted ${day(o.at)}</small></div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:start"><button class="btn btn--ghost btn--sm" type="button" data-edit="${o.id}">Edit</button><button class="btn btn--ghost btn--sm" type="button" data-job="${o.status === "open" ? "close" : "reopen"}" data-id="${o.id}">${o.status === "open" ? "Close" : "Reopen"}</button></div></div>
                  <details ${o.applicants.length ? "open" : ""}><summary><b>Applicants</b> (${o.applicants.length})</summary><div style="display:grid;gap:8px;margin-top:10px">${
                    o.applicants
                      .map(
                        (a) =>
                          `<div class="file" style="flex-wrap:wrap">${ic("users")}<span><b>${esc(a.name)}</b> · score ${Math.round(a.score)}/100<br><small>${esc([a.course, a.institution, a.career].filter(Boolean).join(" · "))} · <a href="mailto:${esc(a.email)}">${esc(a.email)}</a>${a.note ? "<br>“" + esc(a.note) + "”" : ""}</small></span><em style="display:flex;gap:6px;flex-wrap:wrap">${a.visible ? `<a class="btn btn--ghost btn--sm" href="talent.html#learner=${a.learner}">Portfolio</a>` : ""}${a.status === "sent" ? `<button class="btn btn--gold btn--sm" type="button" data-appl="shortlisted" data-id="${a.id}">Shortlist</button><button class="btn btn--ghost btn--sm" type="button" data-appl="declined" data-id="${a.id}">Decline</button>` : `<span class="pill ${a.status === "shortlisted" ? "pill--green" : "pill--grey"}">${a.status === "shortlisted" ? "Shortlisted" : "Declined"}</span>`}</em></div>`,
                      )
                      .join("") || `<p class="note" style="margin:0">No applicants yet.</p>`
                  }</div></details>`),
                )
                .join("")}</div>`
            : `<div class="empty card"><b>Nothing posted yet</b>Post a SIWES placement, internship or job above.</div>`,
        )}`;
    }
    const jobForm = (
      o = {},
    ) => `<form data-jobform class="grid2" novalidate><input type="hidden" name="id" value="${o.id || ""}" />
      ${field(
        "Type",
        `<select name="kind">${Object.entries(R.kinds)
          .map(([k, v]) => `<option value="${k}" ${o.kind === k ? "selected" : ""}>${esc(v)}</option>`)
          .join("")}</select>`,
      )}
      ${field("Title", `<input type="text" name="title" maxlength="120" value="${esc(o.title || "")}" placeholder="e.g. SIWES: data analysis" />`)}
      ${field("Company", `<input type="text" name="company" maxlength="120" value="${esc(o.company || R.company || "")}" />`)}
      ${field("Location", `<input type="text" name="location" maxlength="120" value="${esc(o.location || "")}" placeholder="e.g. Ikeja, Lagos" />`)}
      ${field(
        "Work mode",
        `<select name="mode">${Object.entries(R.modes)
          .map(([k, v]) => `<option value="${k}" ${o.mode === k ? "selected" : ""}>${esc(v)}</option>`)
          .join("")}</select>`,
      )}
      ${field("Career path (helps us show it to the right learners)", `<select name="career"><option value="">Any</option>${R.careers.map((c) => `<option value="${c.key}" ${o.career === c.key ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select>`)}
      ${field("Description", `<textarea name="description" maxlength="5000">${esc(o.description || "")}</textarea>`, true)}
      ${field("Requirements (optional)", `<textarea name="requirements" maxlength="3000">${esc(o.requirements || "")}</textarea>`, true)}
      ${field("Pay or stipend (optional)", `<input type="text" name="pay" maxlength="80" value="${esc(o.pay || "")}" placeholder="e.g. NGN 40,000 monthly" />`)}
      ${field("Apply by (optional)", `<input type="date" name="deadline" class="inp" value="${esc(o.deadline || "")}" />`)}
      ${field("Your own application link (optional)", `<input type="url" name="apply_url" maxlength="300" value="${esc(o.applyUrl || "")}" placeholder="https://" />`, true)}
      <p class="note" style="grid-column:1/-1;margin:0">Learners apply with their AiRise portfolio; you'll see each applicant below and get an email.</p>
      <div style="display:flex;gap:10px"><button class="btn btn--gold">${o.id ? "Save changes" : "Publish"}</button>${o.id ? `<button class="btn btn--ghost" type="button" data-cancel-edit>Cancel</button>` : ""}</div></form>`;
    document.addEventListener("submit", (e) => {
      const f = e.target.closest("[data-jobform]");
      if (!f) return;
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      busy($("button", f), async () => {
        const r = await api("airise/jobs", { action: "save", ...v, id: +v.id || 0 });
        toast(r.message);
        await load();
      });
    });
    document.addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit]");
      if (ed) {
        const o = R.items.find((x) => x.id === +ed.dataset.edit);
        $("[data-jobform]").outerHTML = jobForm(o);
        $("[data-form-title]").textContent = "Edit: " + o.title;
        $("[data-form-title]").scrollIntoView({ behavior: "smooth" });
      }
      if (e.target.closest("[data-cancel-edit]")) load().catch(fail);
      const jb = e.target.closest("[data-job]");
      if (jb)
        busy(jb, async () => {
          toast((await api("airise/jobs", { action: jb.dataset.job, id: +jb.dataset.id })).message);
          await load();
        });
      const ap = e.target.closest("[data-appl]");
      if (ap)
        busy(ap, async () => {
          toast(
            (await api("airise/jobs", { action: "applicant", app_id: +ap.dataset.id, status: ap.dataset.appl }))
              .message,
          );
          await load();
        });
    });
    await load();
  }

  // ---------------------------------------------------------------- employers: certificate check, inside AiRise
  function verify() {
    box().innerHTML =
      card(
        `<form data-verify style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><label class="field" style="margin:0;flex:1 1 260px"><span>Certificate number</span><input type="text" name="n" placeholder="AIR-C3-2026-001" autocomplete="off" spellcheck="false" style="text-transform:uppercase" /></label><button class="btn btn--gold">Check</button></form><div data-out aria-live="polite"></div>`,
      ) +
      `<p class="note">Numbers look like AIR-C3-2026-001 (series course 3), AIR-H-2026-001 (The Hack) or AIR-T12-2026-001 (a trainer course).</p>`;
    $("[data-verify]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = e.target.n.value.trim().toUpperCase();
      const out = $("[data-out]");
      if (!n) return;
      out.innerHTML = `<p class="note">Checking…</p>`;
      try {
        const r = await api("airise/cert?number=" + encodeURIComponent(n));
        out.innerHTML = r.found
          ? `<div class="file" style="border-left:4px solid var(--green)">${ic("check-circle")}<span><b>Genuine.</b> ${esc(r.number)} was issued to <b>${esc(r.name)}</b> for <b>${esc(r.title)}</b> on ${day(r.issued)}.</span></div>`
          : `<div class="file" style="border-left:4px solid var(--red)">${ic("help")}<span><b>Not found.</b> AiRise has no certificate with the number ${esc(n)}. Check it was typed correctly.</span></div>`;
      } catch (er) {
        out.innerHTML = `<p class="note">${esc(er.message)}</p>`;
      }
    });
  }

  // copy buttons
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(
      () => toast("Copied"),
      () => prompt("Copy this:", b.dataset.copy),
    );
  });

  const P = { courses, assessments, certificates, opportunities, classes, cohorts, jobs, verify };
  if (P[page]) Promise.resolve(P[page]()).catch(fail);
})();
