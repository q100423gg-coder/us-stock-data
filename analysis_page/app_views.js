/* =====================================================================
   기업 분석 노트 — home, screener, earnings calendar, macro
   ===================================================================== */
const POPULAR = ["NVDA", "AAPL", "MSFT", "TSLA", "GOOGL", "AMZN", "META", "AVGO", "PLTR", "SPCX", "TSM", "INOD"];
function tkButton(t, extra) {
  const r = row(t);
  return h("div", { class: "tkc" }, h("b", null, t), h("span", null, dispName(t) + (extra || "")));
}
function viewShell(title, sub) {
  const view = $("#view");
  clear(view);
  const wrap = h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } });
  if (title) wrap.append(h("div", { class: "ph" }, h("h2", { style: { fontSize: "20px" } }, title), sub ? h("span", { class: "sub" }, sub) : null));
  view.append(wrap);
  return wrap;
}

// ---------------------------------------------------------------- home
async function renderHome() {
  const wrap = viewShell(null);
  const wl = watchlist();
  const wlPanel = h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "관심 종목"), h("span", { class: "sub" }, wl.length ? `${wl.length}종목 · 이 브라우저에 저장` : "")));
  if (wl.length) {
    const grid = h("div", { class: "wl" });
    for (const t of wl) grid.append(watchCard(t));
    wlPanel.append(grid);
  } else {
    wlPanel.append(h("p", { class: "lede" }, "종목 페이지에서 ", h("b", null, "★ 관심 종목"), "을 누르면 여기에 모여요. 많이 찾는 종목부터 둘러보세요."));
    const grid = h("div", { class: "wl" });
    for (const t of POPULAR.filter((x) => row(x)).slice(0, 8)) grid.append(watchCard(t));
    wlPanel.append(grid);
  }
  const earnPanel = h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "다가오는 실적 발표"),
    h("button", { type: "button", class: "linkish", onclick: () => go("calendar") }, "캘린더 전체 보기")));
  const elist = h("div", { class: "elist" }, h("p", { class: "note" }, "불러오는 중…"));
  earnPanel.append(elist);
  wrap.append(h("div", { class: "hero" }, wlPanel, earnPanel));
  // movers
  const sp = DATA.rows.filter((r) => r.q === "EQUITY" && r.sp5 && isNum(r.ch));
  if (sp.length > 20) {
    const ups = sp.slice().sort((a, b) => b.ch - a.ch).slice(0, 6), dns = sp.slice().sort((a, b) => a.ch - b.ch).slice(0, 6);
    const col = (title, rows) => h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 } }, h("h3", { class: "sub-h" }, title),
      h("div", { class: "elist" }, rows.map((r) => h("button", { type: "button", class: "erow", onclick: () => go("company", r.t) },
        h("span", { class: "d" }, sectorKo(r.s)), h("span", { class: "nm" }, h("b", null, r.t), dispName(r.t)), h("span", { class: "r " + cls(r.ch) }, fmtP(r.ch, 1))))));
    wrap.append(h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "오늘 크게 움직인 S&P 500 종목"), h("span", { class: "sub" }, fmtD(DATA.dates[DATA.dates.length - 1], "mdw") + " 종가")),
      h("div", { class: "grid2" }, col("상승", ups), col("하락", dns))));
  }
  // macro strip
  const mPanel = h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "매크로 한눈에"),
    h("button", { type: "button", class: "linkish", onclick: () => go("macro") }, "매크로 대시보드")));
  const strip = h("div", { class: "mstrip" }, h("p", { class: "note" }, "불러오는 중…"));
  mPanel.append(strip);
  wrap.append(mPanel);
  // presets
  const pPanel = h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "조건으로 종목 찾기"), h("span", { class: "sub" }, "누르면 스크리너가 열려요")));
  const pg = h("div", { class: "presets" });
  for (const p of PRESETS.filter((x) => x.id !== "all")) {
    const n = DATA.rows.filter((r) => r.q === "EQUITY" && p.fn(r)).length;
    pg.append(h("button", { type: "button", class: "pcard", onclick: () => { SCR.preset = p.id; go("screener"); } },
      h("b", null, p.name), h("span", null, p.desc), h("span", { class: "ct" }, fmtN(n) + "종목")));
  }
  pPanel.append(pg);
  wrap.append(pPanel);
  // async parts
  loadCal().then((cal) => {
    clear(elist);
    const today = todayISO();
    const lim = new Date(pd(today).getTime() + 8 * DAYMS).toISOString().slice(0, 10);
    const ev = Object.entries(cal.tickers || {}).filter(([t, v]) => v.d >= today && v.d <= lim && row(t))
      .map(([t, v]) => ({ sym: t, d: v.d, time: v.t || "", mc: row(t).mc || 0 })).sort((a, b) => b.mc - a.mc).slice(0, 10)
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : b.mc - a.mc));
    if (!ev.length) { elist.append(h("p", { class: "note" }, "앞으로 일주일 안에 발표하는 주요 종목이 없어요.")); return; }
    for (const x of ev) elist.append(h("button", { type: "button", class: "erow", onclick: () => go("company", x.sym) },
      h("span", { class: "d" }, fmtD(x.d, "md") + " (" + WD[pd(x.d).getDay()] + ") ", h("span", { class: "tb " + x.time }, x.time === "bmo" ? "장전" : x.time === "amc" ? "장후" : "미정")),
      h("span", { class: "nm" }, h("b", null, x.sym), dispName(x.sym)), h("span", { class: "r" }, isNum(x.mc) ? fmtM(x.mc * 1000) : "")));
  }).catch(() => { clear(elist).append(h("p", { class: "note" }, "실적 일정을 불러오지 못했어요.")); });
  loadMacro().then((m) => {
    clear(strip);
    for (const key of ["FFR", "UST10Y", "SP10_3M", "CPI", "CORE_PCE", "UNRATE", "VIX", "HY"]) {
      const s = m.series[key];
      if (!s) continue;
      strip.append(macroMini(key, s));
    }
  }).catch(() => { clear(strip).append(h("p", { class: "note" }, "매크로 데이터를 불러오지 못했어요.")); });
}
function watchCard(t) {
  const r = row(t);
  const b = h("button", { type: "button", class: "wcard", onclick: () => go("company", t) },
    h("div", { class: "top1" }, h("span", { class: "sym" }, t), r && isNum(r.v) ? h("span", { class: "ab a" + r.v, style: { fontSize: "11px", padding: "0 7px 0 5px" } }, h("i"), RADAR_KO[r.v]) : null),
    h("span", { class: "nm" }, dispName(t)),
    h("div", { class: "px" }, h("b", null, fmtPx(r.c)), h("span", { class: cls(r.ch) }, fmtP(r.ch, 2))),
    h("div", { class: "meta" }, isNum(r.pe) ? h("span", null, "PER " + fmtN(r.pe, 1)) : null, isNum(r.r1y) ? h("span", null, "1년 " + fmtP(r.r1y, 0)) : null,
      r.nx && r.nx >= todayISO() ? h("span", null, "실적 " + fmtD(r.nx, "md")) : null));
  return b;
}
function macroChange(s) {
  const obs = s.obs;
  if (!obs || obs.length < 2) return {};
  const last = obs[obs.length - 1];
  const find = (days) => { const t = pd(last[0]).getTime() - days * DAYMS; let v = null; for (const o of obs) { if (pd(o[0]).getTime() <= t) v = o; else break; } return v; };
  const m1 = find(s.freq === "M" ? 31 : s.freq === "Q" ? 92 : 30), y1 = find(365);
  const pctUnit = /%|pt/.test(s.unit) && !/전년비|연율/.test(s.unit) ? false : false;
  return { last, m1, y1, pctUnit };
}
function macroFmt(s, v) {
  if (!isNum(v)) return "–";
  if (s.unit === "천 명" || s.unit === "천 건" || s.unit === "천 호(연율)") return fmtN(v, 0);
  if (s.unit === "pt" && v > 1000) return fmtN(v, 0);
  if (s.unit === "조 달러") return fmtN(v, 2);
  if (s.unit === "지수") return fmtN(v, v > 50 ? 1 : 3);
  if (s.unit === "달러/배럴") return fmtN(v, 1);
  return fmtN(v, 2);
}
function macroDelta(s, a, b) {
  if (!a || !b || !isNum(a[1]) || !isNum(b[1])) return null;
  if (s.unit === "천 명") { const d = a[1] - b[1]; return (d > 0 ? "+" : d < 0 ? "−" : "") + fmtN(Math.abs(d), 0) + "천 명"; }
  const isRate = /%/.test(s.unit) || s.unit === "%p";
  if (isRate) { const d = a[1] - b[1]; return (d > 0 ? "+" : d < 0 ? "−" : "") + fmtN(Math.abs(d), 2) + "%p"; }
  return fmtP((a[1] / b[1] - 1) * 100, 1);
}
function macroMini(key, s) {
  const c = macroChange(s);
  const recent = s.obs.slice(-Math.min(s.obs.length, s.freq === "D" ? 504 : s.freq === "W" ? 104 : s.freq === "Q" ? 12 : 36)).map((o) => o[1]);
  return h("button", { type: "button", class: "mcard", onclick: () => { MAC.open = key; go("macro"); } },
    h("span", { class: "nm" }, s.name),
    h("span", { class: "v" }, macroFmt(s, c.last && c.last[1]), h("small", null, s.unit)),
    spark(recent, "var(--s1)", 150, 30),
    h("span", { class: "d" }, (c.last ? fmtD(c.last[0], s.freq === "M" || s.freq === "Q" ? "ym" : "md") : "") + (macroDelta(s, c.last, c.y1) ? " · 1년 " + macroDelta(s, c.last, c.y1) : "")));
}

