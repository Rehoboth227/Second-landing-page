/* Public AiMove fare calculator (RehoTrans page). Needs aimove-pricing.js first.
   Renders into any element with [data-fare-calc]; the rate table into [data-fare-rates]. */
(() => {
  "use strict";
  const P = window.AiMovePricing;
  if (!P) return;
  const C = P.CONFIG;
  const naira = (n) => "₦" + Math.round(n).toLocaleString("en-NG");

  document.querySelectorAll("[data-fare-rates]").forEach((el) => {
    el.innerHTML = `<table>
      <caption class="sr-only">AiMove rates by vehicle</caption>
      <thead><tr><th scope="col">Vehicle</th><th scope="col">Base</th><th scope="col">Per km</th><th scope="col">Per min</th><th scope="col">Minimum</th></tr></thead>
      <tbody>${Object.values(C.vehicles)
        .map(
          (v) =>
            `<tr><td>${v.name}<small>up to ${v.maxKg.toLocaleString("en-NG")} kg</small></td><td>${naira(v.base)}</td><td>${naira(v.perKm)}</td><td>${naira(v.perMin)}</td><td>${naira(v.minFare)}</td></tr>`,
        )
        .join("")}</tbody></table>`;
  });

  document.querySelectorAll("[data-fare-calc]").forEach((el) => {
    const id = (n) => "fc-" + n + "-" + Math.random().toString(36).slice(2, 7);
    const ids = { km: id("km"), kg: id("kg"), veh: id("veh"), worth: id("worth"), peak: id("peak") };
    el.innerHTML = `<form class="fc" novalidate>
      <div class="fc__grid">
        <label for="${ids.km}"><span>Distance (km)</span><input id="${ids.km}" name="km" type="number" min="0.5" max="1500" step="0.5" value="14.5" inputmode="decimal"></label>
        <label for="${ids.kg}"><span>Weight (kg)</span><input id="${ids.kg}" name="kg" type="number" min="0.1" max="1000" step="0.5" value="5" inputmode="decimal"></label>
        <label for="${ids.veh}"><span>Vehicle</span><select id="${ids.veh}" name="vehicle"><option value="auto">Choose by weight</option>${Object.entries(
          C.vehicles,
        )
          .map(([k, v]) => `<option value="${k}">${v.name}</option>`)
          .join("")}</select></label>
        <label for="${ids.worth}"><span>Item value (₦, optional)</span><input id="${ids.worth}" name="worth" type="number" min="0" step="1000" value="" inputmode="numeric" placeholder="0"></label>
      </div>
      <fieldset class="fc__svc"><legend>Delivery type</legend>${["SAME_DAY", "EXPRESS", "INSTANT", "SCHEDULED"]
        .map(
          (k, i) =>
            `<label><input type="radio" name="service" value="${k}" ${i === 0 ? "checked" : ""}><span><b>${C.services[k].name}</b><small>${C.services[k].markup ? "+" + naira(C.services[k].markup) : "No markup"} · ${C.services[k].detail}</small></span></label>`,
        )
        .join("")}</fieldset>
      <label class="fc__peak" for="${ids.peak}"><input id="${ids.peak}" name="peak" type="checkbox"><span>Pickup at peak hours (${C.peak.label}, ×${C.peak.multiplier} on distance and time)</span></label>
    </form>
    <div class="fc__out" aria-live="polite"></div>`;
    const f = el.querySelector("form");
    const out = el.querySelector(".fc__out");
    const calc = () => {
      const q = P.quote({
        km: parseFloat(f.km.value),
        kg: parseFloat(f.kg.value),
        vehicle: f.vehicle.value,
        worth: parseFloat(f.worth.value),
        service: f.querySelector("[name=service]:checked").value,
        hour: f.peak.checked ? 8 : 12,
      });
      out.innerHTML = `<div class="fc__total"><small>Estimated fare · ${q.vehicleName}${q.upgraded ? " (upgraded for the weight)" : ""} · about ${q.minutes} min</small><b>${naira(q.total)}</b></div>
        <ul class="fc__lines">${q.lines
          .filter((l) => l.amount || l.key === "base")
          .map((l) => `<li><span>${l.label}</span><b>${naira(l.amount)}</b></li>`)
          .join("")}</ul>
        <p class="fc__split">Paid into escrow. When the recipient confirms with their 4-digit PIN, the rider receives <b>${naira(q.riderShare)}</b> (${Math.round(C.riderShare * 100)}% of the delivery fare) and AiMove keeps <b>${naira(q.platformFee)}</b>${q.protection ? ", including goods protection" : ""}.</p>`;
    };
    f.addEventListener("input", calc);
    f.addEventListener("change", calc);
    f.addEventListener("submit", (e) => e.preventDefault());
    calc();
  });
})();
