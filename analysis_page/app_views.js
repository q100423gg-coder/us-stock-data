/* =====================================================================
   기업 분석 노트 — home, screener, earnings calendar (macro: app_macro.js)
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
      h("span", { class: "nm" }, h("b", null, x.sym), dispName(x.sym)), h("span", { class: "r" }, isNum(x.mc) ? [fmtM(x.mc * 1000), kLine(krwM(x.mc * 1000))] : "")));
  }).catch(() => { clear(elist).append(h("p", { class: "note" }, "실적 일정을 불러오지 못했어요.")); });
  loadMacro().then((m) => {
    clear(strip);
    const rd = macroRead(m);
    strip.before(macroVerdict(rd));
    for (const key of ["FFR", "UST10Y", "SP10_3M", "CPI", "CORE_PCE", "UNRATE", "VIX", "HY"]) {
      const s = m.series[key];
      if (!s) continue;
      strip.append(macroMini(key, s, rd.items[key]));
    }
  }).catch(() => { clear(strip).append(h("p", { class: "note" }, "매크로 데이터를 불러오지 못했어요.")); });
}
function watchCard(t) {
  const r = row(t);
  const b = h("button", { type: "button", class: "wcard", onclick: () => go("company", t) },
    h("div", { class: "top1" }, h("span", { class: "sym" }, t), r && isNum(r.v) ? h("span", { class: "ab a" + r.v, style: { fontSize: "11px", padding: "0 7px 0 5px" } }, h("i"), RADAR_KO[r.v]) : null),
    h("span", { class: "nm" }, dispName(t)),
    h("div", { class: "px" }, h("b", null, fmtPx(r.c)), h("span", { class: cls(r.ch) }, fmtP(r.ch, 2))),
    krwP(r.c) ? h("small", { class: "krw" }, "≈ " + krwP(r.c)) : null,
    h("div", { class: "meta" }, isNum(r.pe) ? h("span", null, "PER " + fmtN(r.pe, 1)) : null, isNum(r.r1y) ? h("span", null, "1년 " + fmtP(r.r1y, 0)) : null,
      r.nx && r.nx >= todayISO() ? h("span", null, "실적 " + fmtD(r.nx, "md")) : null));
  return b;
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
  ["mc", "시총", (r) => (isNum(r.mc) ? [fmtM(r.mc * 1000), kLine(krwM(r.mc * 1000))] : "–")],
  ["c", "주가", (r) => [fmtPx(r.c), kLine(krwP(r.c))]],
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
          h("span", { class: "r" }, (x.eps ? "EPS " + x.eps + " · " : "") + (isNum(x.r.mc) ? fmtM(x.r.mc * 1000) : ""), isNum(x.r.mc) ? kLine(krwM(x.r.mc * 1000)) : null)));
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
          h("td", { class: "n" }, fmtM((r.mc || 0) * 1000), kLine(krwM((r.mc || 0) * 1000))));
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
