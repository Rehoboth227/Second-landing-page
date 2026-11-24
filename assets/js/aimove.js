/* AiMove page: onboarding slides, interactive app tour and tracking lookup.
   Screens and sample data follow the "upgrade Aimove" Figma design. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Onboarding slides (Quick delivery · Flexible payment · Real-time tracking)
  const slides = $$(".am2-slide");
  const dots = $$("[data-dot]");
  let at = 0;
  let auto = null;
  const showSlide = (i) => {
    at = (i + slides.length) % slides.length;
    slides.forEach((s, k) => s.classList.toggle("is-on", k === at));
    dots.forEach((d, k) => d.toggleAttribute("aria-current", k === at));
  };
  dots.forEach((d) =>
    d.addEventListener("click", () => {
      clearInterval(auto);
      showSlide(Number(d.dataset.dot));
    }),
  );
  if (slides.length && !reduce) auto = setInterval(() => showSlide(at + 1), 4200);

  // App tour
  const phone = $("[data-phone]");
  if (!phone) return;
  const screens = $$(".am2-screen", phone);
  const steps = $$(".am2-step");
  const toast = $(".am2-toast", phone);
  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add("is-on");
    clearTimeout(say.t);
    say.t = setTimeout(() => toast.classList.remove("is-on"), 2400);
  };
  const show = (key) => {
    if (!screens.some((s) => s.dataset.screen === key)) return;
    screens.forEach((s) => {
      s.hidden = s.dataset.screen !== key;
      if (!s.hidden) s.scrollTop = 0;
    });
    steps.forEach((b) => b.toggleAttribute("aria-current", b.dataset.show === key));
  };
  // Buttons inside the phone and in the step list
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-show]");
    if (b && (phone.contains(b) || b.classList.contains("am2-step"))) {
      show(b.dataset.show);
      return;
    }
    // Links elsewhere on the page that jump to a screen
    const j = e.target.closest("[data-jump]");
    if (j) show(j.dataset.jump);
    if (e.target.closest("[data-done]")) say("Delivery confirmed. Thanks for rating your rider!");
    if (e.target.closest("[data-accept]")) say("Job accepted. Navigating to pickup…");
  });
  // Segmented control (Instant / Scheduled) inside the phone
  phone.addEventListener("click", (e) => {
    const seg = e.target.closest(".am2-seg button");
    if (!seg) return;
    $$("button", seg.parentElement).forEach((x) => x.classList.toggle("on", x === seg));
  });

  // Tracking lookup
  const form = $("[data-track]");
  if (form) {
    const input = $("#trk");
    const out = $("[data-track-out]");
    const SAMPLE = "R-7458-4567-4434-5854";
    const msg = document.createElement("p");
    msg.className = "am2-hint am2-hint--msg";
    msg.setAttribute("role", "status");
    form.after(msg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim().toUpperCase().replace(/\s+/g, "");
      if (!v) {
        msg.textContent = "Enter a tracking number.";
        return;
      }
      if (!/^R(-\d{4}){4}$/.test(v)) {
        msg.textContent = "Tracking numbers look like R-7458-4567-4434-5854.";
        return;
      }
      if (v !== SAMPLE) {
        msg.textContent = `We couldn't find ${v}. This page only shows the sample package until AiMove's tracking service is connected.`;
        return;
      }
      msg.textContent = "";
      $("[data-trk-no]").textContent = v;
      out.classList.remove("am2-flash");
      void out.offsetWidth;
      out.classList.add("am2-flash");
      out.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    });
    const s = $("[data-sample]");
    if (s)
      s.addEventListener("click", () => {
        input.value = SAMPLE;
        form.requestSubmit();
      });
  }
})();
