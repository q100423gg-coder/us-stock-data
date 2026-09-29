/* =====================================================================
   기업 분석 노트 — company view
   ===================================================================== */
const CO = { sym: null, rec: null, row: null, per: "a", stmt: "inc", range: "1Y", cmp: false, spy: null };

const lastI = (arr) => { if (!arr) return -1; for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return i; return -1; };
const lastV = (arr) => { const i = lastI(arr); return i >= 0 ? arr[i] : null; };
const ratio = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? (a / b) * 100 : null);
const yoyAt = (arr, i, lag) => (i - lag >= 0 && isNum(arr[i]) && isNum(arr[i - lag]) && arr[i - lag] !== 0 ? ((arr[i] / arr[i - lag]) - 1) * 100 * Math.sign(arr[i - lag]) : null);
/** statements of foreign filers are in their own currency: r.fx converts to USD (null = rate unknown) */
function fxOf(r) { return r.fcur ? (isNum(r.fx) ? r.fx : null) : 1; }
function curPrice() { const lv = APP.live.get(CO.sym); return lv && isNum(lv.px) ? lv.px : CO.row.c; }
function cleanFS(t) {
  if (!t || !t.d || t.__clean) return t;
  const keys = Object.keys(t).filter((k) => k !== "d" && Array.isArray(t[k]));
  const cnt = t.d.map((_, i) => keys.reduce((a, k) => a + (isNum(t[k][i]) ? 1 : 0), 0));
  const mx = Math.max(0, ...cnt);
  const keep = t.d.map((_, i) => cnt[i] >= Math.max(3, mx * 0.3) && (isNum((t.rev || [])[i]) || isNum((t.ni || [])[i]) || isNum((t.ta || [])[i])));
  const out = { __clean: true, d: t.d.filter((_, i) => keep[i]) };
  for (const k of keys) out[k] = t[k].filter((_, i) => keep[i]);
  return out;
}
function fsT(per) {
  const fs = CO.rec && CO.rec.fs;
  if (!fs || !fs[per]) return null;
  if (!fs[per].__clean) fs[per] = cleanFS(fs[per]);
  const t = fs[per];
  return t.d && t.d.length ? t : null;
}
function scrollEnd(el) { requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; }); return el; }
function perLabels(t, per) { return t.d.map((d) => (per === "a" ? "FY" + d.slice(2, 4) : d.slice(2, 4) + "." + d.slice(5, 7))); }
function secHead(title, sub, extra) {
  return h("div", { class: "ph" }, h("h2", null, title), sub ? h("span", { class: "sub" }, sub) : null, extra || null);
}
function kvTile(label, value, sub, cls) {
  return h("div", null, h("span", null, label), h("b", { class: cls || null }, value), sub ? (sub instanceof Node ? sub : h("small", null, sub)) : null);
}
function radarBadge(r, lg) {
  if (!isNum(r.v)) return null;
  const a = h("a", { class: "ab a" + r.v, href: CONFIG.radarUrl || "#", target: "_blank", rel: "noopener", title: "추세 레이더의 기술적 판정 — 새 창에서 열려요" },
    h("i"), "추세 레이더 " + RADAR_KO[r.v]);
  if (lg) a.style.fontSize = "13px";
  return a;
}

// ---------------------------------------------------------------- entry
async function renderCompany(sym) {
  const view = $("#view");
  clear(view);
  const r = row(sym);
  if (!r) { view.append(h("div", { class: "err" }, `‘${sym}’ 종목을 찾지 못했어요. 위 검색창에서 티커나 이름으로 찾아보세요.`)); return; }
  APP.sym = sym;
  LS.set("last", sym);
  Object.assign(CO, { sym, row: r, rec: null, spy: null });
  const wrap = h("div", { class: "co", style: { display: "flex", flexDirection: "column", gap: "18px" } });
  view.append(wrap);
  wrap.append(coHead(r));
  const body = h("div", null, h("div", { class: "loading" }, "기업 데이터를 불러오는 중이에요…"));
  wrap.append(body);
  let rec;
  try { rec = await getRec(sym); } catch (e) {
    clear(body).append(h("div", { class: "err" }, "데이터 파일을 불러오지 못했어요. 잠시 후 새로고침해 주세요. (" + e.message + ")"));
    return;
  }
  if (APP.sym !== sym || APP.view !== "company") return;
  CO.rec = rec || { t: sym };
  if (r.q !== "ETF") { try { CO.spy = await getRec("SPY"); } catch (e) { CO.spy = null; } }
  clear(body);
  body.style.display = "flex"; body.style.flexDirection = "column"; body.style.gap = "18px";
  const R = CO.rec;
  if (r.q === "ETF") {
    body.append(secNav([["s-ov", "개요"], ["s-px", "주가"], ["s-hold", "보유 종목"], ["s-div", "분배금"], ["s-news", "뉴스"]]));
    body.append(secEtfOverview(R), secPrice(R), secHoldings(R), secDividends(R), secNews(R));
  } else {
    const hasFund = !!(R.k || R.fs);
    body.append(h("div", { class: "co-top" }, researchBox(r, R), scorePanel(r, R)));
    body.append(secNav([["s-ov", "개요"], ["s-px", "주가"], ["s-earn", "실적"], ["s-fs", "재무제표"], ["s-val", "투자지표"],
      ["s-an", "애널리스트"], ["s-own", "주주·내부자"], ["s-div", "배당"], ["s-news", "뉴스"], ["s-ai", "AI 노트"]]));
    if (!hasFund) body.append(h("div", { class: "err" }, "이 종목의 기업 데이터를 아직 받지 못했어요. 오늘 밤 수집 뒤에 채워져요. 주가 정보는 아래에서 볼 수 있어요."));
    body.append(secOverview(r, R), secPrice(R), secEarnings(r, R), secStatements(R), secValuation(r, R), secAnalyst(r, R),
      secOwnership(R), secDividends(R), secNews(R), secAI(r, R));
  }
  wireSecNav(body);
  liveQuote(sym, false);
}

function coHead(r) {
  const ko = koName(r.t), en = r.n || r.t;
  const star = h("button", { type: "button", class: "star" + (watchlist().includes(r.t) ? " on" : ""), "aria-pressed": String(watchlist().includes(r.t)) },
    h("span", { class: "ic" }, "★"), "관심 종목");
  star.addEventListener("click", () => { const on = toggleWatch(r.t); star.classList.toggle("on", on); star.setAttribute("aria-pressed", String(on)); });
  const chips = h("div", { class: "chips" },
    r.s >= 0 ? h("span", { class: "chip" }, sectorKo(r.s)) : null,
    r.i ? h("span", { class: "chip", title: r.i }, indKo(r.i)) : null,
    r.sp5 ? h("span", { class: "chip" }, "S&P 500") : null,
    r.cty && r.cty !== "United States" ? h("span", { class: "chip" }, r.cty) : null,
    radarBadge(r), star);
  const px = h("div", { class: "co-px", id: "co-px" });
  fillPx(px, r, null);
  return h("section", { class: "co-head" },
    h("div", { class: "co-id" },
      h("div", { class: "line1" }, h("span", { class: "sym" }, r.t), h("h2", null, ko || shortEn(en)), ko ? h("span", { class: "en" }, en) : null),
      chips),
    px);
}
function fillPx(px, r, live) {
  clear(px);
  const p = live && isNum(live.px) ? live.px : r.c, ch = live && isNum(live.pct) ? live.pct : r.ch;
  const chAbs = live && isNum(live.chg) ? live.chg : (isNum(r.c) && isNum(r.ch) ? r.c - r.c / (1 + r.ch / 100) : null);
  px.append(h("div", { class: "big" }, fmtPx(p)));
  px.append(h("div", { class: "chg " + cls(ch) }, (isNum(chAbs) ? (chAbs > 0 ? "+" : chAbs < 0 ? "−" : "") + fmtN(Math.abs(chAbs), 2) + "  " : "") + fmtP(ch, 2)));
  const asof = h("div", { class: "asof" });
  if (live && isNum(live.px)) {
    asof.append(h("span", { class: "live" }, h("i"), live.open ? "실시간 · Twelve Data" : "최근 체결 · Twelve Data"),
      h("span", null, live.when ? live.when : ""));
  } else {
    const d = DATA.dates[DATA.dates.length - 1];
    asof.append(h("span", null, d ? fmtD(d, "mdw").replace(/ \(.\)/, "") + " 종가" : "종가"));
  }
  const btn = h("span", { id: "live-slot" });
  asof.append(btn);
  px.append(asof);
}

// ---------------------------------------------------------------- live quote (Twelve Data, optional)
async function liveQuote(sym, userAsked) {
  const slot = $("#live-slot");
  if (!slot) return;
  clear(slot);
  if (!APP.cap.mcp) return;
  const st = await tdState();
  if (APP.sym !== sym) return;
  if (st === "unavailable" || st === "denied") return;
  if (st !== "granted" && !userAsked) {
    slot.append(h("button", { type: "button", class: "linkish", onclick: () => liveQuote(sym, true) }, "실시간 시세 보기"));
    return;
  }
  slot.append(h("span", { class: "muted" }, "시세 확인 중…"));
  try {
    const { parsed } = await tdCall("get_quote", { symbol: sym.replace("-", ".") }, 60000);
    if (APP.sym !== sym) return;
    const q = parsed.data && parsed.data.find((x) => String(x.symbol || "").toUpperCase().replace(".", "-") === sym);
    if (!q || !isFinite(parseFloat(q.close))) { clear(slot).append(h("span", { class: "muted" }, parsed.plan ? "실시간 시세는 Twelve Data 요금제에서 지원하지 않아요." : "실시간 시세 없음")); return; }
    const t = parseInt(q.last_quote_at || q.timestamp, 10);
    const when = isFinite(t) ? new Date(t * 1000).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 기준" : "";
    const live = { px: parseFloat(q.close), chg: parseFloat(q.change), pct: parseFloat(q.percent_change), open: q.is_market_open === "true", when };
    APP.live.set(sym, live);
    const px = $("#co-px");
    if (px) { fillPx(px, CO.row, live); const s2 = $("#live-slot"); if (s2) s2.append(h("span", { class: "muted" }, "· 지표는 전일 종가 기준")); }
  } catch (e) {
    if (APP.sym !== sym) return;
    clear(slot).append(h("span", { class: "muted", title: e && e.message ? e.message : "" }, tdErrorText(e)));
  }
}

