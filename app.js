/* Kjørebok – PWA for registrering av jobbkjøring.
   Lagrer alt lokalt på telefonen (localStorage). */
(() => {
"use strict";

const PURPOSES = ["Vernerunde", "Samordningsmøte", "Granskning", "Befaring", "Møte", "Kurs/opplæring"];
const K = { trips: "kb_trips", settings: "kb_settings", active: "kb_active", tolls: "kb_tolls2", brg: "kb_brg" };
const NVDB_URL = "https://nvdbapiles.atlas.vegvesen.no/vegobjekter/api/v4/vegobjekter/45?inkluder=egenskaper,lokasjon&srid=4326&antall=1000";
const $ = s => document.querySelector(s);

// ---------- små hjelpere ----------
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast("Lagring feilet – lite plass?"); return false; } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = v => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, "")); return isFinite(n) ? n : null; };
const r1 = n => Math.round(n * 10) / 10;
const fmt = (n, d = 1) => (n == null ? "" : Number(n).toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtKr = n => (n ? (Math.round(n * 100) / 100).toLocaleString("nb-NO", { maximumFractionDigits: 2 }) + " kr" : "");
const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = iso => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const monthName = ym => { const [y, m] = ym.split("-"); return new Date(+y, +m - 1, 1).toLocaleDateString("nb-NO", { month: "long", year: "numeric" }); };
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }

// avstand i meter (haversine)
function dist(a, b) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// avstand fra punkt p til linjestykke a-b (meter), flat tilnærming lokalt
function distToSeg(p, a, b) {
  const kx = 111320 * Math.cos(p[0] * Math.PI / 180), ky = 110540;
  const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return { d: Math.sqrt(x * x + y * y), t };
}

// ---------- tilstand ----------
let trips = load(K.trips, []);
let settings = Object.assign({ key: "", home: null, purpose: "", useRouteKm: true, vehicle: "el", elPct: 50, autopass: true }, load(K.settings, {}));
const saveTrips = () => save(K.trips, trips);
const saveSettings = () => save(K.settings, settings);
function upsertTrip(t) { const i = trips.findIndex(x => x.id === t.id); if (i >= 0) trips[i] = t; else trips.push(t); saveTrips(); }
const tripKm = t => num(t.km) || 0;
const placeLabel = p => (p && p.label) || "";
const tripFrom = t => placeLabel((t.places || [])[0]);
const tripTo = t => placeLabel((t.places || []).slice(-1)[0]);
const tripVia = t => (t.places || []).slice(1, -1).map(placeLabel).filter(Boolean).join(" / ");
// hovedmål: siste stopp som ikke er startstedet (for tur/retur A→B→A blir det B)
const tripDest = t => { const ps = (t.places || []).map(placeLabel).filter(Boolean); const f = ps[0]; for (let i = ps.length - 1; i > 0; i--) if (ps[i] !== f) return ps[i]; return ps[ps.length - 1] || ""; };
const isRound = t => { const ps = (t.places || []).map(placeLabel).filter(Boolean); return ps.length > 2 && ps[0] === ps[ps.length - 1]; };

// ---------- eksterne tjenester ----------
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function searchPlaces(q, near) {
  const local = knownPlaces().filter(p => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, 4)
    .map(p => ({ ...p, sub: "Brukt før" }));
  if (!settings.key || q.length < 3) return local;
  const [lat, lon] = near || [59.91, 10.75];
  try {
    const j = await getJSON(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json?key=${encodeURIComponent(settings.key)}&typeahead=true&limit=6&countrySet=NO&language=nb-NO&lat=${lat}&lon=${lon}`);
    const remote = (j.results || []).map(r => {
      const a = r.address || {};
      const name = r.poi ? r.poi.name : (a.streetName ? `${a.streetName}${a.streetNumber ? " " + a.streetNumber : ""}` : a.freeformAddress);
      const place = a.municipality || a.municipalitySubdivision || "";
      return { label: place && !String(name).includes(place) ? `${name}, ${place}` : name, sub: a.freeformAddress, lat: r.position.lat, lon: r.position.lon };
    });
    return [...local, ...remote];
  } catch { return local; }
}
async function reverseGeocode(lat, lon) {
  if (settings.key) {
    try {
      const j = await getJSON(`https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json?key=${encodeURIComponent(settings.key)}&language=nb-NO`);
      const a = (j.addresses || [])[0]?.address;
      if (a) {
        const street = a.streetName ? `${a.streetName}${a.streetNumber ? " " + a.streetNumber : ""}` : "";
        return [street, a.municipality].filter(Boolean).join(", ") || a.freeformAddress;
      }
    } catch {}
  }
  try {
    const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&accept-language=nb`);
    const a = j.address || {};
    const street = a.road ? `${a.road}${a.house_number ? " " + a.house_number : ""}` : "";
    const town = a.city || a.town || a.village || a.municipality || "";
    return [street, town].filter(Boolean).join(", ") || j.display_name || null;
  } catch {}
  return null;
}
async function routeKm(coords) {
  if (!settings.key || coords.length < 2) return null;
  const locs = coords.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(":");
  try {
    const j = await getJSON(`https://api.tomtom.com/routing/1/calculateRoute/${locs}/json?key=${encodeURIComponent(settings.key)}&travelMode=car&routeType=fastest&traffic=false`);
    const r = (j.routes || [])[0]; if (!r) return null;
    const pts = r.legs.flatMap(l => l.points.map(p => [p.latitude, p.longitude]));
    return { km: r1(r.summary.lengthInMeters / 1000), points: pts, secs: r.summary.travelTimeInSeconds || 0 };
  } catch { return null; }
}

