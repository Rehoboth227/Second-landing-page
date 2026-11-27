/* AiRise interactions: course filter, result calculator, certificate check (asks the server), facilitator checklist */
(() => {
  // Course filter by phase
  const tabs = document.querySelectorAll(".ar-tabs [data-filter]");
  const cards = document.querySelectorAll("[data-courses] [data-phase]");
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      cards.forEach((c) => {
        c.hidden = t.dataset.filter !== "all" && c.dataset.phase !== t.dataset.filter;
      });
    }),
  );

  // Final assessment result calculator (70 overall and at least 50% in each part)
  const calc = document.querySelector("[data-grade]");
  if (calc) {
    const inputs = [...calc.querySelectorAll("input")];
    const out = (k) => calc.querySelector(`[data-g="${k}"]`);
    const update = () => {
      let total = 0;
      const low = [];
      inputs.forEach((i) => {
        const max = +i.dataset.max;
        let v = Math.max(0, Math.min(max, Math.round(+i.value || 0)));
        total += v;
        const isLow = v < max / 2;
        i.classList.toggle("low", isLow);
        if (isLow) low.push(i.name.replace("p", "Part "));
      });
      let res = total >= 85 ? "Distinction" : total >= 75 ? "Merit" : total >= 70 ? "Pass" : "Not yet passed";
      if (low.length) res = "Not yet passed";
      out("total").textContent = total;
      out("result").textContent = res;
      out("result").classList.toggle("fail", res === "Not yet passed");
      out("why").textContent = low.length
        ? `Below 50% in ${low.join(" and ")}. You would re-sit only ${low.length > 1 ? "those parts" : "that part"}, after feedback.`
        : total < 70
          ? "Below 70 overall. You would re-sit the parts below standard, after feedback."
          : "At least 50% in every part.";
    };
    calc.addEventListener("input", update);
    update();
  }

  // Certificate number reader
  const ver = document.querySelector("[data-verify]");
  if (ver) {
    const courses = [
      "Adaptability",
      "Initiative and Proactivity",
      "Communication Skills",
      "Problem-Solving",
      "Work Ethics and Reliability",
      "Teamwork and Collaboration",
      "Continuous Learning",
      "Networking and Interpersonal Skills",
      "Self-Awareness",
    ];
    const input = ver.querySelector("input"),
      btn = ver.querySelector("button"),
      box = ver.querySelector(".ar-verify__out");
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    // Reads the number, then asks the AiRise server whether it was really issued.
    const check = async () => {
      const v = input.value.trim().toUpperCase();
      if (!v) {
        box.innerHTML = "";
        return;
      }
      const m = v.match(/^AIR-(C([1-9])|P|H|T(\d+))-(20\d\d)-(\d{3,})$/);
      if (!m) {
        box.innerHTML = `<div class="bad">“${esc(v)}” doesn't match the AiRise format. It should look like AIR-C3-2026-001.</div>`;
        return;
      }
      const what = m[2]
        ? `Course ${m[2]} certificate: <b>${courses[+m[2] - 1]}</b>`
        : m[1] === "P"
          ? "<b>Programme certificate</b> (all nine courses and the final assessment)"
          : m[1] === "H"
            ? "<b>The Hack</b> (partner course with Rheti)"
            : "<b>AiRise trainer course</b>";
      box.innerHTML = `<div class="ok">Checking ${esc(v)}…</div>`;
      try {
        const res = await fetch(new URL("../../api/airise/cert?number=" + encodeURIComponent(v), location.href), {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const r = await res.json();
        if (!r.ok) throw new Error();
        box.innerHTML = r.found
          ? `<div class="ok"><b>Genuine.</b> ${esc(r.number)} was issued to <b>${esc(r.name)}</b> for <b>${esc(r.title)}</b> on ${esc(r.issued)}.</div>`
          : `<div class="bad">${what}, issued in ${m[4]}. <b>We have no certificate with this number.</b> Check it was typed correctly, or contact AiRise.</div>`;
      } catch (e) {
        box.innerHTML = `<div class="ok">${what}<br>Issued in ${m[4]} · serial ${m[5]}<br><small>We couldn't reach the AiRise records just now, so only the format was checked. Try again, or contact AiRise with this number.</small></div>`;
      }
    };
    btn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") check();
    });
  }

  // Facilitator checklist (saved per browser)
  const list = document.querySelector("[data-checklist]");
  if (list) {
    const KEY = "airise-facilitator-checklist";
    const boxes = [...list.querySelectorAll("input[type=checkbox]")];
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      saved = [];
    }
    boxes.forEach((b) => {
      b.checked = saved.includes(b.dataset.key);
    });
    const update = () => {
      const done = boxes.filter((b) => b.checked);
      list.querySelector(".ar-check__bar i").style.width = (done.length / boxes.length) * 100 + "%";
      list.querySelector(".ar-check__count").textContent = `${done.length} of ${boxes.length} done`;
      try {
        localStorage.setItem(KEY, JSON.stringify(done.map((b) => b.dataset.key)));
      } catch (e) {
        /* storage unavailable */
      }
    };
    list.addEventListener("change", update);
    update();
  }
})();