// ---------------------------------------------------------------- section nav
function secNav(items) {
  return h("nav", { class: "co-nav", "aria-label": "섹션" }, items.map(([id, label]) => h("a", { href: "#" + id, "data-sec": id, onclick: (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  } }, label)));
}
function wireSecNav(root) {
  const nav = $(".co-nav", root);
  if (!nav || typeof IntersectionObserver === "undefined") return;
  const links = new Map($$("a", nav).map((a) => [a.dataset.sec, a]));
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove("on"));
      const a = links.get(e.target.id);
      if (a) { a.classList.add("on"); a.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    }
  }, { rootMargin: "-20% 0px -70% 0px" });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

// ---------------------------------------------------------------- research box & scores
function researchBox(r, R) {
  const k = R.k || {}, e = R.e || {};
  const price = r.c;
  const tgt = (k.tgt || [])[0];
  const nx = r.nx || (e.nx && e.nx.d);
  const dd = nx ? daysBetween(todayISO(), nx) : null;
  const calT = DATA.calMap && DATA.calMap[r.t] ? DATA.calMap[r.t].t : "";
  const rows1 = [
    ["컨센서스 의견", k.rk ? `${REC_KO[k.rk] || k.rk}${isNum(k.rm) ? " (" + fmtN(k.rm, 2) + ")" : ""}` : "–"],
    ["평균 목표주가", isNum(tgt) ? `${fmtPx(tgt)} (${fmtP(r.up, 1)})` : "–"],
    ["목표가 범위", k.tgt && isNum(k.tgt[3]) ? `${fmtPx(k.tgt[3])} ~ ${fmtPx(k.tgt[2])}` : "–"],
    ["애널리스트", isNum(k.na) ? k.na + "명" : "–"],
  ];
  const rows2 = [
    ["시가총액", isNum(r.mc) ? `${fmtM(r.mc * 1000)} · ${fmtKo(r.mc * 1000)}` : "–"],
    ["52주 범위", isNum(k.l52) ? `${fmtPx(k.l52)} ~ ${fmtPx(k.h52)}` : "–"],
    ["PER · 선행 PER", `${isNum(r.pe) ? fmtN(r.pe, 1) + "배" : "적자/–"} · ${isNum(r.fpe) ? fmtN(r.fpe, 1) + "배" : "–"}`],
    ["다음 실적 발표", nx ? `${fmtD(nx, "md")}${calT === "bmo" ? " 장 시작 전" : calT === "amc" ? " 장 마감 후" : ""}${isNum(dd) && dd >= 0 ? " (D-" + dd + ")" : ""}` : "–"],
  ];
  if (isNum(r.v)) rows1.push(["추세 레이더 판정", RADAR_KO[r.v] + (r.g ? " · 등급 " + r.g : "")]);
  if (isNum(r.dy) || isNum(r.rg)) rows2.push(["매출 성장 · 배당", `${isNum(r.rg) ? fmtP(r.rg, 1) : "–"} · ${isNum(r.dy) ? fmtP(r.dy, 2, false) : "없음"}`]);
  const sc = scorecard(r, R);
  const col = (rows) => h("div", { class: "rb-col" }, rows.map(([a, b]) => h("div", { class: "rb-row" }, h("span", null, a), h("b", { title: b }, b))));
  const box = h("section", { class: "rbox", "aria-label": "리서치 요약" },
    h("div", { class: "rbox-h" }, h("h3", null, "리서치 요약 · " + r.t), h("span", null, fmtD(DATA.dates[DATA.dates.length - 1]) + " 종가 " + fmtPx(price))),
    h("div", { class: "rbox-body" }, col(rows1), col(rows2)),
    h("div", { class: "rb-overall" },
      h("div", { class: "sc" }, isNum(sc.overall) ? fmtN(sc.overall, 1) : "–", h("small", null, " / 10")),
      h("p", null, h("b", null, "종합 점수 "), overallText(sc)),
      h("button", { type: "button", class: "btn sm primary", onclick: () => { const el = $("#s-ai"); if (el) el.scrollIntoView({ behavior: "smooth" }); } }, "AI 리서치 노트 ↓")));
  return box;
}
function scorePanel(r, R) {
  const sc = scorecard(r, R);
  const list = h("div", { class: "scores" });
  for (const a of sc.axes) {
    const w = isNum(a.score) ? Math.max(4, a.score * 10) : 0;
    const parts = a.parts.filter((p) => isNum(p[1])).map((p) => `${p[0]} 상위 ${Math.max(1, Math.round(100 - p[1]))}%`);
    list.append(h("div", { class: "srow2" },
      h("span", { class: "lab" }, a.name),
      h("span", { class: "meter", role: "meter", "aria-valuemin": 0, "aria-valuemax": 10, "aria-valuenow": isNum(a.score) ? a.score : 0, "aria-label": a.name },
        h("i", { style: { width: w + "%", background: isNum(a.score) && a.score < 4 ? "var(--s0)" : "var(--s1)" } })),
      h("span", { class: "v" }, isNum(a.score) ? fmtN(a.score, 1) : "–"),
      h("span", { class: "why" }, parts.length ? parts.join(" · ") : "데이터 부족")));
  }
  return h("section", { class: "panel" },
    secHead("요약 평가", "미국 2,000여 종목 중 위치 (0–10, 높을수록 좋음)"),
    list,
    h("p", { class: "note" }, "밸류에이션은 높을수록 ‘싸다’는 뜻이에요. 마진과 배수는 같은 섹터 안에서, 나머지는 전체 종목과 비교했어요. 규칙 기반 점수라 참고용이에요."));
}