// ---------- bomstasjoner (NVDB) ----------
function parseStations(objs) {
  const out = [];
  for (const o of objs) {
    const wkt = o.lokasjon?.geometri?.wkt || o.geometri?.wkt || "";
    const m = wkt.match(/POINT[^(]*\(\s*([-\d.]+)\s+([-\d.]+)/); if (!m) continue;
    const e = {}; (o.egenskaper || []).forEach(p => { e[p.navn] = p.verdi; });
    out.push({
      name: e["Navn bomstasjon"] || "Bomstasjon", anlegg: e["Navn bompengeanlegg"] || "",
      lat: +m[1], lon: +m[2], price: num(e["Takst liten bil"]), rush: num(e["Rushtidstakst liten bil"]),
      rm: [e["Rushtid morgen, fra"], e["Rushtid morgen, til"]], ra: [e["Rushtid ettermiddag, fra"], e["Rushtid ettermiddag, til"]],
      dir: e["Innkrevningsretning"] || "",
      id: o.id, vls: o.lokasjon?.stedfestinger?.[0]?.veglenkesekvensid || null, rel: o.lokasjon?.stedfestinger?.[0]?.relativPosisjon ?? null,
      grp: e["Timesregel, passeringsgruppe"] || null, hourMin: num(e["Timesregel, varighet"]) || 60, hourRule: e["Timesregel"] || ""
    });
  }
  return out;
}
async function fetchStations() {
  let url = NVDB_URL, all = [], guard = 0;
  while (url && guard++ < 30) {
    const j = await getJSON(url);
    const objs = j.objekter || [];
    all = all.concat(objs);
    const next = j.metadata?.neste?.href;
    if (!objs.length || !next || objs.length < (j.metadata?.sidestørrelse || 1000)) break;
    url = next;
  }
  const st = parseStations(all);
  if (!st.length) throw new Error("ingen data");
  save(K.tolls, { at: Date.now(), stations: st });
  return st;
}
function stations() { return (load(K.tolls, null) || {}).stations || []; }
async function ensureStations() {
  const t = load(K.tolls, null);
  if (t && t.stations?.length && Date.now() - t.at < 30 * 864e5) return;
  try { await fetchStations(); } catch {}
  renderTollStatus();
}
function inWindow(time, w) { return w[0] && w[1] && time >= w[0] && time <= w[1]; }
function priceAt(st, when) {
  const wd = when.getDay(), t = hhmm(when);
  const julyFree = when.getMonth() === 6 && /fjellinjen/i.test(st.anlegg || "");
  const rush = wd >= 1 && wd <= 5 && !julyFree && st.rush && (inWindow(t, st.rm) || inWindow(t, st.ra));
  let p = rush ? st.rush : (st.price || 0);
  if (settings.vehicle !== "fossil") p *= (num(settings.elPct) ?? 50) / 100;   // elbil: andel av ordinær takst
  if (settings.autopass !== false) p *= 0.8;                                    // AutoPASS-avtale: 20 % rabatt
  return Math.round(p * 100) / 100;
}
// retning (grader) fra a til b
const bearing = (a, b) => { const toR = x => x * Math.PI / 180, dl = toR(b[1] - a[1]); const y = Math.sin(dl) * Math.cos(toR(b[0])), x = Math.cos(toR(a[0])) * Math.sin(toR(b[0])) - Math.sin(toR(a[0])) * Math.cos(toR(b[0])) * Math.cos(dl); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const parseLine = wkt => wkt.replace(/^[^(]*\(/, "").replace(/\).*$/, "").split(",").map(s => s.trim().split(/\s+/).map(Number)).map(c => [c[0], c[1]]);
let brgCache = load(K.brg, {});
// veiens metreringsretning ved bomstasjonen (fra NVDB vegnett), mellomlagret
async function stationBearing(s) {
  if (s.id != null && s.id in brgCache) return brgCache[s.id];
  if (!s.vls || s.rel == null) return null;
  try {
    const j = await getJSON(`https://nvdbapiles.atlas.vegvesen.no/vegnett/api/v4/veglenkesekvenser/${s.vls}?srid=4326`);
    const links = (j.veglenker || []).filter(v => !v.sluttdato && v.startposisjon <= s.rel && v.sluttposisjon >= s.rel && v.geometri?.wkt);
    let best = null;
    for (const v of links) {
      const pts = parseLine(v.geometri.wkt);
      for (let i = 1; i < pts.length; i++) { const r = distToSeg([s.lat, s.lon], pts[i - 1], pts[i]); if (!best || r.d < best.d) best = { d: r.d, b: bearing(pts[i - 1], pts[i]) }; }
    }
    const b = best && best.d < 60 ? best.b : null;
    brgCache[s.id] = b; save(K.brg, brgCache);
    return b;
  } catch { return null; }
}
// pts: [[lat,lon,timeMs?]]; finner bomstasjoner du faktisk passerer i betalingsretningen
async function detectTolls(pts, startMs, threshold) {
  const st = stations(); if (!st.length || pts.length < 2) return [];
  let minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
  pts.forEach(p => { minLa = Math.min(minLa, p[0]); maxLa = Math.max(maxLa, p[0]); minLo = Math.min(minLo, p[1]); maxLo = Math.max(maxLo, p[1]); });
  const cand = st.filter(s => s.lat > minLa - .01 && s.lat < maxLa + .01 && s.lon > minLo - .02 && s.lon < maxLo + .02);
  const hits = [];
  for (const s of cand) {
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      if (dist(pts[i - 1], pts[i]) < 1) continue;
      const r = distToSeg([s.lat, s.lon], pts[i - 1], pts[i]);
      if (r.d < threshold && (!best || r.d < best.d)) best = { d: r.d, i, t: r.t };
    }
    if (!best) continue;
    const a = pts[best.i - 1], b = pts[best.i];
    const sb = await stationBearing(s);
    let note = "";
    if (sb == null) note = "retning ukjent";
    else {
      const d = angDiff(bearing(a, b), sb);
      if (d > 45 && d < 135) continue;                    // kryssende vei (bro/kulvert) – ingen passering
      const along = d <= 45, ir = (s.dir || "").toLowerCase();
      const charged = !ir || ir.includes("begge") || (ir.includes("med") && along) || (ir.includes("mot") && !along);
      if (!charged) continue;                              // kjører i retningen uten innkreving
    }
    const ms = a[2] && b[2] ? a[2] + (b[2] - a[2]) * best.t : startMs;
    hits.push({ s, ms, note, d: best.d, order: best.i + best.t });
  }
  hits.sort((x, y) => x.order - y.order);
  // samme stasjon flere ganger, eller hovedvei + rampe i samme kryss: behold den som ligger nærmest ruten
  const uniq = [];
  for (const h of hits) {
    const k = uniq.findIndex(o => (o.s.name === h.s.name && o.s.anlegg === h.s.anlegg && Math.abs(o.order - h.order) < 5) || (dist([o.s.lat, o.s.lon], [h.s.lat, h.s.lon]) < 200 && Math.abs(o.ms - h.ms) < 90000));
    if (k < 0) uniq.push(h); else if (h.d < uniq[k].d) uniq[k] = h;
  }
  // timesregel: i samme passeringsgruppe betales bare første passering innenfor perioden
  const lastPaid = {};
  return uniq.map(({ s, ms, note }) => {
    let price = priceAt(s, new Date(ms));
    if (s.grp && /første/i.test(s.hourRule) && lastPaid[s.grp] != null && ms - lastPaid[s.grp] < s.hourMin * 60000) { price = 0; note = "timesregel"; }
    else if (s.grp) lastPaid[s.grp] = ms;
    return { name: s.name, anlegg: s.anlegg, price, time: hhmm(new Date(ms)), note, on: true };
  });
}

// ---------- kjent sted-historikk ----------
function knownPlaces() {
  const map = new Map();
  if (settings.home) map.set(settings.home.label.toLowerCase(), settings.home);
  trips.forEach(t => (t.places || []).forEach(p => { if (p.label && p.lat != null && !map.has(p.label.toLowerCase())) map.set(p.label.toLowerCase(), { label: p.label, lat: p.lat, lon: p.lon }); }));
  return [...map.values()];
}

// ---------- autoforslag ----------
function attachAuto(input, getNear, onPick) {
  const wrap = input.parentElement;
  let box = null, timer = null, seq = 0;
  const close = () => { if (box) { box.remove(); box = null; } };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      const res = await searchPlaces(q, getNear && getNear());
      if (my !== seq || document.activeElement !== input) return;
      close();
      if (!res.length) return;
      box = document.createElement("div"); box.className = "sugg";
      res.slice(0, 7).forEach(r => {
        const b = document.createElement("button"); b.type = "button";
        b.innerHTML = `${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}`;
        b.addEventListener("pointerdown", e => { e.preventDefault(); input.value = r.label; close(); onPick({ label: r.label, lat: r.lat, lon: r.lon }); });
        box.appendChild(b);
      });
      wrap.appendChild(box);
    }, 280);
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

// ---------- faner ----------
function showTab(id) {
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
  document.querySelectorAll("main section").forEach(s => s.classList.toggle("on", s.id === id));
  window.scrollTo(0, 0);
}
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.tab === "ny" && !editing.id) newTripForm();
  showTab(b.dataset.tab);
}));

