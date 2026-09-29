/* =====================================================================
   기업 분석 노트 — shared app state, capabilities, scoring, labels
   ===================================================================== */
const CONFIG = window.__CFG || {};
const APP = { view: null, sym: null, cap: { mcp: null, sample: null, perm: null }, live: new Map(), ctl: null };
const TD = "Twelve Data";                                   // the viewer's connector display name

const IND_KO = {
  "Advertising Agencies": "광고 대행", "Aerospace & Defense": "항공우주·방위", "Agricultural Inputs": "농업 투입재(비료·농약)",
  "Airlines": "항공사", "Airports & Air Services": "공항·항공 서비스", "Aluminum": "알루미늄", "Apparel Manufacturing": "의류 제조",
  "Apparel Retail": "의류 소매", "Asset Management": "자산운용", "Auto & Truck Dealerships": "자동차 딜러", "Auto Manufacturers": "자동차 제조",
  "Auto Parts": "자동차 부품", "Banks - Diversified": "대형 은행", "Banks - Regional": "지역 은행", "Beverages - Brewers": "맥주",
  "Beverages - Non-Alcoholic": "음료(비주류)", "Beverages - Wineries & Distilleries": "와인·증류주", "Biotechnology": "바이오테크",
  "Broadcasting": "방송", "Building Materials": "건축 자재", "Building Products & Equipment": "건축 제품·설비",
  "Business Equipment & Supplies": "사무 장비·용품", "Capital Markets": "증권·투자은행", "Chemicals": "화학", "Coking Coal": "제철용 석탄",
  "Communication Equipment": "통신 장비", "Computer Hardware": "컴퓨터 하드웨어", "Confectioners": "제과", "Conglomerates": "복합 기업",
  "Consulting Services": "컨설팅", "Consumer Electronics": "소비자 가전", "Copper": "구리", "Credit Services": "신용 서비스(카드·대출)",
  "Department Stores": "백화점", "Diagnostics & Research": "진단·연구 서비스", "Discount Stores": "할인점", "Drug Manufacturers - General": "대형 제약",
  "Drug Manufacturers - Specialty & Generic": "특수·제네릭 제약", "Education & Training Services": "교육 서비스",
  "Electrical Equipment & Parts": "전기 장비·부품", "Electronic Components": "전자 부품", "Electronic Gaming & Multimedia": "게임·멀티미디어",
  "Electronics & Computer Distribution": "전자·컴퓨터 유통", "Engineering & Construction": "엔지니어링·건설", "Entertainment": "엔터테인먼트",
  "Farm & Heavy Construction Machinery": "농기계·중장비", "Farm Products": "농산물", "Financial Conglomerates": "금융 복합 기업",
  "Financial Data & Stock Exchanges": "금융 데이터·거래소", "Food Distribution": "식품 유통", "Footwear & Accessories": "신발·잡화",
  "Furnishings, Fixtures & Appliances": "가구·가전", "Gambling": "게임·베팅", "Gold": "금", "Grocery Stores": "식료품점",
  "Health Information Services": "헬스케어 IT", "Healthcare Plans": "건강보험", "Home Improvement Retail": "주택 개보수 소매",
  "Household & Personal Products": "생활용품", "Industrial Distribution": "산업재 유통", "Information Technology Services": "IT 서비스",
  "Infrastructure Operations": "인프라 운영", "Insurance - Diversified": "종합 보험", "Insurance - Life": "생명보험",
  "Insurance - Property & Casualty": "손해보험", "Insurance - Reinsurance": "재보험", "Insurance - Specialty": "특종 보험",
  "Insurance Brokers": "보험 중개", "Integrated Freight & Logistics": "종합 물류", "Internet Content & Information": "인터넷 콘텐츠·정보",
  "Internet Retail": "온라인 소매", "Leisure": "레저", "Lodging": "숙박", "Lumber & Wood Production": "목재", "Luxury Goods": "명품",
  "Marine Shipping": "해운", "Medical Care Facilities": "의료 시설", "Medical Devices": "의료 기기", "Medical Distribution": "의약품 유통",
  "Medical Instruments & Supplies": "의료 기구·소모품", "Metal Fabrication": "금속 가공", "Mortgage Finance": "모기지 금융",
  "Oil & Gas Drilling": "석유·가스 시추", "Oil & Gas E&P": "석유·가스 탐사·생산", "Oil & Gas Equipment & Services": "석유·가스 장비·서비스",
  "Oil & Gas Integrated": "종합 석유", "Oil & Gas Midstream": "석유·가스 중류(파이프라인)", "Oil & Gas Refining & Marketing": "정유·판매",
  "Other Industrial Metals & Mining": "기타 산업 금속·광업", "Other Precious Metals & Mining": "기타 귀금속", "Packaged Foods": "가공식품",
  "Packaging & Containers": "포장재", "Paper & Paper Products": "제지", "Personal Services": "개인 서비스", "Pharmaceutical Retailers": "약국 체인",
  "Pollution & Treatment Controls": "환경 설비", "Publishing": "출판", "REIT - Diversified": "리츠(복합)", "REIT - Healthcare Facilities": "리츠(헬스케어)",
  "REIT - Hotel & Motel": "리츠(호텔)", "REIT - Industrial": "리츠(물류·산업)", "REIT - Mortgage": "리츠(모기지)", "REIT - Office": "리츠(오피스)",
  "REIT - Residential": "리츠(주거)", "REIT - Retail": "리츠(리테일)", "REIT - Specialty": "리츠(특수: 데이터센터·통신탑 등)", "Railroads": "철도",
  "Real Estate - Development": "부동산 개발", "Real Estate - Diversified": "부동산(복합)", "Real Estate Services": "부동산 서비스",
  "Recreational Vehicles": "레저용 차량", "Rental & Leasing Services": "렌탈·리스", "Residential Construction": "주택 건설",
  "Resorts & Casinos": "리조트·카지노", "Restaurants": "외식", "Scientific & Technical Instruments": "과학·계측 기기",
  "Security & Protection Services": "보안 서비스", "Semiconductor Equipment & Materials": "반도체 장비·소재", "Semiconductors": "반도체",
  "Shell Companies": "스팩·셸 컴퍼니", "Silver": "은", "Software - Application": "응용 소프트웨어", "Software - Infrastructure": "인프라 소프트웨어",
  "Solar": "태양광", "Specialty Business Services": "전문 비즈니스 서비스", "Specialty Chemicals": "특수 화학", "Specialty Industrial Machinery": "산업 기계",
  "Specialty Retail": "전문 소매", "Staffing & Employment Services": "인력 서비스", "Steel": "철강", "Telecom Services": "통신 서비스",
  "Textile Manufacturing": "섬유", "Thermal Coal": "발전용 석탄", "Tobacco": "담배", "Tools & Accessories": "공구", "Travel Services": "여행 서비스",
  "Trucking": "트럭 운송", "Uranium": "우라늄", "Utilities - Diversified": "유틸리티(복합)", "Utilities - Independent Power Producers": "독립 발전사",
  "Utilities - Regulated Electric": "전력", "Utilities - Regulated Gas": "가스", "Utilities - Regulated Water": "수도", "Utilities - Renewable": "재생에너지",
  "Waste Management": "폐기물 처리", "ETF": "ETF",
};
const indKo = (s) => (s && IND_KO[s]) || s || "";
const sectorKo = (i) => (i >= 0 && i < SECTOR_KO.length ? SECTOR_KO[i] : "기타");