// ---------------------------------------------------------------- overview
function secOverview(r, R) {
  const p = R.p || {}, k = R.k || {};
  const sec = h("section", { class: "panel sec", id: "s-ov" }, secHead("개요", p.fye ? "회계연도 말 " + fmtD(p.fye, "md").replace("/", "월 ") + "일" : ""));
  if (p.sum) {
    const d = h("p", { class: "desc clamp", lang: "en" }, p.sum);
    const more = h("button", { type: "button", class: "linkish", onclick: () => { d.classList.toggle("clamp"); more.textContent = d.classList.contains("clamp") ? "전체 보기" : "접기"; } }, "전체 보기");
    const koBox = h("div");
    const koBtn = h("button", { type: "button", class: "btn sm", hidden: !APP.cap.sample }, "한국어로 요약");
    koBtn.addEventListener("click", () => koSummary(R, koBox, koBtn));
    document.addEventListener("caps", () => { koBtn.hidden = !APP.cap.sample; }, { once: true });
    const cached = LS.get("ko:" + R.t);
    if (cached && cached.text) renderKo(koBox, cached.text, cached.at);
    sec.append(koBox, d, h("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" } }, more, koBtn));
  }
  const facts = [];
  if (isNum(p.emp)) facts.push(["직원", fmtN(p.emp) + "명"]);
  if (p.loc) facts.push(["본사", p.loc]);
  if (p.ex) facts.push(["거래소", p.ex]);
  if (p.off && p.off[0]) facts.push(["최고경영자", p.off.find((o) => /ceo|chief executive/i.test(o[1] || "")) ? p.off.find((o) => /ceo|chief executive/i.test(o[1] || ""))[0] : p.off[0][0]]);
  if (facts.length || p.web) {
    sec.append(h("div", { class: "facts" }, facts.map(([a, b]) => h("span", null, a + " ", h("b", null, b))),
      p.web ? h("a", { href: p.web, target: "_blank", rel: "noopener" }, "웹사이트 ↗") : null,
      p.ir ? h("a", { href: p.ir, target: "_blank", rel: "noopener" }, "IR ↗") : null));
  }
  const fx = fxOf(r), fc = r.fcur || "USD";
  const conv = (v) => (isNum(v) && fx ? v * fx : null);
  const ev = isNum(r.mc) && fx ? r.mc * 1000 + (conv(k.debt) || 0) - (conv(k.cash) || 0) : null;
  const inUsd = (v) => (r.fcur && isNum(conv(v)) ? "≈ " + fmtM(conv(v)) + " · " : "");
  const tiles = [
    ["시가총액", fmtM(isNum(r.mc) ? r.mc * 1000 : null), fmtKo(isNum(r.mc) ? r.mc * 1000 : null)],
    ["기업가치(EV)", fmtM(ev), "시총 + 차입금 − 현금"],
    ["매출(최근 12개월)", fmtM(k.rev, fc), inUsd(k.rev) + (isNum(r.rg) ? "전년 동기 대비 " + fmtP(r.rg) : "")],
    ["순이익(최근 12개월)", fmtM(k.ni, fc), inUsd(k.ni) + (isNum(r.eg) ? "이익 성장 " + fmtP(r.eg) : "")],
    ["PER · 선행 PER", `${isNum(r.pe) ? fmtN(r.pe, 1) : "–"} · ${isNum(r.fpe) ? fmtN(r.fpe, 1) : "–"}`, "배"],
    ["PSR · PBR", `${isNum(r.ps) ? fmtN(r.ps, 1) : "–"} · ${isNum(r.pb) ? fmtN(r.pb, 1) : "–"}`, "배"],
    ["EV/EBITDA", isNum(r.eve) ? fmtN(r.eve, 1) + "배" : "–", ""],
    ["영업이익률", isNum(r.om) ? fmtP(r.om, 1, false) : "–", isNum(r.gm) ? "매출총이익률 " + fmtP(r.gm, 1, false) : ""],
    ["ROE", isNum(r.roe) ? fmtP(r.roe, 1, false) : "–", isNum(k.roa) ? "ROA " + fmtR(k.roa) : ""],
    ["부채비율(D/E)", isNum(r.de) ? fmtN(r.de, 0) + "%" : "–", isNum(r.cr) ? "유동비율 " + fmtN(r.cr, 2) + "배" : ""],
    ["FCF 수익률", isNum(r.fcfy) ? fmtP(r.fcfy, 2, false) : "–", isNum(k.fcf) ? "FCF " + fmtM(k.fcf, fc) : ""],
    ["배당수익률", isNum(r.dy) ? fmtP(r.dy, 2, false) : "없음", isNum(k.dr) ? "연 " + fmtPx(k.dr) : ""],
    ["베타", isNum(k.beta) ? fmtN(k.beta, 2) : "–", "시장 대비 변동성"],
    ["공매도 비율", isNum(r.si) ? fmtP(r.si, 2, false) : "–", isNum(k.sr) ? "커버 " + fmtN(k.sr, 1) + "일" : "유통주식 대비"],
    ["기관 · 내부자 보유", `${isNum(k.inst) ? fmtR(k.inst, 0) : "–"} · ${isNum(k.ins) ? fmtR(k.ins, 1) : "–"}`, ""],
    ["발행주식수", fmtShares(k.sh), ""],
  ];
  sec.append(h("div", { class: "kv" }, tiles.map(([a, b, c]) => kvTile(a, b, c))));
  return sec;
}
function renderKo(box, text, at) {
  clear(box);
  const div = h("div", { class: "ko-sum" });
  div.innerHTML = mdToHtml(text);
  box.append(div, h("p", { class: "note" }, "AI 요약 · " + relTime(at)));
}
async function koSummary(R, box, btn) {
  const sample = APP.cap.sample;
  if (!sample || !R.p || !R.p.sum) return;
  btn.disabled = true;
  clear(box).append(h("p", { class: "note" }, "요약하는 중…"));
  const prompt = "다음은 미국 상장사의 영문 회사 소개예요. 한국 개인 투자자가 이해하기 쉽게 한국어 3~4문장으로 요약해 주세요. " +
    "무엇을 팔아서 돈을 버는지, 주요 사업 부문과 대표 제품·서비스를 포함하고, 원문에 없는 내용은 추가하지 마세요. 마크다운 없이 문장만 써 주세요.\n\n" +
    `회사: ${R.p.n || R.t} (${R.t})\n\n` + R.p.sum.slice(0, 6000);
  try {
    const { text } = await sample(prompt, { modelTier: "quick", cache: { gcTime: 86400000 }, onText: ({ text }) => { clear(box).append(h("div", { class: "ko-sum" }, text)); } });
    LS.set("ko:" + R.t, { text, at: Date.now() });
    renderKo(box, text, Date.now());
  } catch (e) {
    clear(box).append(h("p", { class: "note" }, sampleErrorText(e)));
    if (e && e.text) box.prepend(h("div", { class: "ko-sum" }, e.text));
  } finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- price
function secPrice(R) {
  const sec = h("section", { class: "panel sec", id: "s-px" });
  const [dd, dc] = decodePx(R.px);
  const pm = R.pm && R.pm.c ? R.pm : null;
  const spy = CO.spy ? decodePx(CO.spy.px) : [[], []];
  const spym = CO.spy && CO.spy.pm ? CO.spy.pm : null;
  const ranges = [["1M", 22], ["3M", 64], ["6M", 127], ["1Y", 253], ["2Y", 9999], ["5Y", -60], ["10Y", -120]];
  const seg = h("div", { class: "seg", role: "group", "aria-label": "기간" });
  const cmpBtn = h("button", { type: "button", class: "btn sm", "aria-pressed": String(CO.cmp), hidden: !spy[0].length }, "S&P 500 비교");
  const chartBox = h("div", { class: "chart" });
  const cap = h("p", { class: "note" });
  sec.append(secHead("주가", dd.length ? "일봉 " + fmtD(dd[0]) + " ~ " + fmtD(dd[dd.length - 1]) + (pm ? " · 월봉 10년" : "") : ""),
    h("div", { class: "ctools" }, seg, cmpBtn), chartBox, cap);
  const monthTs = (m) => new Date(parseInt(m.slice(0, 4), 10), parseInt(m.slice(5, 7), 10) - 1, 15).getTime();
  function monthly(pmObj) {
    if (!pmObj) return [[], []];
    const y0 = parseInt(pmObj.s.slice(0, 4), 10), m0 = parseInt(pmObj.s.slice(5, 7), 10) - 1;
    const xs = [], ys = [];
    pmObj.c.forEach((c, i) => { const d = new Date(y0, m0 + i, 15); xs.push(d.getTime()); ys.push(c); });
    return [xs, ys];
  }
  function draw() {
    const rg = ranges.find((x) => x[0] === CO.range) || ranges[3];
    let xs, ys, bx = [], by = [];
    if (rg[1] > 0 && dd.length) {
      const n = Math.min(dd.length, rg[1]);
      xs = dd.slice(-n).map((d) => pd(d).getTime()); ys = dc.slice(-n);
      if (spy[0].length) {
        const start = dd[dd.length - n];
        const i0 = spy[0].findIndex((d) => d >= start);
        if (i0 >= 0) { bx = spy[0].slice(i0).map((d) => pd(d).getTime()); by = spy[1].slice(i0); }
      }
    } else {
      const [mx, my] = monthly(pm);
      const n = Math.min(mx.length, -rg[1]);
      xs = mx.slice(-n); ys = my.slice(-n);
      if (spym) { const [sx, sy] = monthly(spym); const t0 = xs[0]; const i0 = sx.findIndex((t) => t >= t0); if (i0 >= 0) { bx = sx.slice(i0); by = sy.slice(i0); } }
    }
    if (!xs || !xs.length) { clear(chartBox).append(h("p", { class: "empty" }, "주가 데이터가 없어요.")); return; }
    const chg = ys.length > 1 ? (ys[ys.length - 1] / ys[0] - 1) * 100 : null;
    const bchg = by.length > 1 ? (by[by.length - 1] / by[0] - 1) * 100 : null;
    const series = [];
    if (CO.cmp && by.length) {
      const b0 = ys[0], s0 = by[0];
      series.push({ name: CO.sym, color: "var(--s1)", x: xs, y: ys.map((v) => (v / b0) * 100), fmt: (v) => fmtP(v - 100, 1) });
      series.push({ name: "S&P 500 (SPY)", color: "var(--s0)", x: bx, y: by.map((v) => (v / s0) * 100), fmt: (v) => fmtP(v - 100, 1) });
      lineChart(chartBox, { height: 260, series, yFmt: (v) => fmtN(v, 0), label: "주가와 S&P 500 비교(시작=100)" });
    } else {
      series.push({ name: CO.sym, color: "var(--s1)", x: xs, y: ys, area: true });
      lineChart(chartBox, { height: 260, series, yFmt: (v) => (v >= 1000 ? fmtN(v, 0) : v >= 100 ? fmtN(v, 0) : fmtN(v, 2)), endLabel: true, label: "주가 추이" });
    }
    clear(cap).append(h("span", null, CO.cmp && by.length ? "시작 시점을 100으로 맞춰 비교했어요. " : "",
      "이 기간 ", h("b", { class: cls(chg) }, fmtP(chg, 1)), isNum(bchg) ? h("span", null, " · S&P 500 ", h("b", null, fmtP(bchg, 1))) : null,
      rg[1] < 0 ? " · 월말 종가(배당 미반영)" : " · 일간 종가(분할 반영, 배당 미반영)"));
  }
  ranges.forEach(([lab, n]) => {
    const ok = n > 0 ? dd.length > 0 && (n === 9999 ? dd.length > 260 : true) : pm && pm.c.length >= Math.min(-n, 24);
    if (!ok) return;
    const b = h("button", { type: "button", "aria-pressed": String(CO.range === lab) }, lab);
    b.addEventListener("click", () => { CO.range = lab; $$("button", seg).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
    seg.append(b);
  });
  cmpBtn.addEventListener("click", () => { CO.cmp = !CO.cmp; cmpBtn.setAttribute("aria-pressed", String(CO.cmp)); draw(); });
  draw();
  // returns vs S&P 500
  const r = CO.row, k = R.k || {};
  const rets = h("div", { class: "rets" });
  const ret = (arrD, arrC, days) => {
    if (!arrD.length) return null;
    const last = pd(arrD[arrD.length - 1]);
    const tgt = new Date(last.getTime() - days * DAYMS);
    let base = null;
    for (let i = 0; i < arrD.length; i++) { if (pd(arrD[i]) <= tgt) base = arrC[i]; else break; }
    return base ? (arrC[arrC.length - 1] / base - 1) * 100 : null;
  };
  const mret = (pmObj, months) => { if (!pmObj || pmObj.c.length <= months) return null; const c = pmObj.c; return (c[c.length - 1] / c[c.length - 1 - months] - 1) * 100; };
  const items = [["1주", ret(dd, dc, 7), ret(spy[0], spy[1], 7)], ["1개월", r.r1m, ret(spy[0], spy[1], 30)], ["3개월", r.r3m, ret(spy[0], spy[1], 91)],
    ["6개월", r.r6m, ret(spy[0], spy[1], 182)], ["연초 이후", r.ytd, null], ["1년", r.r1y, ret(spy[0], spy[1], 365)],
    ["3년", mret(pm, 36), mret(spym, 36)], ["5년", mret(pm, 60), mret(spym, 60)], ["10년", mret(pm, 119), mret(spym, 119)]];
  for (const [lab, v, b] of items) {
    if (!isNum(v)) continue;
    rets.append(h("div", null, h("span", null, lab), h("b", { class: cls(v) }, fmtP(v, 1)), isNum(b) ? h("small", null, "S&P " + fmtP(b, 1)) : null));
  }
  sec.append(rets);
  const lo = k.l52, hi = k.h52;
  if (isNum(lo) && isNum(hi)) {
    sec.append(h("div", { class: "grid2" },
      h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        h("h3", { class: "sub-h" }, "52주 범위"),
        rangeTrack(lo, hi, [{ v: r.c, cls: "", title: "현재가" }], { fillTo: r.c }),
        h("p", { class: "note" }, `현재가는 52주 최저가보다 ${fmtP((r.c / lo - 1) * 100, 1)}, 최고가 대비 ${fmtP((r.c / hi - 1) * 100, 1)} 위치예요.`)),
      isNum(k.ath) ? h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        h("h3", { class: "sub-h" }, "사상 최고가"),
        h("p", { class: "lede" }, h("b", null, fmtPx(k.ath)), ` · 현재가는 최고가 대비 ${fmtP((r.c / k.ath - 1) * 100, 1)}`)) : null));
  }
  return sec;
}

// ---------------------------------------------------------------- earnings
function secEarnings(r, R) {
  const e = R.e || {};
  const sec = h("section", { class: "panel sec", id: "s-earn" }, secHead("실적", "EPS는 조정(Non-GAAP) 기준 컨센서스와 비교"));
  // next report
  const nx = r.nx || (e.nx && e.nx.d);
  const cal = DATA.calMap && DATA.calMap[r.t];
  const tr0 = (e.tr || []).find((x) => x[0] === "0q");
  if (nx) {
    const dd = daysBetween(todayISO(), nx);
    const eps = e.nx && e.nx.eps ? e.nx.eps : null, rev = e.nx && e.nx.rev ? e.nx.rev : null;
    sec.append(h("div", { class: "nextcard" },
      h("div", { class: "it" }, "다음 실적 발표", h("b", null, fmtD(nx, "mdw") + (cal && cal.t === "bmo" ? " 장 시작 전" : cal && cal.t === "amc" ? " 장 마감 후" : ""))),
      isNum(dd) && dd >= 0 ? h("div", { class: "dday" }, dd === 0 ? "D-DAY" : "D-" + dd) : null,
      eps && isNum(eps[0]) ? h("div", { class: "it" }, "예상 EPS", h("b", null, "$" + fmtN(eps[0], 2) + (isNum(eps[1]) ? ` (${fmtN(eps[1], 2)}~${fmtN(eps[2], 2)})` : ""))) : null,
      rev && isNum(rev[0]) ? h("div", { class: "it" }, "예상 매출", h("b", null, fmtM(rev[0]) + (tr0 && isNum(tr0[13]) ? " · 전년비 " + fmtP(tr0[13] * 100, 1) : ""))) : null,
      tr0 && isNum(tr0[7]) ? h("div", { class: "it" }, "EPS 성장 예상", h("b", null, fmtP(tr0[7] * 100, 1))) : null,
      e.nx && e.nx.est ? h("span", { class: "tag" }, "예상일(미확정)") : cal && cal.src === "nasdaq" ? h("span", { class: "tag" }, "Nasdaq 일정") : null));
  }
  const hist = (e.h || []).filter((x) => isNum(x[3]) || isNum(x[4]));
  if (hist.length) {
    const cats = hist.map((x) => (x[2] || (x[0] || "").slice(2, 7)).replace(/^(\d)Q(\d{4})$/, (m, q, y) => y.slice(2) + "." + q + "Q"));
    const box = h("div", { class: "chart" });
    const surp = h("div", { class: "surp" });
    sec.append(h("div", { class: "grid2" },
      h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
        h("h3", { class: "sub-h" }, "EPS 실제 vs 예상"),
        legend([{ name: "실제 EPS", color: "var(--s1)", kind: "box" }, { name: "예상 EPS(컨센서스)", color: "var(--ink)", kind: "tick" }]), box),
      h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, h("h3", { class: "sub-h" }, "어닝 서프라이즈"), surp)));
    barChart(box, { height: 200, cats, yFmt: (v) => "$" + fmtN(v, Math.abs(v) < 10 ? 2 : 1),
      series: [{ name: "실제 EPS", color: "var(--s1)", values: hist.map((x) => x[3]) }, { name: "예상 EPS", color: "var(--ink)", kind: "tick", values: hist.map((x) => x[4]) }],
      note: (i) => (isNum(hist[i][5]) ? `서프라이즈 ${fmtP(hist[i][5], 1)}` : "") + (hist[i][6] ? ` · 발표 ${fmtD(hist[i][6], "md")}` : ""), label: "분기 EPS 실제와 예상" });
    hist.slice().reverse().forEach((x, j) => {
      const s = x[5];
      surp.append(h("div", null, h("span", null, cats[hist.length - 1 - j] + (x[6] ? " · " + fmtD(x[6], "md") + " 발표" : "")),
        h("b", { class: cls(s) }, isNum(s) ? fmtP(s, 1) : "–"),
        h("small", { class: "muted" }, isNum(s) ? (s >= 0 ? "예상 상회" : "예상 하회") + ` · ${fmtN(x[3], 2)} vs ${fmtN(x[4], 2)}` : "")));
    });
  }
  // quarterly summary table
  const q = fsT("q");
  if (q && q.rev) {
    const labs = perLabels(q, "q");
    const n = q.d.length;
    const tbl = h("table", { class: "t" });
    const head = h("tr", null, h("th", null, "분기(기말)"), labs.map((l) => h("th", { class: "n" }, l)));
    tbl.append(h("thead", null, head));
    const tb = h("tbody");
    const line = (lab, arr, f, yo, strong) => {
      if (!arr || !arr.some(isNum)) return;
      tb.append(h("tr", { class: strong ? "strong" : null }, h("td", null, lab), arr.map((v, i) => {
        const y = yo ? yoyAt(arr, i, 4) : null;
        return h("td", { class: "n" }, f(v), isNum(y) ? h("span", { class: "yoy " + cls(y) }, "YoY " + fmtP(y, 0)) : null);
      })));
    };
    line("매출", q.rev, (v) => fmtM(v), true, true);
    line("영업이익", q.oi, (v) => fmtM(v), true);
    if (q.oi && q.rev) line("영업이익률", q.oi.map((v, i) => ratio(v, q.rev[i])), (v) => (isNum(v) ? fmtP(v, 1, false) : "–"));
    line("순이익", q.ni, (v) => fmtM(v), true);
    line("희석 EPS", q.eps, (v) => (isNum(v) ? "$" + fmtN(v, 2) : "–"), true);
    tbl.append(tb);
    sec.append(h("h3", { class: "sub-h" }, "최근 분기 실적"), scrollEnd(h("div", { class: "tw" }, tbl)),
      h("p", { class: "note" }, "표의 EPS는 회계 기준(GAAP) 희석 EPS라서 위 서프라이즈 차트의 조정 EPS와 다를 수 있어요. YoY는 4분기 전과 비교했어요."));
  }
  if (!nx && !hist.length && !(q && q.rev)) sec.append(h("p", { class: "empty" }, "실적 데이터가 없어요."));
  return sec;
}

