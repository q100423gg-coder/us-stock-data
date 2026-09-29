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
        h("span", { class: "mc" }, isNum(r.mc) ? [fmtM(r.mc * 1000), kLine(krwM(r.mc * 1000))] : r.q === "ETF" ? "ETF" : ""));
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

// ---------------------------------------------------------------- won amounts (rate from the nightly collector)
function krwTime(sec) {
  if (!isNum(sec)) return "";
  try {
    const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(sec * 1000));
    const g = (t) => (parts.find((x) => x.type === t) || {}).value || "";
    return `${g("month")}/${g("day")} ${g("hour")}:${g("minute")}`;
  } catch (e) { return ""; }
}
/** redraw the current view in place (won amounts on/off) and keep the reader where they were */
async function redrawInPlace() {
  const y = window.scrollY;
  hideTip();
  if (APP.view === "company" && APP.sym) {
    const oldAi = $("#s-ai .ai");                 // an AI note (maybe still being written) doesn't depend on the won setting
    await renderCompany(APP.sym);
    const nw = $("#s-ai .ai");
    if (oldAi && nw) nw.replaceWith(oldAi);
    const lv = APP.live.get(APP.sym), px = $("#co-px");
    if (lv && px) fillPx(px, CO.row, lv);
  } else {
    (VIEWS[APP.view] || renderHome)();
  }
  requestAnimationFrame(() => window.scrollTo(0, y));
}
function initKrw() {
  const btn = $("#krw-btn"), foot = $("#foot-fx");
  KRW.rate = isNum(DATA.uni.krw) && DATA.uni.krw > 0 ? DATA.uni.krw : null;
  KRW.at = DATA.uni.krw_at || null;
  KRW.on = LS.get("krw", true) !== false;
  if (!KRW.rate) { btn.hidden = true; foot.hidden = true; return; }
  const t = krwTime(KRW.at);
  foot.textContent = `원화 환산: 1달러 = ${fmtN(KRW.rate, 1)}원 (${t ? t + " 기준 " : ""}야후 파이낸스 환율, 매일 아침 갱신)`;
  btn.title = `달러 금액 옆에 원화 환산액을 함께 보여 줘요 (1달러 = ${fmtN(KRW.rate, 1)}원)`;
  btn.setAttribute("aria-pressed", String(KRW.on));
  btn.addEventListener("click", () => {
    KRW.on = !KRW.on;
    LS.set("krw", KRW.on);
    btn.setAttribute("aria-pressed", String(KRW.on));
    redrawInPlace();
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
  initKrw();
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
