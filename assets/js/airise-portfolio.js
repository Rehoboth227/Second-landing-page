/* AiRise portfolios: the learner's own portfolio (portfolio.html) and the employer talent search (talent.html).
   Everything is stored on the server (api/lib/airise.php); files upload in 4 MB pieces to private storage. */
(() => {
  "use strict";
  const { COURSES, esc, ic, thumbClass } = window.AiRise;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const api = (path, body) => RH.call(path, body === undefined ? {} : { method: "POST", body });
  const size = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const fileUrl = (id) => RH.url("api/airise/file?id=" + id);
  const toast = (msg) => {
    const t = $(".toast");
    if (!t) return alert(msg);
    t.querySelector("span").textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("is-on"), 3600);
  };
  const STATUS = {
    pending: ["Waiting for checks", "pill--grey"],
    verified: ["Verified", "pill--green"],
    rejected: ["Not verified", "pill--rose"],
  };
  const bar = (v, max) => `<div class="bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div>`;
  const page = document.body.dataset.page;

  // ---------------------------------------------------------------- learner: my portfolio
  if (page === "portfolio") {
    let D = null;
    const load = async () => {
      D = await api("airise/portfolio");
      render();
    };
    function render() {
      const p = D.profile;
      const f = $("#pf-form");
      if (!f.dataset.filled) {
        $("[data-careers]", f).innerHTML =
          `<option value="">Choose</option>` +
          D.careers.map((c) => `<option value="${c.key}">${esc(c.label)}</option>`).join("");
        f.course.value = p.course;
        f.institution.value = p.institution;
        f.level.value = p.level;
        f.career.value = p.career;
        f.grade.value = p.grade;
        f.cgpa.value = p.cgpa === null ? "" : p.cgpa;
        f.scale.value = String(p.scale || 5);
        f.about.value = p.about;
        f.visible.checked = p.visible;
        f.dataset.filled = "1";
      }
      const docs = D.docs;
      const verified = docs.filter((d) => d.status === "verified").length;
      const certPart = D.score.parts[0];
      $("[data-pf-stats]").innerHTML = [
        ["star", Math.round(D.score.total) + "/100", "Portfolio score"],
        [
          "chart",
          D.rank && D.rank.position ? `#${D.rank.position} of ${D.rank.of}` : "Not ranked",
          D.rank && D.rank.label ? D.rank.label : "Career ranking",
        ],
        ["check", `${verified}/${docs.length}`, "Verified documents"],
        ["award", certPart[3].split(",")[0], "Certificates"],
      ]
        .map(
          ([i, b, s]) =>
            `<div class="stat card"><span class="stat__ico">${ic(i)}</span><div><small>${esc(s)}</small><b>${esc(b)}</b></div></div>`,
        )
        .join("");
      $("[data-score]").textContent = Math.round(D.score.total);
      $("[data-rank-label]").textContent = D.rank && D.rank.label ? D.rank.label : "Career path";
      $("[data-rank-pos]").textContent =
        D.rank && D.rank.position ? `#${D.rank.position} of ${D.rank.of} learners` : "Choose a career path";
      $("[data-breakdown]").innerHTML = D.score.parts
        .map(
          ([label, v, max, hint]) =>
            `<div><div style="display:flex;justify-content:space-between;font-size:14px"><b>${esc(label)}</b><span>${v}/${max}</span></div>${bar(v, max)}<small style="color:var(--soft);font-size:12px">${esc(hint)}</small></div>`,
        )
        .join("");
      $("[data-tips]").innerHTML =
        D.tips.map((t) => `<li>${esc(t)}</li>`).join("") || "<li>Your portfolio is in great shape. Keep learning.</li>";

      $("[data-folders]").innerHTML = Object.entries(D.folders)
        .map(([key, label]) => {
          const list = docs.filter((d) => d.folder === key);
          return `<section class="card" style="padding:18px;display:grid;gap:12px" data-folder="${key}">
            <h3 style="margin:0;font-size:17px;display:flex;gap:8px;align-items:center">${ic("layers")} ${esc(label)} <small style="color:var(--soft);font-weight:500">(${list.length})</small></h3>
            ${
              list
                .map(
                  (d) =>
                    `<div class="file" style="flex-wrap:wrap">${ic("file")}<span><a href="${esc(fileUrl(d.file.id))}" target="_blank" rel="noopener">${esc(d.title)}</a><br><small>${esc(d.file.name)} · ${size(d.file.size)}</small>${d.status === "rejected" && d.note ? `<br><small style="color:var(--red)">${esc(d.note)}</small>` : ""}</span><em><span class="pill ${STATUS[d.status][1]}">${STATUS[d.status][0]}</span></em><button class="x-btn" type="button" data-del="${d.id}" aria-label="Remove ${esc(d.title)}">${ic("trash")}</button></div>`,
                )
                .join("") || `<p class="note" style="margin:0">Nothing here yet.</p>`
            }
            <form class="grid" style="display:grid;gap:8px" data-add="${key}" novalidate>
              <input class="inp" name="title" maxlength="120" placeholder="Title, e.g. ${key === "results" ? "Final year transcript" : key === "certificates" ? "Google Data Analytics certificate" : key === "projects" ? "Sales dashboard project" : "Reference from my internship"}" aria-label="Document title" />
              <label class="btn btn--sm btn--ghost" style="justify-self:start">${ic("upload")} Choose file and add<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" class="sr-only" /></label>
              <small data-progress style="color:var(--soft)"></small>
            </form></section>`;
        })
        .join("");

      $("[data-suggest]").innerHTML =
        D.suggest
          .map((x) => {
            const c = COURSES.find((y) => y.slug === x.course);
            return `<a class="ccard card" href="learn.html?course=${esc(x.course)}">
            <div class="thumb ${c ? thumbClass(c) : "thumb--p3"}"><span class="thumb__n">${c ? (c.partner ? "Partner" : "Course " + c.n) : "Trainer course"}</span>${c ? `<span class="thumb__model">${c.model}</span>` : ""}</div>
            <span class="pill pill--green" style="align-self:flex-start">${esc(x.why)}</span><h3>${esc(x.title)}</h3></a>`;
          })
          .join("") || `<div class="empty card"><b>Choose a career path</b>We'll suggest courses for it.</div>`;
    }

    // Uploads a document in 4 MB pieces, then files it in the folder.
    async function addDoc(form, file) {
      const title = form.title.value.trim();
      if (title.length < 2) {
        form.file.value = "";
        return toast("Give the document a title first");
      }
      const out = $("[data-progress]", form);
      try {
        const st = await api("airise/upload/start", { name: file.name, size: file.size, use: "portfolio" });
        let off = 0;
        let saved = null;
        while (off < file.size) {
          const r = await RH.raw(`airise/upload/chunk?id=${st.id}&offset=${off}`, file.slice(off, off + st.chunk));
          off = r.received;
          out.textContent = `Uploading ${Math.round((off / file.size) * 100)}%`;
          if (r.done) saved = r.file;
        }
        const r = await api("airise/portfolio/doc", { folder: form.dataset.add, title, file: { id: saved.id } });
        toast(r.message);
        await load();
      } catch (e) {
        out.textContent = "";
        toast(e.message);
      }
    }
    document.addEventListener("change", (e) => {
      const f = e.target.closest("[data-add]");
      if (f && e.target.name === "file" && e.target.files[0]) addDoc(f, e.target.files[0]);
    });
    document.addEventListener("submit", (e) => {
      if (e.target.closest("[data-add]")) e.preventDefault();
    });
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-del]");
      if (!b || !confirm("Remove this document from your portfolio?")) return;
      try {
        await api("airise/portfolio/doc", { action: "delete", id: +b.dataset.del });
        await load();
        toast("Removed");
      } catch (er) {
        toast(er.message);
      }
    });
    $("#pf-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = $("button[type=submit]", f);
      btn.disabled = true;
      try {
        const r = await api("airise/portfolio", {
          course: f.course.value.trim(),
          institution: f.institution.value.trim(),
          level: f.level.value,
          career: f.career.value,
          grade: f.grade.value.trim(),
          cgpa: f.cgpa.value.trim(),
          scale: +f.scale.value,
          about: f.about.value.trim(),
          visible: f.visible.checked,
        });
        toast(r.message);
        await load();
      } catch (er) {
        toast(er.message);
      }
      btn.disabled = false;
    });
    load().catch((e) => toast(e.message));
  }

  // ---------------------------------------------------------------- employers: talent search
  if (page === "talent") {
    const f = $("#tl-f");
    let careersFilled = false;
    async function search() {
      const qs = new URLSearchParams({ career: f.career.value, q: f.q.value.trim() });
      const body = $("[data-talent]");
      body.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;
      try {
        const r = await api("airise/talent?" + qs);
        if (!careersFilled) {
          $("[data-careers]", f).innerHTML =
            `<option value="">All career paths</option>` +
            r.careers.map((c) => `<option value="${c.key}">${esc(c.label)}</option>`).join("");
          careersFilled = true;
        }
        $("[data-count]").textContent = `${r.items.length} learner${r.items.length === 1 ? "" : "s"}`;
        body.innerHTML =
          r.items
            .map(
              (x) =>
                `<tr><td><b>#${x.rank}</b></td><td><div class="who"><span class="avatar">${esc(
                  x.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase(),
                )}</span><div><b>${esc(x.name)}</b><small>${esc([x.course, x.institution].filter(Boolean).join(" · ") || "Course not given")}</small></div></div></td><td>${esc(x.careerLabel || "Not chosen")}</td><td style="min-width:120px"><b>${Math.round(x.score)}</b>/100${bar(x.score, 100)}</td><td><small>${x.folders.map((fo) => `${esc(fo.label.split(" ")[0])}: ${fo.count}${fo.verified ? ` (${fo.verified} ✓)` : ""}`).join("<br>")}</small></td><td><button class="btn btn--ghost btn--sm" type="button" data-open="${x.id}">View portfolio</button></td></tr>`,
            )
            .join("") || `<tr><td colspan="6">No learners match yet.</td></tr>`;
      } catch (e) {
        body.innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`;
      }
    }
    async function open(id) {
      const dlg = $("#pf-dlg");
      try {
        const x = (await api("airise/talent/one?id=" + id)).learner;
        const folders = x.folders
          .map((fo) => {
            const list = x.docs.filter((d) => d.folder === fo.key);
            return `<h3 style="margin:14px 0 6px;font-size:15px">${esc(fo.label)}</h3>${
              list
                .map(
                  (d) =>
                    `<div class="file">${ic("file")}<span><a href="${esc(fileUrl(d.file.id))}" target="_blank" rel="noopener">${esc(d.title)}</a><br><small>${esc(d.file.name)} · ${size(d.file.size)}</small></span><em><span class="pill ${STATUS[d.status][1]}">${STATUS[d.status][0]}</span></em></div>`,
                )
                .join("") || `<p class="note" style="margin:0">Empty</p>`
            }`;
          })
          .join("");
        dlg.innerHTML = `<div style="padding:24px;display:grid;gap:10px">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h2 id="dlg-t" style="margin:0">${esc(x.name)}</h2><p style="margin:4px 0 0;color:var(--soft)">${esc([x.course, x.institution, x.level].filter(Boolean).join(" · "))}</p></div><button class="x-btn" type="button" data-close aria-label="Close">✕</button></div>
          <p style="margin:0"><b>${esc(x.careerLabel || "No career path chosen")}</b> · score <b>${Math.round(x.score)}</b>/100${x.grade ? " · " + esc(x.grade) : ""}${x.cgpa !== null ? ` · CGPA ${x.cgpa}/${x.scale}` : ""}</p>
          ${x.about ? `<p style="margin:0">${esc(x.about)}</p>` : ""}
          <p style="margin:0"><a class="btn btn--gold btn--sm" href="mailto:${esc(x.email)}">${ic("mail")} Email ${esc(x.name.split(" ")[0])}</a></p>
          <div style="display:grid;gap:8px">${x.parts.map(([l, v, m, h]) => `<div><div style="display:flex;justify-content:space-between;font-size:14px"><b>${esc(l)}</b><span>${v}/${m}</span></div>${bar(v, m)}<small style="color:var(--soft);font-size:12px">${esc(h)}</small></div>`).join("")}</div>
          <h3 style="margin:14px 0 6px;font-size:15px">AiRise certificates</h3>${
            x.certList.length
              ? x.certList
                  .map(
                    (c) =>
                      `<div class="file">${ic("award")}<span>${esc(c.title)}<br><small>${esc(c.number)} · ${esc(c.at)}</small></span><em><a href="${esc(RH.url("services/rheti/certificates.html"))}" target="_blank" rel="noopener">Check</a></em></div>`,
                  )
                  .join("")
              : `<p class="note" style="margin:0">None yet</p>`
          }
          ${folders}
          <p class="note">Documents marked "Waiting for checks" have not been verified by AiRise yet.</p></div>`;
        dlg.showModal();
      } catch (e) {
        alert(e.message);
      }
    }
    f.addEventListener("submit", (e) => (e.preventDefault(), search()));
    f.career.addEventListener("change", search);
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-open]");
      if (b) open(+b.dataset.open);
      if (e.target.closest("[data-close]") || e.target.id === "pf-dlg") $("#pf-dlg").close();
    });
    search();
  }
})();