// ---------------------------------------------------------------- statements
const ST_ROWS = {
  inc: [["rev", "매출액", "b"], ["cogs", "매출원가"], ["gp", "매출총이익", "b"], ["%gp", "  매출총이익률", "m"], ["rd", "연구개발비"], ["sga", "판매관리비"],
    ["oi", "영업이익", "b"], ["%oi", "  영업이익률", "m"], ["ebitda", "EBITDA"], ["nii", "순이자이익"], ["intx", "이자비용"], ["pti", "세전이익"], ["tax", "법인세"],
    ["ni", "순이익", "b"], ["%ni", "  순이익률", "m"], ["eps", "희석 EPS", "eps"], ["shd", "희석 주식수", "sh"]],
  bal: [["ta", "자산총계", "b"], ["ca", "유동자산"], ["cash", "현금및현금성자산"], ["csti", "현금·단기투자"], ["recv", "매출채권"], ["inv", "재고자산"],
    ["ppe", "유형자산"], ["gw", "영업권·무형자산"], ["tl", "부채총계", "b"], ["cl", "유동부채"], ["ap", "매입채무"], ["cd", "단기차입금"], ["ltd", "장기차입금"],
    ["td", "총차입금", "b"], ["nd", "순차입금"], ["eq", "자본총계", "b"], ["re", "이익잉여금"], ["wc", "운전자본"], ["so", "발행주식수", "sh"]],
  cf: [["ocf", "영업활동현금흐름", "b"], ["capex", "설비투자(CAPEX)"], ["fcf", "잉여현금흐름(FCF)", "b"], ["icf", "투자활동현금흐름"], ["fin", "재무활동현금흐름"],
    ["buy", "자사주 매입"], ["div", "배당금 지급"], ["sbc", "주식보상비용"], ["da", "감가상각비"], ["dissue", "차입금 조달"], ["drepay", "차입금 상환"], ["cwc", "운전자본 변동"]],
};
function secStatements(R) {
  const sec = h("section", { class: "panel sec", id: "s-fs" });
  const perSeg = h("div", { class: "seg", role: "group", "aria-label": "기간 단위" });
  const stSeg = h("div", { class: "seg", role: "group", "aria-label": "재무제표" });
  const charts = h("div", { class: "grid2" });
  const table = h("div");
  const cur = (R.p && R.p.fcur) || "USD";
  sec.append(secHead("재무제표", cur !== "USD" ? `보고 통화 ${cur}${isNum(CO.row.fx) ? " (1 " + cur + " = $" + (CO.row.fx < 0.01 ? CO.row.fx.toPrecision(3) : fmtN(CO.row.fx, 4)) + ")" : ""} · 야후 파이낸스 표준화` : "야후 파이낸스 표준화 재무제표"),
    h("div", { class: "ctools" }, perSeg, stSeg), charts, table);
  if (!fsT("a") && !fsT("q")) { sec.append(h("p", { class: "empty" }, "재무제표 데이터가 없어요.")); return sec; }
  [["a", "연간"], ["q", "분기"]].forEach(([id, lab]) => {
    const b = h("button", { type: "button", "aria-pressed": String(CO.per === id) }, lab);
    b.addEventListener("click", () => { CO.per = id; $$("button", perSeg).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
    perSeg.append(b);
  });
  [["inc", "손익계산서"], ["bal", "재무상태표"], ["cf", "현금흐름표"]].forEach(([id, lab]) => {
    const b = h("button", { type: "button", "aria-pressed": String(CO.stmt === id) }, lab);
    b.addEventListener("click", () => { CO.stmt = id; $$("button", stSeg).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawTable(); });
    stSeg.append(b);
  });
  const money = (v) => fmtM(v, cur);
  function chartCard(title, leg, fn) {
    const box = h("div", { class: "chart" });
    charts.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 } }, h("h3", { class: "sub-h" }, title), leg, box));
    fn(box);
  }
  function draw() {
    const t = fsT(CO.per) || fsT(CO.per === "a" ? "q" : "a");
    clear(charts);
    if (!t) return;
    const cats = perLabels(t, CO.per === "a" || !fsT("q") ? (t === fsT("a") ? "a" : "q") : "q");
    const S = (key) => t[key] || t.d.map(() => null);
    chartCard("매출과 이익", legend([{ name: "매출", color: "var(--s1)" }, { name: "영업이익", color: "var(--s2)" }, { name: "순이익", color: "var(--s3)" }]), (box) =>
      barChart(box, { height: 210, cats, yFmt: (v) => fmtM(v, cur), label: "매출과 이익",
        series: [{ name: "매출", color: "var(--s1)", values: S("rev") }, { name: "영업이익", color: "var(--s2)", values: S("oi") }, { name: "순이익", color: "var(--s3)", values: S("ni") }] }));
    const gm = S("gp").map((v, i) => ratio(v, S("rev")[i])), om = S("oi").map((v, i) => ratio(v, S("rev")[i])), nm = S("ni").map((v, i) => ratio(v, S("rev")[i]));
    chartCard("이익률 추이", legend([{ name: "매출총이익률", color: "var(--s1)", kind: "line" }, { name: "영업이익률", color: "var(--s2)", kind: "line" }, { name: "순이익률", color: "var(--s3)", kind: "line" }]), (box) =>
      lineChart(box, { height: 210, cats, label: "이익률 추이", yFmt: (v) => fmtN(v, 0) + "%",
        series: [{ name: "매출총이익률", color: "var(--s1)", x: cats.map((_, i) => i), y: gm, dots: true, fmt: (v) => fmtP(v, 1, false) },
          { name: "영업이익률", color: "var(--s2)", x: cats.map((_, i) => i), y: om, dots: true, fmt: (v) => fmtP(v, 1, false) },
          { name: "순이익률", color: "var(--s3)", x: cats.map((_, i) => i), y: nm, dots: true, fmt: (v) => fmtP(v, 1, false) }] }));
    chartCard("현금흐름", legend([{ name: "영업현금흐름", color: "var(--s1)" }, { name: "설비투자", color: "var(--s2)" }, { name: "잉여현금흐름", color: "var(--s3)" }]), (box) =>
      barChart(box, { height: 210, cats, yFmt: money, label: "현금흐름",
        series: [{ name: "영업현금흐름", color: "var(--s1)", values: S("ocf") }, { name: "설비투자", color: "var(--s2)", values: S("capex") }, { name: "잉여현금흐름", color: "var(--s3)", values: S("fcf") }] }));
    const cashS = t.csti && t.csti.some(isNum) ? S("csti") : S("cash");
    chartCard("현금과 차입금", legend([{ name: t.csti && t.csti.some(isNum) ? "현금·단기투자" : "현금성자산", color: "var(--s1)" }, { name: "총차입금", color: "var(--s2)" }, { name: "자본총계", color: "var(--s3)" }]), (box) =>
      barChart(box, { height: 210, cats, yFmt: money, label: "현금과 차입금",
        series: [{ name: "현금", color: "var(--s1)", values: cashS }, { name: "총차입금", color: "var(--s2)", values: S("td") }, { name: "자본총계", color: "var(--s3)", values: S("eq") }] }));
    drawTable();
  }
  function drawTable() {
    clear(table);
    const per = fsT(CO.per) ? CO.per : (CO.per === "a" ? "q" : "a");
    const t = fsT(per);
    if (!t) return;
    const labs = perLabels(t, per);
    const trailing = per === "a" && CO.stmt !== "bal" ? (R.fs && R.fs.t) || {} : {};
    const hasTTM = Object.keys(trailing).length > 0;
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, h("th", null, per === "a" ? "회계연도" : "분기(기말)"), labs.map((l, i) => h("th", { class: "n", title: t.d[i] }, l)),
      hasTTM ? h("th", { class: "n", title: "최근 12개월 합계" }, "TTM") : null)));
    const tb = h("tbody");
    const lag = per === "a" ? 1 : 4;
    for (const [key, lab, kind] of ST_ROWS[CO.stmt]) {
      let arr, ttm = null;
      if (key.startsWith("%")) {
        const base = key.slice(1);
        if (!t[base] || !t.rev) continue;
        arr = t[base].map((v, i) => ratio(v, t.rev[i]));
        if (hasTTM && trailing[base] && trailing.rev) ttm = ratio(trailing[base][1], trailing.rev[1]);
      } else {
        arr = t[key];
        if (!arr || !arr.some(isNum)) continue;
        if (hasTTM && trailing[key]) ttm = trailing[key][1];
      }
      const f = kind === "m" ? (v) => (isNum(v) ? fmtP(v, 1, false) : "–") : kind === "eps" ? (v) => (isNum(v) ? fmtN(v, 2) : "–") : kind === "sh" ? (v) => fmtShares(v) : (v) => fmtM(v, cur);
      const showYoy = kind === "b" || kind === "eps";
      tb.append(h("tr", { class: kind === "b" ? "strong" : kind === "m" ? "sub" : null },
        h("td", null, lab.trim()),
        arr.map((v, i) => { const y = showYoy ? yoyAt(arr, i, lag) : null; return h("td", { class: "n" }, f(v), isNum(y) ? h("span", { class: "yoy " + cls(y) }, fmtP(y, 0)) : null); }),
        hasTTM ? h("td", { class: "n" }, isNum(ttm) ? f(ttm) : "") : null));
    }
    tbl.append(tb);
    table.append(scrollEnd(h("div", { class: "tw" }, tbl)),
      h("p", { class: "note" }, `단위: ${cur === "USD" ? "달러" : cur} (M=백만, B=10억). 굵은 행 아래 작은 숫자는 ${per === "a" ? "전년" : "전년 동기"} 대비 증감률이에요. 야후 파이낸스는 최근 ${per === "a" ? "4개 회계연도" : "5개 분기"}까지 제공해요.`));
  }
  draw();
  return sec;
}

