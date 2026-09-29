/* =====================================================================
   기업 분석 노트 — routing, search box, boot
   ===================================================================== */
const VIEWS = { home: renderHome, screener: renderScreener, calendar: renderCalendar, macro: renderMacro };
function setHash(tok) {
  try { history.replaceState(null, "", tok ? "#" + tok : location.pathname + location.search); } catch (e) { /* sandboxed */ }
}
function go(view, sym) {
  hideTip();
  if (APP.ctl && view !== "company") { /* keep a running note alive only on its own page */ }
  if (view === "company") {
    const t = sym || APP.sym || LS.get("last", "NVDA");
    if (APP.ctl && APP.sym !== t) { APP.ctl.abort(); APP.ctl = null; }
    APP.view = "company";
    markTab("company");
    setHash(t);
    window.scrollTo(0, 0);
    renderCompany(row(t) ? t : "NVDA");
    return;
  }
  if (APP.ctl) { APP.ctl.abort(); APP.ctl = null; }
  APP.view = view;
  markTab(view);
  setHash(view === "home" ? "" : view);
  window.scrollTo(0, 0);
  (VIEWS[view] || renderHome)();
}
function markTab(v) { $$(".tabs [data-view]").forEach((b) => { if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }); }
function routeFromHash() {
  const tok = decodeURIComponent((location.hash || "").slice(1));
  if (!tok) return go("home");
  if (VIEWS[tok]) return go(tok);
  const t = tok.toUpperCase().replace(/[./]/g, "-");
  if (row(t)) return go("company", t);
  return go("home");
}

// ---------------------------------------------------------------- search box
function wireSearch() {
  const q = $("#q"), res = $("#q-res");
  let hits = [], sel = -1;
  const close = () => { res.hidden = true; q.setAttribute("aria-expanded", "false"); sel = -1; };
  const pick = (t) => { close(); q.value = ""; q.blur(); go("company", t); };
  const paint = () => {
    clear(res);
    if (!q.value.trim()) { close(); return; }
    if (!hits.length) { res.append(h("div", { class: "none" }, "찾는 종목이 없어요. 시가총액 20억 달러 이상 미국 상장 종목과 S&P 500을 다뤄요.")); }
    hits.forEach((t, i) => {
      const r = row(t);
      const b = h("button", { type: "button", role: "option", "aria-selected": String(i === sel), id: "q-o" + i },
        h("span", { class: "sym" }, t), h("span", { class: "nm" }, dispName(t), koName(t) ? h("small", null, shortEn(r.n)) : null),
        h("span", { class: "mc" }, isNum(r.mc) ? fmtM(r.mc * 1000) : r.q === "ETF" ? "ETF" : ""));
      b.addEventListener("mousedown", (e) => { e.preventDefault(); pick(t); });
      res.append(b);
    });
    res.hidden = false;
    q.setAttribute("aria-expanded", "true");
  };
  q.addEventListener("input", () => { hits = search(q.value, 8); sel = hits.length ? 0 : -1; paint(); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; paint(); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); sel = (sel - 1 + hits.length) % hits.length; paint(); }
    else if (e.key === "Enter") { e.preventDefault(); if (hits[sel >= 0 ? sel : 0]) pick(hits[sel >= 0 ? sel : 0]); }
    else if (e.key === "Escape") { close(); }
  });
  q.addEventListener("blur", () => setTimeout(close, 120));
  q.addEventListener("focus", () => { if (q.value.trim()) { hits = search(q.value, 8); paint(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q && !/input|textarea|select/i.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); q.focus(); }
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  applyUpDown(LS.get("ud", "kr"));
  $$(".seg [data-ud]").forEach((b) => b.addEventListener("click", () => { LS.set("ud", b.dataset.ud); applyUpDown(b.dataset.ud); }));
  $$(".tabs [data-view]").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  const rl = $("#radar-link");
  if (CONFIG.radarUrl) rl.href = CONFIG.radarUrl; else rl.hidden = true;
  initCaps();
  try {
    await loadUniverse();
  } catch (e) {
    clear($("#view")).append(h("div", { class: "err" }, "데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요. (" + e.message + ")"));
    return;
  }
  buildSearch();
  wireSearch();
  const n = DATA.rows.filter((r) => r.q === "EQUITY").length;
  $("#brand-sub").textContent = `미국 주식 ${fmtN(n)}종목의 재무제표·투자지표·실적·매크로를 한곳에서 봐요.`;
  const last = DATA.dates[DATA.dates.length - 1];
  $("#foot-asof").textContent = `가격 기준 ${last ? fmtD(last, "long") : "–"} 종가` + (DATA.uni.built ? ` · 데이터 갱신 ${DATA.uni.built}` : "");
  loadCal().then((c) => { DATA.calMap = c.tickers || {}; }).catch(() => { DATA.calMap = {}; });
  loadMacro().then((m) => {
    const pick = (k) => { const s = m.series[k]; return s && s.obs.length ? { [s.name]: s.obs[s.obs.length - 1][1], 날짜: s.obs[s.obs.length - 1][0] } : null; };
    DATA.macroSnap = ["FFR", "UST10Y", "SP10_3M", "CPI", "CORE_PCE", "UNRATE", "VIX", "HY"].map(pick).filter(Boolean);
  }).catch(() => {});
  routeFromHash();
  window.addEventListener("hashchange", routeFromHash);
}
boot();