// ---------------------------------------------------------------- screener
const PRESETS = [
  { id: "all", name: "전체", desc: "모든 종목", fn: () => true },
  { id: "growth", name: "고성장", desc: "매출 20%↑·이익 15%↑ 성장 (전년 동기 대비)", fn: (r) => r.rg >= 20 && r.eg >= 15 },
  { id: "value", name: "저평가", desc: "PER이 섹터 중앙값의 80% 이하, 선행 PER 15배 이하, 이익 성장 중", fn: (r) => { const m = ustat().medSec[r.s] || {}; return r.pe > 0 && isNum(m.pe) && r.pe <= m.pe * 0.8 && r.fpe > 0 && r.fpe <= 15 && (r.eg == null || r.eg > 0); } },
  { id: "quality", name: "우량주", desc: "ROE 20%↑, 영업이익률 20%↑, 부채비율 100% 이하, FCF 흑자", fn: (r) => r.roe >= 20 && r.om >= 20 && (r.de == null || r.de <= 100) && r.fcfy > 0 },
  { id: "dividend", name: "고배당", desc: "배당수익률 3%↑, 배당성향 90% 이하", fn: (r) => r.dy >= 3 && (r.pay == null || r.pay <= 90) },
  { id: "analyst", name: "목표가 괴리 큼", desc: "애널리스트 8명↑, 평균 의견 ‘매수’ 이상, 목표가 대비 20%↑ 여력", fn: (r) => r.na >= 8 && r.rm <= 2 && r.up >= 20 },
  { id: "radar", name: "추세 레이더 매수", desc: "추세 레이더가 ‘매수’ 또는 ‘매수 대기’로 판정한 종목", fn: (r) => r.v === 5 || r.v === 4 },
  { id: "soon", name: "실적 임박", desc: "7일 안에 실적 발표 예정", fn: (r) => r.nx && r.nx >= todayISO() && daysBetween(todayISO(), r.nx) <= 7 },
  { id: "surprise", name: "어닝 서프라이즈", desc: "최근 30일 안에 발표해서 EPS가 예상을 5% 이상 웃돈 종목", fn: (r) => r.lr && daysBetween(r.lr, todayISO()) <= 30 && r.ls >= 5 },
];
const SCR = { preset: "all", sector: -1, mc: 0, sp5: false, q: "", sort: "mc", dir: -1, shown: 100 };
const SCOLS = [
  ["mc", "시총", (r) => (isNum(r.mc) ? fmtM(r.mc * 1000) : "–")],
  ["c", "주가", (r) => fmtPx(r.c)],
  ["ch", "1일", (r) => fmtP(r.ch, 1), true],
  ["r1m", "1개월", (r) => fmtP(r.r1m, 1), true],
  ["r1y", "1년", (r) => fmtP(r.r1y, isNum(r.r1y) && Math.abs(r.r1y) < 10 ? 1 : 0), true],
  ["pe", "PER", (r) => (isNum(r.pe) ? fmtN(r.pe, 1) : "–")],
  ["fpe", "선행PER", (r) => (isNum(r.fpe) ? fmtN(r.fpe, 1) : "–")],
  ["ps", "PSR", (r) => (isNum(r.ps) ? fmtN(r.ps, 1) : "–")],
  ["eve", "EV/EBITDA", (r) => (isNum(r.eve) ? fmtN(r.eve, 1) : "–")],
  ["rg", "매출성장", (r) => fmtP(r.rg, isNum(r.rg) && Math.abs(r.rg) < 10 ? 1 : 0), true],
  ["om", "영업이익률", (r) => (isNum(r.om) ? fmtP(r.om, 0, false) : "–")],
  ["roe", "ROE", (r) => (isNum(r.roe) ? fmtP(r.roe, 0, false) : "–")],
  ["de", "부채비율", (r) => (isNum(r.de) ? fmtN(r.de, 0) + "%" : "–")],
  ["dy", "배당", (r) => (isNum(r.dy) ? fmtP(r.dy, 1, false) : "–")],
  ["up", "목표가 괴리", (r) => fmtP(r.up, isNum(r.up) && Math.abs(r.up) < 10 ? 1 : 0), true],
  ["rm", "의견", (r) => (isNum(r.rm) ? (r.rm <= 1.5 ? "강력 매수" : r.rm <= 2.5 ? "매수" : r.rm <= 3.5 ? "중립" : "매도") : "–")],
  ["v", "레이더", null],
  ["nx", "실적일", (r) => (r.nx ? fmtD(r.nx, "md") : "–")],
];
function screenerRows() {
  const p = PRESETS.find((x) => x.id === SCR.preset) || PRESETS[0];
  const q = SCR.q.trim().toLowerCase();
  const hits = q ? new Set(search(q, 400)) : null;
  let rows = DATA.rows.filter((r) => r.q === "EQUITY" && p.fn(r) && (SCR.sector < 0 || r.s === SCR.sector) && (!SCR.mc || (r.mc || 0) >= SCR.mc) && (!SCR.sp5 || r.sp5) && (!hits || hits.has(r.t)));
  const k = SCR.sort, d = SCR.dir;
  rows.sort((a, b) => {
    const x = a[k], y = b[k];
    const xa = x == null || x === "" ? null : x, ya = y == null || y === "" ? null : y;
    if (xa == null && ya == null) return (b.mc || 0) - (a.mc || 0);
    if (xa == null) return 1;
    if (ya == null) return -1;
    return (xa < ya ? -1 : xa > ya ? 1 : 0) * d;
  });
  return rows;
}
function renderScreener() {
  const wrap = viewShell("종목 찾기", "미국 상장 종목 전체를 재무·밸류에이션·전망으로 걸러 봐요");
  const chips = h("div", { class: "pchips", role: "group", "aria-label": "조건 모음" });
  const desc = h("p", { class: "pdesc" });
  const secSel = h("select", { class: "sel", "aria-label": "섹터" }, h("option", { value: "-1" }, "모든 섹터"), SECTOR_KO.map((s, i) => h("option", { value: String(i) }, s)));
  const mcSel = h("select", { class: "sel", "aria-label": "시가총액" }, [[0, "시총 전체"], [10, "100억$ 이상"], [50, "500억$ 이상"], [200, "2,000억$ 이상"]].map(([v, l]) => h("option", { value: String(v) }, l)));
  const spBtn = h("button", { type: "button", class: "btn", "aria-pressed": String(SCR.sp5) }, "S&P 500만");
  const qIn = h("input", { class: "inp", type: "search", placeholder: "이 안에서 검색", value: SCR.q, style: { flex: "1 1 180px", maxWidth: "260px" } });
  secSel.value = String(SCR.sector); mcSel.value = String(SCR.mc);
  const rbar = h("div", { class: "rbar" });
  const tw = h("div", { class: "st-wrap" });
  const more = h("button", { type: "button", class: "btn", hidden: true }, "100개 더 보기");
  wrap.append(h("section", { class: "panel" }, chips, desc, h("div", { class: "fbar" }, secSel, mcSel, spBtn, qIn), rbar), tw, more);
  const counts = new Map(PRESETS.map((p) => [p.id, DATA.rows.filter((r) => r.q === "EQUITY" && p.fn(r)).length]));
  function drawChips() {
    clear(chips);
    for (const p of PRESETS) {
      if (p.id === "radar" && !DATA.rows.some((r) => isNum(r.v))) continue;
      const b = h("button", { type: "button", class: "pchip", "aria-pressed": String(SCR.preset === p.id) }, p.name, h("span", { class: "ct" }, fmtN(counts.get(p.id))));
      b.addEventListener("click", () => { SCR.preset = p.id; SCR.shown = 100; if (p.id === "soon") { SCR.sort = "nx"; SCR.dir = 1; } else if (p.id === "analyst") { SCR.sort = "up"; SCR.dir = -1; } else if (p.id === "dividend") { SCR.sort = "dy"; SCR.dir = -1; } drawChips(); draw(); });
      chips.append(b);
    }
    const p = PRESETS.find((x) => x.id === SCR.preset);
    desc.textContent = p ? p.desc : "";
  }
  function draw() {
    const rows = screenerRows();
    clear(rbar).append(h("span", null, h("b", null, fmtN(rows.length)), "종목"), h("span", { class: "muted" }, "열 제목을 누르면 정렬돼요 · 행을 누르면 종목 분석으로 이동"));
    const tbl = h("table", { class: "st" });
    const hr = h("tr", null, h("th", { class: "c-name" }, "종목"), h("th", { class: "l", style: { textAlign: "left" } }, "섹터"));
    for (const [k, lab] of SCOLS) {
      const th = h("th", { "aria-sort": SCR.sort === k ? (SCR.dir > 0 ? "ascending" : "descending") : null });
      const b = h("button", { type: "button" }, lab, h("span", { class: "ar" }, SCR.sort === k ? (SCR.dir > 0 ? "▲" : "▼") : "↕"));
      b.addEventListener("click", () => { if (SCR.sort === k) SCR.dir = -SCR.dir; else { SCR.sort = k; SCR.dir = ["pe", "fpe", "ps", "eve", "de", "rm", "nx"].includes(k) ? 1 : -1; } draw(); });
      th.append(b);
      hr.append(th);
    }
    tbl.append(h("thead", null, hr));
    const tb = h("tbody");
    for (const r of rows.slice(0, SCR.shown)) {
      const tr = h("tr", { tabindex: 0 }, h("td", { class: "c-name" }, tkButton(r.t)), h("td", { class: "l" }, sectorKo(r.s)),
        SCOLS.map(([k, , f, signed]) => k === "v" ? h("td", null, isNum(r.v) ? h("span", { class: "ab a" + r.v, style: { fontSize: "11px" } }, h("i"), RADAR_KO[r.v]) : "–")
          : h("td", { class: signed ? cls(r[k]) : null }, f(r))));
      tr.addEventListener("click", () => go("company", r.t));
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go("company", r.t); });
      tb.append(tr);
    }
    tbl.append(tb);
    clear(tw).append(rows.length ? tbl : h("p", { class: "empty", style: { padding: "18px" } }, "조건에 맞는 종목이 없어요."));
    more.hidden = rows.length <= SCR.shown;
    more.textContent = `${Math.min(100, rows.length - SCR.shown)}개 더 보기 (남은 ${fmtN(rows.length - SCR.shown)}개)`;
  }
  secSel.addEventListener("change", () => { SCR.sector = parseInt(secSel.value, 10); SCR.shown = 100; draw(); });
  mcSel.addEventListener("change", () => { SCR.mc = parseInt(mcSel.value, 10); SCR.shown = 100; draw(); });
  spBtn.addEventListener("click", () => { SCR.sp5 = !SCR.sp5; spBtn.setAttribute("aria-pressed", String(SCR.sp5)); SCR.shown = 100; draw(); });
  let tq = 0;
  qIn.addEventListener("input", () => { clearTimeout(tq); tq = setTimeout(() => { SCR.q = qIn.value; SCR.shown = 100; draw(); }, 180); });
  more.addEventListener("click", () => { SCR.shown += 100; draw(); });
  drawChips();
  draw();
}

