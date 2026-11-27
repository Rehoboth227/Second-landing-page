/* Rehohub accounts: browser client shared by the account pages and the product apps.
   It only talks to this site's own /api/ (same origin). The server decides who is signed in
   and what each person may do; this file just asks it and shows the right screen. */
(() => {
  "use strict";
  const script = document.currentScript;
  const ROOT = new URL("../../", script.src).href; // site root, works in a sub-folder too
  const API = ROOT + "api/";
  const PRODUCT_NAME = { aipay: "AiPay", aimove: "AiMove", greenfed: "GreenFed", airise: "AiRise", rehohub: "Rehohub" };
  const ROLE_NAME = {
    customer: "Customer",
    rider: "Rider",
    merchant: "Merchant",
    employee: "Employee",
    trainer: "Trainer",
    admin: "Administrator",
  };
  // Role names as each product calls them
  const ROLE_LABEL = {
    "aipay:customer": "Shopper",
    "aipay:merchant": "Merchant",
    "aimove:customer": "Customer",
    "aimove:rider": "Rider",
    "greenfed:customer": "Customer",
    "greenfed:employee": "Employee",
    "airise:customer": "Learner",
    "airise:trainer": "Trainer",
  };
  // Where each approved role opens
  const OPEN = {
    "aipay:customer": "products/aipay.html",
    "aipay:merchant": "products/aipay.html",
    "aimove:customer": "products/aimove.html",
    "aimove:rider": "products/aimove.html",
    "aimove:admin": "products/aimove.html",
    "aipay:admin": "products/aipay.html",
    "greenfed:customer": "products/greenfed.html",
    "greenfed:employee": "products/greenfed.html",
    "greenfed:admin": "products/greenfed.html",
    "airise:customer": "products/airise/dashboard.html",
    "airise:trainer": "products/airise/trainer.html",
    "airise:admin": "products/airise/dashboard.html",
  };

  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  let csrf = null;
  let current = null;

  class ApiError extends Error {
    constructor(message, code, fields, status) {
      super(message);
      this.code = code;
      this.fields = fields || {};
      this.status = status || 0;
    }
  }

  async function call(path, opts = {}, retry = true) {
    const method = opts.method || "GET";
    const init = { method, credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" };
    if (method === "POST") {
      if (!csrf) await session(true);
      init.headers["Content-Type"] = "application/json";
      init.headers["X-CSRF-Token"] = csrf || "";
      init.body = JSON.stringify(opts.body || {});
    }
    let res;
    try {
      res = await fetch(API + path, init);
    } catch (e) {
      throw new ApiError("We couldn't reach the server. Check your connection and try again.", "offline");
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new ApiError(
        res.status === 404 || location.protocol === "file:"
          ? "Accounts work on the live website only (the account service is not installed here)."
          : "The server sent an unexpected response. Please try again.",
        "unavailable",
      );
    }
    if (data.csrf) csrf = data.csrf;
    if ("user" in data) current = data;
    if (!res.ok || !data.ok) {
      if (data.error === "csrf" && retry) {
        await session(true);
        return call(path, opts, false);
      }
      throw new ApiError(data.message || "Something went wrong.", data.error, data.fields, res.status);
    }
    return data;
  }

  /** Sends raw bytes (a piece of a file) to an upload route; same session and CSRF checks as call(). */
  async function raw(path, blob, retry = true) {
    if (!csrf) await session(true);
    let res;
    try {
      res = await fetch(API + path, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/octet-stream", "X-CSRF-Token": csrf || "" },
        body: blob,
      });
    } catch (e) {
      throw new ApiError("The upload was interrupted. Check your connection and try again.", "offline");
    }
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      throw new ApiError(
        res.status === 413 ? "That file is too large for the server." : "The server sent an unexpected response.",
        "unavailable",
      );
    }
    if (data.csrf) csrf = data.csrf;
    if (!res.ok || !data.ok) {
      if (data.error === "csrf" && retry) {
        await session(true);
        return raw(path, blob, false);
      }
      throw new ApiError(data.message || "Something went wrong.", data.error, data.fields, res.status);
    }
    return data;
  }

  async function session(force) {
    if (current && !force) return current;
    return call("session");
  }

  const url = (path) => ROOT + path;

  function here() {
    return location.pathname + location.search + location.hash;
  }

  function loginUrl(next) {
    return url("account/login.html?next=" + encodeURIComponent(next || here()));
  }

  /** Only allow redirects back into this same website. */
  function safeNext(next, fallback) {
    if (!next) return fallback;
    try {
      const u = new URL(next, location.href);
      if (u.origin === location.origin && !/^(javascript|data):/i.test(next)) return u.href;
    } catch (e) {}
    return fallback;
  }

  async function logout(to) {
    try {
      await call("auth/logout", { method: "POST" });
    } catch (e) {}
    location.href = to || url("account/login.html");
  }

  const memberships = (user, product) =>
    user ? user.memberships.filter((m) => !product || m.product === product) : [];
  const isAdminFor = (user, product) => !!user && (user.super_admin || (user.admin_products || []).includes(product));

  /** Roles this person may use in a product right now (approved only). Admins of the product get "admin". */
  function rolesIn(user, product) {
    const roles = memberships(user, product)
      .filter((m) => m.status === "approved")
      .map((m) => m.role);
    if (isAdminFor(user, product) && !roles.includes("admin")) roles.push("admin");
    return roles;
  }

  // ---------------------------------------------------------------- page guard for product apps
  function overlay(html) {
    let el = document.getElementById("rh-guard");
    if (!el) {
      el = document.createElement("div");
      el.id = "rh-guard";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.style.cssText =
        "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(7,26,61,.6);backdrop-filter:blur(6px);font-family:Outfit,Poppins,system-ui,sans-serif";
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="background:#fff;color:#0b1b36;max-width:440px;width:100%;border-radius:18px;padding:26px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5);display:grid;gap:14px;text-align:center">${html}</div>`;
    const f = el.querySelector("a,button");
    if (f) f.focus();
    return el;
  }
  const btn = (href, text, primary) =>
    `<a href="${esc(href)}" style="display:inline-flex;justify-content:center;align-items:center;min-height:46px;padding:0 18px;border-radius:12px;font-weight:700;text-decoration:none;${
      primary ? "background:#1760BA;color:#fff" : "border:1.5px solid #e2e8f0;color:#33415c"
    }">${text}</a>`;

  /**
   * Requires a signed-in person with an approved role in `product`.
   * roles: list of roles that may use the page. Resolves with { user, roles } when allowed.
   */
  async function guard(product, roles) {
    const name = PRODUCT_NAME[product];
    overlay(`<p style="margin:0">Checking your ${name} account…</p>`);
    let s;
    try {
      s = await session(true);
    } catch (e) {
      overlay(
        `<h2 style="margin:0;font-size:22px">Can't check your account</h2><p style="margin:0;color:#64748b">${esc(e.message)}</p>${btn(location.href, "Try again", true)}${btn(url("index.html"), "Back to Rehohub")}`,
      );
      throw e;
    }
    const user = s.user;
    if (!user) {
      location.replace(loginUrl());
      return new Promise(() => {});
    }
    const mine = rolesIn(user, product);
    const allowed = mine.filter((r) => roles.includes(r) || r === "admin");
    if (allowed.length) {
      const el = document.getElementById("rh-guard");
      if (el) el.remove();
      return { user, roles: allowed };
    }
    const pending = memberships(user, product).filter((m) => roles.includes(m.role));
    const wanted = roles[0];
    let body;
    if (pending.some((m) => m.status === "pending")) {
      body = `<h2 style="margin:0;font-size:22px">Waiting for approval</h2><p style="margin:0;color:#64748b">Your ${name} application is being reviewed. We'll email ${esc(user.email)} as soon as it's approved.</p>`;
    } else if (pending.some((m) => m.status === "rejected" || m.status === "suspended")) {
      const m = pending.find((x) => x.status === "rejected" || x.status === "suspended");
      body = `<h2 style="margin:0;font-size:22px">${m.status === "rejected" ? "Application not approved" : "Access suspended"}</h2><p style="margin:0;color:#64748b">${
        m.review_note ? "Reason: " + esc(m.review_note) + ". " : ""
      }See My account for details, or contact info@rehohub.com.</p>`;
    } else {
      body = `<h2 style="margin:0;font-size:22px">Add ${name} to your account</h2><p style="margin:0;color:#64748b">You're signed in as ${esc(user.email)}, but ${name} isn't on your account yet.</p>${btn(
        url(`account/index.html#apply=${product}:${wanted}`),
        "Add " + name,
        true,
      )}`;
    }
    overlay(
      body +
        btn(url("account/index.html"), "My account") +
        `<button type="button" style="border:0;background:none;color:#1760BA;font:inherit;font-weight:600;cursor:pointer" onclick="RH.logout()">Sign out</button>`,
    );
    return new Promise(() => {});
  }

  window.RH = {
    call,
    raw,
    session,
    url,
    loginUrl,
    safeNext,
    logout,
    memberships,
    rolesIn,
    isAdminFor,
    guard,
    ApiError,
    esc,
    PRODUCT_NAME,
    ROLE_NAME,
    ROLE_LABEL,
    OPEN,
  };
})();
