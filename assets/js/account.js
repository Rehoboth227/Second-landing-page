/* Rehohub accounts: page logic for /account/*.html (needs rh-auth.js first). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  const hashToken = () => new URLSearchParams(location.hash.slice(1)).get("token") || "";
  const fmt = (d) =>
    d ? new Date(d.replace(" ", "T") + "Z").toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

  // ---------------------------------------------------------------- what people can sign up for
  const OPTIONS = [
    { product: "aipay", role: "customer", title: "Shop on AiPay", sub: "Buy from stores near you" },
    { product: "aipay", role: "merchant", title: "Sell on AiPay", sub: "Open your store", review: true },
    { product: "aimove", role: "customer", title: "Send with AiMove", sub: "Book deliveries and track them" },
    { product: "aimove", role: "rider", title: "Ride for AiMove", sub: "Deliver packages and earn", review: true },
    { product: "greenfed", role: "customer", title: "Eat well with GreenFed", sub: "Meal plans, groceries, community" },
    {
      product: "greenfed",
      role: "employee",
      title: "Work at GreenFed",
      sub: "Nutrition, supply, QA, delivery",
      review: true,
    },
    { product: "airise", role: "customer", title: "Learn with AiRise", sub: "Courses, assessments, certificates" },
    { product: "airise", role: "trainer", title: "Teach on AiRise", sub: "Upload and run courses", review: true },
  ];
  const DETAILS = {
    merchant: [
      ["business_name", "Business name", "text", true],
      ["business_address", "Business address", "text", true],
      ["business_category", "What do you sell?", "text", false, "e.g. Food & drinks, fashion"],
      ["cac_number", "CAC registration number", "text", false, "Optional, but speeds up approval"],
    ],
    rider: [
      ["vehicle_type", "Vehicle", "select", true, "", ["motorcycle", "bicycle", "car", "van", "truck"]],
      ["plate_number", "Plate number", "text", true],
      ["licence_number", "Driver's licence number", "text", true],
      ["city", "City you'll ride in", "text", true],
    ],
    employee: [
      [
        "employee_type",
        "Your role",
        "select",
        true,
        "",
        ["nutritionist", "supply_manager", "quality_assurance", "packaging_delivery", "health_specialist", "supplier"],
      ],
      ["city", "City", "text", false],
    ],
    trainer: [
      ["expertise", "What do you teach?", "text", true, "e.g. CV writing, customer service"],
      ["experience_years", "Years of experience", "number", true],
      ["profile_url", "LinkedIn or portfolio link", "url", false, "https://"],
      ["bio", "Short bio", "textarea", false],
    ],
  };
  const NICE = {
    motorcycle: "Motorcycle",
    bicycle: "Bicycle",
    car: "Car",
    van: "Van",
    truck: "Truck",
    nutritionist: "Nutritionist",
    supply_manager: "Supply manager",
    quality_assurance: "Quality assurance",
    packaging_delivery: "Packaging & delivery",
    health_specialist: "Health specialist",
    supplier: "Supplier",
  };
  const FIELD_LABEL = Object.fromEntries(
    Object.values(DETAILS)
      .flat()
      .map(([k, l]) => [k, l]),
  );
  const label = (product, role) =>
    role === "admin"
      ? product === "rehohub"
        ? "Super administrator"
        : RH.PRODUCT_NAME[product] + " administrator"
      : RH.PRODUCT_NAME[product] + " " + (RH.ROLE_LABEL[product + ":" + role] || role).toLowerCase();

  function detailFields(role, values = {}) {
    return (DETAILS[role] || [])
      .map(([k, l, type, req, hint, opts]) => {
        const id = "d_" + k;
        const v = values[k] ?? "";
        let input;
        if (type === "select")
          input = `<select class="inp" id="${id}" name="d.${k}" ${req ? "required" : ""}><option value="">Choose…</option>${opts
            .map((o) => `<option value="${o}" ${v === o ? "selected" : ""}>${NICE[o] || o}</option>`)
            .join("")}</select>`;
        else if (type === "textarea")
          input = `<textarea class="inp" id="${id}" name="d.${k}" maxlength="600">${esc(v)}</textarea>`;
        else
          input = `<input class="inp" id="${id}" name="d.${k}" type="${type}" ${type === "number" ? 'min="0" max="60" inputmode="numeric"' : ""} value="${esc(v)}" placeholder="${esc(
            hint || "",
          )}" ${req ? "required" : ""} maxlength="200">`;
        return `<label class="field" for="${id}"><span>${l}${req ? "" : " (optional)"}</span>${input}</label>`;
      })
      .join("");
  }
  const readDetails = (form) =>
    Object.fromEntries(
      $$("[name^='d.']", form)
        .filter((x) => x.value.trim() !== "")
        .map((x) => [x.name.slice(2), x.value.trim()]),
    );

  // Two sides: accounts people can use straight away, and accounts our team approves first.
  function roleChooser(name, selected, exclude = []) {
    const opts = OPTIONS.filter((o) => !exclude.includes(o.product + ":" + o.role));
    const item = (o) =>
      `<label class="role"><input type="radio" name="${name}" value="${o.product}:${o.role}" ${selected === o.product + ":" + o.role ? "checked" : ""} required><span><b>${o.title}</b><small>${o.sub}</small></span></label>`;
    const col = (title, sub, list) =>
      list.length
        ? `<div class="roles__col"><p class="roles__h">${title}<small>${sub}</small></p>${list.map(item).join("")}</div>`
        : "";
    return `<div class="roles" role="radiogroup" aria-label="What you are signing up for">${col(
      "For users",
      "Ready as soon as you confirm your email",
      opts.filter((o) => !o.review),
    )}${col(
      "Needs approval",
      "Our team reviews these first",
      opts.filter((o) => o.review),
    )}</div>`;
  }

  // ---------------------------------------------------------------- form helpers
  function clearErrors(form) {
    $$(".ferr", form).forEach((e) => e.remove());
    $$(".bad", form).forEach((e) => e.classList.remove("bad"));
    const n = $("[data-msg]", form);
    if (n) {
      n.hidden = true;
      n.textContent = "";
    }
  }
  function showError(form, err) {
    const n = $("[data-msg]", form);
    let first = null;
    Object.entries(err.fields || {}).forEach(([k, msg]) => {
      const el =
        form.querySelector(`[name="${k}"], [name="d.${k}"]`) ||
        (k === "role" ? form.querySelector("[name=pick]") : null);
      if (!el) return;
      const host = el.closest(".field") || el.closest(".check") || el.closest("fieldset") || el.parentElement;
      if (el.classList.contains("inp")) el.classList.add("bad");
      const p = document.createElement("span");
      p.className = "ferr";
      p.textContent = msg;
      host.appendChild(p);
      first = first || el;
    });
    if (n) {
      n.className = "note note--bad";
      n.textContent = err.message;
      n.hidden = false;
    }
    (first || n)?.focus?.();
  }
  function note(form, text, kind = "ok") {
    const n = $("[data-msg]", form);
    n.className = "note note--" + kind;
    n.textContent = text;
    n.hidden = false;
  }
  async function submitting(form, fn) {
    const b = $("button[type=submit], button:not([type])", form);
    clearErrors(form);
    if (b) b.disabled = true;
    try {
      await fn();
    } catch (e) {
      showError(form, e);
    } finally {
      if (b) b.disabled = false;
    }
  }
  function toast(text) {
    let t = $(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove("on"), 3000);
  }
  // show/hide password buttons
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pw]");
    if (!b) return;
    const i = b.parentElement.querySelector("input");
    const show = i.type === "password";
    i.type = show ? "text" : "password";
    b.textContent = show ? "Hide" : "Show";
    b.setAttribute("aria-pressed", String(show));
  });
  const clearHash = () => history.replaceState(null, "", location.pathname + location.search);

  // ---------------------------------------------------------------- pages
  const P = {};

  P.login = async () => {
    const f = $("#login");
    const next = RH.safeNext(params.get("next"), RH.url("account/index.html"));
    const s = await RH.session().catch((e) => (note(f, e.message, "bad"), null));
    if (s && s.user) return location.replace(next);
    $("[data-register]").href = RH.url(
      "account/register.html" + (params.get("next") ? "?next=" + encodeURIComponent(params.get("next")) : ""),
    );
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(f, async () => {
        try {
          await RH.call("auth/login", { method: "POST", body: { email: f.email.value, password: f.password.value } });
          location.href = next;
        } catch (err) {
          if (err.code === "unverified") {
            showError(f, err);
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn btn--line btn--sm";
            b.textContent = "Send a new confirmation link";
            b.onclick = async () => {
              b.disabled = true;
              try {
                const r = await RH.call("auth/resend", { method: "POST", body: { email: f.email.value } });
                note(f, r.message);
              } catch (x) {
                showError(f, x);
              }
            };
            $("[data-msg]", f).after(b);
          } else throw err;
        }
      });
    });
  };

  P.register = () => {
    const f = $("#register");
    const pre = params.get("product") && params.get("role") ? params.get("product") + ":" + params.get("role") : "";
    $("[data-roles]").innerHTML = roleChooser("pick", pre);
    const syncDetails = () => {
      const v = (f.querySelector("[name=pick]:checked") || {}).value || "";
      const role = v.split(":")[1];
      $("[data-details]").innerHTML = detailFields(role);
      const o = OPTIONS.find((x) => x.product + ":" + x.role === v);
      $("[data-review]").hidden = !(o && o.review);
    };
    f.addEventListener("change", (e) => e.target.name === "pick" && syncDetails());
    syncDetails();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(f, async () => {
        if (f.password.value !== f.password2.value) {
          throw new RH.ApiError("The passwords don't match.", "invalid", { password2: "The passwords don't match." });
        }
        const [product, role] = ((f.querySelector("[name=pick]:checked") || {}).value || ":").split(":");
        const r = await RH.call("auth/register", {
          method: "POST",
          body: {
            full_name: f.full_name.value,
            email: f.email.value,
            phone: f.phone.value,
            password: f.password.value,
            product,
            role,
            details: readDetails(f),
            accept_terms: f.accept_terms.checked,
          },
        });
        $("[data-done-email]").textContent = f.email.value.trim();
        $("#step-form").hidden = true;
        $("#step-done").hidden = false;
        $("#step-done h1").focus();
        $("[data-resend]").onclick = async (ev) => {
          ev.target.disabled = true;
          try {
            const x = await RH.call("auth/resend", { method: "POST", body: { email: f.email.value } });
            toast(x.message);
          } catch (x) {
            toast(x.message);
          }
        };
        return r;
      });
    });
  };

  P.verify = async () => {
    const out = $("#out");
    const token = hashToken();
    clearHash();
    if (!token) {
      out.innerHTML = `<div class="note note--bad">This page needs the link from your email. Open the link again, or <a href="login.html">sign in</a>.</div>`;
      return;
    }
    try {
      const s = await RH.call("auth/verify", { method: "POST", body: { token } });
      const pending = s.user.memberships.filter((m) => m.status === "pending");
      const ready = s.user.memberships.filter((m) => m.status === "approved");
      out.innerHTML = `<div class="big-ico" aria-hidden="true">✓</div><h1 class="center" tabindex="-1">Email confirmed</h1>
        ${pending.length ? `<div class="note note--warn">Your ${pending.map((m) => esc(label(m.product, m.role))).join(", ")} application is now with our team. We'll email you when it's approved.</div>` : ""}
        ${ready.map((m) => `<a class="btn btn--block" href="${RH.url(RH.OPEN[m.product + ":" + m.role] || "account/index.html")}">Open ${esc(RH.PRODUCT_NAME[m.product])}</a>`).join("")}
        <a class="btn btn--ghost btn--block" href="index.html">Go to My account</a>`;
      $("h1", out).focus();
    } catch (e) {
      out.innerHTML = `<div class="note note--bad">${esc(e.message)}</div><a class="btn btn--line btn--block" href="login.html">Sign in to request a new link</a>`;
    }
  };

  P.forgot = () => {
    const f = $("#forgot");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const r = await RH.call("auth/forgot", { method: "POST", body: { email: f.email.value } });
        note(f, r.message);
      });
    });
  };

  P.reset = () => {
    const f = $("#reset");
    const token = hashToken();
    clearHash();
    if (!token) {
      note(f, "This page needs the link from your email. Request a new one from 'Forgot password'.", "bad");
      $("button", f).disabled = true;
      return;
    }
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(f, async () => {
        if (f.password.value !== f.password2.value)
          throw new RH.ApiError("The passwords don't match.", "invalid", { password2: "The passwords don't match." });
        const r = await RH.call("auth/reset", { method: "POST", body: { token, password: f.password.value } });
        f.innerHTML = `<div class="note note--ok">${esc(r.message)}</div><a class="btn btn--block" href="login.html">Sign in</a>`;
      });
    });
  };

  P.invite = async () => {
    const out = $("#out");
    let token = hashToken();
    if (token) sessionStorage.setItem("rh-invite", token);
    else token = sessionStorage.getItem("rh-invite") || "";
    clearHash();
    if (!token) {
      out.innerHTML = `<div class="note note--bad">This page needs the invitation link from your email.</div>`;
      return;
    }
    let info;
    try {
      info = await RH.call("invites/check", { method: "POST", body: { token } });
    } catch (e) {
      sessionStorage.removeItem("rh-invite");
      out.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      return;
    }
    const what = esc(label(info.product, info.role));
    const accept = async (body, form) => {
      await RH.call("invites/accept", { method: "POST", body: { token, ...body } });
      sessionStorage.removeItem("rh-invite");
      location.href =
        info.role === "admin" ? "admin.html" : RH.url(RH.OPEN[info.product + ":" + info.role] || "account/index.html");
    };
    if (info.account_exists && !info.signed_in_as_invitee) {
      out.innerHTML = `<h1>You're invited</h1><p>You've been invited to join as <b>${what}</b>. You already have a Rehohub account with <b>${esc(info.email)}</b>. Sign in with it to accept.</p>
        <a class="btn btn--block" href="login.html?next=${encodeURIComponent(location.pathname)}">Sign in to accept</a>`;
      return;
    }
    if (info.account_exists) {
      out.innerHTML = `<h1>You're invited</h1><p>Accept to add <b>${what}</b> to your account (${esc(info.email)}).</p><form id="acc" novalidate><div data-msg hidden></div><button class="btn btn--block">Accept invitation</button></form>`;
      const f = $("#acc");
      f.addEventListener("submit", (e) => (e.preventDefault(), submitting(f, () => accept({}, f))));
      return;
    }
    out.innerHTML = `<h1>You're invited</h1><p>Create your account to join as <b>${what}</b>.</p>
      <form id="acc" novalidate>
        <label class="field"><span>Email</span><input class="inp" value="${esc(info.email)}" disabled></label>
        <label class="field"><span>Full name</span><input class="inp" name="full_name" autocomplete="name" required></label>
        <label class="field"><span>Choose a password</span><span class="pw"><input class="inp" name="password" type="password" autocomplete="new-password" required><button type="button" data-pw>Show</button></span><small>At least 10 characters.</small></label>
        <div data-msg hidden></div><button class="btn btn--block">Create account and accept</button></form>`;
    const f = $("#acc");
    f.addEventListener(
      "submit",
      (e) => (
        e.preventDefault(), submitting(f, () => accept({ full_name: f.full_name.value, password: f.password.value }, f))
      ),
    );
  };

  P.setup = async () => {
    const out = $("#out");
    let st;
    try {
      st = await RH.call("setup/status");
    } catch (e) {
      out.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      return;
    }
    if (!st.needed) {
      out.innerHTML = `<h1>Setup is complete</h1><p>An administrator already exists. New administrators are invited from the admin console.</p><a class="btn btn--block" href="login.html">Sign in</a>`;
      return;
    }
    if (!st.token_configured) {
      out.innerHTML = `<h1>Setup is turned off</h1><p>Add a <code>setup_token</code> (24+ characters) to your private config file on the server, then reload this page. See DEPLOY.md, step 6.</p>`;
      return;
    }
    $("#setup").hidden = false;
    const f = $("#setup");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(f, async () => {
        if (f.password.value !== f.password2.value)
          throw new RH.ApiError("The passwords don't match.", "invalid", { password2: "The passwords don't match." });
        await RH.call("setup", {
          method: "POST",
          body: {
            setup_token: f.setup_token.value,
            full_name: f.full_name.value,
            email: f.email.value,
            password: f.password.value,
          },
        });
        location.href = "admin.html";
      });
    });
  };

  // ---------------------------------------------------------------- my account
  async function needUser() {
    let s;
    try {
      s = await RH.session(true);
    } catch (e) {
      $("main").innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      throw e;
    }
    if (!s.user) {
      location.replace(RH.loginUrl());
      throw new Error("redirect");
    }
    $$("[data-admin-link]").forEach((a) => (a.hidden = !(s.user.super_admin || s.user.admin_products.length)));
    $$("[data-logout]").forEach((b) => (b.onclick = () => RH.logout()));
    return s.user;
  }

  P.account = async () => {
    const draw = (user) => {
      $("[data-hello]").textContent = "Hello, " + user.full_name.split(" ")[0];
      $("[data-email]").textContent = user.email;
      const ms = user.memberships;
      $("#roles").innerHTML = ms.length
        ? `<ul class="list">${ms
            .map((m) => {
              const open = m.status === "approved" && RH.OPEN[m.product + ":" + m.role];
              return `<li><div><b>${esc(label(m.product, m.role))}</b><small>${
                m.status === "pending"
                  ? "Waiting for approval · applied " + fmt(m.created_at)
                  : m.status === "rejected"
                    ? "Not approved" + (m.review_note ? ": " + esc(m.review_note) : "") + " · you can apply again below"
                    : m.status === "suspended"
                      ? "Suspended" + (m.review_note ? ": " + esc(m.review_note) : "")
                      : m.review_note === "Invited"
                        ? "Added by invitation"
                        : "Active"
              }</small></div><div class="row"><span class="st st--${m.status}">${m.status}</span>${
                open
                  ? `<a class="btn btn--sm" href="${RH.url(open)}">Open</a>`
                  : m.role === "admin"
                    ? `<a class="btn btn--sm" href="admin.html">Admin console</a>`
                    : ""
              }</div></li>`;
            })
            .join("")}</ul>`
        : `<p class="mute">Nothing yet. Add a product below.</p>`;
      const have = ms.filter((m) => m.status !== "rejected").map((m) => m.product + ":" + m.role);
      const want = (new URLSearchParams(location.hash.slice(1)).get("apply") || "").replace(/[^a-z:]/g, "");
      $("[data-apply-roles]").innerHTML = roleChooser("pick", have.includes(want) ? "" : want, have);
      $("[data-apply-details]").innerHTML = "";
      const pf = $("#profile");
      pf.full_name.value = user.full_name;
      pf.phone.value = user.phone || "";
      if (want && !have.includes(want)) {
        syncApply();
        $("#apply").scrollIntoView({ block: "start" });
      }
    };
    const syncApply = () => {
      const v = ($("#apply [name=pick]:checked") || {}).value || "";
      $("[data-apply-details]").innerHTML = detailFields(v.split(":")[1]);
    };
    const user = await needUser();
    draw(user);
    $("#apply").addEventListener("change", (e) => e.target.name === "pick" && syncApply());
    $("#apply").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        const [product, role] = (($("[name=pick]:checked", f) || {}).value || ":").split(":");
        const r = await RH.call("me/memberships", { method: "POST", body: { product, role, details: readDetails(f) } });
        history.replaceState(null, "", location.pathname);
        draw(r.user);
        note(f, r.message);
      });
    });
    $("#profile").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        const r = await RH.call("me/profile", {
          method: "POST",
          body: { full_name: f.full_name.value, phone: f.phone.value },
        });
        note(f, r.message);
        draw((await RH.session(true)).user);
      });
    });
    $("#password").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        const r = await RH.call("me/password", {
          method: "POST",
          body: { current_password: f.current_password.value, new_password: f.new_password.value },
        });
        f.reset();
        note(f, r.message);
      });
    });
  };

  // ---------------------------------------------------------------- admin console
  P.admin = async () => {
    const user = await needUser();
    if (!user.super_admin && !user.admin_products.length) {
      $("main").innerHTML =
        `<div class="card"><h1>Not available</h1><p class="mute">Only administrators can open this page.</p><a class="btn" href="index.html">My account</a></div>`;
      return;
    }
    const products = user.super_admin ? ["aipay", "aimove", "greenfed", "airise"] : user.admin_products;
    $("[data-scope]").textContent = user.super_admin
      ? "Super administrator · all products"
      : "Administrator · " + products.map((p) => RH.PRODUCT_NAME[p]).join(", ");
    $$("[data-super]").forEach((x) => (x.hidden = !user.super_admin));
    $("#f-product").innerHTML =
      `<option value="">All products</option>` +
      products.map((p) => `<option value="${p}">${RH.PRODUCT_NAME[p]}</option>`).join("");

    // tabs
    const show = (name) => {
      $$("[role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
      $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
      loaders[name]();
    };
    $$("[role=tab]").forEach((t) => (t.onclick = () => show(t.dataset.tab)));

    // applications
    async function loadApps() {
      const qs = new URLSearchParams({
        status: $("#f-status").value,
        product: $("#f-product").value,
        q: $("#f-q").value.trim(),
      });
      const box = $("#apps");
      box.innerHTML = `<p class="mute">Loading…</p>`;
      try {
        const r = await RH.call("admin/memberships?" + qs);
        const sum = await RH.call("admin/summary");
        const n = sum.pending.reduce((a, x) => a + Number(x.n), 0);
        $("[data-pending-n]").textContent = n;
        $("[data-pending-n]").hidden = !n;
        box.innerHTML = r.items.length
          ? r.items
              .map((m) => {
                const det = Object.entries(m.details || {})
                  .map(
                    ([k, v]) =>
                      `<dt>${esc(FIELD_LABEL[k] || k)}</dt><dd>${k === "profile_url" ? `<a href="${esc(v)}" rel="noopener noreferrer" target="_blank">${esc(v)}</a>` : esc(NICE[v] || v)}</dd>`,
                  )
                  .join("");
                const acts = {
                  pending: [
                    ["approve", "Approve", "btn--ok"],
                    ["reject", "Reject", "btn--bad"],
                  ],
                  rejected: [["approve", "Approve", "btn--ok"]],
                  approved: [["suspend", "Suspend", "btn--ghost"]],
                  suspended: [["reinstate", "Reinstate", "btn--ok"]],
                }[m.status];
                const self = Number(m.user_id) === Number(user.id);
                return `<article class="app-item"><div class="app-item__head"><div><b>${esc(m.full_name)}</b> · <span class="mute">${esc(m.email)}</span><br><small>${esc(label(m.product, m.role))} · applied ${fmt(
                  m.created_at,
                )}${m.account_status !== "active" ? ` · account <span class="st st--${m.account_status}">${m.account_status.replace("_", " ")}</span>` : ""}</small></div><span class="st st--${m.status}">${m.status}</span></div>
                  <dl>${m.phone ? `<dt>Phone</dt><dd>${esc(m.phone)}</dd>` : ""}<dt>Email confirmed</dt><dd>${m.email_verified_at ? "Yes" : "Not yet"}</dd>${det}${aipayStore(m)}${
                    m.reviewed_at
                      ? `<dt>Reviewed</dt><dd>${fmt(m.reviewed_at)}${m.reviewer ? " by " + esc(m.reviewer) : ""}${m.review_note ? " · " + esc(m.review_note) : ""}</dd>`
                      : ""
                  }</dl>
                  ${!self ? aipayFeeButtons(m) : ""}
                  ${
                    self
                      ? `<p class="mute">This is your own account; another administrator must review it.</p>`
                      : `<div class="row">${(acts || [])
                          .map(
                            ([d, t, c]) =>
                              `<button class="btn btn--sm ${c}" data-decide="${d}" data-id="${m.id}" data-who="${esc(m.full_name)}">${t}</button>`,
                          )
                          .join("")}</div>`
                  }</article>`;
              })
              .join("")
          : `<p class="mute">No applications match.</p>`;
      } catch (e) {
        box.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      }
    }
    $("#filters").addEventListener("submit", (e) => (e.preventDefault(), loadApps()));
    $("#f-status").onchange = loadApps;
    $("#f-product").onchange = loadApps;

    // AiPay stores: store profile and the one-off review fee (paid by bank transfer to Rehohub).
    const FEE_LABEL = {
      no_store: "Store profile not set up yet",
      unpaid: "Not paid yet",
      submitted: "Merchant says they paid: check the Rehohub Moniepoint account",
      confirmed: "Confirmed",
      rejected: "Not received",
    };
    function aipayStore(m) {
      const s = m.aipay_store;
      if (!s) return "";
      const rows = [["AiPay review fee", FEE_LABEL[s.fee_status] || s.fee_status]];
      if (s.fee_sender)
        rows.push([
          "Paid from",
          `${s.fee_sender} (${s.fee_bank || ""})${s.fee_submitted_at ? " · " + fmt(s.fee_submitted_at) : ""}`,
        ]);
      if (s.fee_note) rows.push(["Fee note", s.fee_note]);
      if (s.fee_status !== "no_store") {
        rows.push(["Store", [s.business_name, s.category].filter(Boolean).join(" · ")]);
        rows.push(["Store address", [s.city, s.state].filter(Boolean).join(", ")]);
        if (s.reg_number) rows.push(["ID / CAC number", s.reg_number]);
        if (s.social) rows.push(["Social", s.social]);
        rows.push(["Payout account", s.bank]);
      }
      return rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    }
    function aipayFeeButtons(m) {
      const s = m.aipay_store;
      if (!s || !["submitted", "rejected"].includes(s.fee_status)) return "";
      return `<div class="row"><button class="btn btn--sm btn--ok" data-fee="confirm" data-uid="${m.user_id}" data-who="${esc(m.full_name)}">Confirm fee received</button>${
        s.fee_status === "submitted"
          ? `<button class="btn btn--sm btn--bad" data-fee="reject" data-uid="${m.user_id}" data-who="${esc(m.full_name)}">Fee not received</button>`
          : ""
      }</div>`;
    }
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-fee]");
      if (!b) return;
      const confirmIt = b.dataset.fee === "confirm";
      let note = "";
      if (confirmIt) {
        if (!confirm(`Confirm that the AiPay review fee from ${b.dataset.who} is in the Rehohub account?`)) return;
      } else {
        note = (prompt(`Why couldn't you confirm ${b.dataset.who}'s payment? They will see this.`) || "").trim();
        if (!note) return;
      }
      b.disabled = true;
      try {
        const r = await RH.call("admin/aipay/fee", {
          method: "POST",
          body: { user_id: Number(b.dataset.uid), decision: b.dataset.fee, note },
        });
        toast(r.message || "Saved.");
        loadApps();
      } catch (err) {
        toast(err.message);
        b.disabled = false;
      }
    });

    // decision dialog
    const dlg = $("#decide");
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-decide]");
      if (!b) return;
      const f = $("form", dlg);
      f.id_.value = b.dataset.id;
      f.decision.value = b.dataset.decide;
      $("[data-dlg-title]", dlg).textContent = b.textContent + " " + b.dataset.who + "?";
      f.note.required = b.dataset.decide === "reject";
      $("[data-note-label]", dlg).textContent =
        b.dataset.decide === "reject" ? "Reason (sent to the applicant)" : "Note (optional, sent to the applicant)";
      f.note.value = "";
      clearErrors(f);
      dlg.showModal();
    });
    $("[data-cancel]", dlg).onclick = () => dlg.close();
    $("form", dlg).addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        await RH.call("admin/memberships/decide", {
          method: "POST",
          body: { id: Number(f.id_.value), decision: f.decision.value, note: f.note.value },
        });
        dlg.close();
        toast("Saved. The applicant has been emailed.");
        loadApps();
      });
    });

    // users (super admin)
    async function loadUsers() {
      const box = $("#users");
      box.innerHTML = `<p class="mute">Loading…</p>`;
      try {
        const qs = new URLSearchParams({ q: $("#u-q").value.trim(), status: $("#u-status").value });
        const r = await RH.call("admin/users?" + qs);
        box.innerHTML = `<div class="tbl"><table><thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Joined</th><th>Last sign-in</th><th>Status</th></tr></thead><tbody>${r.items
          .map(
            (u) =>
              `<tr><td><b>${esc(u.full_name)}</b>${u.phone ? `<br><small class="mute">${esc(u.phone)}</small>` : ""}</td><td>${esc(u.email)}</td><td>${u.memberships
                .map(
                  (m) =>
                    `<span class="st st--${m.status}" style="margin:0 4px 4px 0">${esc(label(m.product, m.role))}</span>`,
                )
                .join("")}</td><td>${fmt(u.created_at)}</td><td>${fmt(u.last_login_at)}</td><td>${
                Number(u.id) === Number(user.id) || u.status === "pending_verification"
                  ? `<span class="st st--${u.status}">${u.status.replace("_", " ")}</span>`
                  : `<select data-ustatus="${u.id}" aria-label="Status for ${esc(u.full_name)}">${[
                      "active",
                      "warning",
                      "suspended",
                      "banned",
                      "deactivated",
                    ]
                      .map((s) => `<option value="${s}" ${u.status === s ? "selected" : ""}>${s}</option>`)
                      .join("")}</select>`
              }</td></tr>`,
          )
          .join("")}</tbody></table></div>${r.items.length ? "" : `<p class="mute">No users match.</p>`}`;
      } catch (e) {
        box.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      }
    }
    $("#ufilters").addEventListener("submit", (e) => (e.preventDefault(), loadUsers()));
    $("#u-status").onchange = loadUsers;
    document.addEventListener("change", async (e) => {
      const s = e.target.closest("[data-ustatus]");
      if (!s) return;
      const noteText =
        s.value === "active"
          ? ""
          : prompt(`Reason for setting this account to "${s.value}" (sent to the person):`) || "";
      try {
        await RH.call("admin/users/status", {
          method: "POST",
          body: { id: Number(s.dataset.ustatus), status: s.value, note: noteText },
        });
        toast("Status updated");
      } catch (x) {
        toast(x.message);
      }
      loadUsers();
    });

    // invitations
    const inv = $("#invite");
    const roleOpts = () => {
      const p = inv.product.value;
      const roles =
        p === "rehohub"
          ? ["admin"]
          : {
              aipay: ["customer", "merchant"],
              aimove: ["customer", "rider"],
              greenfed: ["customer", "employee"],
              airise: ["customer", "trainer"],
            }[p] || [];
      const all = user.super_admin && p !== "rehohub" ? [...roles, "admin"] : roles;
      inv.role.innerHTML = all
        .map(
          (r) => `<option value="${r}">${r === "admin" ? "Administrator" : RH.ROLE_LABEL[p + ":" + r] || r}</option>`,
        )
        .join("");
      syncInvRole();
    };
    const syncInvRole = () => {
      $("[data-inv-details]").innerHTML = inv.role.value === "employee" ? detailFields("employee") : "";
    };
    inv.product.innerHTML =
      (user.super_admin ? `<option value="rehohub">Rehohub (all products)</option>` : "") +
      products.map((p) => `<option value="${p}">${RH.PRODUCT_NAME[p]}</option>`).join("");
    if (user.super_admin) inv.product.value = products[0];
    inv.product.onchange = roleOpts;
    inv.role.onchange = syncInvRole;
    roleOpts();
    inv.addEventListener("submit", (e) => {
      e.preventDefault();
      submitting(inv, async () => {
        const r = await RH.call("admin/invites", {
          method: "POST",
          body: { email: inv.email.value, product: inv.product.value, role: inv.role.value, details: readDetails(inv) },
        });
        inv.email.value = "";
        note(inv, r.message);
        loadInvites();
      });
    });
    async function loadInvites() {
      const box = $("#invites");
      try {
        const r = await RH.call("admin/invites");
        box.innerHTML = r.items.length
          ? `<ul class="list">${r.items
              .map(
                (i) =>
                  `<li><div><b>${esc(i.email)}</b><small>${esc(label(i.product, i.role))}${i.details && i.details.employee_type ? " · " + esc(NICE[i.details.employee_type]) : ""} · sent ${fmt(i.created_at)}${
                    i.invited_by ? " by " + esc(i.invited_by) : ""
                  }</small></div><div class="row"><span class="st st--${i.state}">${i.state}</span>${
                    i.state === "pending"
                      ? `<button class="btn btn--ghost btn--sm" data-revoke="${i.id}">Revoke</button>`
                      : ""
                  }</div></li>`,
              )
              .join("")}</ul>`
          : `<p class="mute">No invitations yet.</p>`;
      } catch (e) {
        box.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      }
    }
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-revoke]");
      if (!b || !confirm("Revoke this invitation? The link will stop working.")) return;
      try {
        await RH.call("admin/invites/revoke", { method: "POST", body: { id: Number(b.dataset.revoke) } });
        toast("Invitation revoked");
      } catch (x) {
        toast(x.message);
      }
      loadInvites();
    });

    // audit (super admin)
    async function loadAudit() {
      const box = $("#audit");
      try {
        const r = await RH.call("admin/audit");
        box.innerHTML = `<div class="tbl"><table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Account</th><th>Details</th><th>IP</th></tr></thead><tbody>${r.items
          .map(
            (a) =>
              `<tr><td>${fmt(a.created_at)}</td><td>${esc(a.action.replace(/_/g, " "))}</td><td>${esc(a.actor || "—")}</td><td>${esc(a.target || "—")}</td><td><small>${esc(
                Object.entries(a.details || {})
                  .filter(([, v]) => v !== "" && v !== null)
                  .map(([k, v]) => k + ": " + v)
                  .join(" · "),
              )}</small></td><td><small>${esc(a.ip || "")}</small></td></tr>`,
          )
          .join("")}</tbody></table></div>`;
      } catch (e) {
        box.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      }
    }
    // AiRise courses: trainers' courses waiting for review, published or sent back.
    $$("[data-airise]").forEach((x) => (x.hidden = !products.includes("airise")));
    const C_ST = { review: "pending", published: "approved", changes: "rejected", draft: "pending" };
    const C_LABEL = {
      review: "waiting for review",
      published: "published",
      changes: "changes requested",
      draft: "draft",
    };
    const courseMsg = (m, bad) =>
      ($("[data-course-msg]").innerHTML = m ? `<div class="note ${bad ? "note--bad" : ""}">${esc(m)}</div>` : "");
    async function loadCourses() {
      const box = $("#courses");
      box.innerHTML = `<p class="mute">Loading…</p>`;
      try {
        const r = await RH.call("admin/airise/courses?status=" + $("#c-status").value);
        const link = (f) =>
          `<a href="${esc(RH.url("api/airise/file?id=" + f.id))}" target="_blank" rel="noopener">${esc(f.name)}</a>`;
        box.innerHTML =
          r.items
            .map((c) => {
              const d = c.data;
              const lessons = d.modules
                .map(
                  (m, i) =>
                    `<li><b>${esc(m.title || "Module " + (i + 1))}</b><ul>${m.lessons
                      .filter((l) => l.title)
                      .map(
                        (l) =>
                          `<li>${esc(l.title)} <small class="mute">(${esc(l.type)}, ${l.min || "?"} min)</small>${l.file ? " · " + link(l.file) : ""}</li>`,
                      )
                      .join("")}</ul></li>`,
                )
                .join("");
              const qs = d.questions
                .map(
                  (q) =>
                    `<li>${esc(q.text)}<br><small>${q.opts
                      .map((o, k) => (o ? (k === q.correct ? `<b>✓ ${esc(o)}</b>` : esc(o)) : ""))
                      .filter(Boolean)
                      .join(" · ")}</small></li>`,
                )
                .join("");
              const acts = {
                review: [
                  ["publish", "Publish", "btn--ok"],
                  ["changes", "Ask for changes", "btn--bad"],
                ],
                published: [["unpublish", "Take down", "btn--bad"]],
              }[c.status];
              return `<article class="app-item"><div class="app-item__head"><div><b>${esc(c.title)}</b> · <span class="mute">${esc(c.trainer)} (${esc(c.email)})</span><br><small>${esc(d.track)} · ${esc(d.level)} · about ${d.hours} hours${c.submitted ? " · sent " + fmt(c.submitted) : ""}${c.status === "published" ? " · " + c.learners + " learners" : ""}</small></div><span class="st st--${C_ST[c.status]}">${C_LABEL[c.status]}</span></div>
                <dl><dt>Summary</dt><dd>${esc(d.summary)}</dd>${d.outcomes ? `<dt>Outcomes</dt><dd>${esc(d.outcomes)}</dd>` : ""}<dt>Skills</dt><dd>${esc(d.skills.join(", ") || "None")}</dd><dt>Cover</dt><dd>${d.cover ? link(d.cover) : "None"}</dd>
                <dt>Lessons</dt><dd><ul style="margin:0;padding-left:18px">${lessons}</ul></dd><dt>Quiz</dt><dd>${qs ? `<ol style="margin:0;padding-left:18px">${qs}</ol>Pass mark ${d.pass}%` : "No quiz"}${d.scenario ? `<br>Scenario: ${esc(d.scenario)}` : ""}</dd>${c.note ? `<dt>Last note</dt><dd>${esc(c.note)}</dd>` : ""}</dl>
                <div class="row"><a class="btn btn--sm btn--ghost" href="${esc(RH.url("products/airise/learn.html?course=t" + c.id))}" target="_blank" rel="noopener">Preview</a>${(
                  acts || []
                )
                  .map(
                    ([k, t, cl]) =>
                      `<button class="btn btn--sm ${cl}" data-course="${c.id}" data-decision="${k}" data-title="${esc(c.title)}">${t}</button>`,
                  )
                  .join("")}</div></article>`;
            })
            .join("") || `<p class="mute">No courses here.</p>`;
      } catch (e) {
        box.innerHTML = `<div class="note note--bad">${esc(e.message)}</div>`;
      }
    }
    $("#c-status").onchange = () => (courseMsg(""), loadCourses());
    $("#courses").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-decision]");
      if (!b) return;
      const k = b.dataset.decision;
      let note = "";
      if (k === "publish") {
        if (!confirm(`Publish "${b.dataset.title}" for all AiRise learners?`)) return;
      } else {
        note =
          prompt(
            k === "changes"
              ? "What should the trainer change? (they get this by email)"
              : "Why is it being taken down? (the trainer gets this by email)",
          ) || "";
        if (!note.trim()) return;
      }
      b.disabled = true;
      try {
        const r = await RH.call("admin/airise/review", {
          method: "POST",
          body: { id: +b.dataset.course, decision: k, note },
        });
        courseMsg(r.message);
        loadCourses();
      } catch (er) {
        courseMsg(er.message, true);
        b.disabled = false;
      }
    });
    const loaders = { apps: loadApps, users: loadUsers, invites: loadInvites, audit: loadAudit, courses: loadCourses };
    show("apps");
  };

  if (P[page])
    Promise.resolve()
      .then(() => P[page]())
      .catch((e) => e && e.message !== "redirect" && console.error(e));
})();