// ---------------------------------------------------------------- earnings calendar
const CAL = { span: 7, mc: 10, watch: false };
async function renderCalendar() {
  const wrap = viewShell("실적 캘린더", "Nasdaq 발표 일정 기준 · 시간은 미국 동부 기준 장 시작 전/장 마감 후");
  const ctl = h("div", { class: "fbar" });
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } }, h("div", { class: "loading" }, "불러오는 중…"));
  wrap.append(h("section", { class: "panel" }, ctl), body);
  const spanSeg = h("div", { class: "seg", role: "group", "aria-label": "기간" });
  [[7, "1주"], [14, "2주"], [31, "한 달"]].forEach(([v, l]) => {
    const b = h("button", { type: "button", "aria-pressed": String(CAL.span === v) }, l);
    b.addEventListener("click", () => { CAL.span = v; $$("button", spanSeg).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
    spanSeg.append(b);
  });
  const mcSel = h("select", { class: "sel", "aria-label": "시가총액" }, [[0, "시총 전체"], [10, "100억$ 이상"], [50, "500억$ 이상"], [200, "2,000억$ 이상"]].map(([v, l]) => h("option", { value: String(v) }, l)));
  mcSel.value = String(CAL.mc);
  mcSel.addEventListener("change", () => { CAL.mc = parseInt(mcSel.value, 10); draw(); });
  const wBtn = h("button", { type: "button", class: "btn", "aria-pressed": String(CAL.watch) }, "관심 종목만");
  wBtn.addEventListener("click", () => { CAL.watch = !CAL.watch; wBtn.setAttribute("aria-pressed", String(CAL.watch)); draw(); });
  ctl.append(spanSeg, mcSel, wBtn);
  let cal;
  try { cal = await loadCal(); } catch (e) { clear(body).append(h("div", { class: "err" }, "실적 일정을 불러오지 못했어요.")); return; }
  function draw() {
    clear(body);
    const today = todayISO();
    const end = new Date(pd(today).getTime() + CAL.span * DAYMS).toISOString().slice(0, 10);
    const wl = new Set(watchlist());
    const ev = Object.entries(cal.tickers || {}).map(([t, v]) => ({ sym: t, d: v.d, time: v.t || "", eps: v.eps, r: row(t) }))
      .filter((x) => x.r && x.d >= today && x.d <= end && (x.r.mc || 0) >= CAL.mc && (!CAL.watch || wl.has(x.sym)));
    const byDay = new Map();
    for (const x of ev) { if (!byDay.has(x.d)) byDay.set(x.d, []); byDay.get(x.d).push(x); }
    const days = Array.from(byDay.keys()).sort();
    const grid = h("div", { class: "cgrid" });
    for (const d of days) {
      const list = byDay.get(d).sort((a, b) => (b.r.mc || 0) - (a.r.mc || 0));
      const box = h("div", { class: "panel cday" }, h("h3", null, fmtD(d, "mdw"), h("span", null, list.length + "종목")));
      for (const x of list.slice(0, 40)) {
        box.append(h("button", { type: "button", class: "crow", onclick: () => go("company", x.sym) },
          h("span", { class: "tb " + x.time }, x.time === "bmo" ? "장전" : x.time === "amc" ? "장후" : "미정"),
          h("span", { class: "nm" }, h("b", null, x.sym), dispName(x.sym)),
          h("span", { class: "r" }, (x.eps ? "EPS " + x.eps + " · " : "") + (isNum(x.r.mc) ? fmtM(x.r.mc * 1000) : ""))));
      }
      if (list.length > 40) box.append(h("p", { class: "note" }, `외 ${list.length - 40}종목`));
      grid.append(box);
    }
    body.append(days.length ? grid : h("p", { class: "empty" }, "조건에 맞는 실적 발표 일정이 없어요."));
    // recent results
    const since = new Date(pd(today).getTime() - 10 * DAYMS).toISOString().slice(0, 10);
    const rec = DATA.rows.filter((r) => r.lr && r.lr >= since && r.lr <= today && isNum(r.ls) && (r.mc || 0) >= CAL.mc && (!CAL.watch || wl.has(r.t)))
      .sort((a, b) => (b.mc || 0) - (a.mc || 0)).slice(0, 30);
    if (rec.length) {
      const tbl = h("table", { class: "t" });
      tbl.append(h("thead", null, h("tr", null, ["종목", "발표일", "EPS 서프라이즈", "발표 전후 주가", "시총"].map((x, i) => h("th", { class: i ? "n" : null }, x)))));
      const tb = h("tbody");
      for (const r of rec) {
        const tr = h("tr", { class: "click", tabindex: 0 }, h("td", null, tkButton(r.t)), h("td", { class: "n" }, fmtD(r.lr, "md")),
          h("td", { class: "n " + cls(r.ls) }, fmtP(r.ls, 1)), h("td", { class: "n " + cls(r.lrx) }, isNum(r.lrx) ? fmtP(r.lrx, 1) : "–"),
          h("td", { class: "n" }, fmtM((r.mc || 0) * 1000)));
        tr.addEventListener("click", () => go("company", r.t));
        tb.append(tr);
      }
      tbl.append(tb);
      body.append(h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "최근 10일 실적 발표 결과"), h("span", { class: "sub" }, "조정 EPS 기준 · 주가는 발표 전날 종가 → 발표 다음 날 종가")),
        h("div", { class: "tw" }, tbl)));
    }
  }
  draw();
}