// ---------------------------------------------------------------- valuation
/** monthly P/E from month-end prices and trailing EPS known at each month */
function peHistory(R) {
  if (!R.pm || !R.pm.c) return [];
  const rr = row(R.t);
  if (rr && rr.fcur) return [];                  // EPS in the reporting currency vs a USD share price: not comparable
  const eps = [];
  for (const [d, v] of R.teps || []) if (isNum(v)) eps.push([d, v]);
  const a = R.fs && R.fs.a;
  if (a && a.eps) a.d.forEach((d, i) => { if (isNum(a.eps[i])) eps.push([d, a.eps[i]]); });
  const q = R.fs && R.fs.q;
  if (q && q.eps) for (let i = 3; i < q.d.length; i++) {
    const s = q.eps.slice(i - 3, i + 1);
    if (s.every(isNum) && daysBetween(q.d[i - 3], q.d[i]) < 300) eps.push([q.d[i], s.reduce((x, y) => x + y, 0)]);
  }
  if (!eps.length) return [];
  const m = new Map();
  for (const [d, v] of eps) m.set(d, v);
  const pts = Array.from(m.entries()).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const y0 = parseInt(R.pm.s.slice(0, 4), 10), m0 = parseInt(R.pm.s.slice(5, 7), 10) - 1;
  const out = [];
  R.pm.c.forEach((c, i) => {
    const end = new Date(y0, m0 + i + 1, 0);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    let e = null, ed = null;
    for (const [d, v] of pts) { if (d <= iso) { e = v; ed = d; } else break; }
    if (e == null || daysBetween(ed, iso) > 200) { if (out.length) out.push([end.getTime(), null]); return; }
    const pe = e > 0 && isNum(c) ? c / e : null;
    out.push([end.getTime(), pe > 0 && pe < 400 ? pe : null]);
  });
  while (out.length && !isNum(out[out.length - 1][1])) out.pop();
  return out;
}
function secValuation(r, R) {
  const sec = h("section", { class: "panel sec", id: "s-val" });
  const k = R.k || {};
  const U = ustat();
  const med = U.medSec[r.s] || {};
  const ph = peHistory(R);
  const phv = ph.map((x) => x[1]).filter(isNum);
  const peAvg = phv.length >= 6 ? mean(phv) : null;
  const peSd = phv.length >= 6 ? stdev(phv) : null;
  const pePeriod = ph.length ? `${fmtD(new Date(ph[0][0]), "ym")}~${fmtD(new Date(ph[ph.length - 1][0]), "ym")}` : "";
  const fx = fxOf(r);
  const evNow = isNum(r.mc) && fx ? r.mc * 1000 + ((k.debt || 0) - (k.cash || 0)) * fx : null;
  const evs = isNum(evNow) && isNum(k.rev) && k.rev > 0 ? evNow / (k.rev * fx) : null;
  const vs = (v, m) => (isNum(v) && isNum(m) && m > 0 ? ((v / m - 1) * 100) : null);
  const tile = (label, v, m, hist, lowerCheaper = true, f = (x) => fmtN(x, 1) + "배") => {
    const d = vs(v, m);
    const subs = [];
    if (isNum(m)) subs.push(h("span", null, "섹터 중앙값 " + f(m) + (isNum(d) ? " (" + (d >= 0 ? "+" : "−") + fmtN(Math.abs(d), 0) + "%)" : "")));
    if (hist) subs.push(h("span", null, " · " + hist));
    return kvTile(label, isNum(v) ? f(v) : "–", subs.length ? h("small", null, subs) : null);
  };
  const peHistTxt = isNum(peAvg) ? `${pePeriod} 평균 ${fmtN(peAvg, 1)}배` : null;
  sec.append(secHead("투자지표", "현재 배수 vs 같은 섹터 중앙값 · 과거 평균"),
    h("div", { class: "kv" },
      tile("PER (최근 12개월)", r.pe, med.pe, peHistTxt),
      tile("선행 PER", r.fpe, med.fpe),
      tile("PEG", k.peg, med.peg, null, true, (x) => fmtN(x, 2)),
      tile("PSR", r.ps, med.ps),
      tile("PBR", r.pb, med.pb),
      tile("EV/EBITDA", r.eve, med.eve),
      kvTile("EV/매출", isNum(evs) ? fmtN(evs, 1) + "배" : "–", null),
      kvTile("FCF 수익률", isNum(r.fcfy) ? fmtP(r.fcfy, 2, false) : "–", isNum(med.fcfy) ? "섹터 중앙값 " + fmtP(med.fcfy, 2, false) : null),
      kvTile("배당수익률", isNum(r.dy) ? fmtP(r.dy, 2, false) : "없음", isNum(med.dy) ? "섹터 중앙값 " + fmtP(med.dy, 2, false) : null)));
  // P/E history
  if (phv.length >= 6) {
    const box = h("div", { class: "chart" });
    const curPE = r.pe;
    sec.append(h("h3", { class: "sub-h" }, "PER 추이 (월말 주가 ÷ 직전 12개월 EPS)"), box,
      h("p", { class: "note" }, `음영은 평균 ± 1 표준편차(${fmtN(peAvg - peSd, 1)}~${fmtN(peAvg + peSd, 1)}배), 가로선은 평균 ${fmtN(peAvg, 1)}배예요. ` +
        (isNum(curPE) ? `현재 ${fmtN(curPE, 1)}배는 평균보다 ${fmtP(vs(curPE, peAvg), 0)} ${curPE >= peAvg ? "높아요" : "낮아요"}. ` : "") +
        "야후가 제공하는 EPS 기간(약 3~4년)만큼만 계산돼요."));
    lineChart(box, { height: 220, label: "PER 추이", yFmt: (v) => fmtN(v, 0) + "배",
      series: [{ name: "PER", color: "var(--s1)", x: ph.map((p) => p[0]), y: ph.map((p) => p[1]), fmt: (v) => fmtN(v, 1) + "배" }],
      band: isNum(peSd) ? { lo: Math.max(0, peAvg - peSd), hi: peAvg + peSd } : null, refs: [{ y: peAvg, label: "평균" }],
      tipTitle: (t) => fmtD(new Date(t), "ym") });
  }
  // monthly multiples from Yahoo (last ~16 months)
  const vm = r.fcur ? null : R.vm;                // Yahoo mixes currencies in these for foreign filers
  if (vm && vm.d && vm.d.length >= 4) {
    const grid = h("div", { class: "grid3" });
    const xs = vm.d.map((d) => pd(d).getTime());
    [["ps", "PSR"], ["pb", "PBR"], ["eve", "EV/EBITDA"], ["fpe", "선행 PER"], ["pe", "PER"], ["peg", "PEG"]].forEach(([key, lab]) => {
      const ys = vm[key];
      if (!ys || ys.filter(isNum).length < 4) return;
      const box = h("div", { class: "chart" });
      grid.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 } }, h("h3", { class: "sub-h" }, lab), box));
      lineChart(box, { height: 130, label: lab + " 추이", yFmt: (v) => fmtN(v, v >= 10 ? 0 : 1),
        series: [{ name: lab, color: "var(--s1)", x: xs, y: ys, fmt: (v) => fmtN(v, 2) + "배" }], tipTitle: (t) => fmtD(new Date(t), "ym") });
    });
    if (grid.childNodes.length) sec.append(h("h3", { class: "sub-h" }, "최근 월별 밸류에이션 (야후 파이낸스, 월말 기준)"), grid);
  }
  // peers
  const peers = peersOf(r, 9);
  if (peers.length) {
    const rowsP = [r, ...peers];
    const cols = [["시총", (x) => (isNum(x.mc) ? fmtM(x.mc * 1000) : "–"), "mc"], ["PER", (x) => (isNum(x.pe) ? fmtN(x.pe, 1) : "–"), "pe"],
      ["선행 PER", (x) => (isNum(x.fpe) ? fmtN(x.fpe, 1) : "–"), "fpe"], ["PSR", (x) => (isNum(x.ps) ? fmtN(x.ps, 1) : "–"), "ps"],
      ["EV/EBITDA", (x) => (isNum(x.eve) ? fmtN(x.eve, 1) : "–"), "eve"], ["매출 성장", (x) => fmtP(x.rg, 1), "rg"],
      ["영업이익률", (x) => (isNum(x.om) ? fmtP(x.om, 1, false) : "–"), "om"], ["ROE", (x) => (isNum(x.roe) ? fmtP(x.roe, 1, false) : "–"), "roe"],
      ["1년 수익률", (x) => fmtP(x.r1y, 1), "r1y"]];
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, h("th", null, "종목"), cols.map((c) => h("th", { class: "n" }, c[0])))));
    const tb = h("tbody");
    for (const x of rowsP) {
      const tr = h("tr", { class: "click" + (x.t === r.t ? " hl" : ""), tabindex: 0 },
        h("td", null, h("div", { class: "tkc" }, h("b", null, x.t), h("span", null, dispName(x.t)))),
        cols.map((c) => h("td", { class: "n " + (c[2] === "r1y" || c[2] === "rg" ? cls(x[c[2]]) : "") }, c[1](x))));
      if (x.t !== r.t) { tr.addEventListener("click", () => go("company", x.t)); tr.addEventListener("keydown", (e) => { if (e.key === "Enter") go("company", x.t); }); }
      tb.append(tr);
    }
    const medRow = h("tr", { class: "strong" }, h("td", null, "비교군 중앙값"), cols.map((c) => {
      const vals = peers.map((x) => x[c[2]]).filter((v) => isNum(v) && (!["pe", "fpe", "ps", "eve"].includes(c[2]) || v > 0));
      const m = median(vals);
      const fake = {}; fake[c[2]] = m;
      return h("td", { class: "n" }, isNum(m) ? c[1](fake) : "–");
    }));
    tb.append(medRow);
    tbl.append(tb);
    sec.append(h("h3", { class: "sub-h" }, `비교 기업 · ${indKo(r.i) || sectorKo(r.s)}`), h("div", { class: "tw" }, tbl),
      h("p", { class: "note" }, "같은 업종에서 시가총액이 비슷한 기업을 골랐어요. 행을 누르면 그 종목으로 이동해요."));
  }
  return sec;
}

