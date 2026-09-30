/* =====================================================================
   기업 분석 노트 — macro dashboard with plain-language readings
   Every indicator gets: what it is, what a high or low value means for
   stocks, and a rule-based reading of the latest value
   (주식에 우호적 · 중립 · 주의 · 주식에 부담).
   ===================================================================== */
const MAC = { open: null, range: "5Y" };
const MLV = {
  good: { t: "주식에 우호적", s: "우호", sc: 1 },
  mid: { t: "중립", s: "중립", sc: 0 },
  warn: { t: "주의", s: "주의", sc: -0.5 },
  bad: { t: "주식에 부담", s: "부담", sc: -1 },
};

// ---------------------------------------------------------------- small helpers
const pc = (v, nd = 2) => (isNum(v) ? fmtN(v, nd) + "%" : "–");
const pp = (v, nd = 2) => (isNum(v) ? (v > 0 ? "+" : v < 0 ? "−" : "") + fmtN(Math.abs(v), nd) + "%p" : "–");
/** counts published in thousands -> "16.2만 명" */
const man = (v, unit) => (v < 0 ? "−" : "") + fmtN(Math.abs(v) / 10, 1) + "만 " + unit;
const monKo = (d) => +d.slice(5, 7) + "월";
/** josa after a number read aloud: 0·3·6 (영·삼·육) end in a consonant -> "으로" */
const ro = (numText) => (/[036]$/.test(numText) ? "으로" : "로");
const qKo = (d) => `${d.slice(2, 4)}년 ${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}분기`;

/* When each series comes out. Weekdays are US time; the page picks new values up the next morning in Korea.
   c overrides the cadence chip when the release cadence differs from the data frequency. */
const MFREQ = { D: "매일", W: "매주", M: "매월", Q: "분기" };
const MREL = {
  FFR: { t: "값은 매일 기록되지만, 바뀌는 건 1년에 8번 열리는 FOMC 회의 때뿐이에요." },
  UST2Y: { t: "매일 나와요. 연준 금리 통계(H.15)를 거쳐 하루 늦게 올라와요." },
  UST10Y: { t: "매일 나와요. 연준 금리 통계(H.15)를 거쳐 하루 늦게 올라와요." },
  SP10_2: { t: "매일 나와요. 재무부 금리 자료로 그날 바로 계산돼서 2년물·10년물 금리 카드보다 하루 빠를 때가 많아요." },
  SP10_3M: { t: "매일 나와요. 재무부 금리 자료로 그날 바로 계산돼서 국채 금리 카드보다 하루 빠를 때가 많아요." },
  MORT30: { t: "매주 목요일, 주택금융회사 프레디맥이 그 주 조사 결과를 발표해요." },
  CPI: { t: "매월 10~15일쯤 노동통계국이 지난달 치를 발표해요." },
  CORE_CPI: { t: "CPI와 같은 날, 매월 10~15일쯤 지난달 치가 발표돼요." },
  CORE_PCE: { t: "매월 하순 경제분석국이 지난달 치를 발표해요. CPI보다 2주쯤 늦어서 CPI보다 한 달 전 값이 보일 때가 많아요." },
  BEI5: { t: "매일 나와요. 국채 금리로 그날 바로 계산돼요." },
  UNRATE: { t: "보통 매월 첫째 금요일, 노동통계국 고용보고서로 지난달 치가 발표돼요." },
  NFP: { t: "보통 매월 첫째 금요일, 노동통계국 고용보고서로 지난달 치가 발표돼요." },
  CLAIMS: { t: "매주 목요일, 지난주(토요일까지) 신청 건수가 발표돼요. 날짜는 그 주의 마지막 날이에요." },
  SAHM: { t: "고용보고서의 실업률로 계산돼서 매월 고용보고서와 같은 날 바뀌어요." },
  WAGE: { t: "보통 매월 첫째 금요일, 고용보고서와 함께 지난달 치가 발표돼요." },
  GDP: { t: "분기가 끝나고 한 달쯤 뒤 첫 추정치가 나오고, 그 뒤 두 번 더 고쳐서 발표돼요. 2분기는 4~6월이에요." },
  INDPRO: { t: "매월 중순 연준이 지난달 치를 발표해요." },
  RETAIL: { t: "매월 중순 인구조사국이 지난달 치를 발표해요." },
  HOUST: { t: "매월 중순이 지나서 인구조사국이 지난달 치를 발표해요." },
  UMICH: { t: "미시간대가 매월 중순(예비치)과 하순(확정치)에 발표하지만, FRED에는 제공처 요청으로 한 달 늦게 올라와요." },
  M2: { t: "매월 하순 연준이 지난달 치를 발표해요." },
  FEDBS: { t: "매주 목요일 오후, 연준이 수요일 기준 규모를 발표해요." },
  HY: { t: "매일 나와요. 장 마감 값이 하루 늦게 올라와요." },
  IG: { t: "매일 나와요. 장 마감 값이 하루 늦게 올라와요." },
  NFCI: { t: "매주 수요일, 시카고 연은이 지난주(금요일까지) 치를 발표해요." },
  VIX: { t: "매일 나와요. 장 마감 값이 하루 늦게 올라와요." },
  USD: { c: "매주", t: "값은 날마다 있지만, 연준이 매주 월요일에 지난주 치를 한꺼번에 발표해요." },
  WTI: { c: "매주", t: "값은 날마다 있지만, 미국 에너지정보청(EIA)이 매주 수요일에 한꺼번에 올려요." },
  SPX: { t: "매일 나와요. 장 마감 값이 하루 늦게 올라와요." },
};
const mCad = (key, s) => (MREL[key] && MREL[key].c) || MFREQ[s.freq] || "";
/** the period a value covers: "9/28", "9/19 주간", "8월분", "2분기" (with the year when it isn't this year) */
function mPeriod(s, d) {
  if (!d) return "";
  const m = +d.slice(5, 7), yy = +d.slice(0, 4) === new Date().getFullYear() ? "" : d.slice(2, 4) + "년 ";
  if (s.freq === "M") return `${yy}${m}월분`;
  if (s.freq === "Q") return `${yy}${Math.floor((m - 1) / 3) + 1}분기`;
  return fmtD(d, "md") + (s.freq === "W" ? " 주간" : "");
}
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
/** the same with the full year, for the AI prompt and chart tooltips */
function mPeriodFull(s, d) {
  const y = d.slice(0, 4), m = +d.slice(5, 7);
  if (s.freq === "M") return `${y}년 ${m}월`;
  if (s.freq === "Q") return `${y}년 ${Math.floor((m - 1) / 3) + 1}분기`;
  return fmtD(d) + (s.freq === "W" ? " 주간" : "");
}
/** "8월분" with the cadence chip in front */
function mWhen(key, s, d) {
  const p = mPeriod(s, d), c = mCad(key, s);
  return h("span", { class: "dt", title: `${p} 값 · ${c === "분기" ? "분기마다" : c} 발표` }, c ? h("span", { class: "fq" }, c) : null, p);
}
/** "올랐어요" / "내렸어요" with the size of a change in %p */
const moved = (d, nd = 2) => (Math.abs(d) < 0.5 * Math.pow(10, -nd) ? "변화가 없어요" : `${fmtN(Math.abs(d), nd)}%p ${d > 0 ? "올랐어요" : "내렸어요"}`);
/** zone label -> "높은 수준" / "안정적인 수준" */
const LVL_ADJ = { "활발": "활발한", "안정": "안정적인", "매우 안정": "매우 안정적인", "양호": "양호한", "불안": "불안한", "탄탄": "탄탄한",
  "완만": "완만한", "부진": "부진한", "정체": "정체된", "급증": "급증한", "둔화": "둔화된" };
const lvl = (label) => (LVL_ADJ[label] || (/음$/.test(label) ? label.slice(0, -1) + "은" : /함$/.test(label) ? label.slice(0, -1) + "한" : label)) + " 수준";

function zoneOf(v, zones) {
  let lo = -Infinity;
  for (const [up, label, lv] of zones) { if (v < up) return { label, lv, lo, up }; lo = up; }
  const z = zones[zones.length - 1];
  return { label: z[1], lv: z[2], lo, up: Infinity };
}

/** latest value and look-backs of one series */
function mStat(s) {
  const obs = (s && s.obs ? s.obs : []).filter((o) => isNum(o[1]));
  if (!obs.length) return null;
  const last = obs[obs.length - 1], t1 = pd(last[0]).getTime();
  const at = (days) => { const t = t1 - days * DAYMS; let v = null; for (const o of obs) { if (pd(o[0]).getTime() <= t) v = o; else break; } return v; };
  const since = (days) => obs.filter((o) => pd(o[0]).getTime() >= t1 - days * DAYMS);
  const w = since(3653).map((o) => o[1]);
  const q = s.freq === "Q";
  return {
    s, obs, v: last[1], d: last[0], at, since, first: obs[0][0],
    m1: at(s.freq === "M" ? 20 : q ? 80 : 30), m3: at(q ? 170 : 80), y1: at(362),
    pct: w.length >= 12 ? (w.filter((x) => x <= last[1]).length / w.length) * 100 : null,
    tail: (n) => obs.slice(-n).map((o) => o[1]),
  };
}
/** " 최근 10년 중 가장 높은 수준이에요." when the value sits at an extreme of its own history */
function rankText(x) {
  if (x.pct == null) return "";
  const yrs = Math.min(10, Math.max(1, Math.round(daysBetween(x.first, x.d) / 365.25)));
  const span = `최근 ${yrs}년`;
  if (x.pct >= 97) return ` ${span} 중 가장 높은 수준이에요.`;
  if (x.pct >= 85) return ` ${span} 중 높은 편이에요(상위 ${Math.max(1, Math.round(100 - x.pct))}%).`;
  if (x.pct <= 3) return ` ${span} 중 가장 낮은 수준이에요.`;
  if (x.pct <= 15) return ` ${span} 중 낮은 편이에요(하위 ${Math.max(1, Math.round(x.pct))}%).`;
  return "";
}