// =====================================================================
// SPORING
// =====================================================================
let watchId = null, wakeLock = null, tick = null;
const getActive = () => load(K.active, null);

async function requestWake() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && getActive()) { requestWake(); if (watchId == null) beginWatch(); } });

function onPos(pos) {
  const a = getActive();
  if (!a) { endWatch(); renderDrive(); return; }       // stoppet fra en annen fane / automatisering
  const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
  $("#d-gps").textContent = Math.round(acc) + " m";
  const now = pos.timestamp || Date.now();
  const last = a.points[a.points.length - 1];
  if (!last) { if (acc <= 100) { a.points.push([lat, lon, now]); save(K.active, a); } return; }
  if (acc > 50) return;
  const d = dist(last, [lat, lon]);
  if (d < Math.max(20, acc * 0.6)) return;
  const dt = (now - last[2]) / 1000;
  if (dt > 0 && d / dt > 70) return;                     // urealistisk hopp
  a.points.push([lat, lon, now]); a.dist += d;
  save(K.active, a);
  renderDriveStats(a);
}
function beginWatch() {
  if (!("geolocation" in navigator)) { toast("Telefonen gir ikke tilgang til GPS"); return; }
  watchId = navigator.geolocation.watchPosition(onPos, err => {
    $("#d-gps").textContent = "–";
    if (err.code === 1) toast("Gi appen tilgang til posisjon for å spore");
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  clearInterval(tick); tick = setInterval(() => { const a = getActive(); if (a) renderDriveStats(a); else { endWatch(); renderDrive(); } }, 1000);
}
function endWatch() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null;
  clearInterval(tick); tick = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
function startDrive() {
  if (getActive()) return;
  const a = { id: uid(), startedAt: Date.now(), points: [], dist: 0, dest: driveDest, note: $("#d-note").value.trim(), park: $("#d-park").checked };
  save(K.active, a);
  requestWake(); beginWatch(); renderDrive();
  toast("Sporing startet");
}
let stopping = false;
async function stopDrive() {
  const a = getActive(); if (!a || stopping) return;
  stopping = true;
  a.note = $("#d-note").value.trim(); a.park = $("#d-park").checked;
  localStorage.removeItem(K.active);                     // tar sporingen ut av drift med en gang
  endWatch(); renderDrive();
  $("#driveHint").textContent = "Lagrer tur …";
  try {
    let t;
    try { t = await finalize(a); }
    catch {
      const s = new Date(a.startedAt);
      t = { id: a.id, status: "draft", source: "gps", date: isoDate(s), time: hhmm(s), endTime: hhmm(new Date()), places: [{ label: "" }, a.dest || { label: "" }],
        purpose: settings.purpose || "", project: "", km: r1(a.dist / 1000), kmGps: r1(a.dist / 1000), kmRoute: null, tolls: [], toll: 0,
        note: a.note || "", park: !!a.park, parkAmt: null, expDone: false, track: a.points, created: new Date().toISOString() };
    }
    upsertTrip(t);
    driveDest = null; $("#d-dest").value = ""; $("#d-note").value = ""; $("#d-park").checked = false;
    renderAll();
    toast(`Tur lagret: ${fmt(t.km)} km – fullfør detaljene`);
    openTrip(t.id);
  } finally { stopping = false; renderDrive(); }
}
async function finalize(a) {
  const pts = a.points, end = Date.now(), start = new Date(a.startedAt);
  const first = pts[0], last = pts[pts.length - 1];
  const kmGps = r1(a.dist / 1000);
  const places = [];
  places.push(first ? { label: (await reverseGeocode(first[0], first[1])) || "Startpunkt", lat: first[0], lon: first[1] } : { label: settings.home?.label || "" });
  if (a.dest && a.dest.label) places.push(a.dest);
  else places.push(last && last !== first ? { label: (await reverseGeocode(last[0], last[1])) || "Sluttpunkt", lat: last[0], lon: last[1] } : { label: "" });
  // bruk at startpunkt nær kontoret får kontorets navn
  if (settings.home?.lat != null && first && dist(first, [settings.home.lat, settings.home.lon]) < 400) places[0] = { ...settings.home };
  if (settings.home?.lat != null && last && !a.dest && dist(last, [settings.home.lat, settings.home.lon]) < 400) places[places.length - 1] = { ...settings.home };

  let kmRoute = null;
  if (pts.length >= 2) {
    const step = Math.max(1, Math.floor(pts.length / 9));
    const sample = pts.filter((_, i) => i % step === 0).slice(0, 10).map(p => [p[0], p[1]]);
    sample.push([last[0], last[1]]);
    const r = await routeKm(sample);
    kmRoute = r ? r.km : null;
  }
  const tolls = await detectTolls(pts, a.startedAt, 60);
  const km = settings.useRouteKm && kmRoute ? kmRoute : kmGps;
  return {
    id: a.id, status: "draft", source: "gps",
    date: isoDate(start), time: hhmm(start), endTime: hhmm(new Date(end)),
    places, purpose: settings.purpose || "", project: "",
    km, kmGps, kmRoute, tolls, toll: tolls.filter(x => x.on).reduce((s, x) => s + (x.price || 0), 0),
    note: a.note || "", park: !!a.park, parkAmt: null, expDone: false,
    track: pts.length > 400 ? pts.filter((_, i) => i % Math.ceil(pts.length / 400) === 0) : pts,
    created: new Date().toISOString()
  };
}

// --- Kjør-fanen ---
let driveDest = null;
attachAuto($("#d-dest"), () => null, p => { driveDest = p; const a = getActive(); if (a) { a.dest = p; save(K.active, a); } });
$("#d-dest").addEventListener("input", () => { driveDest = $("#d-dest").value.trim() ? { label: $("#d-dest").value.trim() } : null; const a = getActive(); if (a) { a.dest = driveDest; save(K.active, a); } });
["d-note", "d-park"].forEach(id => $("#" + id).addEventListener("change", () => { const a = getActive(); if (a) { a.note = $("#d-note").value.trim(); a.park = $("#d-park").checked; save(K.active, a); } }));
$("#driveBtn").addEventListener("click", () => (getActive() ? stopDrive() : startDrive()));

function renderDriveStats(a) {
  $("#d-km").textContent = fmt(a.dist / 1000);
  const s = Math.floor((Date.now() - a.startedAt) / 1000);
  $("#d-time").textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
function renderDrive() {
  const a = getActive(), btn = $("#driveBtn");
  btn.textContent = a ? "Stopp" : "Kjør"; btn.classList.toggle("on", !!a);
  if (a) {
    renderDriveStats(a);
    if (a.dest && document.activeElement !== $("#d-dest")) $("#d-dest").value = a.dest.label || "";
    if (document.activeElement !== $("#d-note")) $("#d-note").value = a.note || "";
    $("#d-park").checked = !!a.park;
    $("#driveHint").textContent = "Sporer … Hold skjermen på. Trykk Stopp når du er fremme.";
  } else if (!stopping) {
    $("#d-km").textContent = "0,0"; $("#d-time").textContent = "00:00"; $("#d-gps").textContent = "–";
    $("#driveHint").textContent = "Trykk Kjør når du starter. Hold appen åpen med skjermen på (bilholder) mens du kjører.";
  }
}

// =====================================================================
// SKJEMA (ny / rediger)
// =====================================================================
const editing = { id: null, places: [], track: null, tolls: [], source: "manual", kmGps: null, kmRoute: null, created: null };
const F = id => $("#f-" + id);

function renderPurposeChips() {
  const cur = F("purpose").value;
  $("#purposechips").innerHTML = PURPOSES.map(p => `<button type="button" class="chip${p === cur ? " on" : ""}" data-p="${esc(p)}">${esc(p)}</button>`).join("");
}
$("#purposechips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; F("purpose").value = F("purpose").value === b.dataset.p ? "" : b.dataset.p; renderPurposeChips(); });
F("purpose").addEventListener("input", renderPurposeChips);

function renderPlaces() {
  const box = $("#places"); box.innerHTML = "";
  editing.places.forEach((p, i) => {
    const last = i === editing.places.length - 1;
    const row = document.createElement("div"); row.className = "place";
    row.innerHTML = `<span class="dot">${i === 0 ? "A" : last ? "B" : "•"}</span><input placeholder="${i === 0 ? "Fra" : last ? "Til" : "Via"}" value="${esc(p.label)}" class="${p.lat != null ? "ok" : ""}"><button type="button" class="gps" title="Bruk min posisjon" aria-label="Bruk min posisjon">📍</button>${i > 0 && !last ? `<button type="button" class="rm" aria-label="Fjern">✕</button>` : ""}`;
    const inp = row.querySelector("input");
    row.querySelector(".gps").addEventListener("click", e => useMyPosition(i, e.currentTarget));
    inp.addEventListener("input", () => { editing.places[i].label = inp.value; });
    attachAuto(inp, () => { const o = editing.places.find(x => x.lat != null); return o ? [o.lat, o.lon] : null; }, pick => { editing.places[i] = pick; inp.classList.add("ok"); recalcRoute(); });
    row.querySelector(".rm")?.addEventListener("click", () => { editing.places.splice(i, 1); renderPlaces(); recalcRoute(); });
    box.appendChild(row);
  });
}
// «Min posisjon»: henter GPS-posisjon og gjør den om til adresse
async function useMyPosition(i, btn) {
  if (!("geolocation" in navigator)) { toast("Telefonen gir ikke tilgang til GPS"); return; }
  btn.disabled = true; btn.textContent = "…";
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }));
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    let label = settings.home?.lat != null && dist([lat, lon], [settings.home.lat, settings.home.lon]) < 400 ? settings.home.label : null;
    label = label || (await reverseGeocode(lat, lon)) || `Min posisjon (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    editing.places[i] = { label, lat, lon };
    renderPlaces(); recalcRoute();
    toast(`Posisjon hentet (±${Math.round(accuracy)} m)`);
  } catch (e) {
    toast(e && e.code === 1 ? "Gi appen tilgang til posisjon" : "Fant ikke posisjonen din – prøv igjen");
    btn.disabled = false; btn.textContent = "📍";
  }
}
$("#addVia").addEventListener("click", () => { editing.places.splice(editing.places.length - 1, 0, { label: "" }); renderPlaces(); $("#places").querySelectorAll("input")[editing.places.length - 2].focus(); });
$("#homeBtn").addEventListener("click", () => {
  const first = editing.places[0]; if (!first?.label) { toast("Fyll inn Fra først"); return; }
  const lastP = editing.places[editing.places.length - 1];
  if (lastP.label && lastP.label !== first.label) editing.places.push({ ...first }); else editing.places[editing.places.length - 1] = { ...first };
  renderPlaces(); recalcRoute();
});

let routeSeq = 0;
async function recalcRoute() {
  const coords = editing.places.filter(p => p.lat != null).map(p => [p.lat, p.lon]);
  if (coords.length < 2 || coords.length !== editing.places.filter(p => p.label).length) { $("#routeInfo").textContent = ""; return; }
  if (!settings.key) { $("#routeInfo").textContent = "Legg inn TomTom-nøkkel for automatisk km"; return; }
  const my = ++routeSeq; $("#routeInfo").textContent = "Beregner rute …";
  const r = await routeKm(coords);
  if (my !== routeSeq) return;
  if (!r) { $("#routeInfo").textContent = "Fant ikke rute – skriv km selv"; return; }
  editing.kmRoute = r.km; F("km").value = fmt(r.km);
  $("#routeInfo").textContent = `Rute: ${fmt(r.km)} km`;
  const [h, m] = (F("time").value || "08:00").split(":");
  const d = new Date(F("date").value + "T00:00"); d.setHours(+h, +m);
  let acc = 0; const cum = r.points.map((p, i) => (acc += i ? dist(r.points[i - 1], p) : 0));
  const t0 = d.getTime(), tot = acc || 1;
  const tolls = await detectTolls(r.points.map((p, i) => [p[0], p[1], t0 + Math.round((cum[i] / tot) * (r.secs || 0) * 1000)]), t0, 30);
  if (my !== routeSeq) return;
  editing.tolls = tolls;
  renderTolls(); renderKmChoice();
}
function renderTolls() {
  const box = $("#tollList");
  if (!editing.tolls.length) { box.innerHTML = ""; return; }
  const free = editing.tolls.filter(t => t.note === "timesregel").length;
  box.innerHTML = `<p class="hint" style="margin:0 0 4px">Bompasseringer – estimat for ${settings.vehicle === "fossil" ? "bensin/diesel" : "elbil"}${settings.autopass !== false ? " med AutoPASS" : ""}:</p>` + editing.tolls.map((t, i) => t.note === "timesregel" ? "" : `
    <div class="toll"><label><input type="checkbox" data-i="${i}" ${t.on ? "checked" : ""}> ${esc(t.name)}${t.time && editing.source === "gps" ? ` <span class="hint">kl. ${t.time}</span>` : ""}${t.note ? ` <span class="hint">(${esc(t.note)})</span>` : ""}</label><span>${t.note === "timesregel" ? "0 kr" : fmtKr(t.price) || "?"}</span></div>`).join("") + (free ? `<p class="hint" style="margin:4px 0 0">+ ${free} passering${free > 1 ? "er" : ""} uten kostnad (timesregel)</p>` : "");
  F("toll").value = String(Math.round(editing.tolls.filter(t => t.on).reduce((s, t) => s + (t.price || 0), 0) * 100) / 100 || "");
}
$("#tollList").addEventListener("change", e => { const i = e.target.dataset.i; if (i == null) return; editing.tolls[i].on = e.target.checked; renderTolls(); });
function renderKmChoice() {
  const box = $("#kmChoice");
  if (editing.source !== "gps" || editing.kmGps == null) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `GPS-målt: <button type="button" class="btn small ghost" data-km="${editing.kmGps}">${fmt(editing.kmGps)} km</button>` +
    (editing.kmRoute ? ` · Rute (TomTom): <button type="button" class="btn small ghost" data-km="${editing.kmRoute}">${fmt(editing.kmRoute)} km</button>` : "");
}
$("#kmChoice").addEventListener("click", e => { const b = e.target.closest("[data-km]"); if (b) F("km").value = fmt(+b.dataset.km); });

function newTripForm() {
  Object.assign(editing, { id: null, places: [settings.home ? { ...settings.home } : { label: "" }, { label: "" }], track: null, tolls: [], source: "manual", kmGps: null, kmRoute: null, created: null, status: "ok" });
  $("#tripform").reset();
  const now = new Date(); F("date").value = isoDate(now); F("time").value = hhmm(now);
  F("purpose").value = settings.purpose || "";
  $("#formtitle").textContent = "Registrer tur"; $("#savebtn").textContent = "Lagre tur";
  $("#cancelEdit").hidden = true; $("#deleteTrip").hidden = true; $("#routeInfo").textContent = "";
  renderPlaces(); renderPurposeChips(); renderTolls(); renderKmChoice();
}
function openTrip(id) {
  const t = trips.find(x => x.id === id); if (!t) return;
  Object.assign(editing, { id: t.id, places: (t.places || []).map(p => ({ ...p })), track: t.track || null, tolls: (t.tolls || []).map(x => ({ ...x })), source: t.source || "manual", kmGps: t.kmGps ?? null, kmRoute: t.kmRoute ?? null, created: t.created, status: t.status, endTime: t.endTime });
  if (editing.places.length < 2) editing.places.push({ label: "" });
  F("date").value = t.date; F("time").value = t.time || ""; F("purpose").value = t.purpose || ""; F("project").value = t.project || "";
  F("km").value = fmt(t.km); F("toll").value = t.toll ? String(t.toll) : ""; F("note").value = t.note || "";
  F("park").checked = !!t.park; F("parkAmt").value = t.parkAmt ?? ""; F("expDone").checked = !!t.expDone;
  $("#formtitle").textContent = t.status === "draft" ? "Fullfør tur" : "Rediger tur";
  $("#savebtn").textContent = t.status === "draft" ? "Bekreft tur" : "Lagre endringer";
  $("#cancelEdit").hidden = false; $("#deleteTrip").hidden = false; $("#routeInfo").textContent = "";
  renderPlaces(); renderPurposeChips(); renderTolls(); renderKmChoice();
  if (editing.tolls.length) F("toll").value = t.toll ? String(t.toll) : "";
  showTab("ny");
}
$("#tripform").addEventListener("submit", e => {
  e.preventDefault();
  const km = num(F("km").value);
  if (km == null || km < 0) { toast("Fyll inn kilometer"); F("km").focus(); return; }
  const places = editing.places.filter(p => p.label && p.label.trim()).map(p => ({ label: p.label.trim(), lat: p.lat ?? null, lon: p.lon ?? null }));
  if (places.length < 2) { toast("Fyll inn fra og til"); return; }
  const t = {
    id: editing.id || uid(), status: "ok", source: editing.source,
    date: F("date").value, time: F("time").value, endTime: editing.endTime || "",
    places, purpose: F("purpose").value.trim(), project: F("project").value.trim(),
    km: r1(km), kmGps: editing.kmGps, kmRoute: editing.kmRoute,
    tolls: editing.tolls, toll: num(F("toll").value) || 0,
    note: F("note").value.trim(), park: F("park").checked, parkAmt: num(F("parkAmt").value), expDone: F("expDone").checked,
    track: editing.track, created: editing.created || new Date().toISOString()
  };
  upsertTrip(t);
  toast(editing.id ? "Tur lagret" : `Lagret: ${fmt(t.km)} km`);
  editing.id = null; renderAll(); newTripForm(); showTab("kjor");
});
$("#cancelEdit").addEventListener("click", () => { editing.id = null; newTripForm(); showTab("kjor"); });
$("#deleteTrip").addEventListener("click", () => {
  const b = $("#deleteTrip");
  if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Trykk igjen for å slette"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Slett"; }, 3000); return; }
  trips = trips.filter(x => x.id !== editing.id); saveTrips();
  b.dataset.armed = ""; b.textContent = "Slett"; editing.id = null;
  toast("Tur slettet"); renderAll(); newTripForm(); showTab("kjor");
});

// =====================================================================
// LISTER / OVERSIKT
// =====================================================================
const sortTrips = arr => [...arr].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
function tripRow(t) {
  const sub = [t.purpose, t.project, t.park && !t.expDone ? "🅿 utlegg" : "", t.note].filter(Boolean).map(esc).join(" · ");
  return `<div class="trip${t.status === "draft" ? " draft" : ""}" data-id="${t.id}">
    <div><div class="t">${esc(tripFrom(t))} → ${esc(tripDest(t))}${isRound(t) ? " ↺" : ""}</div><div class="s">${fmtDate(t.date)}${t.time ? " kl. " + t.time : ""}${sub ? " · " + sub : ""}</div></div>
    <div class="k"><b>${fmt(tripKm(t))} km</b>${t.toll ? `<div class="s">${fmtKr(t.toll)}</div>` : ""}</div></div>`;
}
function renderDrafts() {
  const d = sortTrips(trips.filter(t => t.status === "draft")).reverse();
  $("#draftsCard").hidden = !d.length;
  $("#drafts").innerHTML = d.map(tripRow).join("");
  const r = sortTrips(trips.filter(t => t.status !== "draft")).reverse().slice(0, 5);
  $("#recent").innerHTML = r.length ? r.map(tripRow).join("") : `<p class="empty">Ingen turer ennå.</p>`;
  const ex = sortTrips(trips.filter(t => t.park && !t.expDone));
  $("#expenseCard").hidden = !ex.length;
  $("#expenses").innerHTML = ex.map(t => `<div class="exp"><div>${fmtDate(t.date)} · ${esc(tripDest(t))}${t.parkAmt ? " · " + fmtKr(t.parkAmt) : ""}${t.note ? `<div class="hint" style="margin:0">${esc(t.note)}</div>` : ""}</div><button class="btn small ghost" data-done="${t.id}">Levert</button></div>`).join("");
}
$("#expenses").addEventListener("click", e => { const b = e.target.closest("[data-done]"); if (!b) return; const t = trips.find(x => x.id === b.dataset.done); if (t) { t.expDone = true; saveTrips(); renderAll(); toast("Markert som levert"); } });
["#drafts", "#recent", "#list"].forEach(sel => $(sel).addEventListener("click", e => { const r = e.target.closest(".trip"); if (r) openTrip(r.dataset.id); }));

function months() { const s = new Set(trips.map(t => t.date.slice(0, 7))); s.add(isoDate(new Date()).slice(0, 7)); return [...s].sort().reverse(); }
function renderMonth() {
  const sel = $("#month"), cur = sel.value || isoDate(new Date()).slice(0, 7), ms = months();
  sel.innerHTML = ms.map(m => `<option value="${m}">${monthName(m)}</option>`).join("") + `<option value="all">Alle turer</option>`;
  sel.value = ms.includes(cur) || cur === "all" ? cur : ms[0];
}
$("#month").addEventListener("change", renderList);
const periodTrips = () => { const m = $("#month").value; return sortTrips(trips.filter(t => m === "all" || t.date.startsWith(m))); };
function renderList() {
  const ts = periodTrips(), ok = ts.filter(t => t.status !== "draft");
  $("#s-count").textContent = ok.length;
  $("#s-km").textContent = fmt(ok.reduce((s, t) => s + tripKm(t), 0), 0);
  $("#s-toll").textContent = Math.round(ok.reduce((s, t) => s + (t.toll || 0), 0)).toLocaleString("nb-NO");
  $("#list").innerHTML = ts.length ? [...ts].reverse().map(tripRow).join("") : `<p class="empty">Ingen turer i perioden.</p>`;
  // steder: hver destinasjon (alle stopp unntatt start) med antall og datoer
  const map = new Map();
  ok.forEach(t => (t.places || []).slice(1).forEach(p => {
    if (!p.label || (settings.home && p.label === settings.home.label)) return;
    const k = p.label; const v = map.get(k) || { n: 0, dates: [] };
    v.n++; if (!v.dates.includes(t.date)) v.dates.push(t.date); map.set(k, v);
  }));
  const rows = [...map.entries()].sort((a, b) => b[1].n - a[1].n);
  $("#placesSummary").innerHTML = rows.length ? rows.map(([k, v]) => `<div class="pl"><div>${esc(k)}<div class="s">${v.dates.map(fmtDate).join(", ")}</div></div><b>${v.n}×</b></div>`).join("") : `<p class="empty">Ingen steder ennå.</p>`;
}

// ---------- eksport ----------
const COLS = ["Dato", "Start", "Fra", "Via", "Til", "Formål", "Prosjekt", "Km", "Bompenger", "Parkering/utlegg", "Kommentar"];
const rowOf = t => [fmtDate(t.date), t.time || "", tripFrom(t), tripVia(t), tripTo(t), t.purpose, t.project, fmt(tripKm(t)), t.toll ? fmt(t.toll, 2) : "", t.park ? (t.parkAmt ? Math.round(t.parkAmt) + " kr" : "Ja") + (t.expDone ? " (levert)" : "") : "", t.note].map(v => String(v ?? ""));
const okPeriod = () => periodTrips().filter(t => t.status !== "draft");
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
$("#copyTsv").addEventListener("click", async () => {
  const ts = okPeriod(); if (!ts.length) return toast("Ingen bekreftede turer i perioden");
  const txt = [COLS, ...ts.map(rowOf)].map(r => r.map(c => c.replace(/[\t\n]/g, " ")).join("\t")).join("\n");
  try { await navigator.clipboard.writeText(txt); toast(`${ts.length} turer kopiert`); } catch { toast("Kopiering ble blokkert"); }
});
$("#dlCsv").addEventListener("click", () => {
  const ts = okPeriod(); if (!ts.length) return toast("Ingen bekreftede turer i perioden");
  const q = c => (/[";\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  download(`kjorebok-${$("#month").value}.csv`, "﻿" + [COLS, ...ts.map(rowOf)].map(r => r.map(q).join(";")).join("\r\n"), "text/csv;charset=utf-8");
});
$("#shareText").addEventListener("click", async () => {
  const ts = okPeriod(); if (!ts.length) return toast("Ingen bekreftede turer i perioden");
  const m = $("#month").value;
  const text = `Kjørebok ${m === "all" ? "" : monthName(m)}\n\n` + ts.map(t => `${fmtDate(t.date)} ${tripFrom(t)} – ${[tripVia(t), tripTo(t)].filter(Boolean).join(" – ")}: ${fmt(tripKm(t))} km${t.purpose ? " (" + t.purpose + ")" : ""}${t.toll ? ", bom " + fmtKr(t.toll) : ""}${t.park ? ", parkering" + (t.parkAmt ? " " + fmtKr(t.parkAmt) : "") : ""}`).join("\n") +
    `\n\nTotalt ${fmt(ts.reduce((s, t) => s + tripKm(t), 0))} km, ${ts.length} turer`;
  try { if (navigator.share) await navigator.share({ title: "Kjørebok", text }); else { await navigator.clipboard.writeText(text); toast("Kopiert"); } } catch {}
});

// =====================================================================
// INNSTILLINGER
// =====================================================================
let homePick = null;
function renderSettings() {
  $("#s-key").value = settings.key || ""; $("#s-home").value = settings.home?.label || "";
  $("#s-purpose").value = settings.purpose || ""; $("#s-route").checked = !!settings.useRouteKm;
  $("#s-vehicle").value = settings.vehicle || "el"; $("#s-elpct").value = settings.elPct ?? 50; $("#s-autopass").checked = settings.autopass !== false;
  const base = location.origin + location.pathname;
  $("#autoStart").textContent = base + "?auto=start"; $("#autoStop").textContent = base + "?auto=stop";
  renderTollStatus();
}
attachAuto($("#s-home"), () => null, p => { homePick = p; });
$("#settingsform").addEventListener("submit", e => {
  e.preventDefault();
  settings.key = $("#s-key").value.trim();
  const hl = $("#s-home").value.trim();
  settings.home = hl ? (homePick && homePick.label === hl ? homePick : (settings.home && settings.home.label === hl ? settings.home : { label: hl, lat: null, lon: null })) : null;
  settings.purpose = $("#s-purpose").value.trim(); settings.useRouteKm = $("#s-route").checked;
  settings.vehicle = $("#s-vehicle").value; settings.elPct = num($("#s-elpct").value) ?? 50; settings.autopass = $("#s-autopass").checked;
  saveSettings(); toast("Innstillinger lagret"); renderAll();
});
function renderTollStatus() {
  const t = load(K.tolls, null);
  $("#tollStatus").textContent = t?.stations?.length ? `${t.stations.length} bomstasjoner lastet ${new Date(t.at).toLocaleDateString("nb-NO")}.` : "Ikke lastet ennå (krever nett).";
}
$("#loadTolls").addEventListener("click", async () => {
  $("#tollStatus").textContent = "Laster …";
  try { const s = await fetchStations(); toast(`${s.length} bomstasjoner lastet`); } catch (e) { toast("Kunne ikke hente bomstasjoner"); }
  renderTollStatus();
});
$("#backup").addEventListener("click", () => download(`kjorebok-backup-${isoDate(new Date())}.json`, JSON.stringify({ version: 1, trips, settings: { ...settings, key: "" } }, null, 1), "application/json"));
$("#restore").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); const inc = Array.isArray(j) ? j : j.trips || [];
    let n = 0; inc.forEach(t => { if (t && t.id && t.date && !trips.some(x => x.id === t.id)) { trips.push(t); n++; } });
    saveTrips(); renderAll(); toast(`${n} turer gjenopprettet`);
  } catch { toast("Ugyldig fil"); }
  e.target.value = "";
});

// ---------- datalister ----------
function renderDatalists() {
  const uniq = a => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, "nb"));
  $("#dl-project").innerHTML = uniq(trips.map(t => t.project)).map(p => `<option value="${esc(p)}">`).join("");
  $("#dl-purpose").innerHTML = uniq([...PURPOSES, ...trips.map(t => t.purpose)]).map(p => `<option value="${esc(p)}">`).join("");
}

function renderAll() { renderDrive(); renderDrafts(); renderMonth(); renderList(); renderDatalists(); renderSettings(); }

// ---------- oppstart ----------
window.addEventListener("storage", e => { if (e.key === K.active || e.key === K.trips) { trips = load(K.trips, []); if (!getActive()) endWatch(); renderAll(); } });
window.addEventListener("online", () => $("#status").textContent = "");
window.addEventListener("offline", () => $("#status").textContent = "Frakoblet");
if (!navigator.onLine) $("#status").textContent = "Frakoblet";

newTripForm(); renderAll();
if (getActive()) { requestWake(); beginWatch(); }

const params = new URLSearchParams(location.search);
const auto = params.get("auto");
if (auto) {
  history.replaceState(null, "", location.pathname);
  if (auto === "start" && !getActive()) startDrive();
  if (auto === "stop" && getActive()) stopDrive();
}
ensureStations();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// til testing
window.__kb = { finalize, detectTolls, parseStations, dist, stationBearing, priceAt };
})();