// ---------------------------------------------------------------- analysts
function secAnalyst(r, R) {
  const k = R.k || {}, e = R.e || {};
  const sec = h("section", { class: "panel sec", id: "s-an" }, secHead("애널리스트 전망", isNum(k.na) ? `${k.na}명 커버리지` : ""));
  const top = h("div", { class: "grid2" });
  sec.append(top);
  // target price
  const tg = k.tgt;
  if (tg && isNum(tg[0])) {
    const lo = Math.min(tg[3] ?? tg[0], r.c), hi = Math.max(tg[2] ?? tg[0], r.c);
    const pad = (hi - lo) * 0.06;
    top.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
      h("h3", { class: "sub-h" }, "목표주가"),
      h("div", { class: "facts" }, h("span", null, "평균 ", h("b", null, fmtPx(tg[0]))), h("span", null, "중앙값 ", h("b", null, fmtPx(tg[1]))),
        h("span", null, "최고 ", h("b", null, fmtPx(tg[2]))), h("span", null, "최저 ", h("b", null, fmtPx(tg[3])))),
      rangeTrack(lo - pad, hi + pad, [{ v: tg[3], cls: "lo", title: "최저 목표가" }, { v: tg[2], cls: "hi", title: "최고 목표가" }, { v: tg[0], cls: "tgt", title: "평균 목표가" }, { v: r.c, cls: "", title: "현재가" }],
        { loLabel: fmtPx(lo - pad), hiLabel: fmtPx(hi + pad) }),
      h("div", { class: "legend" }, h("span", { class: "k" }, h("i", { class: "lk box", style: { background: "var(--ink)", borderRadius: "50%" } }), "현재가 " + fmtPx(r.c)),
        h("span", { class: "k" }, h("i", { class: "lk box", style: { background: "var(--s1)", borderRadius: "50%" } }), "평균 목표가 (" + fmtP(r.up, 1) + ")")),
      h("p", { class: "note" }, `컨센서스: ${REC_KO[k.rk] || "–"} (1=강력 매수 … 5=매도 척도에서 ${isNum(k.rm) ? fmtN(k.rm, 2) : "–"})`)));
  }
  // recommendation trend
  const rt = R.rt || [];
  if (rt.length) {
    const labs = { "0m": "이번 달", "-1m": "1개월 전", "-2m": "2개월 전", "-3m": "3개월 전" };
    const rows = h("div", { class: "recrows" });
    for (const x of rt) {
      const tot = x.slice(1, 6).reduce((a, b) => a + (b || 0), 0);
      if (!tot) continue;
      const bar = h("div", { class: "recbar", role: "img", "aria-label": `강력 매수 ${x[1]}, 매수 ${x[2]}, 중립 ${x[3]}, 매도 ${x[4]}, 강력 매도 ${x[5]}` });
      [[1, "rk5", "강력 매수"], [2, "rk4", "매수"], [3, "rk3", "중립"], [4, "rk2", "매도"], [5, "rk1", "강력 매도"]].forEach(([j, c, nm]) => {
        if (!x[j]) return;
        const seg = h("i", { class: c, style: { width: (x[j] / tot) * 100 + "%" }, title: `${nm} ${x[j]}명` });
        seg.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, tipBody(labs[x[0]] || x[0], [[null, x[j] + "명", nm]])));
        seg.addEventListener("pointerleave", hideTip);
        bar.append(seg);
      });
      const buyPct = ((x[1] + x[2]) / tot) * 100;
      rows.append(h("div", { class: "recrow" }, h("span", null, labs[x[0]] || x[0]), bar, h("span", { class: "n" }, fmtN(buyPct, 0) + "%")));
    }
    top.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
      h("h3", { class: "sub-h" }, "투자의견 분포 (오른쪽 숫자 = 매수 비율)"), rows,
      h("div", { class: "legend" }, [["rk5", "강력 매수"], ["rk4", "매수"], ["rk3", "중립"], ["rk2", "매도"], ["rk1", "강력 매도"]].map(([c, nm]) =>
        h("span", { class: "k" }, h("i", { class: "lk box " + c }), nm)))));
  }
  // estimates table
  const tr = e.tr || [];
  if (tr.length) {
    const plab = (p, end) => ({ "0q": "이번 분기", "+1q": "다음 분기", "0y": "올해", "+1y": "내년" }[p] || p) + (end ? ` (${end.slice(2, 4)}.${end.slice(5, 7)})` : "");
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, ["기간", "EPS 예상", "범위", "1년 전 EPS", "EPS 성장", "매출 예상", "매출 성장", "애널리스트"].map((x, i) => h("th", { class: i ? "n" : null }, x)))));
    const tb = h("tbody");
    for (const x of tr) {
      tb.append(h("tr", null, h("td", null, plab(x[0], x[1])),
        h("td", { class: "n" }, isNum(x[2]) ? "$" + fmtN(x[2], 2) : "–"),
        h("td", { class: "n" }, isNum(x[3]) ? `${fmtN(x[3], 2)} ~ ${fmtN(x[4], 2)}` : "–"),
        h("td", { class: "n" }, isNum(x[5]) ? "$" + fmtN(x[5], 2) : "–"),
        h("td", { class: "n " + cls(x[7]) }, isNum(x[7]) ? fmtP(x[7] * 100, 1) : "–"),
        h("td", { class: "n" }, fmtM(x[8])),
        h("td", { class: "n " + cls(x[13]) }, isNum(x[13]) ? fmtP(x[13] * 100, 1) : "–"),
        h("td", { class: "n" }, isNum(x[6]) ? x[6] + "명" : "–")));
    }
    tbl.append(tb);
    sec.append(h("h3", { class: "sub-h" }, "컨센서스 추정치"), h("div", { class: "tw" }, tbl));
    // EPS trend & revisions
    const tbl2 = h("table", { class: "t" });
    tbl2.append(h("thead", null, h("tr", null, ["기간", "90일 전", "60일 전", "30일 전", "7일 전", "현재", "90일 변화", "30일 상향/하향"].map((x, i) => h("th", { class: i ? "n" : null }, x)))));
    const tb2 = h("tbody");
    for (const x of tr) {
      const ch = isNum(x[17]) && x[17] !== 0 && isNum(x[2]) ? ((x[2] / x[17]) - 1) * 100 * Math.sign(x[17]) : null;
      tb2.append(h("tr", null, h("td", null, plab(x[0], null)),
        [x[17], x[16], x[15], x[14], x[2]].map((v) => h("td", { class: "n" }, isNum(v) ? fmtN(v, 2) : "–")),
        h("td", { class: "n " + cls(ch) }, fmtP(ch, 1)),
        h("td", { class: "n" }, h("span", { class: "up" }, "▲" + (x[19] ?? 0)), " / ", h("span", { class: "dn" }, "▼" + (x[21] ?? 0)))));
    }
    tbl2.append(tb2);
    sec.append(h("h3", { class: "sub-h" }, "EPS 추정치 변화"), h("div", { class: "tw" }, tbl2),
      h("p", { class: "note" }, "추정치가 올라가는 종목(상향 우위)은 실적 기대가 좋아지고 있다는 뜻이에요."));
  }
  // rating changes
  const ud = R.ud || [];
  if (ud.length) {
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, ["날짜", "증권사", "의견 변경", "투자의견", "목표주가"].map((x, i) => h("th", { class: i >= 4 ? "n" : "l" }, x)))));
    const tb = h("tbody");
    for (const x of ud.slice(0, 15)) {
      const act = ACTION_KO[x[4]] || x[4] || "";
      const cur = isNum(x[6]) && x[6] > 0 ? x[6] : null, prior = isNum(x[7]) && x[7] > 0 ? x[7] : null;
      const pt = cur ? (prior && prior !== cur ? `${fmtPx(prior)} → ${fmtPx(cur)}` : fmtPx(cur)) : "–";
      const ptc = cur && prior ? cls(cur - prior) : "";
      tb.append(h("tr", null, h("td", { class: "l" }, fmtD(x[0])), h("td", { class: "l" }, x[1] || ""),
        h("td", { class: "l " + (x[4] === "up" ? "up" : x[4] === "down" ? "dn" : "") }, act),
        h("td", { class: "l" }, x[3] && x[3] !== x[2] ? `${gradeKo(x[3])} → ${gradeKo(x[2])}` : gradeKo(x[2])),
        h("td", { class: "n " + ptc }, pt)));
    }
    tbl.append(tb);
    sec.append(h("h3", { class: "sub-h" }, "최근 투자의견 변경"), h("div", { class: "tw" }, tbl));
  }
  if (!tg && !rt.length && !tr.length && !ud.length) sec.append(h("p", { class: "empty" }, "애널리스트 데이터가 없어요."));
  return sec;
}