// ---------------------------------------------------------------- shared readings
function curveJudge(x, what) {
  const yr = x.since(365), neg = yr.filter((o) => o[1] < 0).length;
  if (x.v < 0) return { lv: "bad", tag: "역전",
    say: `${pp(x.v)}로 단기 금리가 장기 금리보다 높은 '역전' 상태예요. 시장이 경기 둔화와 금리 인하를 예상한다는 뜻이고, 과거엔 경기 침체 전에 자주 나타났어요.`,
    brief: `장단기 금리(${what})가 역전돼 있어요.` };
  if (neg >= Math.max(10, yr.length * 0.1)) return { lv: "warn", tag: "역전 해소 직후",
    say: `최근 1년 안에 역전됐다가 ${pp(x.v)}로 돌아왔어요. 과거엔 역전이 풀린 뒤에 침체가 시작된 경우가 많아 고용 지표를 함께 봐야 해요.`,
    brief: `장단기 금리 역전(${what})이 최근에 풀렸어요.` };
  if (x.v < 0.5) return { lv: "mid", tag: "평평",
    say: `${pp(x.v)}로 장기·단기 금리 차이가 작아요(평평한 모양). 경기 확장이 무르익은 시기에 흔한 모습이에요.`,
    brief: `장단기 금리차(${what})는 ${pp(x.v)}로 평평해요.` };
  return { lv: "good", tag: "정상",
    say: `${pp(x.v)}로 장기 금리가 단기 금리보다 충분히 높은 정상 모양이에요. 이 지표로 본 경기 침체 신호는 없어요.`,
    brief: `장단기 금리차(${what})는 ${pp(x.v)}로 정상이에요.` };
}
function inflJudge(x, g, name) {
  const z = zoneOf(x.v, g.zones), d3 = x.m3 ? x.v - x.m3[1] : null;
  let lv = z.lv;
  if (lv === "warn" && x.v > 2 && d3 != null && d3 >= 0.2) lv = "bad";
  const gap = x.v - 2;
  const tgt = gap > 0.3 ? `연준 목표(2%)보다 ${fmtN(gap, 2)}%p 높아요.` : gap < -0.7 ? "연준 목표(2%)보다 낮아요." : "연준 목표(2%)에 가까워요.";
  const trend = d3 == null ? "" : d3 >= 0.2 ? ` 3개월 전(${pc(x.m3[1])})보다 다시 오르고 있어요.` : d3 <= -0.2 ? ` 3개월 전(${pc(x.m3[1])})보다는 내려왔어요.` : ` 3개월 전(${pc(x.m3[1])})과 비슷해요.`;
  const tail = lv === "bad" ? " 연준이 금리를 내리기 어렵고 오히려 올릴 수도 있어 주식에 부담이에요."
    : lv === "warn" && x.v > 2 ? " 연준이 금리를 쉽게 내리기 어려운 수준이에요."
    : lv === "good" ? " 물가가 안정돼 있어 연준이 금리를 올릴 이유가 적어요."
    : x.v <= 1 ? " 물가가 너무 낮으면 경기가 약하다는 신호일 수 있어요." : "";
  return { lv, tag: z.label, say: `1년 전보다 ${pc(x.v)} 올랐어요. ${tgt}${trend}${tail}`,
    brief: `${name}${josa(name, "이", "가")} ${pc(x.v)}로 ${lv === "good" ? "안정적이에요" : gap > 0.3 ? "목표(2%)보다 높아요" : gap < -0.7 ? "목표(2%)보다 낮아요" : "목표(2%) 근처예요"}.` };
}