// ---------------------------------------------------------------- macro
const MAC = { open: null, range: "5Y" };
function regimeTiles(m) {
  const S = m.series, out = [];
  const L = (k) => { const s = S[k]; return s && s.obs.length ? s.obs[s.obs.length - 1] : null; };
  const ago = (k, days) => { const s = S[k]; if (!s) return null; const last = s.obs[s.obs.length - 1]; const t = pd(last[0]).getTime() - days * DAYMS; let v = null; for (const o of s.obs) { if (pd(o[0]).getTime() <= t) v = o; else break; } return v; };
  const ffr = L("FFR"), ffr1 = ago("FFR", 365);
  if (ffr) {
    const d = ffr1 ? ffr[1] - ffr1[1] : 0;
    out.push({ lv: "ok", t: `기준금리 ${fmtN(ffr[1], 2)}%`, s: d < -0.1 ? `1년 새 ${fmtN(-d, 2)}%p 인하 — 완화 국면이에요.` : d > 0.1 ? `1년 새 ${fmtN(d, 2)}%p 인상 — 긴축 국면이에요.` : "1년째 동결이에요." });
    if (d > 0.1) out[out.length - 1].lv = "warn";
  }
  const c3 = L("SP10_3M"), c2 = L("SP10_2");
  if (c3) out.push({ lv: c3[1] < 0 ? "bad" : c3[1] < 0.3 ? "warn" : "ok", t: `장단기 금리차 ${fmtN(c3[1], 2)}%p (10년−3개월)`, s: c3[1] < 0 ? "역전 상태 — 과거엔 경기 침체의 선행 신호였어요." : c3[1] < 0.3 ? "거의 평평해요." : "정상 기울기예요." + (c2 ? ` 10년−2년은 ${fmtN(c2[1], 2)}%p.` : "") });
  const cpi = L("CPI"), core = L("CORE_PCE"), cpi3 = ago("CPI", 92);
  if (cpi) out.push({ lv: cpi[1] > 3.5 ? "bad" : cpi[1] > 2.6 ? "warn" : "ok", t: `소비자물가 ${fmtN(cpi[1], 1)}% (전년비)`,
    s: (cpi3 ? (cpi[1] < cpi3[1] - 0.1 ? "3개월 전보다 둔화" : cpi[1] > cpi3[1] + 0.1 ? "3개월 전보다 가속" : "3개월 전과 비슷") : "") + (core ? ` · 근원 PCE ${fmtN(core[1], 1)}% (연준 목표 2%)` : "") });
  const un = L("UNRATE"), sahm = L("SAHM"), nfp = L("NFP");
  if (un) out.push({ lv: sahm && sahm[1] >= 0.5 ? "bad" : sahm && sahm[1] >= 0.3 ? "warn" : "ok", t: `실업률 ${fmtN(un[1], 1)}%`,
    s: (sahm ? `삼의 법칙 지표 ${fmtN(sahm[1], 2)} (0.5 이상이면 침체 신호)` : "") + (nfp ? ` · 최근 고용 ${nfp[1] >= 0 ? "+" : "−"}${fmtN(Math.abs(nfp[1]), 0)}천 명` : "") });
  const gdp = L("GDP"), ret = L("RETAIL");
  if (gdp) out.push({ lv: gdp[1] < 0 ? "bad" : gdp[1] < 1 ? "warn" : "ok", t: `실질 GDP ${fmtN(gdp[1], 1)}% (연율, ${fmtD(gdp[0], "ym")})`, s: ret ? `소매판매 전년비 ${fmtP(ret[1], 1)}` : "" });
  const hy = L("HY"), nfci = L("NFCI");
  if (hy) out.push({ lv: hy[1] > 5 ? "bad" : hy[1] > 4 ? "warn" : "ok", t: `하이일드 스프레드 ${fmtN(hy[1], 2)}%p`, s: (hy[1] > 5 ? "신용 불안 구간" : hy[1] > 4 ? "다소 벌어짐" : "신용 시장 안정") + (nfci ? ` · 금융여건지수 ${fmtN(nfci[1], 2)} (${nfci[1] < 0 ? "완화적" : "긴축적"})` : "") });
  const vix = L("VIX");
  if (vix) out.push({ lv: vix[1] >= 25 ? "bad" : vix[1] >= 18 ? "warn" : "ok", t: `VIX ${fmtN(vix[1], 1)}`, s: vix[1] >= 25 ? "공포 구간 — 변동성이 커요." : vix[1] >= 18 ? "평소보다 불안해요." : "시장이 평온해요." });
  return out;
}
async function renderMacro() {
  const wrap = viewShell("매크로 대시보드", "미국 연준 FRED 공식 통계 · 매일 아침 갱신");
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } }, h("div", { class: "loading" }, "불러오는 중…"));
  wrap.append(body);
  let m;
  try { m = await loadMacro(); } catch (e) { clear(body).append(h("div", { class: "err" }, "매크로 데이터를 불러오지 못했어요.")); return; }
  clear(body);
  // regime
  const tiles = regimeTiles(m);
  const briefOut = h("div", { class: "ai-out" });
  const briefBtn = h("button", { type: "button", class: "btn sm", hidden: !APP.cap.sample }, "AI 매크로 브리핑");
  document.addEventListener("caps", () => { briefBtn.hidden = !APP.cap.sample; }, { once: true });
  const briefStatus = h("span", { class: "ai-status" });
  const cachedBrief = LS.get("macrobrief");
  if (cachedBrief && cachedBrief.text && cachedBrief.upd === m.updated_at) { briefOut.innerHTML = mdToHtml(cachedBrief.text); briefStatus.textContent = relTime(cachedBrief.at) + " 작성"; }
  briefBtn.addEventListener("click", () => macroBrief(m, tiles, briefOut, briefBtn, briefStatus));
  body.append(h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "지금 경제는"), h("span", { class: "sub" }, "규칙 기반 요약 · 최신 발표치")),
    h("div", { class: "regime" }, tiles.map((t) => h("div", { class: "rg " + t.lv }, h("i"), h("div", null, h("b", null, t.t), h("span", null, t.s))))),
    h("div", { class: "ai-ctl" }, briefBtn, briefStatus), briefOut));
  // yield curve
  if (m.curve && m.curve.rows && m.curve.rows.now) {
    const cv = m.curve, cats = cv.tenors;
    const ser = [["now", "var(--s1)", "최근"], ["m1", "var(--s2)", "1개월 전"], ["y1", "var(--s3)", "1년 전"]].filter(([k]) => cv.rows[k])
      .map(([k, col, lab]) => ({ name: `${lab} (${fmtD(cv.rows[k].d, "md")})`, color: col, x: cats.map((_, i) => i), y: cv.rows[k].v, dots: true, fmt: (v) => fmtN(v, 2) + "%" }));
    const box = h("div", { class: "chart" });
    body.append(h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "미 국채 수익률 곡선"), h("span", { class: "sub" }, "만기별 금리")),
      legend(ser.map((s) => ({ name: s.name, color: s.color, kind: "line" }))), box,
      h("p", { class: "note" }, "오른쪽이 올라가는 모양이 정상이에요. 단기 금리가 장기 금리보다 높으면(역전) 경기 둔화 우려가 크다는 뜻이에요.")));
    lineChart(box, { height: 240, cats, series: ser, yFmt: (v) => fmtN(v, 1) + "%", label: "미 국채 수익률 곡선" });
  }
  // groups
  for (const g of m.groups) {
    const keys = Object.keys(m.series).filter((k) => m.series[k].group === g.id);
    if (!keys.length) continue;
    const grid = h("div", { class: "mcards" });
    const sec = h("section", { class: "panel mgroup" }, h("h3", null, g.name), grid);
    for (const key of keys) grid.append(macroCard(key, m.series[key], grid));
    body.append(sec);
  }
  body.append(h("p", { class: "note" }, `FRED 수집 ${m.updated_at ? fmtD(m.updated_at.slice(0, 10)) : ""} · 월간 지표는 발표 시점에 한 달 이상 늦게 나와요. 카드를 누르면 긴 기간 차트가 열려요.`));
  if (MAC.open && m.series[MAC.open]) {
    const card = $(`.mc2[data-key="${MAC.open}"]`, body);
    if (card) { card.click(); setTimeout(() => card.scrollIntoView({ block: "center" }), 50); }
    MAC.open = null;
  }
}
function macroCard(key, s, grid) {
  const c = macroChange(s);
  const n = s.freq === "D" ? 504 : s.freq === "W" ? 104 : s.freq === "Q" ? 12 : 36;
  const btn = h("button", { type: "button", class: "mc2", "data-key": key, "aria-expanded": "false" },
    h("div", { class: "hd" }, h("span", { class: "nm" }, s.name), h("span", { class: "dt" }, c.last ? fmtD(c.last[0], s.freq === "M" || s.freq === "Q" ? "ym" : "md") : "")),
    h("div", { class: "row" }, h("span", { class: "v" }, macroFmt(s, c.last && c.last[1]), h("small", null, s.unit)), spark(s.obs.slice(-n).map((o) => o[1]), "var(--s1)", 110, 34)),
    h("span", { class: "chg" }, [c.m1 ? (s.freq === "Q" ? "직전 분기 " : "1개월 ") + (macroDelta(s, c.last, c.m1) || "–") : null, c.y1 ? "1년 " + (macroDelta(s, c.last, c.y1) || "–") : null].filter(Boolean).join(" · ")));
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    $$(".mc2", grid).forEach((b) => b.setAttribute("aria-expanded", "false"));
    $$(".mdetail", grid).forEach((d) => d.remove());
    if (open) return;
    btn.setAttribute("aria-expanded", "true");
    const det = h("div", { class: "mdetail" });
    // insert after the last card of this visual row
    const cards = $$(".mc2", grid);
    const top = btn.offsetTop;
    let after = btn;
    for (const cd of cards) if (cd.offsetTop === top) after = cd;
    after.after(det);
    const seg = h("div", { class: "seg", role: "group", "aria-label": "기간" });
    const box = h("div", { class: "chart" });
    det.append(h("div", { class: "ctools" }, h("b", null, s.name + " (" + s.unit + ")"), seg), box,
      h("p", { class: "note" }, s.desc + " ", h("a", { href: "https://fred.stlouisfed.org/series/" + s.id, target: "_blank", rel: "noopener" }, "FRED " + s.id + " ↗")));
    const draw = () => {
      const yrs = { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10, "전체": 99 }[MAC.range];
      const t0 = pd(s.obs[s.obs.length - 1][0]).getTime() - yrs * 365.25 * DAYMS;
      const pts = s.obs.filter((o) => pd(o[0]).getTime() >= t0);
      const zero = /%p$/.test(s.unit) || s.unit === "천 명" || key === "NFCI" || key === "SAHM";
      lineChart(box, { height: 240, label: s.name, series: [{ name: s.name, color: "var(--s1)", x: pts.map((o) => pd(o[0]).getTime()), y: pts.map((o) => o[1]), area: !zero, fmt: (v) => macroFmt(s, v) + " " + s.unit }],
        yFmt: (v) => macroFmt(s, v), refs: zero ? [{ y: key === "SAHM" ? 0.5 : 0, label: key === "SAHM" ? "침체 신호 0.5" : "" }] : [],
        tipTitle: (t) => fmtD(new Date(t), s.freq === "M" || s.freq === "Q" ? "ym" : null), endLabel: true });
    };
    ["1Y", "3Y", "5Y", "10Y", "전체"].forEach((r) => {
      const b = h("button", { type: "button", "aria-pressed": String(MAC.range === r) }, r);
      b.addEventListener("click", () => { MAC.range = r; $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
      seg.append(b);
    });
    draw();
  });
  return btn;
}
async function macroBrief(m, tiles, out, btn, status) {
  const sample = APP.cap.sample;
  if (!sample) return;
  const snap = {};
  for (const [k, s] of Object.entries(m.series)) {
    const c = macroChange(s);
    if (!c.last) continue;
    snap[s.name] = { 최신: c.last[1], 날짜: c.last[0], 단위: s.unit, "직전 비교치(1개월·직전 분기 전)": c.m1 ? c.m1[1] : null, "1년 전": c.y1 ? c.y1[1] : null };
  }
  const prompt = "당신은 미국 매크로 이코노미스트예요. 아래 미국 경제 지표 최신값(FRED)만 근거로, 미국 주식에 투자하는 한국 개인 투자자를 위한 매크로 브리핑을 한국어로 써 주세요.\n" +
    "형식: Markdown. ### 한 줄 요약, ### 금리와 연준, ### 물가, ### 고용과 성장, ### 신용·유동성·시장 심리, ### 주식 투자에 주는 시사점(유리한 업종·불리한 업종, 체크할 다음 발표) 순서. 전체 1,200~1,800자. 숫자는 주어진 값만 쓰고, 추측은 추측이라고 밝히세요. 마지막 줄에 '※ 참고용이며 투자 권유가 아닙니다.'\n\n" +
    JSON.stringify({ 기준: m.updated_at, 국채수익률곡선: m.curve ? m.curve.rows : null, 지표: snap, 규칙기반요약: tiles.map((t) => t.t + " — " + t.s) });
  btn.disabled = true;
  status.textContent = "Claude가 지표를 읽는 중이에요…";
  let latest = "", raf = 0;
  const paint = () => { raf = 0; out.innerHTML = mdToHtml(latest); };
  try {
    const res = await sample(prompt, { modelTier: "default", cache: { gcTime: 43200000 }, onText: ({ text }) => { latest = text; status.textContent = "작성 중…"; if (!raf) raf = requestAnimationFrame(paint); } });
    latest = res.text; paint();
    LS.set("macrobrief", { text: res.text, at: Date.now(), upd: m.updated_at });
    status.textContent = "완료";
  } catch (e) {
    if (e && e.text) { latest = e.text; paint(); }
    status.textContent = sampleErrorText(e);
  } finally { btn.disabled = false; }
}
