/* =====================================================================
   기업 분석 노트 — AI research note (sample capability, viewer's own Claude)
   ===================================================================== */
function compactFS(t, per, n) {
  if (!t) return null;
  const idx = t.d.map((_, i) => i).slice(-n);
  const pick = (k) => (t[k] ? idx.map((i) => t[k][i]) : undefined);
  const out = { period_end: idx.map((i) => t.d[i]) };
  for (const k of ["rev", "gp", "oi", "ebitda", "ni", "eps", "rd", "sga", "intx", "ocf", "capex", "fcf", "buy", "div", "sbc", "cash", "csti", "td", "nd", "eq", "ta", "tl", "ca", "cl", "so", "shd"]) {
    const v = pick(k);
    if (v && v.some(isNum)) out[k] = v;
  }
  if (out.rev) {
    out.gross_margin_pct = idx.map((i) => (t.gp ? ratio(t.gp[i], t.rev[i]) : null)).map((v) => (isNum(v) ? +v.toFixed(1) : null));
    out.op_margin_pct = idx.map((i) => (t.oi ? ratio(t.oi[i], t.rev[i]) : null)).map((v) => (isNum(v) ? +v.toFixed(1) : null));
    out.net_margin_pct = idx.map((i) => (t.ni ? ratio(t.ni[i], t.rev[i]) : null)).map((v) => (isNum(v) ? +v.toFixed(1) : null));
  }
  return out;
}
function noteData(r, R) {
  const k = R.k || {}, e = R.e || {}, p = R.p || {}, own = R.own || {};
  const U = ustat(), med = U.medSec[r.s] || {};
  const ph = peHistory(R);
  const peVals = ph.map((x) => x[1]).filter(isNum);
  const peers = peersOf(r, 8).map((x) => ({ ticker: x.t, name: x.n, mcap_b: x.mc, pe: x.pe, fwd_pe: x.fpe, ps: x.ps, ev_ebitda: x.eve, rev_growth_pct: x.rg, op_margin_pct: x.om, roe_pct: x.roe }));
  const sc = scorecard(r, R);
  const byY = new Map();
  for (const [d, a] of R.dv || []) if (d && isNum(a)) byY.set(d.slice(0, 4), +((byY.get(d.slice(0, 4)) || 0) + a).toFixed(4));
  const macro = DATA.macroSnap || null;
  return {
    as_of_close: DATA.dates[DATA.dates.length - 1], currency: "USD",
    krw_per_usd: KRW.rate || null,
    units: r.fcur ? `재무제표·ttm 금액은 ${r.fcur} 백만 단위(1 ${r.fcur} = ${r.fx ?? "환율 미상"} USD), 시가총액·주가·주당 값은 USD` : "금액은 백만 달러(M), 주당 값은 달러",
    company: { ticker: r.t, name: p.n || r.n, korean_name: koName(r.t) || null, sector: p.sec || sectorKo(r.s), industry: p.ind || r.i,
      employees: p.emp, hq: p.loc, fiscal_year_end: p.fye, latest_quarter: p.mrq, description: (p.sum || "").slice(0, 1800) },
    price: { close: r.c, change_1d_pct: r.ch, r1m_pct: r.r1m, r3m_pct: r.r3m, r6m_pct: r.r6m, ytd_pct: r.ytd, r1y_pct: r.r1y,
      high_52w: k.h52, low_52w: k.l52, all_time_high: k.ath, beta: k.beta, short_pct_float: r.si },
    size: { market_cap_usd_m: isNum(r.mc) ? r.mc * 1000 : null,
      enterprise_value_usd_m: isNum(r.mc) && fxOf(r) ? r.mc * 1000 + ((k.debt || 0) - (k.cash || 0)) * fxOf(r) : null, shares_out_m: k.sh },
    valuation_now: { pe_ttm: r.pe, pe_forward: r.fpe, peg: k.peg, ps: r.ps, pb: r.pb, ev_ebitda: r.eve, fcf_yield_pct: r.fcfy, dividend_yield_pct: r.dy },
    valuation_history: peVals.length ? { pe_monthly_period: [new Date(ph[0][0]).toISOString().slice(0, 7), new Date(ph[ph.length - 1][0]).toISOString().slice(0, 7)],
      pe_avg: +mean(peVals).toFixed(1), pe_min: +Math.min(...peVals).toFixed(1), pe_max: +Math.max(...peVals).toFixed(1),
      yahoo_monthly_multiples: r.fcur ? null : R.vm || null } : { note: r.fcur ? "외화 보고 기업이라 PER 과거 추이는 계산하지 않음" : "PER 과거 데이터 부족", yahoo_monthly_multiples: r.fcur ? null : R.vm || null },
    sector_medians: { pe: med.pe, fwd_pe: med.fpe, ps: med.ps, ev_ebitda: med.eve, op_margin_pct: med.om, roe_pct: med.roe, rev_growth_pct: med.rg },
    peers,
    ttm: { revenue_m: k.rev, gross_profit_m: k.gp, ebitda_m: k.ebitda, net_income_m: k.ni, operating_cf_m: k.ocf, free_cf_m: fcfTTM(R), cash_m: k.cash, debt_m: k.debt,
      gross_margin: k.gm, op_margin: k.om, net_margin: k.pm, roe: k.roe, roa: k.roa, current_ratio: k.cr, quick_ratio: k.qr, debt_to_equity_pct: k.de,
      rev_growth_yoy_q: k.rg, earnings_growth_yoy_q: k.eg },
    annual: compactFS(R.fs && R.fs.a, "a", 5), quarterly: compactFS(R.fs && R.fs.q, "q", 6),
    earnings: { history: (e.h || []).map((x) => ({ period_end: x[0], fiscal_q: x[1], eps_actual: x[3], eps_est: x[4], surprise_pct: x[5], reported: x[6] })),
      next: e.nx || null, next_date: r.nx || null },
    estimates: (e.tr || []).map((x) => ({ period: x[0], end: x[1], eps_avg: x[2], eps_low: x[3], eps_high: x[4], eps_year_ago: x[5], eps_analysts: x[6], eps_growth: x[7],
      rev_avg_m: x[8], rev_growth: x[13], eps_90d_ago: x[17], eps_30d_ago: x[15], up_30d: x[19], down_30d: x[21] })),
    analysts: { recommendation: k.rk, rec_mean_1to5: k.rm, count: k.na, target_mean: (k.tgt || [])[0], target_median: (k.tgt || [])[1], target_high: (k.tgt || [])[2],
      target_low: (k.tgt || [])[3], upside_pct: r.up, trend: R.rt || null, recent_changes: (R.ud || []).slice(0, 10) },
    ownership: { insiders: own.ins ?? k.ins, institutions: own.inst ?? k.inst, top_holders: (own.top || []).slice(0, 5).map((x) => [x[0], x[1]]),
      insider_6m: R.nspa || null, recent_insider_tx: (R.itx || []).slice(0, 12).map((x) => [x[0], x[1], x[2], x[3], x[4], x[5]]) },
    governance_risk_1to10: p.gov || null, officers: (p.off || []).slice(0, 6),
    dividends: { yield: k.dy, rate: k.dr, payout_ratio: k.pay, avg_5y_yield_pct: k.d5y, ex_date: k.exd, per_year: Object.fromEntries(Array.from(byY.entries()).slice(-8)) },
    scorecard_0to10: Object.fromEntries(sc.axes.map((a) => [a.name, a.score])),
    technical_radar: isNum(r.v) ? { verdict: RADAR_KO[r.v], grade: r.g || null, note: "추세 레이더(이동평균·거래량 기반 규칙)의 판정" } : null,
    news_headlines: (R.nw || []).slice(0, 6).map((x) => [x[0], x[1], x[2]]),
    macro_context: macro,
  };
}
function notePrompt(r, R, focus) {
  const data = JSON.stringify(noteData(r, R), (k, v) => (typeof v === "number" && !Number.isInteger(v) ? +v.toFixed(4) : v));
  return `당신은 대형 투자은행 자산운용 부문에서 20년 동안 기업을 분석해 온 시니어 주식 애널리스트예요. 아래 [데이터]만 근거로, 기관 투자자에게 보내는 주식 리서치 노트를 한국어로 써 주세요.

작성 원칙
- 숫자는 [데이터]에 있는 값만 쓰고, 없는 값은 "데이터 없음"이라고 적으세요. 새로운 사실(신제품, 인수, 소송 등)을 지어내지 마세요.
- 목표주가처럼 추정이 필요한 곳은 쓰는 가정(예: 선행 EPS × 목표 PER)과 계산을 한 줄로 보여 주세요.
- 특정 금융회사 명의나 로고를 쓰지 말고, 작성자는 "AI 애널리스트"로만 표시하세요.
- 금액 단위는 [데이터]의 units 설명을 따르세요(보통 백만 달러). 본문에서는 $331.8B, $58.4M처럼 읽기 쉽게 바꿔 쓰고, 외화로 보고하는 회사는 통화를 밝히거나 달러로 환산해 쓰세요.
${KRW.rate ? `- 주가·목표주가·시가총액·매출·이익 같은 달러 금액 바로 뒤에는 괄호로 원화 환산액을 붙이세요. 환율은 [데이터]의 krw_per_usd(1달러 = ${fmtN(KRW.rate, 1)}원)를 쓰고, 예: $509.22(약 70.5만 원), $331.8B(약 450조 원)처럼 만·억·조 단위로 읽기 쉽게 반올림하세요.
` : ""}- 형식: Markdown. 제목은 ##, 소제목은 ###. 표는 Markdown 표. 전체 분량은 한국어 3,000~4,500자.

구성 (이 순서 그대로)
## ${r.t} 리서치 노트 — (한 줄 핵심 논지)
1. **요약 박스** — 2열 Markdown 표: 투자의견(매수/보유/회피), 확신도(높음/중간/낮음), 현재가(${DATA.dates[DATA.dates.length - 1]} 종가), 12개월 목표주가(기본 시나리오), 상승 여력, 시가총액, 52주 범위, 다음 실적 발표일.
2. ### 비즈니스 모델 — 이 회사가 돈을 버는 방식을 쉬운 말로.
3. ### 매출 구성 — 사업부별 비중과 성장 추세. [데이터]에 사업부 수치가 없으면 그 사실을 밝히고, 회사 설명과 전체 매출 추이로 설명하세요.
4. ### 수익성 — 매출총이익률·영업이익률·순이익률의 연간 추이(제공된 연도 수를 명시)와 최근 분기 흐름.
5. ### 재무 건전성 — 부채비율(D/E), 유동비율, 현금 대비 총차입금, 이자 부담.
6. ### 잉여현금흐름 — FCF 수익률, FCF 증가율, 자본 배분 우선순위(설비투자·자사주·배당·M&A).
7. ### 경쟁 우위 — 가격 결정력, 브랜드, 전환 비용, 네트워크 효과를 각각 1~10점으로 매기고 근거를 한 줄씩 (Markdown 표).
8. ### 경영진 — 자본 배분 이력, 내부자 지분과 최근 거래, 보상과 주주 이익의 정렬(지배구조 위험 점수 포함).
9. ### 밸류에이션 — 현재 PER·PSR·EV/EBITDA를 과거 평균(데이터 기간 명시)과 섹터 중앙값·비교 기업과 비교 (Markdown 표).
10. ### 강세·약세 시나리오 — 각각 12개월 목표주가, 핵심 가정, 촉매를 표로.
11. ### 결론 — 한 단락: 매수·보유·회피 중 하나와 확신도, 핵심 근거, 가장 큰 위험.
마지막 줄: "※ AI가 공개 데이터로 작성한 참고 자료이며 투자 권유가 아닙니다. 데이터 기준: ${DATA.dates[DATA.dates.length - 1]} 종가."
${focus ? `\n독자가 특히 궁금해하는 점 (본문 곳곳과 결론에서 직접 답해 주세요): ${focus.slice(0, 600)}\n` : ""}
[데이터]
${data}`;
}
function secAI(r, R) {
  const sec = h("section", { class: "panel sec", id: "s-ai" });
  sec.append(secHead("AI 리서치 노트", "요약 박스 → 사업 모델 → 수익성 → 재무 → 현금흐름 → 경쟁우위 → 경영진 → 밸류에이션 → 시나리오 → 결론"));
  const wrap = h("div", { class: "ai" });
  sec.append(wrap);
  const focus = h("input", { class: "inp", type: "text", placeholder: "특별히 궁금한 점 (선택) — 예: 관세 영향, 경쟁사 대비 마진", style: { flex: "1 1 280px", maxWidth: "520px" } });
  const tier = h("select", { class: "sel", "aria-label": "분석 깊이" }, h("option", { value: "default" }, "기본 분석"), h("option", { value: "complex" }, "심층 분석 (느림)"));
  const go1 = h("button", { type: "button", class: "btn primary" }, "노트 쓰기");
  const stop = h("button", { type: "button", class: "btn", hidden: true }, "중지");
  const status = h("span", { class: "ai-status" });
  const out = h("div", { class: "ai-out", "aria-live": "polite" });
  const unavailable = h("p", { class: "note" }, "AI 노트는 Claude 앱이나 claude.ai에서 이 페이지를 열었을 때 쓸 수 있어요. 노트를 쓰면 보는 사람의 Claude 사용량이 쓰여요.");
  wrap.append(h("div", { class: "ai-ctl" }, focus, tier, go1, stop, status), out, unavailable,
    h("p", { class: "disc" }, "버튼을 누르면 이 페이지의 데이터(재무제표·지표·컨센서스·주주·뉴스 헤드라인)를 Claude에게 보내 노트를 써요. 첫 사용 때 권한을 물어봐요. 결과는 이 브라우저에만 저장돼요. 투자 권유가 아닌 참고 자료예요."));
  const setAvail = () => { const ok = !!APP.cap.sample; go1.disabled = !ok; unavailable.hidden = ok; };
  setAvail();
  document.addEventListener("caps", setAvail);
  const cached = LS.get("note:" + r.t);
  if (cached && cached.text) {
    out.innerHTML = mdToHtml(cached.text);
    status.textContent = `${relTime(cached.at)} 작성 (${cached.tier === "complex" ? "심층" : "기본"}${cached.asof ? ", " + cached.asof + " 데이터" : ""}) · 다시 쓰려면 ‘노트 쓰기’`;
  }
  go1.addEventListener("click", async () => {
    const sample = APP.cap.sample;
    if (!sample) return;
    if (APP.ctl) APP.ctl.abort();
    const ctl = new AbortController();
    APP.ctl = ctl;
    go1.disabled = true; stop.hidden = false;
    status.textContent = "Claude가 데이터를 읽고 생각하는 중이에요… (보통 20초~1분)";
    out.classList.add("streaming");
    clear(out);
    let raf = 0, latest = "";
    const paint = () => { raf = 0; out.innerHTML = mdToHtml(latest); };
    try {
      const res = await sample(notePrompt(r, R, focus.value.trim()), {
        modelTier: tier.value, signal: ctl.signal, cache: false,
        onText: ({ text }) => { latest = text; status.textContent = "작성 중…"; if (!raf) raf = requestAnimationFrame(paint); },
      });
      latest = res.text;
      paint();
      LS.set("note:" + r.t, { text: res.text, at: Date.now(), tier: res.modelTierApplied || tier.value, asof: DATA.dates[DATA.dates.length - 1] });
      status.textContent = "완료" + (res.truncated ? " — 길이 제한으로 끝부분이 잘렸어요." : "") + (res.modelTierApplied && res.modelTierApplied !== tier.value ? " (요금제에 따라 다른 모델이 답했어요)" : "");
    } catch (e) {
      if (e && e.text) { latest = e.text; paint(); } else if (!(e && e.code === "cancelled")) clear(out);
      status.textContent = sampleErrorText(e);
      if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) { APP.cap.sample = null; setAvail(); }
    } finally {
      out.classList.remove("streaming");
      go1.disabled = !APP.cap.sample; stop.hidden = true;
      if (APP.ctl === ctl) APP.ctl = null;
    }
  });
  stop.addEventListener("click", () => { if (APP.ctl) APP.ctl.abort(); });
  return sec;
}
