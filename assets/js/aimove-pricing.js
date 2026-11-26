/* AiMove standard fare calculator (Nigerian naira).
   One place for every price. Used by the AiMove web app (send a package, review, payment,
   rider payouts) and by the public fare calculator on the RehoTrans page.

   Model, following how Nigerian ride-hailing and logistics services price trips:
   - Bolt / Gokada style: base fare + price per km + price per minute, with a minimum fare.
   - GIG Logistics style: weight brackets (no surcharge up to 5 kg).
   - Long trips (over 30 km, e.g. interstate) pay a lower per-km rate after the first 30 km.
   - Instant and Express carry a FIXED markup, the same at any distance.
   - Peak hours in Lagos traffic (7–10am, 5–8pm) multiply the distance and time charges.
   - A flat booking fee, optional goods protection for valuable items, rounded up to ₦50.
   - Riders keep 85% of the delivery fare; AiMove's commission is 15% (the booking fee and
     goods protection are not shared).
   Change the numbers in CONFIG to change prices everywhere. When bookings move to the server,
   the server must run the same calculation and ignore any price sent by the browser. */
(function (root) {
  "use strict";

  const CONFIG = {
    currency: "NGN",
    vehicles: {
      bike: { name: "Motorcycle", maxKg: 10, base: 500, perKm: 120, perMin: 15, minFare: 1200, speedKmh: 24 },
      car: { name: "Car", maxKg: 50, base: 1000, perKm: 200, perMin: 25, minFare: 2500, speedKmh: 20 },
      van: { name: "Van", maxKg: 1000, base: 3000, perKm: 400, perMin: 40, minFare: 6000, speedKmh: 18 },
    },
    // After the first 30 km the per-km rate halves and the trip is timed at highway speed.
    longDistance: { afterKm: 30, rateFactor: 0.5, speedKmh: 60 },
    // Weight brackets: [up to kg, surcharge]. Above the last bracket, add perKgAbove for every extra kg.
    weight: {
      brackets: [
        [5, 0],
        [10, 300],
        [20, 700],
        [50, 1500],
      ],
      perKgAbove: 30,
    },
    // Fixed markups by service type (the same at any distance).
    services: {
      SAME_DAY: { name: "Standard", detail: "Delivered the same day", markup: 0 },
      EXPRESS: { name: "Express", detail: "Delivered within 3 hours", markup: 800 },
      INSTANT: { name: "Instant", detail: "Picked up now, taken straight there", markup: 1500 },
      SCHEDULED: { name: "Scheduled", detail: "Pick a date and time slot", markup: 0 },
    },
    peak: {
      windows: [
        [7, 10],
        [17, 20],
      ],
      multiplier: 1.25,
      label: "7–10am and 5–8pm",
    },
    bookingFee: 200,
    protection: { freeUpTo: 50000, rate: 0.005, max: 5000 },
    roundTo: 50,
    riderShare: 0.85,
  };

  const isPeak = (hour) => CONFIG.peak.windows.some(([a, b]) => hour >= a && hour < b);

  /** Smallest vehicle that can carry the weight. */
  function pickVehicle(kg) {
    const order = ["bike", "car", "van"];
    return order.find((v) => kg <= CONFIG.vehicles[v].maxKg) || "van";
  }

  function weightSurcharge(kg) {
    const { brackets, perKgAbove } = CONFIG.weight;
    for (const [max, fee] of brackets) if (kg <= max) return fee;
    const [lastMax, lastFee] = brackets[brackets.length - 1];
    return lastFee + Math.ceil(kg - lastMax) * perKgAbove;
  }

  /**
   * quote({ km, kg, service, vehicle, hour, worth })
   * vehicle: "auto" (default), "bike", "car" or "van". A vehicle too small for the weight is upgraded.
   */
  function quote(opts) {
    const km = Math.max(0.5, Number(opts.km) || 0);
    const kg = Math.max(0.1, Number(opts.kg) || 1);
    const service = CONFIG.services[opts.service] ? opts.service : "SAME_DAY";
    const hour = Number.isFinite(opts.hour) ? opts.hour : new Date().getHours();
    const worth = Math.max(0, Number(opts.worth) || 0);
    const need = pickVehicle(kg);
    const rank = { bike: 0, car: 1, van: 2 };
    let vehicle = CONFIG.vehicles[opts.vehicle] ? opts.vehicle : need;
    const upgraded = rank[vehicle] < rank[need];
    if (upgraded) vehicle = need;
    const v = CONFIG.vehicles[vehicle];
    const L = CONFIG.longDistance;

    const nearKm = Math.min(km, L.afterKm);
    const farKm = Math.max(0, km - L.afterKm);
    const minutes = Math.round((nearKm / v.speedKmh) * 60 + (farKm / L.speedKmh) * 60);
    const distance = Math.round(nearKm * v.perKm + farKm * v.perKm * L.rateFactor);
    const time = Math.round(minutes * v.perMin);
    const peak = isPeak(hour);
    const surge = peak ? Math.round((distance + time) * (CONFIG.peak.multiplier - 1)) : 0;
    const weight = weightSurcharge(kg);
    const markup = CONFIG.services[service].markup;

    let deliveryFare = v.base + distance + time + surge + weight + markup;
    const minimumTopUp = Math.max(0, v.minFare - deliveryFare);
    deliveryFare += minimumTopUp;
    const protection =
      worth > CONFIG.protection.freeUpTo
        ? Math.min(CONFIG.protection.max, Math.round(worth * CONFIG.protection.rate))
        : 0;
    const raw = deliveryFare + CONFIG.bookingFee + protection;
    const total = Math.ceil(raw / CONFIG.roundTo) * CONFIG.roundTo;
    const rounding = total - raw;
    deliveryFare += rounding; // rounding goes to the delivery fare, so the rider shares it

    const fmtKm = (n) => (Math.round(n * 10) / 10).toLocaleString("en-NG");
    const lines = [
      { key: "base", label: `Base fare (${v.name})`, amount: v.base },
      {
        key: "distance",
        label: farKm
          ? `Distance: ${fmtKm(nearKm)} km × ₦${v.perKm} + ${fmtKm(farKm)} km × ₦${Math.round(v.perKm * L.rateFactor)}`
          : `Distance: ${fmtKm(km)} km × ₦${v.perKm}`,
        amount: distance,
      },
      { key: "time", label: `Time: about ${minutes} min × ₦${v.perMin}`, amount: time },
      { key: "weight", label: `Weight (${fmtKm(kg)} kg)`, amount: weight },
      { key: "surge", label: `Peak hours (${CONFIG.peak.label}), ×${CONFIG.peak.multiplier}`, amount: surge },
      { key: "service", label: `${CONFIG.services[service].name} service`, amount: markup },
      { key: "minimum", label: `Minimum fare top-up (₦${v.minFare.toLocaleString("en-NG")})`, amount: minimumTopUp },
      { key: "booking", label: "Booking fee", amount: CONFIG.bookingFee },
      { key: "protection", label: "Goods protection (0.5% of declared value)", amount: protection },
      { key: "rounding", label: "Rounded up to the nearest ₦50", amount: rounding },
    ];
    const riderShare = Math.round(deliveryFare * CONFIG.riderShare);
    return {
      v: 2,
      km,
      kg,
      minutes,
      service,
      serviceName: CONFIG.services[service].name,
      vehicle,
      vehicleName: v.name,
      upgraded,
      peak,
      lines,
      deliveryFare,
      bookingFee: CONFIG.bookingFee,
      protection,
      total,
      riderShare,
      platformFee: total - riderShare,
    };
  }

  const api = { CONFIG, quote, pickVehicle, isPeak, weightSurcharge };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AiMovePricing = api;
})(typeof window !== "undefined" ? window : globalThis);