// ---------------------------------------------------------------- up/down colour convention
function applyUpDown(v) {
  document.body.dataset.updown = v === "us" ? "us" : "kr";
  $$(".seg [data-ud]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ud === (v === "us" ? "us" : "kr"))));
}

// ---------------------------------------------------------------- watchlist
function watchlist() { const w = LS.get("watch", []); return Array.isArray(w) ? w.filter((t) => row(t)) : []; }
function toggleWatch(t) {
  const w = watchlist();
  const i = w.indexOf(t);
  if (i >= 0) w.splice(i, 1); else w.unshift(t);
  LS.set("watch", w.slice(0, 40));
  return i < 0;
}

// ---------------------------------------------------------------- capabilities (design for absence)
function initCaps() {
  const c = window.claude;
  if (!c || typeof c.use !== "function") return;
  c.use("permissions").then((p) => { APP.cap.perm = p; }).catch(() => {});
  c.use("mcp").then((m) => { APP.cap.mcp = m; document.dispatchEvent(new CustomEvent("caps")); }).catch(() => {});
  c.use("sample").then((s) => { APP.cap.sample = s; document.dispatchEvent(new CustomEvent("caps")); }).catch(() => {});
}
async function tdState() {
  if (!APP.cap.mcp) return "unavailable";
  if (!APP.cap.perm) return "prompt";
  try { return await APP.cap.perm.state("mcp:" + TD); } catch (e) { return "unavailable"; }
}
/** Twelve Data answers {result: "<csv; separated>" | "<json>" | "<plan message>"} */
function tdParse(payload) {
  let res = payload && typeof payload === "object" && "result" in payload ? payload.result : payload;
  if (typeof res !== "string") return { data: res };
  const s = res.trim();
  if (/available exclusively|upgrading|pricing/i.test(s) && !s.startsWith("{") && !s.startsWith("[")) return { plan: s };
  if (s.startsWith("{") || s.startsWith("[")) { try { return { data: JSON.parse(s) }; } catch (e) { return { err: "parse" }; } }
  const lines = s.split("\n").filter(Boolean);
  if (lines.length < 2 || !lines[0].includes(";")) return { err: s.slice(0, 200) };
  const head = lines[0].split(";");
  return { data: lines.slice(1).map((ln) => { const v = ln.split(";"); const o = {}; head.forEach((k, i) => { o[k] = v[i]; }); return o; }) };
}
function tdErrorText(e) {
  const code = e && e.code;
  if (code === "needs_reauth") return "Twelve Data 연결이 만료됐어요. claude.ai 설정 → 커넥터에서 다시 연결해 주세요.";
  if (code === "server_not_connected" || code === "selection_required") return "Twelve Data 커넥터가 연결돼 있지 않아요. claude.ai 설정 → 커넥터에서 추가하면 실시간 시세를 볼 수 있어요.";
  if (code === "not_in_manifest" || code === "not_granted" || code === "blocked_by_policy" || code === "approval_required") return "이 페이지에서 Twelve Data 사용이 허용되지 않았어요.";
  if (code === "server_unavailable" || code === "upstream_error") return "Twelve Data가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.";
  if (code === "tool_error") return "Twelve Data가 요청을 처리하지 못했어요: " + String((e && e.message) || "").slice(0, 140);
  return "실시간 데이터를 불러오지 못했어요.";
}
async function tdCall(tool, input, staleMs) {
  const m = APP.cap.mcp;
  if (!m) throw { code: "capability_disabled" };
  const r = await m.callTool(TD, tool, input, { cache: { staleTime: staleMs || 60000, gcTime: 3600000 } });
  return { parsed: tdParse(r && r.payload), cached: r && r.cache ? r.cache.storedAt : null };
}
function sampleErrorText(e) {
  const c = e && e.code;
  if (c === "not_granted" || c === "sampling_disabled" || c === "not_declared" || c === "capability_disabled" || c === "capability_removed")
    return "이 보기에서는 AI 작성 기능을 쓸 수 없어요.";
  if (c === "rate_limited") return "요청이 많아 잠시 쉬어야 해요. 조금 뒤에 다시 눌러 주세요.";
  if (c === "session_expired") return "Claude에 다시 로그인해 주세요.";
  if (c === "refused") return "AI가 이 요청에 답하지 않았어요. 질문을 바꿔 다시 시도해 주세요.";
  if (c === "prompt_too_large") return "보낼 데이터가 너무 많아요.";
  if (c === "cancelled") return "중지했어요.";
  return "AI 응답이 중간에 끊겼어요. 다시 시도해 주세요.";
}

// ---------------------------------------------------------------- universe statistics for percentiles
let USTAT = null;
function ustat() {
  if (USTAT) return USTAT;
  const eq = DATA.rows.filter((r) => r.q === "EQUITY");
  const keys = ["rg", "eg", "gm", "om", "pm", "roe", "de", "cr", "pe", "fpe", "ps", "pb", "eve", "peg", "fcfy", "r3m", "r6m", "r1y", "fh", "rm", "up", "dy", "mc", "si"];
  const all = {}, bySec = {};
  for (const k of keys) all[k] = eq.map((r) => r[k]);
  for (const r of eq) {
    const s = r.s;
    if (!bySec[s]) { bySec[s] = {}; for (const k of keys) bySec[s][k] = []; }
    for (const k of keys) bySec[s][k].push(r[k]);
  }
  const medSec = {};
  for (const s of Object.keys(bySec)) {
    medSec[s] = {};
    for (const k of keys) medSec[s][k] = median(bySec[s][k].filter((v) => !(["pe", "fpe", "ps", "pb", "eve", "peg"].includes(k) && !(v > 0))));
  }
  USTAT = { all, bySec, medSec, eq };
  return USTAT;
}
const posOnly = (arr) => arr.map((v) => (isNum(v) && v > 0 ? v : null));

/**
 * Six-axis scorecard, 0-10 each, from percentile ranks across the ~2,000-stock universe
 * (sector-relative where margins and multiples differ by industry).
 */
function scorecard(r, rec) {
  const U = ustat();
  const sec = U.bySec[r.s] || U.all;
  const P = (k, v, hb, secRel) => pctRank(secRel ? (["pe", "fpe", "ps", "pb", "eve", "peg"].includes(k) ? posOnly(sec[k]) : sec[k]) :
    (["pe", "fpe", "ps", "pb", "eve", "peg"].includes(k) ? posOnly(U.all[k]) : U.all[k]), v, hb);
  const e = (rec && rec.e) || {};
  const tr = e.tr || [];
  const ny = tr.find((x) => x[0] === "+1y"), cy = tr.find((x) => x[0] === "0y");
  const fwdG = ny && isNum(ny[7]) ? ny[7] * 100 : cy && isNum(cy[7]) ? cy[7] * 100 : null;
  const allFwd = null;
  const k = (rec && rec.k) || {};
  const fsA = rec && rec.fs && rec.fs.a;
  const lastA = (key) => { if (!fsA || !fsA[key]) return null; for (let i = fsA[key].length - 1; i >= 0; i--) if (isNum(fsA[key][i])) return fsA[key][i]; return null; };
  const ebit = lastA("ebit") ?? lastA("oi"), intx = lastA("intx");
  const cover = isNum(ebit) && isNum(intx) && intx > 0 ? ebit / intx : null;
  const fxr = r.fcur ? (isNum(r.fx) ? r.fx : null) : 1;
  const netCash = isNum(k.cash) && isNum(k.debt) && isNum(r.mc) && r.mc > 0 && fxr ? ((k.cash - k.debt) * fxr) / (r.mc * 1000) : null;
  const rev30 = [cy, ny].filter(Boolean).map((x) => { const up = x[19], dn = x[21]; return isNum(up) && isNum(dn) && up + dn > 0 ? (up - dn) / (up + dn) : null; }).filter(isNum);
  const revScore = rev30.length ? ((mean(rev30) + 1) / 2) * 100 : null;
  const fin = r.s === 2;                                   // financials: leverage ratios are not comparable
  const axes = [
    { id: "growth", name: "성장성", parts: [["매출 성장률", P("rg", r.rg, true)], ["이익 성장률", P("eg", r.eg, true)],
      ["향후 EPS 성장 전망", isNum(fwdG) ? Math.max(0, Math.min(100, 50 + fwdG * 2)) : null]] },
    { id: "profit", name: "수익성", parts: [["매출총이익률(업종 대비)", fin ? null : P("gm", r.gm, true, true)], ["영업이익률(업종 대비)", P("om", r.om, true, true)],
      ["순이익률", P("pm", r.pm, true)], ["ROE", P("roe", r.roe, true)]] },
    { id: "health", name: "재무 건전성", parts: [["부채비율", fin ? null : P("de", r.de, false)], ["유동비율", fin ? null : P("cr", r.cr, true)],
      ["순현금/시총", isNum(netCash) ? Math.max(0, Math.min(100, 50 + netCash * 150)) : null],
      ["이자보상배율", isNum(cover) ? Math.max(0, Math.min(100, cover >= 20 ? 95 : cover * 4.5)) : (isNum(ebit) && ebit > 0 && isNum(intx) && intx === 0 ? 90 : null)]] },
    { id: "value", name: "밸류에이션", parts: [["PER(업종 대비)", isNum(r.pe) && r.pe > 0 ? P("pe", r.pe, false, true) : null],
      ["선행 PER(업종 대비)", isNum(r.fpe) && r.fpe > 0 ? P("fpe", r.fpe, false, true) : null], ["PSR(업종 대비)", P("ps", r.ps, false, true)],
      ["EV/EBITDA(업종 대비)", isNum(r.eve) && r.eve > 0 ? P("eve", r.eve, false, true) : null], ["FCF 수익률", P("fcfy", r.fcfy, true)]] },
    { id: "mom", name: "주가 모멘텀", parts: [["3개월 수익률", P("r3m", r.r3m, true)], ["6개월 수익률", P("r6m", r.r6m, true)],
      ["1년 수익률", P("r1y", r.r1y, true)], ["52주 고점 근접도", P("fh", r.fh, true)]] },
    { id: "analyst", name: "애널리스트", parts: [["투자의견", isNum(r.rm) ? Math.max(0, Math.min(100, (5 - r.rm) / 4 * 100)) : null],
      ["목표가 상승여력", P("up", r.up, true)], ["최근 30일 추정치 수정", revScore]] },
  ];
  for (const a of axes) {
    const vals = a.parts.map((p) => p[1]).filter(isNum);
    a.score = vals.length >= (a.id === "analyst" ? 1 : 2) ? Math.round((mean(vals) / 10) * 10) / 10 : null;
    if (a.id === "analyst" && !(r.na >= 3)) a.score = null;
  }
  const have = axes.filter((a) => isNum(a.score));
  const overall = have.length >= 3 ? Math.round(mean(have.map((a) => a.score)) * 10) / 10 : null;
  return { axes, overall, fwdG, cover, netCash, allFwd };
}
function scoreWord(s) {
  if (!isNum(s)) return "데이터 부족";
  return s >= 8 ? "매우 강함" : s >= 6.5 ? "강함" : s >= 4.5 ? "보통" : s >= 3 ? "약함" : "매우 약함";
}
function josa(word, withB, withoutB) { return hasBatchim(word) ? withB : withoutB; }
function overallText(sc) {
  const have = sc.axes.filter((a) => isNum(a.score)).sort((a, b) => b.score - a.score);
  if (have.length < 3) return "평가할 데이터가 아직 부족해요.";
  const top = have.filter((a) => a.score >= 6.5).slice(0, 2);
  const low = have.filter((a) => a.score < 4).slice(-2);
  const names = (arr) => arr.map((a) => a.name).join("·");
  if (top.length && low.length) { const t = names(top), l = names(low); return `${t}${josa(t, "이", "가")} 강하고, ${l}${josa(l, "은", "는")} 약한 편이에요.`; }
  if (top.length) { const t = names(top); return `${t}${josa(t, "이", "가")} 강하고 뚜렷한 약점은 없어요.`; }
  if (low.length) { const l = names(low); return `두드러진 강점 없이 ${l}${josa(l, "이", "가")} 약한 편이에요.`; }
  return "전반적으로 업종·시장 평균 수준이에요.";
}
function hasBatchim(word) {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return false;
  return (ch - 0xac00) % 28 !== 0;
}

// ---------------------------------------------------------------- peers
function peersOf(r, n = 9) {
  let pool = DATA.rows.filter((x) => x.q === "EQUITY" && x.i && x.i === r.i && x.t !== r.t);
  if (pool.length < 3) pool = DATA.rows.filter((x) => x.q === "EQUITY" && x.s === r.s && x.t !== r.t);
  pool.sort((a, b) => Math.abs(Math.log((a.mc || 0.01) / (r.mc || 0.01))) - Math.abs(Math.log((b.mc || 0.01) / (r.mc || 0.01))));
  return pool.slice(0, n).sort((a, b) => (b.mc || 0) - (a.mc || 0));
}