// ---------------------------------------------------------------- the guide, one entry per FRED series
const MG = {
  FFR: {
    what: "미국 중앙은행(연준)이 정하는 기준금리예요. 예금·대출·채권 금리가 모두 이 금리를 따라 움직여서 '돈의 값'이라고 불러요. 1년에 8번 열리는 회의(FOMC)에서 정해요.",
    hi: "높거나 올리는 중이면 돈 빌리는 비용이 커져 기업 투자와 소비가 줄어요. 예금·채권 이자가 높아져 주식의 매력도 떨어지고, 특히 먼 미래 이익에 기대는 성장주가 약해지기 쉬워요.",
    lo: "낮거나 내리는 중이면 돈이 싸져 기업 이익과 주가에 우호적이에요. 다만 경기가 갑자기 나빠져 서둘러 내리는 경우는 예외예요.",
    rule: "최근 200일 안에 올렸으면 '주식에 부담', 내렸으면 '주식에 우호적'으로 봐요. 그대로면 금리 수준으로 판단해요.",
    scale: [0, 6], zones: [[1.5, "낮음", "good"], [3, "보통", "mid"], [4.5, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      let mv = null;
      for (let i = x.obs.length - 1; i > 0; i--) { const d = x.obs[i][1] - x.obs[i - 1][1]; if (Math.abs(d) > 1e-6) { mv = { d, date: x.obs[i][0] }; break; } }
      const z = zoneOf(x.v, g.zones), ago = mv ? daysBetween(mv.date, x.d) : 9999;
      if (mv && ago <= 200 && mv.d > 0) return { lv: "bad", tag: "최근 인상",
        say: `${fmtD(mv.date, "md")}에 ${fmtN(mv.d, 2)}%p 올려 ${pc(x.v)}가 됐어요. 물가를 잡으려고 금리를 올리는 흐름이라 주식, 특히 성장주에 부담이에요.`,
        brief: `연준이 ${fmtD(mv.date, "md")}에 기준금리를 ${fmtN(mv.d, 2)}%p 올렸어요.` };
      if (mv && ago <= 200 && mv.d < 0) return { lv: "good", tag: "최근 인하",
        say: `${fmtD(mv.date, "md")}에 ${fmtN(-mv.d, 2)}%p 내려 ${pc(x.v)}가 됐어요. ${x.v >= 3 ? "아직 낮은 금리는 아니지만 " : ""}금리를 내리는 흐름은 보통 주식에 우호적이에요.`,
        brief: `연준이 ${fmtD(mv.date, "md")}에 기준금리를 ${fmtN(-mv.d, 2)}%p 내렸어요.` };
      const months = mv ? Math.max(1, Math.round(ago / 30.4)) : null;
      return { lv: z.lv, tag: "동결 · " + z.label,
        say: `${months ? months + "개월째 " : ""}${pc(x.v)}로 그대로예요(동결). ` + (x.v >= 3 ? "높은 금리가 이어져 기업과 가계의 이자 부담이 큰 편이에요." : "돈 빌리는 비용이 크지 않은 수준이에요."),
        brief: `기준금리는 ${pc(x.v)}로 ${months ? months + "개월째 " : ""}그대로예요.` };
    },
  },
  UST2Y: {
    what: "2년 뒤에 원금을 돌려받는 미국 국채의 금리예요. 앞으로 1~2년 동안 기준금리가 어떻게 될지에 대한 시장의 예상이 가장 빨리 반영돼요.",
    hi: "기준금리보다 높으면 시장이 '금리가 더 오를 것'으로 본다는 뜻이라 주식에 부담이에요.",
    lo: "기준금리보다 낮으면 시장이 금리 인하를 예상한다는 뜻이에요. 경기가 괜찮은 상태에서 나오는 인하 기대는 주식에 우호적이에요.",
    rule: "기준금리(상단)보다 0.35%p 이상 높으면 '추가 인상 예상', 0.35%p 이상 낮으면 '인하 예상'으로 봐요.",
    judge(x, S) {
      const f = S("FFR"), m1 = x.m1 ? x.v - x.m1[1] : 0;
      const pace = m1 >= 0.3 ? ` 한 달 새 ${fmtN(m1, 2)}%p 뛰었어요.` : m1 <= -0.3 ? ` 한 달 새 ${fmtN(-m1, 2)}%p 내렸어요.` : "";
      if (!f) return { lv: "mid", tag: "", say: `${pc(x.v)}예요.${pace}`, brief: "" };
      const gap = x.v - f.v;
      if (gap >= 0.35) return { lv: "bad", tag: "추가 인상 예상",
        say: `기준금리(${pc(f.v)})보다 ${fmtN(gap, 2)}%p 높아요. 시장이 앞으로 금리를 더 올릴 것으로 본다는 뜻이라 주식에 부담이에요.${pace}`,
        brief: `2년물 금리(${pc(x.v)})가 기준금리보다 높아 시장은 추가 인상을 예상해요.` };
      if (gap <= -0.35) return { lv: "good", tag: "인하 예상",
        say: `기준금리(${pc(f.v)})보다 ${fmtN(-gap, 2)}%p 낮아요. 시장이 앞으로 금리 인하를 예상하고 있어요.${pace}`,
        brief: `2년물 금리(${pc(x.v)})가 기준금리보다 낮아 시장은 금리 인하를 예상해요.` };
      return { lv: "mid", tag: "동결 예상",
        say: `기준금리(${pc(f.v)})와 비슷해서 당분간 금리가 크게 바뀌지 않을 거라고 보는 모습이에요.${pace}`,
        brief: "시장은 당분간 금리 동결을 예상해요." };
    },
  },
  UST10Y: {
    what: "10년 만기 미국 국채 금리예요. 주택담보대출·회사채 금리의 기준이고, 주식의 적정 가치를 계산할 때 쓰는 할인율의 바탕이에요.",
    hi: "오르면 기업이 앞으로 벌 돈의 현재 가치가 줄어 주가, 특히 기술·성장주가 눌려요. 채권 이자가 높아지면 돈이 주식에서 채권으로 옮겨 가기도 해요. 보통 4.5%를 넘으면 부담 구간으로 봐요.",
    lo: "낮으면 주식 가치 평가에 우호적이에요. 다만 경기 침체 걱정 때문에 급하게 떨어질 때는 좋은 신호가 아니에요.",
    scale: [0, 6], zones: [[3, "낮음", "good"], [4, "보통", "mid"], [4.5, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), m1 = x.m1 ? x.v - x.m1[1] : 0;
      const lv = m1 >= 0.3 && z.lv === "warn" ? "bad" : z.lv;
      const pace = m1 >= 0.3 ? ` 한 달 새 ${fmtN(m1, 2)}%p 올라 속도도 빨라요.` : m1 <= -0.3 ? ` 한 달 새 ${fmtN(-m1, 2)}%p 내렸어요.` : "";
      const tail = lv === "bad" || lv === "warn" ? " 주식, 특히 성장주 가치에 부담이에요." : lv === "good" ? " 주식 가치 평가에 우호적인 수준이에요." : "";
      return { lv, tag: z.label, say: `${pc(x.v)}로 ${lvl(z.label)}이에요.${rankText(x)}${pace}${tail}`,
        brief: `10년물 금리가 ${pc(x.v)}로 ${x.pct != null && x.pct >= 97 ? "최근 10년 중 가장 높아요" : lvl(z.label) + "이에요"}.` };
    },
  },
  SP10_2: {
    what: "10년 금리에서 2년 금리를 뺀 값이에요. 돈을 오래 빌려줄수록 이자를 더 받는 게 정상이라 보통은 플러스예요.",
    hi: "0.5%p 이상 플러스로 벌어져 있으면 정상적인 경기 확장 모습이에요.",
    lo: "마이너스(역전)면 시장이 앞으로 경기 둔화와 금리 인하를 예상한다는 뜻이에요. 과거 미국 경기 침체 전에는 거의 매번 역전이 먼저 나타났고, 역전이 풀린 직후에 침체가 시작된 경우도 많아요.",
    scale: [-1.5, 3], zones: [[0, "역전", "bad"], [0.5, "평평", "mid"], [Infinity, "정상", "good"]],
    judge: (x) => curveJudge(x, "10년−2년"),
  },
  SP10_3M: {
    what: "10년 금리에서 3개월 금리를 뺀 값이에요. 뉴욕 연은이 '1년 뒤 경기 침체 확률'을 계산할 때 쓰는 지표예요.",
    hi: "0.5%p 이상 플러스면 정상이에요. 이 지표로 본 침체 확률이 낮아요.",
    lo: "마이너스(역전)면 경기 침체 확률이 높아졌다는 뜻이에요. 1960년대 이후 미국 경기 침체 전에는 거의 매번 이 역전이 나타났어요.",
    scale: [-1.5, 3], zones: [[0, "역전", "bad"], [0.5, "평평", "mid"], [Infinity, "정상", "good"]],
    judge: (x) => curveJudge(x, "10년−3개월"),
  },
  MORT30: {
    what: "미국에서 집을 살 때 받는 30년 고정금리 주택담보대출(모기지) 금리예요. 매주 발표돼요.",
    hi: "높으면 집 사기가 어려워져 주택 거래와 건설이 줄고, 가구·가전·건자재 소비와 은행 대출도 둔해져요. 7% 이상은 2000년대 초 이후 가장 높은 수준이에요.",
    lo: "낮으면 주택 구매와 대출 갈아타기(재융자)가 늘어 소비에 도움이 돼요.",
    scale: [2, 8.5], zones: [[4.5, "낮음", "good"], [6, "보통", "mid"], [7, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), dy = x.y1 ? x.v - x.y1[1] : null;
      return { lv: z.lv, tag: z.label,
        say: `${pc(x.v)}로 ${lvl(z.label)}이에요.${rankText(x)}${dy != null ? ` 1년 전보다 ${moved(dy)}.` : ""} ${z.lv === "bad" || z.lv === "warn" ? "주택 거래·건설과 관련 소비에 부담이에요." : "주택 시장에 큰 부담은 없는 수준이에요."}`,
        brief: `모기지 금리가 ${pc(x.v)}로 ${lvl(z.label)}이에요.` };
    },
  },
  CPI: {
    what: "소비자가 사는 물건·서비스 값이 1년 전보다 몇 % 올랐는지예요. 뉴스에서 말하는 '인플레이션'이 바로 이 숫자예요.",
    hi: "연준 목표(2%)보다 높게 이어지면 연준이 금리를 내리기 어렵고 오히려 올릴 수도 있어 주식에 부담이에요. 기업 원가도 올라요.",
    lo: "2% 안팎이 가장 좋아요. 0% 가까이 너무 낮으면 경기가 약하다는 신호일 수 있어요.",
    rule: "3개월 전보다 0.2%p 넘게 다시 오르고 있으면 한 단계 더 나쁘게 봐요.",
    scale: [-1, 6], zones: [[1, "너무 낮음", "warn"], [2.7, "적정", "good"], [3.5, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge: (x, S, g) => inflJudge(x, g, "소비자물가(CPI)"),
  },
  CORE_CPI: {
    what: "CPI에서 값이 크게 출렁이는 식품·에너지를 뺀 물가예요. 물가의 바닥 흐름을 보여줘서 연준이 더 중요하게 봐요.",
    hi: "3%를 넘게 이어지면 물가가 끈끈하게 안 떨어진다는 뜻이라 금리 인하가 늦어져요.",
    lo: "2~2.7%면 물가가 잘 잡혀 가는 모습이에요.",
    rule: "3개월 전보다 0.2%p 넘게 다시 오르고 있으면 한 단계 더 나쁘게 봐요.",
    scale: [0, 6], zones: [[1, "너무 낮음", "warn"], [2.7, "적정", "good"], [3.3, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge: (x, S, g) => inflJudge(x, g, "근원 CPI"),
  },
  CORE_PCE: {
    what: "연준이 '물가 목표 2%'를 잴 때 공식적으로 쓰는 물가예요(식품·에너지 제외). CPI보다 범위가 넓고 조금 늦게 발표돼요.",
    hi: "목표(2%)보다 높게 이어지면 연준이 금리를 내릴 수 없어 주식에 부담이에요.",
    lo: "2% 근처로 내려오면 연준이 금리를 내릴 여유가 생겨 주식에 우호적이에요.",
    rule: "3개월 전보다 0.2%p 넘게 다시 오르고 있으면 한 단계 더 나쁘게 봐요.",
    scale: [0, 5], zones: [[1.5, "낮음", "mid"], [2.5, "목표 근처", "good"], [3, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge: (x, S, g) => inflJudge(x, g, "연준이 보는 근원 PCE"),
  },
  BEI5: {
    what: "채권 시장이 예상하는 앞으로 5년 동안의 평균 물가 상승률이에요. 일반 국채와 물가연동국채의 금리 차이로 계산해요.",
    hi: "2.5%를 넘어 오르면 '물가가 계속 오를 것'이라는 믿음이 퍼진다는 뜻이라 연준이 금리를 올릴 이유가 돼요.",
    lo: "2~2.5%면 물가 기대가 잘 잡혀 있다는 좋은 신호예요. 1.5% 아래로 떨어지면 경기 침체 걱정을 반영하는 경우가 많아요.",
    scale: [0.5, 3.5], zones: [[1.5, "낮음", "warn"], [2.5, "안정", "good"], [3, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      const t = z.lv === "good" ? "물가 기대가 잘 잡혀 있어요." : x.v >= 2.5 ? "물가가 계속 오를 거라는 걱정이 커지고 있어요. 연준이 금리를 올릴 이유가 될 수 있어요." : "물가 기대가 낮아요. 경기 둔화 걱정을 반영하는 경우가 많아요.";
      return { lv: z.lv, tag: z.label, say: `채권 시장은 앞으로 5년 동안 물가가 해마다 평균 ${pc(x.v)}씩 오를 것으로 봐요. ${t}`,
        brief: `기대인플레이션은 ${pc(x.v)}로 ${z.lv === "good" ? "안정적이에요" : lvl(z.label) + "이에요"}.` };
    },
  },
  UNRATE: {
    what: "일할 의사가 있는데 일자리를 구하지 못한 사람의 비율이에요. 매달 첫째 금요일 고용 보고서와 함께 나와요.",
    hi: "수준보다 오르는 속도가 중요해요. 몇 달 새 빠르게 오르면 경기 침체가 시작됐다는 신호예요(아래 '삼의 법칙' 참고).",
    lo: "4% 안팎으로 낮게 유지되면 소비가 탄탄해요. 다만 너무 낮으면 일손이 부족해 임금이 오르고 물가를 자극할 수 있어요.",
    rule: "1년 전보다 0.4%p 이상 오르면 '상승 중'(주의), 0.8%p 이상 오르면 '빠르게 상승'(부담)으로 봐요.",
    scale: [2.5, 8], zones: [[3.8, "매우 낮음", "mid"], [5, "양호", "good"], [6.5, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), dy = x.y1 ? x.v - x.y1[1] : null;
      let lv = z.lv, tag = z.label;
      if (dy != null && dy >= 0.8) { lv = "bad"; tag = "빠르게 상승"; } else if (dy != null && dy >= 0.4) { if (lv !== "bad") lv = "warn"; tag = "상승 중"; }
      const ch = dy == null ? "" : Math.abs(dy) < 0.05 ? " 1년 전과 같아요." : ` 1년 전(${pc(x.y1[1], 1)})보다 ${moved(dy, 1)}.`;
      const tail = lv === "bad" ? " 일자리가 빠르게 줄고 있다는 신호라 경기 침체를 조심해야 해요."
        : lv === "warn" ? " 실업률이 오르는 흐름이라 고용 둔화를 지켜봐야 해요."
        : z.label === "매우 낮음" ? " 일손이 부족할 만큼 고용이 뜨거워 임금·물가 압력이 생길 수 있어요."
        : " 일자리가 안정적이라 소비를 받쳐 줘요.";
      return { lv, tag, say: `${pc(x.v, 1)}로 ${lvl(z.label)}이에요.${ch}${tail}`,
        brief: `실업률이 ${pc(x.v, 1)}로 ${lv === "good" ? "낮게 유지돼요" : lv === "mid" ? "매우 낮아요" : "오르고 있어요"}.` };
    },
  },
  NFP: {
    what: "농업을 뺀 미국 일자리가 한 달 동안 몇 개 늘었는지예요. 시장이 가장 주목하는 고용 지표예요(단위가 천 명이라 162는 16.2만 명이에요).",
    hi: "매달 10만~20만 명씩 늘면 경기가 탄탄하다는 뜻이에요. 30만 명 넘게 너무 많이 늘면 임금·물가 걱정으로 금리 인하가 늦어질 수 있어요.",
    lo: "5만 명 아래로 줄거나 마이너스가 되면 경기 둔화·침체 신호예요. 한 달치는 들쭉날쭉하니 3개월 평균으로 보세요.",
    rule: "최근 3개월 평균으로 판단해요.",
    scale: [-150, 400], zones: [[0, "감소", "bad"], [75, "약함", "warn"], [250, "양호", "good"], [Infinity, "과열", "mid"]],
    judge(x, S, g) {
      const a3 = mean(x.tail(3)), z = zoneOf(a3, g.zones);
      const tail = z.lv === "good" ? "일자리가 꾸준히 늘어 경기가 탄탄하다는 뜻이에요."
        : z.lv === "warn" ? "일자리 증가 속도가 느려져 고용이 식고 있어요."
        : z.lv === "bad" ? "일자리가 줄고 있어 경기 침체 신호예요."
        : "일자리가 너무 많이 늘어 임금·물가 걱정으로 금리 인하가 늦어질 수 있어요.";
      const word = { "양호": "양호해요", "약함": "약해요", "감소": "마이너스예요", "과열": "매우 강해요" }[z.label];
      return { lv: z.lv, tag: z.label, gauge: a3,
        say: `${monKo(x.d)}에 ${man(Math.abs(x.v), "명")} ${x.v >= 0 ? "늘었고" : "줄었고"}, 최근 3개월 평균은 ${man(a3, "명")}이에요. ${tail}`,
        brief: `일자리 증가는 최근 3개월 평균 ${man(a3, "명")}으로 ${word}.` };
    },
  },
  CLAIMS: {
    what: "한 주 동안 새로 실업수당을 신청한 사람 수예요(단위 천 건). 매주 목요일 발표돼 해고 흐름을 가장 빨리 보여줘요.",
    hi: "늘어나면 해고가 많아진다는 뜻이에요. 30만 건을 넘거나 몇 달 새 빠르게 늘면 경기 악화 신호예요.",
    lo: "25만 건 아래면 해고가 적은 건강한 고용 시장이에요.",
    rule: "최근 4주 평균으로 판단하고, 3개월 전보다 15% 넘게 늘었으면 '늘어나는 중'(주의)으로 봐요.",
    scale: [150, 400], zones: [[250, "낮음(양호)", "good"], [300, "보통", "mid"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const a4 = mean(x.tail(4));
      const p4 = mean(x.obs.filter((o) => { const dd = daysBetween(o[0], x.d); return dd >= 84 && dd < 112; }).map((o) => o[1]));
      const z = zoneOf(a4, g.zones);
      let lv = z.lv, tag = z.label;
      const up = isNum(p4) && p4 > 0 ? a4 / p4 - 1 : null;
      if (up != null && up >= 0.15 && lv !== "bad") { lv = "warn"; tag = "늘어나는 중"; }
      const ch = up == null ? "" : ` 3개월 전보다 ${fmtN(Math.abs(up) * 100, 0)}% ${up >= 0 ? "많아요" : "적어요"}.`;
      return { lv, tag, gauge: a4,
        say: `최근 4주 평균 주당 ${man(a4, "건")}이에요.${ch} ${lv === "good" ? "해고가 적어 고용 시장이 건강해요." : lv === "bad" ? "해고가 늘어 경기 악화 신호예요." : "해고 흐름을 지켜볼 필요가 있어요."}`,
        brief: `실업수당 신규 청구는 주당 ${man(a4, "건")}으로 ${lv === "good" ? "적어요" : lv === "bad" ? "많아요" : "늘고 있어요"}.` };
    },
  },
  SAHM: {
    what: "실업률 3개월 평균이 지난 1년 중 가장 낮았던 때보다 얼마나 올랐는지예요. 경제학자 클로디아 삼이 만든 경기 침체 판별법이에요.",
    hi: "0.5%p 이상이면 경기 침체가 시작됐다는 신호예요. 1970년 이후 이 신호가 켜졌을 때는 거의 매번 침체였어요.",
    lo: "0에 가깝거나 마이너스면 고용이 안정적이에요.",
    scale: [-0.5, 1], zones: [[0.3, "안정", "good"], [0.5, "주의", "warn"], [Infinity, "침체 신호", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      const say = z.lv === "bad" ? `${pp(x.v)}로 침체 기준(0.5%p)을 넘었어요. 1970년 이후 이 신호가 켜졌을 때는 거의 매번 경기 침체였어요.`
        : z.lv === "warn" ? `${pp(x.v)}로 침체 기준(0.5%p)에 가까워지고 있어요. 실업률 흐름을 주의해서 봐야 해요.`
        : `${pp(x.v)}로 침체 기준(0.5%p)과 거리가 멀어요. 고용이 안정적이에요.`;
      return { lv: z.lv, tag: z.label, say,
        brief: z.lv === "good" ? "삼의 법칙 침체 신호는 꺼져 있어요." : z.lv === "warn" ? "삼의 법칙 지표가 침체 기준에 가까워지고 있어요." : "삼의 법칙 침체 신호가 켜졌어요." };
    },
  },
  WAGE: {
    what: "미국 근로자의 시간당 평균 임금이 1년 전보다 몇 % 올랐는지예요.",
    hi: "4%를 넘으면 기업 인건비와 서비스 물가를 밀어 올려 연준이 금리를 내리기 어려워요.",
    lo: "3~3.5%가 물가 2%와 어울리는 수준이에요. 물가 상승률보다 낮으면 실제 소득(실질 임금)이 줄어 소비가 약해질 수 있어요.",
    rule: "물가 상승률(CPI)보다 낮으면 실질 임금이 줄고 있다고 보고 '주의'로 봐요.",
    scale: [0, 6], zones: [[2.5, "낮음", "warn"], [3.8, "적정", "good"], [4.5, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), cpi = S("CPI"), real = cpi ? x.v - cpi.v : null;
      let lv = z.lv, tag = z.label, realTxt = "";
      if (real != null && real < 0) { realTxt = ` 다만 물가(${pc(cpi.v)})보다 덜 올라 물가를 빼면 실질 임금은 줄고 있어요. 소비에는 부담이에요.`; if (lv === "good") { lv = "warn"; tag = "실질 임금 감소"; } }
      else if (real != null) realTxt = ` 물가(${pc(cpi.v)})보다 ${fmtN(real, 2)}%p 더 올라 실질 소득이 늘고 있어요.`;
      const pace = z.label === "적정" ? "물가를 크게 자극하지 않는 적정 속도예요." : z.label === "낮음" ? "임금이 느리게 오르고 있어요." : "임금이 빠르게 올라 서비스 물가를 자극할 수 있어요.";
      return { lv, tag, say: `임금이 1년 전보다 ${pc(x.v)} 올랐어요. ${pace}${realTxt}`,
        brief: real != null && real < 0 ? `임금 상승률(${pc(x.v)})이 물가보다 낮아 실질 임금이 줄고 있어요.` : `임금은 ${pc(x.v)} 올라 ${lvl(z.label)}이에요.` };
    },
  },
  GDP: {
    what: "물가를 빼고 본 미국 경제 전체의 성장률이에요. 분기 성장률을 1년치로 환산(연율)해서 발표해요.",
    hi: "2% 이상이면 탄탄한 성장이에요. 기업 매출이 늘기 좋은 환경이에요.",
    lo: "0~1%면 둔화, 마이너스가 두 분기 이어지면 흔히 경기 침체로 봐요.",
    scale: [-3, 5], zones: [[0, "역성장", "bad"], [1, "부진", "warn"], [2, "완만", "mid"], [Infinity, "탄탄", "good"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), prev = x.m1;
      const t = { "역성장": "경제가 줄어들었어요. 두 분기 연속이면 흔히 경기 침체로 봐요.", "부진": "성장이 거의 멈춘 수준이에요.", "완만": "느리지만 성장은 이어지고 있어요.", "탄탄": "탄탄하게 성장하고 있어요." }[z.label];
      const word = { "역성장": "마이너스예요", "부진": "부진해요", "완만": "완만해요", "탄탄": "탄탄해요" }[z.label];
      return { lv: z.lv, tag: z.label,
        say: `${qKo(x.d)}에 연율 ${pc(x.v, 1)} 성장했어요${prev ? `(직전 분기 ${pc(prev[1], 1)})` : ""}. ${t}`,
        brief: `${qKo(x.d)} 성장률은 연율 ${pc(x.v, 1)}로 ${word}.` };
    },
  },
  INDPRO: {
    what: "공장·광산·전기·가스 생산량이 1년 전보다 얼마나 늘었는지예요. 제조업 경기를 보여줘요.",
    hi: "늘어나면 제조업 경기가 살아난다는 뜻이라 산업재·소재 기업에 좋아요.",
    lo: "마이너스면 공장 생산이 줄고 있다는 뜻이에요. 경기 둔화 때 먼저 나타나요.",
    scale: [-6, 6], zones: [[-1, "위축", "bad"], [1, "정체", "mid"], [Infinity, "증가", "good"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      return { lv: z.lv, tag: z.label,
        say: `생산이 1년 전보다 ${pc(Math.abs(x.v))} ${x.v >= 0 ? "늘었어요" : "줄었어요"}. ${z.lv === "good" ? "제조업 경기가 괜찮은 편이에요." : z.lv === "bad" ? "제조업이 위축되고 있어요." : "제조업 경기는 제자리걸음이에요."}`,
        brief: `산업생산은 1년 전보다 ${pc(Math.abs(x.v), 1)} ${x.v >= 0 ? "늘었어요" : "줄었어요"}.` };
    },
  },
  RETAIL: {
    what: "미국 소비자가 가게와 온라인에서 쓴 돈이 1년 전보다 얼마나 늘었는지예요. 미국 경제의 약 70%가 소비예요.",
    hi: "물가 상승률보다 많이 늘면 실제 소비가 탄탄하다는 뜻이라 기업 매출에 좋아요.",
    lo: "물가 상승률보다 적게 늘면, 물가를 빼고 보면 소비가 줄고 있다는 뜻이에요.",
    rule: "증가율에서 물가 상승률(CPI)을 뺀 값으로 판단해요. 게이지도 그 값이에요.",
    scale: [-4, 6], zones: [[-1, "위축", "bad"], [1, "보합", "mid"], [Infinity, "탄탄", "good"]],
    judge(x, S, g) {
      const cpi = S("CPI"), real = cpi ? x.v - cpi.v : x.v, z = zoneOf(real, g.zones);
      const t = !cpi ? "" : z.lv === "good" ? ` 물가 상승(${pc(cpi.v)})을 빼도 약 ${fmtN(real, 1)}% 늘어난 셈이라 소비가 탄탄해요.`
        : z.lv === "bad" ? ` 물가 상승(${pc(cpi.v)})을 빼면 약 ${fmtN(-real, 1)}% 줄어든 셈이라 실제 소비는 약해요.`
        : ` 물가 상승(${pc(cpi.v)})을 빼면 거의 제자리예요.`;
      return { lv: z.lv, tag: z.label, gauge: real,
        say: `소비자 지출이 1년 전보다 ${pc(Math.abs(x.v))} ${x.v >= 0 ? "늘었어요" : "줄었어요"}.${t}`,
        brief: z.lv === "good" ? `소매판매가 물가를 빼고도 약 ${fmtN(real, 1)}% 늘어 소비가 탄탄해요.` : z.lv === "bad" ? "물가를 빼면 소매판매가 줄고 있어요." : "물가를 빼면 소매판매는 제자리예요." };
    },
  },
  HOUST: {
    what: "새로 짓기 시작한 주택 수를 1년치로 환산한 값이에요(단위 천 호, 1,275는 127.5만 호). 금리에 민감해서 경기를 미리 보여주는 지표로 써요.",
    hi: "150만 호 이상이면 주택 경기가 활발해요. 건설·건자재·가구 업종에 좋아요.",
    lo: "120만 호 아래로 줄면 주택 경기가 식고 있다는 뜻이에요. 보통 금리가 높을 때 줄어요.",
    rule: "달마다 들쭉날쭉해서 최근 3개월 평균으로 판단해요.",
    scale: [800, 1900], zones: [[1100, "부진", "bad"], [1300, "다소 약함", "warn"], [1500, "보통", "mid"], [Infinity, "활발", "good"]],
    judge(x, S, g) {
      const a3 = mean(x.tail(3)), z = zoneOf(a3, g.zones), dy = x.y1 ? x.v / x.y1[1] - 1 : null;
      const t = z.lv === "good" ? "주택 경기가 활발해요." : z.lv === "mid" ? "주택 경기는 보통이에요." : z.lv === "warn" ? "주택 경기가 다소 식은 편이에요." : "주택 경기가 부진해요.";
      return { lv: z.lv, tag: z.label, gauge: a3,
        say: `${monKo(x.d)} 착공은 연율 ${man(x.v, "호")}${dy != null ? `(1년 전보다 ${fmtN(Math.abs(dy) * 100, 1)}% ${dy >= 0 ? "많음" : "적음"})` : ""}, 최근 3개월 평균은 ${man(a3, "호")}예요. ${t}`,
        brief: `주택 착공은 3개월 평균 ${man(a3, "호")}로 ${lvl(z.label)}이에요.` };
    },
  },
  UMICH: {
    what: "미시간대가 매달 소비자에게 경기와 살림살이 전망을 물어 만든 지수예요. 1966년을 100으로 잡았고, 장기 평균은 85 안팎이에요.",
    hi: "높으면 소비자가 지갑을 열 가능성이 커요.",
    lo: "60 아래는 역사적으로 매우 비관적인 수준이에요. 소비가 줄 위험이 있지만, 과거엔 심리가 바닥일 때 주가도 바닥 근처였던 적이 많아요(거꾸로 읽기도 하는 지표예요).",
    scale: [40, 110], zones: [[60, "매우 비관", "warn"], [75, "비관", "warn"], [90, "보통", "mid"], [Infinity, "낙관", "good"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      const t = z.label === "매우 비관" ? " 소비가 위축될 위험이 있지만, 이렇게 비관이 심할 때 주가가 바닥 근처였던 적도 많아요."
        : z.label === "비관" ? " 소비자들이 경기를 어둡게 보고 있어요." : z.label === "보통" ? " 소비자 심리는 평범한 수준이에요." : " 소비자들이 경기를 밝게 보고 있어요.";
      const word = { "매우 비관": "매우 비관적이에요", "비관": "비관적이에요", "보통": "보통이에요", "낙관": "낙관적이에요" }[z.label];
      return { lv: z.lv, tag: z.label,
        say: `${fmtN(x.v, 1)}${ro(fmtN(x.v, 1))} 장기 평균(약 85)보다 ${fmtN(Math.abs(85 - x.v), 0)}포인트 ${x.v < 85 ? "낮아요" : "높아요"}.${rankText(x)}${t}`,
        brief: `소비자심리가 ${fmtN(x.v, 1)}${ro(fmtN(x.v, 1))} ${word}.` };
    },
  },
  M2: {
    what: "현금·예금처럼 바로 쓸 수 있는 돈(M2)이 1년 전보다 얼마나 늘었는지예요.",
    hi: "10% 넘게 급증하면 돈이 넘쳐 자산 가격이 오르기 쉽지만 물가도 자극해요(2021년이 그랬어요).",
    lo: "마이너스면 시중의 돈이 줄어든다는 뜻이라 주식에 부담이에요(2023년이 그랬어요).",
    scale: [-5, 15], zones: [[0, "감소", "bad"], [3, "둔화", "mid"], [8, "적정", "good"], [Infinity, "급증", "warn"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      const t = { "적정": "경제 규모에 맞게 적당히 늘고 있어요.", "급증": "돈이 많이 풀려 자산 가격을 밀어 올리기 쉽지만 물가도 자극할 수 있어요.", "감소": "시중의 돈이 줄어 주식에 부담이에요.", "둔화": "돈이 느리게 늘고 있어요." }[z.label];
      return { lv: z.lv, tag: z.label, say: `시중의 돈이 1년 전보다 ${pc(Math.abs(x.v))} ${x.v >= 0 ? "늘었어요" : "줄었어요"}. ${t}`,
        brief: `통화량(M2)은 1년 전보다 ${pc(Math.abs(x.v), 1)} ${x.v >= 0 ? "늘었어요" : "줄었어요"}.` };
    },
  },
  FEDBS: {
    what: "연준이 가진 국채·주택저당증권 같은 자산의 규모예요(조 달러). 채권을 사들이면(양적완화) 시중에 돈이 풀리고, 줄이면(양적긴축) 돈을 거둬들여요.",
    hi: "늘어나는 중이면 시장에 돈이 풀려 주식에 우호적이에요.",
    lo: "줄어드는 중이면(양적긴축) 시장의 돈이 빠져 주식에 약한 부담이에요.",
    hiL: "늘어나면", loL: "줄어들면",
    rule: "1년 전보다 3% 넘게 늘면 '늘리는 중', 3% 넘게 줄면 '줄이는 중'으로 봐요. 금액 자체의 높고 낮음보다 방향이 중요해요.",
    judge(x) {
      const dy = x.y1 ? (x.v / x.y1[1] - 1) * 100 : null;
      let lv = "mid", tag = "거의 그대로", t = "연준이 자산 규모를 크게 바꾸지 않고 있어요.", brief = "연준 자산 규모는 거의 그대로예요.";
      if (dy != null && dy >= 3) { lv = "good"; tag = "늘리는 중"; t = "연준이 채권을 사들여 시중에 돈을 풀고 있어요(양적완화)."; brief = "연준이 자산을 늘려 돈을 풀고 있어요."; }
      else if (dy != null && dy <= -3) { lv = "warn"; tag = "줄이는 중"; t = "연준이 보유 채권을 줄여 시중의 돈을 거둬들이고 있어요(양적긴축)."; brief = "연준이 자산을 줄여 돈을 거둬들이고 있어요."; }
      return { lv, tag, say: `${fmtN(x.v, 2)}조 달러로 1년 전보다 ${dy != null ? fmtN(Math.abs(dy), 1) + "% " + (dy >= 0 ? "늘었어요" : "줄었어요") : "–"}. ${t}`, brief };
    },
  },
  HY: {
    what: "신용등급이 낮은(투기등급) 회사의 채권이 국채보다 금리를 얼마나 더 주는지예요. 시장이 기업 부도 위험을 얼마나 걱정하는지 보여줘요.",
    hi: "5%p 넘게 벌어지면 투자자들이 부도를 걱정한다는 뜻이라 주식에도 위험 신호예요. 2008년·2020년 위기 때 크게 뛰었어요.",
    lo: "3~4%p 이하로 낮으면 신용 시장이 안정적이고 기업이 돈을 빌리기 쉬워요. 너무 낮으면 위험을 가볍게 본다는 뜻이기도 해요.",
    rule: "한 달 새 0.5%p 넘게 벌어지면 수준이 낮아도 한 단계 조심스럽게 봐요.",
    scale: [2, 8], zones: [[3.5, "매우 안정", "good"], [5, "보통", "mid"], [6.5, "불안", "warn"], [Infinity, "위기", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), m1 = x.m1 ? x.v - x.m1[1] : 0;
      const t = z.lv === "good" ? "기업 부도 걱정이 적고 돈 빌리기 쉬운 환경이에요. 너무 낮을 땐 위험을 가볍게 본다는 뜻이기도 해요."
        : z.lv === "mid" ? "신용 시장은 보통 수준이에요." : z.lv === "warn" ? "기업 부도 걱정이 커지고 있어요. 주식에도 위험 신호예요." : "신용 시장이 위기 수준으로 불안해요.";
      const pace = m1 >= 0.5 ? ` 한 달 새 ${fmtN(m1, 2)}%p 벌어져 주의가 필요해요.` : "";
      const lv = pace && z.lv === "good" ? "mid" : pace && z.lv === "mid" ? "warn" : z.lv;
      return { lv, tag: z.label, say: `${fmtN(x.v, 2)}%p로 ${lvl(z.label)}이에요. ${t}${pace}`,
        brief: `하이일드 스프레드가 ${fmtN(x.v, 2)}%p로 ${z.lv === "good" ? "신용 시장이 안정적이에요" : lvl(z.label) + "이에요"}.` };
    },
  },
  IG: {
    what: "신용등급이 좋은 우량 회사의 채권이 국채보다 금리를 얼마나 더 주는지예요. 대기업이 돈을 빌리는 여건을 보여줘요.",
    hi: "1.5%p 넘게 벌어지면 우량 기업마저 돈 빌리기 어려워진다는 뜻이라 위험 신호예요.",
    lo: "1%p 아래면 우량 기업의 자금 조달이 아주 원활해요.",
    scale: [0.4, 2.5], zones: [[1, "안정", "good"], [1.5, "보통", "mid"], [2, "불안", "warn"], [Infinity, "위기", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      return { lv: z.lv, tag: z.label,
        say: `${fmtN(x.v, 2)}%p로 ${lvl(z.label)}이에요. ${z.lv === "good" ? "우량 기업이 돈을 빌리기 쉬운 환경이에요." : z.lv === "mid" ? "기업 자금 조달 여건은 보통이에요." : "기업이 돈을 빌리기 어려워지고 있어요."}`,
        brief: `우량 회사채 스프레드는 ${fmtN(x.v, 2)}%p로 ${z.lv === "good" ? "안정적이에요" : lvl(z.label) + "이에요"}.` };
    },
  },
  NFCI: {
    what: "시카고 연은이 금리·신용·주식시장 등 100여 개 지표를 묶어 만든 '돈 구하기 쉬운 정도' 지수예요. 0이 장기 평균이에요.",
    hi: "0보다 크면 평소보다 돈 구하기 어려운(긴축적) 환경이라 주식에 부담이에요.",
    lo: "0보다 작으면 평소보다 돈 구하기 쉬운(완화적) 환경이라 주식에 우호적이에요.",
    scale: [-1, 1], zones: [[-0.3, "완화적", "good"], [0, "다소 완화", "mid"], [0.3, "다소 긴축", "warn"], [Infinity, "긴축적", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      const t = z.lv === "good" ? "평소보다 돈을 구하기 쉬운(완화적) 금융 환경이라 주식에 우호적이에요."
        : z.lv === "mid" ? "평소보다 조금 완화적인 금융 환경이에요." : z.lv === "warn" ? "평소보다 조금 긴축적인 금융 환경이에요." : "평소보다 돈을 구하기 어려운(긴축적) 금융 환경이라 주식에 부담이에요.";
      const n = fmtN(x.v, 2);
      return { lv: z.lv, tag: z.label, say: `${n}${ro(n)} 0(장기 평균)보다 ${x.v < 0 ? "낮아요" : "높아요"}. ${t}`,
        brief: `금융 여건은 평소보다 ${x.v < 0 ? "완화적이에요" : "긴축적이에요"}.` };
    },
  },
  VIX: {
    what: "S&P 500 옵션 가격으로 계산한, 앞으로 30일 동안 주가가 얼마나 출렁일지에 대한 시장의 예상이에요. '공포 지수'라고도 불러요.",
    hi: "20을 넘으면 불안, 30을 넘으면 공포 구간이에요. 주가가 크게 흔들리기 쉬워요. 다만 공포가 극에 달했을 때가 오히려 매수 기회였던 적도 많아요.",
    lo: "15 아래면 시장이 평온해요. 너무 낮을 땐 방심한 상태라 작은 악재에도 크게 흔들릴 수 있어요.",
    scale: [8, 45], zones: [[15, "평온", "good"], [20, "보통", "mid"], [30, "불안", "warn"], [Infinity, "공포", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones);
      const t = { "평온": "시장이 평온해요. 다만 너무 낮을 땐 방심한 상태일 수 있어요.", "보통": "평소 수준의 긴장감이에요.", "불안": "시장 불안이 커져 주가가 크게 흔들리기 쉬워요.", "공포": "공포 구간이에요. 변동성이 매우 크지만, 과거엔 이런 때가 매수 기회였던 적도 많아요." }[z.label];
      const word = { "평온": "평온해요", "보통": "보통 수준이에요", "불안": "불안해요", "공포": "공포 구간이에요" }[z.label];
      const n = fmtN(x.v, 1);
      return { lv: z.lv, tag: z.label, say: `${n}${ro(n)} '${z.label}' 구간이에요. ${t}`, brief: `VIX가 ${n}${ro(n)} 시장이 ${word}.` };
    },
  },
  USD: {
    what: "미국의 주요 교역국 통화들과 비교한 달러 가치예요. 숫자가 클수록 달러가 강하다는 뜻이에요.",
    hi: "달러가 강하면 해외 매출이 큰 미국 기업의 이익이 줄고(환산 손실), 원자재와 신흥국 시장에 부담이에요. 한국 투자자에게는 원화로 환산한 미국 주식 가치가 늘어나는 효과가 있어요.",
    lo: "달러가 약하면 수출 기업과 해외 매출이 큰 기업에 유리해요. 원화로 환산하면 환율 손실이 생길 수 있어요.",
    rule: "1년 전보다 5% 넘게 오르면 '강세', 5% 넘게 내리면 '약세'로 봐요.",
    judge(x) {
      const dy = x.y1 ? (x.v / x.y1[1] - 1) * 100 : null;
      let lv = "mid", tag = "보합";
      if (dy != null && dy >= 5) { lv = "warn"; tag = "강세"; } else if (dy != null && dy <= -5) { lv = "good"; tag = "약세"; }
      const t = tag === "강세" ? "달러가 강해져 해외 매출이 큰 미국 기업 이익에는 불리해요. 원화로 환산한 미국 주식 가치는 늘어나요."
        : tag === "약세" ? "달러가 약해져 해외 매출이 큰 미국 기업에 유리해요. 원화로 환산하면 환율 손실이 생길 수 있어요."
        : "달러 가치가 1년 전과 비슷해 기업 이익에 주는 영향이 크지 않아요.";
      const krw = KRW.rate ? ` 오늘 아침 원/달러 환율은 ${fmtN(KRW.rate, 1)}원이에요.` : "";
      return { lv, tag, say: `1년 전보다 ${dy != null ? fmtN(Math.abs(dy), 1) + "% " + (dy >= 0 ? "올랐어요" : "내렸어요") : "–"}.${rankText(x)} ${t}${krw}`,
        brief: tag === "강세" ? "달러가 강세라 해외 매출이 큰 기업에 불리해요." : tag === "약세" ? "달러가 약세라 해외 매출이 큰 기업에 유리해요." : "달러 가치는 1년 전과 비슷해요." };
    },
  },
  WTI: {
    what: "미국 서부 텍사스산 원유 1배럴(약 159리터)의 가격이에요. 세계 유가의 기준 중 하나예요.",
    hi: "90달러 이상으로 오르면 휘발유·운송비가 올라 물가를 자극하고 소비를 줄여요. 에너지 기업의 이익은 늘어요.",
    lo: "60~80달러는 무난한 수준이에요. 너무 급하게 떨어지면 경기 둔화를 반영하는 경우가 많아요.",
    scale: [20, 130], zones: [[50, "낮음", "warn"], [80, "보통", "good"], [95, "다소 높음", "warn"], [Infinity, "높음", "bad"]],
    judge(x, S, g) {
      const z = zoneOf(x.v, g.zones), dy = x.y1 ? (x.v / x.y1[1] - 1) * 100 : null;
      const t = z.lv === "bad" ? "휘발유·운송비가 올라 물가를 다시 자극하고 소비를 줄일 수 있어요. 에너지 기업에는 유리해요."
        : z.lv === "warn" ? (x.v >= 80 ? "물가에 다소 부담이 되는 수준이에요." : "유가가 많이 낮아요. 경기 둔화를 반영하는 경우가 많고 에너지 기업에는 불리해요.")
        : "물가에 큰 부담이 없는 무난한 수준이에요.";
      return { lv: z.lv, tag: z.label,
        say: `배럴당 ${fmtN(x.v, 1)}달러로 ${lvl(z.label)}이에요${dy != null ? `(1년 전보다 ${fmtN(Math.abs(dy), 0)}% ${dy >= 0 ? "상승" : "하락"})` : ""}. ${t}`,
        brief: `유가가 배럴당 ${fmtN(x.v, 1)}달러로 ${dy != null && Math.abs(dy) >= 20 ? `1년 새 ${fmtN(Math.abs(dy), 0)}% ${dy >= 0 ? "올랐어요" : "내렸어요"}` : lvl(z.label) + "이에요"}.` };
    },
  },
  SPX: {
    what: "미국 대형주 500개로 만든 대표 주가지수예요. 미국 주식시장 전체의 온도계예요.",
    hi: "최고치 근처면 투자 심리가 좋다는 뜻이에요. 다만 많이 오른 뒤에는 작은 악재에도 흔들릴 수 있어요.",
    lo: "고점보다 10% 넘게 빠지면 '조정', 20% 넘게 빠지면 '약세장'이라고 불러요.",
    rule: "52주 최고치 대비 −5% 이내 '고점 근처', −10% 이내 '소폭 조정', −20% 이내 '조정', 그 아래는 '약세장'으로 봐요.",
    judge(x) {
      const yr = x.since(365).map((o) => o[1]), hi = Math.max(...yr), dd = (x.v / hi - 1) * 100, dy = x.y1 ? (x.v / x.y1[1] - 1) * 100 : null;
      let lv = "good", tag = "고점 근처";
      if (dd <= -20) { lv = "bad"; tag = "약세장"; } else if (dd <= -10) { lv = "warn"; tag = "조정"; } else if (dd <= -5) { lv = "mid"; tag = "소폭 조정"; }
      const t = { "고점 근처": "투자 심리가 좋은 편이에요.", "소폭 조정": "고점에서 조금 쉬어 가는 중이에요.", "조정": "고점보다 10% 넘게 빠진 조정 구간이에요.", "약세장": "고점보다 20% 넘게 빠진 약세장이에요." }[tag];
      return { lv, tag,
        say: `52주 최고치(${fmtN(hi, 0)})보다 ${fmtN(Math.abs(dd), 1)}% ${dd < -0.05 ? "아래예요" : "근처예요"}${dy != null ? `. 1년 동안 ${fmtN(Math.abs(dy), 1)}% ${dy >= 0 ? "올랐어요" : "내렸어요"}` : ""}. ${t}`,
        brief: tag === "고점 근처" ? "S&P 500은 52주 최고치 근처예요." : `S&P 500은 52주 최고치보다 ${fmtN(Math.abs(dd), 0)}% 낮아요.` };
    },
  },
};
const MGROUP_INTRO = {
  rates: "금리는 '돈의 값'이에요. 금리가 오르면 기업의 이자 부담이 커지고 주식의 적정 가치가 낮아져요.",
  inflation: "물가가 너무 빨리 오르면 연준이 금리를 올려요. 연준의 목표는 2%예요.",
  labor: "일자리가 탄탄해야 소비가 버텨요. 고용이 갑자기 나빠지면 경기 침체 신호예요.",
  growth: "경제가 얼마나 크고 있는지, 소비자가 지갑을 여는지 보여줘요.",
  liquidity: "시중에 돈이 얼마나 풀려 있고, 기업이 돈을 빌리기 쉬운지 보여줘요.",
  market: "주식시장의 분위기와 달러·유가처럼 기업 이익에 영향을 주는 가격이에요.",
};
/** themes in the order of importance of their indicators */
const MTHEME_KEYS = {
  rates: ["UST10Y", "FFR", "UST2Y", "MORT30", "SP10_3M", "SP10_2"],
  inflation: ["CORE_PCE", "CPI", "CORE_CPI", "BEI5"],
  labor: ["UNRATE", "NFP", "CLAIMS", "SAHM", "WAGE"],
  growth: ["GDP", "RETAIL", "UMICH", "INDPRO", "HOUST"],
  liquidity: ["HY", "NFCI", "IG", "M2", "FEDBS"],
  market: ["VIX", "SPX", "WTI", "USD"],
};
const MTERMS = [
  ["연준(Fed) · FOMC", "미국의 중앙은행이 연방준비제도(연준)예요. 1년에 8번 FOMC 회의를 열어 기준금리를 정해요. 전 세계 금리와 주식시장이 이 결정을 따라 움직여요."],
  ["전년비", "1년 전 같은 달(분기)과 비교한 증감률이에요. 계절에 따른 들쭉날쭉함을 없애고 흐름을 보기 좋아요."],
  ["연율", "한 분기 성장률이 1년 내내 이어진다고 보고 환산한 값이에요. 분기 성장률 0.4%는 연율로 약 1.6%예요."],
  ["%와 %p", "금리가 4%에서 5%로 오르면 '1%p(퍼센트포인트) 올랐다'고 해요. 비율끼리의 차이는 %p로 써요. 0.01%p를 1bp(베이시스포인트)라고도 해요."],
  ["스프레드", "두 금리의 차이예요. 회사채 스프레드는 회사채 금리에서 같은 만기 국채 금리를 뺀 값으로, 클수록 투자자가 위험을 크게 본다는 뜻이에요."],
  ["장단기 금리 역전", "보통은 오래 빌려줄수록 금리가 높아요. 단기 금리가 장기 금리보다 높아지는 비정상 상태를 역전이라고 하고, 과거 경기 침체 전에 자주 나타났어요."],
  ["근원 물가", "값이 크게 출렁이는 식품·에너지를 뺀 물가예요. 물가의 바닥 흐름을 보여줘서 연준이 더 중요하게 봐요."],
  ["기대인플레이션", "사람들과 시장이 예상하는 앞으로의 물가 상승률이에요. 기대가 높아지면 실제 물가도 따라 오르기 쉬워요."],
  ["양적완화(QE) · 양적긴축(QT)", "연준이 국채 같은 채권을 사들여 시중에 돈을 푸는 것이 양적완화, 가진 채권을 줄여 돈을 거둬들이는 것이 양적긴축이에요."],
  ["투자등급 · 하이일드", "신용등급 BBB 이상인 회사채가 투자등급, BB 이하가 투기등급(하이일드)이에요. 하이일드는 부도 위험이 큰 대신 금리를 더 줘요."],
  ["금리와 성장주", "주식 가치는 앞으로 벌 돈을 금리로 할인해서 계산해요. 금리가 오르면 먼 미래 이익의 가치가 더 많이 깎여 성장주(기술주)가 더 크게 흔들려요."],
  ["경기 침체", "경제 활동이 몇 달 이상 넓게 줄어드는 거예요. 미국은 전미경제연구소(NBER)가 나중에 공식 판정하고, 흔히 GDP가 두 분기 연속 마이너스면 침체라고 불러요."],
];

// ---------------------------------------------------------------- reading the whole dashboard
function macroRead(m) {
  if (m.__read) return m.__read;
  const cache = {};
  const S = (k) => (k in cache ? cache[k] : (cache[k] = m.series[k] ? mStat(m.series[k]) : null));
  const items = {};
  for (const k of Object.keys(m.series)) {
    const g = MG[k], x = S(k);
    if (!g || !g.judge || !x) continue;
    try { const j = g.judge(x, S, g); if (j) items[k] = Object.assign({ gauge: x.v }, j); } catch (e) { /* a reading is optional */ }
  }
  const themes = (m.groups || []).map((gr) => {
    const keys = (MTHEME_KEYS[gr.id] || Object.keys(m.series).filter((k) => m.series[k].group === gr.id)).filter((k) => items[k]);
    if (!keys.length) return null;
    const list = keys.map((k) => ({ k, j: items[k] }));
    const sc = mean(list.map((i) => MLV[i.j.lv].sc));
    const lv = sc >= 0.35 ? "good" : sc <= -0.35 ? "bad" : "mid";
    const neg = list.filter((i) => i.j.lv === "bad" || i.j.lv === "warn"), pos = list.filter((i) => i.j.lv === "good");
    const label = lv === "good" ? "양호" : lv === "bad" ? "부담" : neg.length && pos.length ? "엇갈림" : "보통";
    let main, other = null;
    if (lv === "bad") { main = neg.slice(0, 2); other = pos[0]; }
    else if (lv === "good") { main = pos.slice(0, 2); other = neg[0]; }
    else { main = [neg[0], pos[0]].filter(Boolean); if (!main.length) main = list.slice(0, 1); }
    let text = main.map((i) => i.j.brief).filter(Boolean).join(" ");
    if (other && other.j.brief) text += " 다만 " + other.j.brief;
    return { id: gr.id, name: gr.name, lv, label, text, sc };
  }).filter(Boolean);
  // overall verdict
  const good = themes.filter((t) => t.lv === "good"), bad = themes.filter((t) => t.lv === "bad");
  const nameList = (arr) => { const ns = arr.map((t) => t.name); if (ns.length <= 1) return ns.join(""); return ns.slice(0, -1).join(", ") + josa(ns[ns.length - 2], "과", "와") + " " + ns[ns.length - 1]; };
  let lv, label, text;
  if (!bad.length && good.length >= 3) { lv = "good"; label = "주식에 우호적인 환경"; }
  else if (bad.length >= 3 && good.length <= 1) { lv = "bad"; label = "주식에 불리한 환경"; }
  else if (bad.length && good.length) { lv = "warn"; label = "엇갈리는 환경"; }
  else if (bad.length) { lv = "warn"; label = "부담이 있는 환경"; }
  else { lv = "mid"; label = "무난한 환경"; }
  const gN = nameList(good), bN = nameList(bad);
  if (good.length && bad.length) text = `${gN}${josa(gN, "은", "는")} 양호하지만, ${bN}${josa(bN, "이", "가")} 부담이에요.`;
  else if (good.length) text = `${gN}${josa(gN, "은", "는")} 양호하고, 뚜렷하게 부담이 되는 부분은 없어요.`;
  else if (bad.length) text = `${bN}${josa(bN, "이", "가")} 부담이고, 뚜렷하게 좋은 부분은 적어요.`;
  else text = "대부분의 지표가 보통 수준이에요.";
  m.__read = { items, themes, overall: { lv, label, text }, S };
  return m.__read;
}

/** classic recession warnings */
function recessionChecks(S) {
  const out = [];
  const c = S("SP10_3M");
  if (c) out.push({ on: c.v < 0, t: "장단기 금리 역전 (10년−3개월)", d: `지금 ${pp(c.v)} · 0 아래면 켜져요` });
  const sa = S("SAHM");
  if (sa) out.push({ on: sa.v >= 0.5, t: "삼의 법칙 0.5%p 이상", d: `지금 ${pp(sa.v)}` });
  const cl = S("CLAIMS");
  if (cl) {
    const yr = cl.since(365).map((o) => o[1]), rolls = [];
    for (let i = 3; i < yr.length; i++) rolls.push(mean(yr.slice(i - 3, i + 1)));
    const a4 = mean(cl.tail(4)), lo = rolls.length ? Math.min(...rolls) : a4;
    const up = lo > 0 ? (a4 / lo - 1) * 100 : 0;
    out.push({ on: a4 >= 300 || up >= 20, t: "실업수당 청구 급증", d: `4주 평균 주당 ${man(a4, "건")} · 1년 중 가장 낮을 때보다 ${fmtN(Math.max(0, up), 0)}% 많음 (20% 이상이면 켜져요)` });
  }
  const hy = S("HY");
  if (hy) out.push({ on: hy.v >= 5, t: "하이일드 스프레드 5%p 이상", d: `지금 ${fmtN(hy.v, 2)}%p` });
  const g = S("GDP");
  if (g) out.push({ on: g.v < 0, t: "실질 GDP 마이너스 성장", d: `최근 분기(${qKo(g.d)}) 연율 ${pc(g.v, 1)}` });
  return out;
}

// ---------------------------------------------------------------- small UI pieces
function mStatus(lv, text) { return h("span", { class: "mst " + lv, title: MLV[lv] ? MLV[lv].t : "" }, h("i"), text || (MLV[lv] ? MLV[lv].t : "")); }
/** a zone boundary in the series' own unit; counts published in thousands are shown in 만 */
function zfmt(s, v, withUnit) {
  const word = { "천 명": "명", "천 건": "건", "천 호(연율)": "호" }[s.unit];
  const nd = (x) => (Number.isInteger(x) ? 0 : Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? 1 : 2);
  if (word) return v === 0 ? "0" : fmtN(v / 10, nd(v / 10)) + "만" + (withUnit ? " " + word : "");
  const u = !withUnit ? "" : s.unit === "%p" ? "%p" : /^%/.test(s.unit) ? "%" : s.unit === "달러/배럴" ? "달러" : "";
  return fmtN(v, nd(v)) + u;
}
function zoneLegend(g, s) {
  if (!g.zones) return "";
  const f = (v) => zfmt(s, v, true);
  let lo = null;
  const parts = g.zones.map(([up, label]) => {
    const t = lo == null ? `${f(up)} 미만 ${label}` : up === Infinity ? `${f(lo)} 이상 ${label}` : `${f(lo)}~${f(up)} ${label}`;
    lo = up;
    return t;
  });
  return parts.join(" · ");
}
function mGauge(g, val, s, lvNow) {
  const [lo, hi] = g.scale;
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const cur = zoneOf(val, g.zones);
  const bar = h("div", { class: "bar" });
  let prev = lo;
  for (const [up, label, lv] of g.zones) {
    const a = pos(prev), b = pos(Math.min(up, hi));
    if (b > a) bar.append(h("i", { class: "z " + (label === cur.label ? (lvNow || lv) + " on" : lv), style: { left: a + "%", width: b - a + "%" } }));
    prev = up;
  }
  bar.append(h("b", { class: "mk", style: { left: pos(val) + "%" } }));
  const ticks = h("div", { class: "tk" });
  for (const [up] of g.zones.slice(0, -1)) if (up > lo && up < hi) ticks.append(h("span", { style: { left: pos(up) + "%" } }, zfmt(s, up, false)));
  return h("div", { class: "mgauge", "aria-hidden": "true" }, bar, ticks);
}

// ---------------------------------------------------------------- numbers (shared with the home strip)
function macroChange(s) {
  const obs = s.obs;
  if (!obs || obs.length < 2) return {};
  const last = obs[obs.length - 1];
  const find = (days) => { const t = pd(last[0]).getTime() - days * DAYMS; let v = null; for (const o of obs) { if (pd(o[0]).getTime() <= t) v = o; else break; } return v; };
  const m1 = find(s.freq === "M" ? 20 : s.freq === "Q" ? 80 : 30), y1 = find(362);
  return { last, m1, y1 };
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
/** compact card for the home page */
function macroMini(key, s, j) {
  const c = macroChange(s);
  const recent = s.obs.slice(-Math.min(s.obs.length, s.freq === "D" ? 504 : s.freq === "W" ? 104 : s.freq === "Q" ? 12 : 36)).map((o) => o[1]);
  return h("button", { type: "button", class: "mcard", onclick: () => { MAC.open = key; go("macro"); } },
    h("span", { class: "nm" }, s.name),
    h("span", { class: "v" }, macroFmt(s, c.last && c.last[1]), h("small", null, s.unit)),
    spark(recent, "var(--s1)", 150, 30),
    h("span", { class: "d" }, (c.last ? mPeriod(s, c.last[0]) : "") + (macroDelta(s, c.last, c.y1) ? " · 1년 " + macroDelta(s, c.last, c.y1) : "")),
    j ? h("span", { class: "mst-row" }, mStatus(j.lv, MLV[j.lv].s), j.tag ? h("span", { class: "lvtag" }, j.tag) : null) : null);
}
/** one-line verdict for the home page */
function macroVerdict(rd) {
  return h("div", { class: "mnow-top" }, h("span", { class: "mpill " + rd.overall.lv }, h("i"), rd.overall.label), h("p", { class: "mnow-sum" }, rd.overall.text));
}

// ---------------------------------------------------------------- the dashboard
async function renderMacro() {
  const wrap = viewShell("매크로 대시보드", "미국 연준 FRED 공식 통계 · 화~토 아침 갱신");
  const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } }, h("div", { class: "loading" }, "불러오는 중…"));
  wrap.append(body);
  let m;
  try { m = await loadMacro(); } catch (e) { clear(body).append(h("div", { class: "err" }, "매크로 데이터를 불러오지 못했어요.")); return; }
  if (APP.view !== "macro") return;
  clear(body);
  const rd = macroRead(m);
  // at a glance
  const briefOut = h("div", { class: "ai-out" });
  const briefBtn = h("button", { type: "button", class: "btn sm", hidden: !APP.cap.sample }, "AI 매크로 브리핑");
  document.addEventListener("caps", () => { briefBtn.hidden = !APP.cap.sample; }, { once: true });
  const briefStatus = h("span", { class: "ai-status" });
  const cachedBrief = LS.get("macrobrief");
  if (cachedBrief && cachedBrief.text && cachedBrief.upd === m.updated_at) { briefOut.innerHTML = mdToHtml(cachedBrief.text); briefStatus.textContent = relTime(cachedBrief.at) + " 작성"; }
  briefBtn.addEventListener("click", () => macroBrief(m, rd, briefOut, briefBtn, briefStatus));
  const themeRows = h("div", { class: "mthemes" }, rd.themes.map((t) => h("button", { type: "button", class: "mth", onclick: () => { const el = document.getElementById("mg-" + t.id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); } },
    h("span", { class: "mth-h" }, mStatus(t.lv === "good" ? "good" : t.lv === "bad" ? "bad" : "mid", t.label), h("b", null, t.name)),
    h("span", { class: "tx" }, t.text))));
  const checks = recessionChecks(rd.S);
  const onN = checks.filter((c) => c.on).length;
  const rec = h("div", { class: "mrec" },
    h("h3", null, "경기 침체 신호 점검", h("span", null, `${checks.length}개 중 ${onN}개 켜짐`)),
    h("p", { class: "note" }, onN === 0 ? "과거 경기 침체 전에 자주 나타났던 신호예요. 지금은 켜진 신호가 없어요." : onN === 1 ? "과거 경기 침체 전에 자주 나타났던 신호예요. 하나가 켜져 있어 지켜볼 필요가 있어요." : "과거 경기 침체 전에 자주 나타났던 신호예요. 여러 개가 켜져 있어 경기 침체 위험이 커졌어요."),
    h("ul", { class: "mck" }, checks.map((c) => h("li", { class: c.on ? "on" : "off" }, h("span", { class: "mk", "aria-hidden": "true" }, c.on ? "!" : "✓"),
      h("span", null, c.t, h("b", null, c.on ? " 켜짐" : " 꺼짐")), h("small", null, c.d)))));
  body.append(h("section", { class: "panel mnow" },
    h("div", { class: "ph" }, h("h2", null, "지금 경제 한눈에"), h("span", { class: "sub" }, "최신 발표치를 정해진 규칙으로 해석했어요")),
    macroVerdict(rd), themeRows, rec,
    h("div", { class: "ai-ctl" }, briefBtn, briefStatus), briefOut,
    h("p", { class: "note" }, "‘주식에 우호적 · 중립 · 주의 · 주식에 부담’은 그 지표가 보통 주식시장에 어떻게 작용하는지를 기준으로 붙인 표시예요. 항목을 누르면 그 부분으로 이동해요.")));
  // yield curve
  if (m.curve && m.curve.rows && m.curve.rows.now) {
    const cv = m.curve, cats = cv.tenors;
    const ser = [["now", "var(--s1)", "최근"], ["m1", "var(--s2)", "1개월 전"], ["y1", "var(--s3)", "1년 전"]].filter(([k]) => cv.rows[k])
      .map(([k, col, lab]) => ({ name: `${lab} (${fmtD(cv.rows[k].d, "md")})`, color: col, x: cats.map((_, i) => i), y: cv.rows[k].v, dots: true, fmt: (v) => fmtN(v, 2) + "%" }));
    const box = h("div", { class: "chart" });
    body.append(h("section", { class: "panel" }, h("div", { class: "ph" }, h("h2", null, "미 국채 수익률 곡선"), h("span", { class: "sub" }, "만기별 금리")),
      legend(ser.map((s) => ({ name: s.name, color: s.color, kind: "line" }))), box,
      h("p", { class: "msay" }, curveNote(cv)),
      h("p", { class: "note" }, "가로축은 만기, 세로축은 금리예요. 오른쪽이 올라가는 모양이 정상이고, 단기 금리가 장기 금리보다 높으면(역전) 경기 둔화 우려가 크다는 뜻이에요.")));
    lineChart(box, { height: 240, cats, series: ser, yFmt: (v) => fmtN(v, 1) + "%", label: "미 국채 수익률 곡선" });
  }
  // groups
  for (const g of m.groups) {
    const keys = Object.keys(m.series).filter((k) => m.series[k].group === g.id);
    if (!keys.length) continue;
    const t = rd.themes.find((x) => x.id === g.id);
    const grid = h("div", { class: "mcards" });
    const sec = h("section", { class: "panel mgroup", id: "mg-" + g.id },
      h("div", { class: "mg-h" }, h("h3", null, g.name), t ? mStatus(t.lv === "good" ? "good" : t.lv === "bad" ? "bad" : "mid", t.label) : null),
      MGROUP_INTRO[g.id] ? h("p", { class: "mg-intro" }, MGROUP_INTRO[g.id]) : null, grid);
    for (const key of keys) grid.append(macroCard(key, m.series[key], grid, rd.items[key]));
    body.append(sec);
  }
  body.append(macroGlossary(m));
  const upd = m.updated_at ? new Date(m.updated_at) : null;
  const updText = upd && !isNaN(upd) ? `${upd.getMonth() + 1}/${upd.getDate()} ${String(upd.getHours()).padStart(2, "0")}:${String(upd.getMinutes()).padStart(2, "0")}` : "";
  body.append(h("p", { class: "note" }, `${updText ? "FRED에서 " + updText + "에 받아온 값이에요. " : ""}카드 오른쪽 위에는 발표 주기(매일·매주·매월·분기)와 그 숫자가 어느 시점의 값인지(8월분, 2분기처럼)를 적었어요. 지표마다 발표 주기와 발표까지 걸리는 시간이 달라서 날짜가 서로 달라요. 발표 요일은 미국 시간 기준이고, 이 페이지에는 다음 날 아침(한국 시간) 갱신 때 반영돼요. 카드를 누르면 긴 기간 차트와 자세한 설명, 발표 일정이 열려요. 해석은 정해진 규칙으로 자동으로 만든 참고용이에요.`));
  if (MAC.open && m.series[MAC.open]) {
    const card = $(`.mc2[data-key="${MAC.open}"]`, body);
    if (card) { card.click(); setTimeout(() => card.scrollIntoView({ block: "center" }), 50); }
    MAC.open = null;
  }
}
function curveNote(cv) {
  const T = cv.tenors, now = cv.rows.now.v, y1 = cv.rows.y1 ? cv.rows.y1.v : null;
  const i3 = T.indexOf("3개월"), i2 = T.indexOf("2년"), i10 = T.indexOf("10년");
  if (i3 < 0 || i10 < 0 || !isNum(now[i3]) || !isNum(now[i10])) return "";
  const sl = now[i10] - now[i3];
  let t = sl < 0 ? `지금은 단기 금리가 장기 금리보다 높은 역전 모양이에요(10년 ${pc(now[i10])} vs 3개월 ${pc(now[i3])}).`
    : sl < 0.5 ? `지금은 단기와 장기 금리가 비슷한 평평한 모양이에요(10년 ${pc(now[i10])}, 3개월 ${pc(now[i3])}).`
    : `지금은 만기가 길수록 금리가 높은 정상 모양이에요(10년 ${pc(now[i10])}, 3개월 ${pc(now[i3])}).`;
  if (y1 && i2 >= 0 && isNum(y1[i2]) && isNum(y1[i10])) {
    const d2 = now[i2] - y1[i2], d10 = now[i10] - y1[i10];
    const up = (d) => d >= 0;
    t += up(d2) === up(d10) ? ` 1년 전보다 2년물은 ${fmtN(Math.abs(d2), 2)}%p, 10년물은 ${fmtN(Math.abs(d10), 2)}%p ${up(d2) ? "올랐어요" : "내렸어요"}.`
      : ` 1년 전보다 2년물은 ${fmtN(Math.abs(d2), 2)}%p ${up(d2) ? "오르고" : "내리고"}, 10년물은 ${fmtN(Math.abs(d10), 2)}%p ${up(d10) ? "올랐어요" : "내렸어요"}.`;
    if (d10 > d2 + 0.2 && d10 > 0.2) t += " 장기 금리가 더 많이 올라 곡선이 가팔라졌어요. 장기 금리 상승은 주식 가치에 부담이에요.";
    else if (d2 > d10 + 0.2 && d2 > 0.2) t += " 단기 금리가 더 많이 올랐어요. 시장이 연준의 긴축을 더 강하게 반영하고 있어요.";
  }
  return t;
}
function macroCard(key, s, grid, j) {
  const c = macroChange(s), g = MG[key];
  const n = s.freq === "D" ? 504 : s.freq === "W" ? 104 : s.freq === "Q" ? 12 : 36;
  const btn = h("button", { type: "button", class: "mc2", "data-key": key, "aria-expanded": "false" },
    h("div", { class: "hd" }, h("span", { class: "nm" }, s.name), c.last ? mWhen(key, s, c.last[0]) : null),
    h("div", { class: "row" }, h("span", { class: "v" }, macroFmt(s, c.last && c.last[1]), h("small", null, s.unit)), spark(s.obs.slice(-n).map((o) => o[1]), "var(--s1)", 110, 34)),
    h("span", { class: "chg" }, [c.m1 ? (s.freq === "Q" ? "직전 분기 " : "1개월 ") + (macroDelta(s, c.last, c.m1) || "–") : null, c.y1 ? "1년 " + (macroDelta(s, c.last, c.y1) || "–") : null].filter(Boolean).join(" · ")),
    j && g && g.zones && isNum(j.gauge) ? mGauge(g, j.gauge, s, j.lv) : null,
    j ? h("span", { class: "mst-row" }, mStatus(j.lv), j.tag ? h("span", { class: "lvtag" }, j.tag) : null) : null,
    j ? h("p", { class: "msay" }, j.say) : null);
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
    const guide = g ? h("dl", { class: "mguide" },
      h("dt", null, "이 지표는요"), h("dd", null, g.what),
      h("dt", null, g.hiL || "높으면"), h("dd", null, g.hi),
      h("dt", null, g.loL || "낮으면"), h("dd", null, g.lo),
      g.zones || g.rule ? [h("dt", null, "읽는 기준"), h("dd", null, [zoneLegend(g, s), g.rule].filter(Boolean).join(". ") + (g.rule && !/[.요]$/.test(g.rule) ? "." : ""))] : null,
      j ? [h("dt", null, "지금은"), h("dd", null, mStatus(j.lv), " ", j.say)] : null,
      MREL[key] && c.last ? [h("dt", null, "발표 일정"), h("dd", null, `${mPeriod(s, c.last[0])} 값이 최신이에요. ${MREL[key].t}`)] : null) : null;
    det.append(h("div", { class: "ctools" }, h("b", null, s.name + " (" + s.unit + ")"), seg), box, guide,
      h("p", { class: "note" }, h("a", { href: "https://fred.stlouisfed.org/series/" + s.id, target: "_blank", rel: "noopener" }, "출처: FRED " + s.id + " ↗")));
    const draw = () => {
      const yrs = { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10, "전체": 99 }[MAC.range];
      const t0 = pd(s.obs[s.obs.length - 1][0]).getTime() - yrs * 365.25 * DAYMS;
      const pts = s.obs.filter((o) => pd(o[0]).getTime() >= t0);
      const zero = /%p$/.test(s.unit) || s.unit === "천 명" || key === "NFCI" || key === "SAHM";
      lineChart(box, { height: 240, label: s.name, series: [{ name: s.name, color: "var(--s1)", x: pts.map((o) => pd(o[0]).getTime()), y: pts.map((o) => o[1]), area: !zero, fmt: (v) => macroFmt(s, v) + " " + s.unit }],
        yFmt: (v) => macroFmt(s, v), refs: zero ? [{ y: key === "SAHM" ? 0.5 : 0, label: key === "SAHM" ? "침체 신호 0.5" : "" }] : [],
        tipTitle: (t) => mPeriodFull(s, isoOf(new Date(t))), endLabel: true });
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
function macroGlossary(m) {
  const groups = (m.groups || []).map((g) => {
    const keys = Object.keys(m.series).filter((k) => m.series[k].group === g.id && MG[k]);
    if (!keys.length) return null;
    return h("div", null, h("h3", null, g.name), h("dl", null, keys.map((k) => h("div", null,
      h("dt", null, m.series[k].name), h("dd", null, MG[k].what + " ", h("b", null, (MG[k].hiL || "높으면") + " "), MG[k].hi + " ", h("b", null, (MG[k].loL || "낮으면") + " "), MG[k].lo)))));
  }).filter(Boolean);
  return h("section", { class: "mgloss" }, h("details", null,
    h("summary", null, "매크로 용어와 지표 읽는 법"),
    h("p", { class: "intro" }, "뉴스와 이 페이지에 자주 나오는 용어, 그리고 지표마다 높을 때와 낮을 때 주식에 어떤 의미인지 모았어요."),
    h("div", { class: "mgl" },
      h("div", null, h("h3", null, "기본 용어"), h("dl", null, MTERMS.map(([t, d]) => h("div", null, h("dt", null, t), h("dd", null, d))))),
      groups)));
}
async function macroBrief(m, rd, out, btn, status) {
  const sample = APP.cap.sample;
  if (!sample) return;
  const snap = {};
  for (const [k, s] of Object.entries(m.series)) {
    const c = macroChange(s);
    if (!c.last) continue;
    const j = rd.items[k];
    snap[s.name] = { 최신: c.last[1], 기준시점: mPeriodFull(s, c.last[0]), 발표주기: mCad(k, s), 단위: s.unit, "직전 비교치(1개월·직전 분기 전)": c.m1 ? c.m1[1] : null, "1년 전": c.y1 ? c.y1[1] : null,
      규칙해석: j ? `${MLV[j.lv].t}${j.tag ? " · " + j.tag : ""} — ${j.say}` : null };
  }
  const prompt = "당신은 미국 매크로 이코노미스트예요. 아래 미국 경제 지표 최신값(FRED)만 근거로, 미국 주식에 투자하는 한국 개인 투자자를 위한 매크로 브리핑을 한국어로 써 주세요. 경제 용어는 처음 나올 때 괄호로 쉽게 풀어 주세요.\n" +
    "형식: Markdown. ### 한 줄 요약, ### 금리와 연준, ### 물가, ### 고용과 성장, ### 신용·유동성·시장 심리, ### 주식 투자에 주는 시사점(유리한 업종·불리한 업종, 체크할 다음 발표) 순서. 전체 1,200~1,800자. 숫자는 주어진 값만 쓰고, 추측은 추측이라고 밝히세요. 마지막 줄에 '※ 참고용이며 투자 권유가 아닙니다.'\n\n" +
    JSON.stringify({ 기준: m.updated_at, 국채수익률곡선: m.curve ? m.curve.rows : null, 지표: snap,
      규칙기반요약: { 종합: rd.overall.label + " — " + rd.overall.text, 분야별: rd.themes.map((t) => `${t.name}(${t.label}): ${t.text}`) } });
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
