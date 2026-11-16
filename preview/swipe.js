/* Sveip mellom faner, glidende fanestrek, temabryter og oppstartsanimasjon. */
(() => {
  "use strict";
  const nav = document.querySelector("nav");
  const tabs = [...nav.querySelectorAll("button")];
  const main = document.querySelector("main");
  const ind = document.createElement("span");
  ind.className = "nav-ind";
  nav.appendChild(ind);

  const cur = () => Math.max(0, tabs.findIndex(b => b.classList.contains("on")));
  // pos kan være et desimaltall mens fingeren drar
  function place(pos) {
    pos = Math.max(0, Math.min(tabs.length - 1, pos));
    const i = Math.floor(pos), f = pos - i, a = tabs[i], b = tabs[Math.min(i + 1, tabs.length - 1)];
    const left = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * f;
    const w = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * f;
    const pad = w * 0.22;
    ind.style.transform = `translateX(${left + pad}px)`;
    ind.style.width = `${w - pad * 2}px`;
  }
  let last = cur();
  place(last);
  requestAnimationFrame(() => ind.classList.add("anim"));

  // retning settes før appens egen klikkhåndtering, så animasjonen kommer fra riktig side
  nav.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    main.dataset.dir = tabs.indexOf(b) >= cur() ? "next" : "prev";
  }, true);
  new MutationObserver(() => { const n = cur(); if (n !== last) { last = n; ind.classList.add("anim"); place(n); } })
    .observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  addEventListener("resize", () => place(cur()));

  // ---- sveip ----
  let sx = 0, sy = 0, active = false, lock = null, sec = null;
  main.addEventListener("touchstart", e => {
    if (e.touches.length !== 1 || e.target.closest("input, select, textarea, .sugg")) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    active = true; lock = null; sec = main.querySelector("section.on");
  }, { passive: true });
  main.addEventListener("touchmove", e => {
    if (!active || !sec) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (lock === null && Math.hypot(dx, dy) > 10) lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
    if (lock !== "x") return;
    const i = cur(), atEdge = (i === 0 && dx > 0) || (i === tabs.length - 1 && dx < 0);
    const d = atEdge ? dx * 0.22 : dx;
    sec.style.transition = "none";
    sec.style.transform = `translateX(${d}px)`;
    sec.style.opacity = String(1 - Math.min(Math.abs(d) / 700, 0.3));
    ind.classList.remove("anim");
    place(i - d / main.clientWidth);
  }, { passive: true });
  main.addEventListener("touchend", e => {
    if (!active) return;
    active = false;
    if (lock !== "x" || !sec) return;
    const dx = e.changedTouches[0].clientX - sx, i = cur();
    sec.style.transition = ""; sec.style.transform = ""; sec.style.opacity = "";
    ind.classList.add("anim");
    const n = dx < -60 ? i + 1 : dx > 60 ? i - 1 : i;
    if (n !== i && n >= 0 && n < tabs.length) { main.dataset.dir = n > i ? "next" : "prev"; tabs[n].click(); }
    else place(i);
  });

  // ---- tema ----
  const btn = document.getElementById("themeBtn");
  const meta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    if (btn) btn.textContent = t === "light" ? "Mørk" : "Lys";
    if (meta) meta.content = t === "light" ? "#e8ecf1" : "#061533";
  }
  applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  btn?.addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(t);
    try { localStorage.setItem("kb_theme", t); } catch {}
  });

  // ---- oppstart: skiltet kommer på plass én gang ----
  document.body.classList.add("boot");
  setTimeout(() => document.body.classList.remove("boot"), 1400);
})();