// ---------------------------------------------------------------- ownership & insiders
function secOwnership(R) {
  const own = R.own || {}, k = R.k || {};
  const sec = h("section", { class: "panel sec", id: "s-own" }, secHead("주주 구성 · 내부자 거래", isNum(own.n) ? `기관 ${fmtN(own.n)}곳 보유` : ""));
  const ins = own.ins ?? k.ins, inst = own.inst ?? k.inst;
  if (isNum(ins) || isNum(inst)) {
    const a = Math.max(0, (ins || 0) * 100), b = Math.max(0, Math.min(100 - a, (inst || 0) * 100)), c = Math.max(0, 100 - a - b);
    const bar = h("div", { class: "ownbar", role: "img", "aria-label": `내부자 ${fmtN(a, 1)}%, 기관 ${fmtN(b, 1)}%, 기타 ${fmtN(c, 1)}%` });
    [[a, "var(--s2)", "내부자"], [b, "var(--s1)", "기관"], [c, "var(--s0)", "개인·기타"]].forEach(([w, col, nm]) => {
      if (w <= 0) return;
      const seg = h("i", { style: { width: w + "%", background: col } });
      seg.addEventListener("pointermove", (ev) => showTip(ev.clientX, ev.clientY, tipBody(nm, [[col, fmtN(w, 1) + "%", ""]])));
      seg.addEventListener("pointerleave", hideTip);
      bar.append(seg);
    });
    sec.append(bar, legend([{ name: `내부자 ${fmtN(a, 1)}%`, color: "var(--s2)" }, { name: `기관 ${fmtN(b, 1)}%`, color: "var(--s1)" }, { name: `개인·기타 ${fmtN(c, 1)}%`, color: "var(--s0)" }]));
  }
  const holderTable = (rows, title) => {
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, ["이름", "지분율", "평가액", "직전 대비"].map((x, i) => h("th", { class: i ? "n" : null }, x)))));
    const tb = h("tbody");
    for (const x of rows) tb.append(h("tr", null, h("td", { title: x[0] || "", style: { maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" } }, x[0] || ""),
      h("td", { class: "n" }, fmtR(x[1], 2)), h("td", { class: "n" }, fmtM(x[3])), h("td", { class: "n " + cls(x[4]) }, isNum(x[4]) ? fmtP(x[4] * 100, 1) : "–")));
    tbl.append(tb);
    const d = rows.map((x) => x[5]).filter(Boolean).sort().pop();
    return [h("h3", { class: "sub-h" }, title + (d ? ` (${fmtD(d)} 기준)` : "")), h("div", { class: "tw" }, tbl)];
  };
  const grid = h("div", { class: "grid2" });
  if (own.top) grid.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 } }, holderTable(own.top, "상위 기관 투자자")));
  if (own.fund) grid.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 } }, holderTable(own.fund, "상위 펀드")));
  if (grid.childNodes.length) sec.append(grid);
  // insiders
  const ns = R.nspa;
  if (ns && (ns[0] || ns[2])) {
    sec.append(h("p", { class: "lede" }, `최근 6개월 내부자 매수 `, h("b", null, `${ns[0] || 0}건 (${fmtBig(ns[1])}주)`), ` · 매도 `, h("b", null, `${ns[2] || 0}건 (${fmtBig(ns[3])}주)`),
      ` · 순${(ns[5] || 0) >= 0 ? "매수" : "매도"} `, h("b", { class: cls(ns[5]) }, fmtBig(Math.abs(ns[5] || 0)) + "주"),
      isNum(ns[6]) ? ` (내부자 보유 주식의 ${fmtR(Math.abs(ns[6]), Math.abs(ns[6]) < 0.001 ? 2 : 1)})` : "", ". 매수 건수에는 주식 보상 같은 비현금 취득도 포함돼요."));
  }
  const itx = R.itx || [];
  if (itx.length) {
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, ["날짜", "이름", "직책", "유형", "주식 수", "금액", "내용"].map((x, i) => h("th", { class: i === 4 || i === 5 ? "n" : "l" }, x)))));
    const tb = h("tbody");
    for (const x of itx.slice(0, 20)) {
      const [lab, kind] = insiderKind(x[3]);
      tb.append(h("tr", null, h("td", { class: "l" }, fmtD(x[0])), h("td", { class: "l" }, x[1] || ""), h("td", { class: "l" }, relationKo(x[2])),
        h("td", { class: "l" }, h("span", { class: "itype " + kind }, lab)), h("td", { class: "n" }, fmtBig(x[4])),
        h("td", { class: "n" }, x[5] ? "$" + fmtBig(x[5]) : "–"), h("td", { class: "l muted", title: x[3] || "" }, (x[3] || "").slice(0, 60))));
    }
    tbl.append(tb);
    sec.append(h("h3", { class: "sub-h" }, "최근 내부자 거래 (SEC Form 4)"), h("div", { class: "tw" }, tbl));
  }
  const gov = R.p && R.p.gov;
  if (gov && gov.some(isNum)) {
    sec.append(h("h3", { class: "sub-h" }, "지배구조 위험 점수 (ISS, 1=낮음 · 10=높음)"),
      h("div", { class: "kv" }, [["감사", gov[0]], ["이사회", gov[1]], ["보상", gov[2]], ["주주 권리", gov[3]], ["종합", gov[4]]].map(([a, b]) => kvTile(a, isNum(b) ? String(b) : "–", null))));
  }
  const off = R.p && R.p.off;
  if (off && off.length) {
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, ["이름", "직책", "나이", "연간 보수"].map((x, i) => h("th", { class: i >= 2 ? "n" : "l" }, x)))));
    const tb = h("tbody");
    for (const o of off) tb.append(h("tr", null, h("td", { class: "l" }, o[0] || ""), h("td", { class: "l" }, o[1] || ""), h("td", { class: "n" }, isNum(o[2]) ? o[2] + "세" : "–"), h("td", { class: "n" }, isNum(o[3]) && o[3] > 0 ? "$" + fmtBig(o[3]) : "–")));
    tbl.append(tb);
    sec.append(h("h3", { class: "sub-h" }, "주요 경영진"), h("div", { class: "tw" }, tbl));
  }
  if (!sec.querySelector("table") && !sec.querySelector(".ownbar")) sec.append(h("p", { class: "empty" }, "주주 데이터가 없어요."));
  return sec;
}

// ---------------------------------------------------------------- dividends & shareholder returns
function secDividends(R) {
  const k = R.k || {};
  const etf = R.q === "ETF";
  const sec = h("section", { class: "panel sec", id: "s-div" }, secHead(etf ? "분배금" : "배당 · 주주환원", ""));
  const dv = R.dv || [];
  const tiles = [
    kvTile(etf ? "분배율" : "배당수익률", isNum(k.dy) ? fmtR(k.dy, 2) : "없음", null),
    kvTile("연간 배당금", isNum(k.dr) ? fmtPx(k.dr) : isNum(k.tdr) ? fmtPx(k.tdr) : "–", isNum(k.tdr) && isNum(k.dr) ? "지난 12개월 " + fmtPx(k.tdr) : null),
  ];
  if (!etf) {
    tiles.push(kvTile("배당성향", isNum(k.pay) ? fmtR(k.pay, 1) : "–", "순이익 중 배당 비율"));
    tiles.push(kvTile("5년 평균 수익률", isNum(k.d5y) ? fmtP(k.d5y, 2, false) : "–", null));
  }
  tiles.push(kvTile("배당락일", k.exd ? fmtD(k.exd) : "–", k.exd && k.exd >= todayISO() ? "예정" : null));
  if (k.dvd) tiles.push(kvTile("지급일", fmtD(k.dvd), null));
  sec.append(h("div", { class: "kv" }, tiles));
  if (dv.length) {
    const byY = new Map();
    for (const [d, a] of dv) { if (!d || !isNum(a)) continue; const y = d.slice(0, 4); byY.set(y, (byY.get(y) || 0) + a); }
    const firstD = dv.find((x) => x[0])[0];
    if (firstD && parseInt(firstD.slice(5, 7), 10) > 3) byY.delete(firstD.slice(0, 4));
    const years = Array.from(byY.keys()).sort().slice(-11);
    const curY = String(new Date().getFullYear());
    let streak = 0;
    const full = years.filter((y) => y !== curY);
    for (let i = full.length - 1; i > 0; i--) { if (byY.get(full[i]) > byY.get(full[i - 1]) * 1.001) streak++; else break; }
    const box = h("div", { class: "chart" });
    sec.append(h("h3", { class: "sub-h" }, "연도별 주당 배당금" + (streak >= 2 ? ` · ${streak}년 연속 증가` : "")), box,
      h("p", { class: "note" }, `${curY}년은 지금까지 지급된 금액이라 흐리게 표시했어요. 최근 지급: ${fmtD(dv[dv.length - 1][0])} ${fmtPx(dv[dv.length - 1][1])}.`));
    barChart(box, { height: 190, cats: years.map((y) => "’" + y.slice(2)), yFmt: (v) => "$" + fmtN(v, v < 10 ? 2 : 1), label: "연도별 주당 배당금",
      series: [{ name: "주당 배당금", color: "var(--s1)", values: years.map((y) => byY.get(y)), faded: (i) => years[i] === curY }],
      tipTitle: (i) => years[i] + "년", labels: [years.length - (years[years.length - 1] === curY ? 2 : 1)].filter((i) => i >= 0) });
  } else if (!etf) {
    sec.append(h("p", { class: "lede" }, "최근 10여 년 동안 배당을 지급하지 않았어요."));
  }
  const a = R.fs && R.fs.a;
  if (!etf && a && (a.buy || a.div)) {
    const cats = perLabels(a, "a");
    const neg = (arr) => (arr || a.d.map(() => null)).map((v) => (isNum(v) ? -v : null));
    const box = h("div", { class: "chart" });
    const fcf = a.fcf || a.d.map(() => null);
    const tot = a.d.map((_, i) => (neg(a.div)[i] || 0) + (neg(a.buy)[i] || 0));
    const li = lastI(fcf);
    const payoutTxt = li >= 0 && isNum(fcf[li]) && fcf[li] > 0 ? ` 최근 회계연도에는 잉여현금흐름의 ${fmtN((tot[li] / fcf[li]) * 100, 0)}%를 주주에게 돌려줬어요.` : "";
    sec.append(h("h3", { class: "sub-h" }, "주주환원 (배당 + 자사주 매입) vs 잉여현금흐름"),
      legend([{ name: "배당 지급", color: "var(--s1)" }, { name: "자사주 매입", color: "var(--s2)" }, { name: "잉여현금흐름", color: "var(--s3)" }]), box,
      h("p", { class: "note" }, "현금흐름표의 연간 금액이에요." + payoutTxt));
    barChart(box, { height: 200, cats, yFmt: (v) => fmtM(v), label: "주주환원과 잉여현금흐름",
      series: [{ name: "배당 지급", color: "var(--s1)", values: neg(a.div) }, { name: "자사주 매입", color: "var(--s2)", values: neg(a.buy) }, { name: "잉여현금흐름", color: "var(--s3)", values: fcf }] });
  }
  return sec;
}

// ---------------------------------------------------------------- news
function secNews(R) {
  const sec = h("section", { class: "panel sec", id: "s-news" });
  const live = h("div");
  const liveBtn = h("button", { type: "button", class: "btn sm", hidden: true }, "보도자료 불러오기 (Twelve Data)");
  sec.append(secHead("뉴스", "야후 파이낸스 관련 기사 · 수집 시점 기준"), liveBtn, live);
  const nw = R.nw || [];
  const name = (R.p && R.p.n) || "";
  const firstWord = shortEn(name).split(" ")[0].toLowerCase();
  const inTitle = (x) => { const tt = (x[1] || "").toLowerCase(); return (firstWord.length >= 3 && tt.includes(firstWord)) || new RegExp("\\b" + R.t.replace("-", "[.-]") + "\\b", "i").test(x[1] || ""); };
  const items = nw.map((x) => ({ x, title: inTitle(x), direct: inTitle(x) || (x.length > 5 && !!x[5]) }));
  items.sort((a, b) => (b.title - a.title) || (b.x[0] > a.x[0] ? 1 : -1));
  const list = h("div", { class: "news" });
  for (const { x, title, direct } of items) {
    list.append(h("a", { class: "nrow", href: x[3] || "#", target: "_blank", rel: "noopener" },
      h("span", { class: "tt", lang: "en" }, x[1]),
      h("span", { class: "mt" }, [x[2], x[0] ? x[0].slice(0, 10) : "", title ? "제목에 언급" : direct ? "관련 종목 태그" : "시장 기사", x[4] === "VIDEO" ? "영상" : ""].filter(Boolean).join(" · "))));
  }
  sec.append(nw.length ? list : h("p", { class: "empty" }, "수집된 뉴스가 없어요."));
  const showBtn = async () => {
    const st = await tdState();
    liveBtn.hidden = !(st === "granted" || st === "prompt");
  };
  showBtn();
  document.addEventListener("caps", showBtn, { once: true });
  liveBtn.addEventListener("click", async () => {
    liveBtn.disabled = true;
    clear(live).append(h("p", { class: "note" }, "보도자료를 불러오는 중…"));
    try {
      const { parsed } = await tdCall("get_company_news", { symbol: R.t.replace("-", "."), outputsize: 5 }, 300000);
      const pr = parsed.data && parsed.data.press_releases;
      clear(live);
      if (!pr || !pr.length) { live.append(h("p", { class: "note" }, parsed.plan ? "현재 Twelve Data 요금제에서는 보도자료를 볼 수 없어요." : "최근 보도자료가 없어요.")); return; }
      const box = h("div", { class: "news" });
      for (const p of pr) {
        box.append(h("div", { class: "nrow" }, h("span", { class: "tt", lang: "en" }, p.title || ""),
          h("span", { class: "mt" }, [p.source, (p.datetime || "").slice(0, 16).replace("T", " ")].filter(Boolean).join(" · ")),
          p.body ? h("span", { class: "sm" }, String(p.body).replace(/[_*#>\[\]]/g, "").slice(0, 280)) : null));
      }
      live.append(h("h3", { class: "sub-h" }, "회사 보도자료 (Twelve Data)"), box);
    } catch (e) {
      clear(live).append(h("p", { class: "note" }, tdErrorText(e)));
    } finally { liveBtn.disabled = false; }
  });
  return sec;
}

// ---------------------------------------------------------------- ETF
function secEtfOverview(R) {
  const p = R.p || {}, k = R.k || {};
  const sec = h("section", { class: "panel sec", id: "s-ov" }, secHead("개요", [p.fam, p.cat].filter(Boolean).join(" · ")));
  if (p.sum) sec.append(h("p", { class: "desc", lang: "en" }, p.sum));
  sec.append(h("div", { class: "kv" },
    kvTile("순자산(AUM)", fmtM(k.aum), fmtKo(k.aum)), kvTile("총보수", isNum(k.er) ? fmtR(k.er, 2) : "–", null),
    kvTile("분배율", isNum(k.dy) ? fmtR(k.dy, 2) : "–", null), kvTile("PER(보유 종목)", isNum(k.pe) ? fmtN(k.pe, 1) + "배" : "–", null),
    kvTile("베타(3년)", isNum(k.beta) ? fmtN(k.beta, 2) : "–", null), kvTile("3년 연평균", isNum(k.r3y) ? fmtR(k.r3y, 1) : "–", null),
    kvTile("5년 연평균", isNum(k.r5y) ? fmtR(k.r5y, 1) : "–", null), kvTile("52주 범위", isNum(k.l52) ? `${fmtPx(k.l52)}~${fmtPx(k.h52)}` : "–", null)));
  return sec;
}
const SW_KO = { realestate: "부동산", consumer_cyclical: "경기소비재", basic_materials: "소재", consumer_defensive: "필수소비재", technology: "기술",
  communication_services: "커뮤니케이션", financial_services: "금융", utilities: "유틸리티", industrials: "산업재", energy: "에너지", healthcare: "헬스케어" };
function secHoldings(R) {
  const etf = R.etf || {};
  const sec = h("section", { class: "panel sec", id: "s-hold" }, secHead("보유 종목", "상위 10개 · 섹터 비중"));
  const grid = h("div", { class: "grid2" });
  if (etf.hold && etf.hold.length) {
    const tbl = h("table", { class: "t" });
    tbl.append(h("thead", null, h("tr", null, h("th", null, "종목"), h("th", { class: "n" }, "비중"))));
    const tb = h("tbody");
    for (const x of etf.hold) {
      const inU = x[0] && row(x[0].replace(".", "-"));
      const tr = h("tr", { class: inU ? "click" : null }, h("td", null, h("div", { class: "tkc" }, h("b", null, x[0] || ""), h("span", null, (inU && koName(inU.t)) || x[1] || ""))), h("td", { class: "n" }, fmtR(x[2], 2)));
      if (inU) tr.addEventListener("click", () => go("company", inU.t));
      tb.append(tr);
    }
    tbl.append(tb);
    grid.append(h("div", { class: "tw" }, tbl));
  }
  if (etf.sw && etf.sw.length) {
    const sw = etf.sw.filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const box = h("div", { class: "chart" });
    grid.append(h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, h("h3", { class: "sub-h" }, "섹터 비중"), box));
    barChart(box, { height: 220, cats: sw.map((x) => (SW_KO[x[0]] || x[0]).slice(0, 4)), yFmt: (v) => fmtN(v * 100, 0) + "%",
      series: [{ name: "비중", color: "var(--s1)", values: sw.map((x) => x[1]), fmt: (v) => fmtR(v, 1) }], tipTitle: (i) => SW_KO[sw[i][0]] || sw[i][0], label: "섹터 비중" });
  }
  sec.append(grid.childNodes.length ? grid : h("p", { class: "empty" }, "보유 종목 데이터가 없어요."));
  return sec;
}
