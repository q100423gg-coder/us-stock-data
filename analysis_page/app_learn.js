/* =====================================================================
   기업 분석 노트 — plain-language help for the company view:
   a term dictionary (tap or hover a dotted term) and rule-based
   "쉽게 읽기" readings for statements, valuation, earnings, analysts,
   ownership and dividends.
   ===================================================================== */
const TERM_GROUPS = [["base", "기본"], ["inc", "손익계산서"], ["bal", "재무상태표"], ["cf", "현금흐름표"], ["val", "투자지표"], ["est", "실적 · 애널리스트"], ["own", "주주 · 배당"], ["etf", "ETF"]];
/** n: name, d: what it is, g: how to read it, c: group */
const TERMS = {
  // basics
  mc: { c: "base", n: "시가총액", d: "주가 × 발행주식수예요. 지금 주가로 회사를 통째로 사려면 드는 값이에요.", g: "크기를 보여줄 뿐 좋고 나쁨은 없어요. 대형주일수록 보통 덜 출렁여요." },
  ev: { c: "base", n: "기업가치(EV)", d: "시가총액 + 빚 − 현금이에요. 회사를 사면서 빚까지 떠안을 때 실제로 드는 값이에요.", g: "빚이 많은 회사와 현금이 많은 회사를 공정하게 비교할 때 써요." },
  ttm: { c: "base", n: "최근 12개월(TTM)", d: "가장 최근 4개 분기를 합친 값이에요.", g: "회계연도가 끝나길 기다리지 않고 가장 최신 1년 실적을 볼 수 있어요." },
  yoy: { c: "base", n: "YoY(전년 대비)", d: "1년 전 같은 기간과 비교한 증감률이에요.", g: "분기 실적은 계절 영향이 있어서 직전 분기보다 1년 전 같은 분기와 비교하는 게 정확해요." },
  fy: { c: "base", n: "회계연도(FY)", d: "회사가 1년 실적을 끊는 기간이에요. 12월에 끝나는 회사가 많지만, 엔비디아(1월)·애플(9월)처럼 다른 회사도 있어요.", g: "FY26은 2026년에 끝나는 회계연도예요. 회사마다 기간이 달라 달력 연도와 어긋날 수 있어요." },
  gaap: { c: "base", n: "GAAP · 조정(Non-GAAP)", d: "GAAP은 미국 회계 기준대로 계산한 공식 숫자, 조정(Non-GAAP)은 주식보상비용·일회성 비용 등을 뺀 회사 기준 숫자예요.", g: "애널리스트 예상치와 어닝 서프라이즈는 보통 조정 기준이에요. 두 숫자 차이가 크면 이유를 확인해 보세요." },
  // income statement
  rev: { c: "inc", n: "매출액", d: "물건과 서비스를 팔아 번 돈 전체예요(비용을 빼기 전).", g: "꾸준히 늘어야 좋아요. 모든 이익의 출발점이에요." },
  cogs: { c: "inc", n: "매출원가", d: "팔린 물건을 만들거나 서비스를 제공하는 데 직접 든 비용이에요(재료비, 생산 인력 등).", g: "매출보다 천천히 늘면 남는 돈이 커져요." },
  gp: { c: "inc", n: "매출총이익", d: "매출 − 매출원가예요. 제품 자체로 남긴 돈이에요.", g: "여기서 연구개발비·판매관리비를 더 빼면 영업이익이 돼요." },
  gpm: { c: "inc", n: "매출총이익률", d: "매출총이익 ÷ 매출이에요. 100원어치 팔아 원가를 빼고 몇 원이 남는지예요.", g: "높을수록 가격을 올려 받을 힘(가격 결정력)이 강해요. 소프트웨어는 70~80%, 유통·제조는 20~40%가 흔해요." },
  rd: { c: "inc", n: "연구개발비(R&D)", d: "새 제품과 기술 개발에 쓴 돈이에요.", g: "기술·제약 기업은 매출의 15~25%를 쓰기도 해요. 미래를 위한 투자예요." },
  sga: { c: "inc", n: "판매관리비", d: "영업·마케팅·관리 부서 인건비, 광고비, 임대료 같은 운영 비용이에요.", g: "매출보다 천천히 늘면 회사가 커질수록 효율이 좋아진다는 뜻이에요." },
  oi: { c: "inc", n: "영업이익", d: "매출총이익 − 연구개발비 − 판매관리비예요. 본업으로 번 이익이에요.", g: "회사의 진짜 사업 실력을 보여줘요. 마이너스면 본업에서 적자예요." },
  opm: { c: "inc", n: "영업이익률", d: "영업이익 ÷ 매출이에요. 100원어치 팔아 본업으로 몇 원이 남는지예요.", g: "보통 20% 이상이면 높고 10% 미만이면 낮은 편이에요. 업종마다 차이가 커서 같은 업종끼리 비교해요." },
  ebitda: { c: "inc", n: "EBITDA", d: "영업이익에 감가상각비를 더한 값이에요. 설비 비용을 빼기 전의 현금 창출력을 대략 보여줘요.", g: "빚 부담(순차입금 ÷ EBITDA)과 EV/EBITDA를 계산할 때 써요." },
  nii: { c: "inc", n: "순이자이익", d: "이자로 번 돈 − 이자로 낸 돈이에요.", g: "현금이 많은 회사는 플러스, 빚이 많은 회사는 마이너스예요. 은행에는 핵심 수입이에요." },
  intx: { c: "inc", n: "이자비용", d: "빌린 돈에 낸 이자예요.", g: "영업이익으로 이자를 몇 번 갚을 수 있는지(이자보상배율)로 봐요. 3배 미만이면 부담이에요." },
  pti: { c: "inc", n: "세전이익", d: "법인세를 내기 전의 이익이에요." },
  tax: { c: "inc", n: "법인세", d: "이익에 매겨진 세금이에요." },
  ni: { c: "inc", n: "순이익", d: "모든 비용, 이자, 세금을 빼고 최종적으로 남은 이익이에요. 주주의 몫이에요.", g: "마이너스면 적자예요. 일회성 이익·손실이 섞일 수 있어 영업이익과 함께 봐요." },
  npm: { c: "inc", n: "순이익률", d: "순이익 ÷ 매출이에요. 100원어치 팔아 최종적으로 몇 원이 남는지예요." },
  eps: { c: "inc", n: "EPS(주당순이익)", d: "순이익 ÷ 주식 수예요. 주식 1주가 번 이익이에요. 희석 EPS는 스톡옵션처럼 앞으로 주식이 될 수 있는 것까지 넣어 계산해요.", g: "꾸준히 늘면 주가도 따라 오르는 경향이 있어요." },
  shd: { c: "inc", n: "희석 주식수", d: "스톡옵션·전환사채 등이 모두 주식으로 바뀐다고 가정한 주식 수예요.", g: "줄면(자사주 매입) 1주당 몫이 커지고, 늘면 기존 주주의 몫이 줄어요(희석)." },
  // balance sheet
  ta: { c: "bal", n: "자산총계", d: "회사가 가진 모든 것(현금, 재고, 공장, 특허 등)의 장부상 가치예요.", g: "자산 = 부채 + 자본이에요. 빚으로 산 자산도 여기에 들어가요." },
  ca: { c: "bal", n: "유동자산", d: "1년 안에 현금으로 바꿀 수 있는 자산(현금, 매출채권, 재고 등)이에요." },
  cash: { c: "bal", n: "현금및현금성자산", d: "바로 쓸 수 있는 현금과 만기 3개월 이내 예금 같은 자산이에요." },
  csti: { c: "bal", n: "현금·단기투자", d: "현금에 곧 현금으로 바꿀 수 있는 단기 투자(국채 등)를 더한 값이에요.", g: "총차입금보다 많으면 빚을 다 갚고도 현금이 남는 순현금 회사예요." },
  recv: { c: "bal", n: "매출채권", d: "물건은 팔았지만 아직 받지 못한 돈(외상값)이에요.", g: "매출보다 빠르게 늘면 돈을 제때 못 받고 있다는 신호일 수 있어요." },
  inv: { c: "bal", n: "재고자산", d: "팔려고 쌓아 둔 제품과 원재료예요.", g: "매출보다 빠르게 늘면 물건이 안 팔리고 쌓이고 있다는 신호일 수 있어요." },
  ppe: { c: "bal", n: "유형자산", d: "공장, 설비, 건물, 데이터센터처럼 형체가 있는 자산이에요." },
  gw: { c: "bal", n: "영업권·무형자산", d: "다른 회사를 인수하며 웃돈을 준 부분(영업권)과 특허·브랜드 같은 자산이에요.", g: "인수가 기대만큼 안 되면 한꺼번에 손실(손상차손)로 처리될 수 있어요." },
  tl: { c: "bal", n: "부채총계", d: "갚아야 할 모든 돈(빚, 외상값, 미리 받은 돈 등)이에요." },
  cl: { c: "bal", n: "유동부채", d: "1년 안에 갚아야 하는 부채예요." },
  ap: { c: "bal", n: "매입채무", d: "재료나 서비스를 사고 아직 주지 않은 돈(외상으로 산 것)이에요." },
  cd: { c: "bal", n: "단기차입금", d: "1년 안에 갚아야 하는 빌린 돈이에요." },
  ltd: { c: "bal", n: "장기차입금", d: "1년 뒤에 갚아도 되는 빌린 돈(회사채, 장기 대출)이에요." },
  td: { c: "bal", n: "총차입금", d: "이자를 내는 빌린 돈 전체(단기 + 장기)예요." },
  nd: { c: "bal", n: "순차입금", d: "총차입금 − 현금이에요. 마이너스면 빚보다 현금이 많은 순현금 회사예요.", g: "1년 EBITDA의 2배 이하면 무난하고, 4배를 넘으면 빚이 많은 편이에요." },
  eq: { c: "bal", n: "자본총계", d: "자산 − 부채예요. 빚을 다 갚고 주주에게 남는 몫(장부상 가치)이에요.", g: "마이너스면 부채가 자산보다 많은 상태예요. 적자가 쌓였거나 자사주를 많이 사들여서 그럴 수 있어요." },
  re: { c: "bal", n: "이익잉여금", d: "그동안 번 이익 중 배당하지 않고 회사에 쌓아 둔 돈이에요." },
  wc: { c: "bal", n: "운전자본", d: "유동자산 − 유동부채예요. 1년 안에 쓸 수 있는 여유 자금이에요." },
  so: { c: "bal", n: "발행주식수", d: "지금 발행돼 있는 주식 수예요.", g: "해마다 줄어들면 자사주 매입으로 주주의 몫이 커지고 있다는 뜻이에요." },
  // cash flow
  ocf: { c: "cf", n: "영업활동현금흐름", d: "본업으로 실제 들어온 현금이에요. 순이익과 달리 외상, 재고 변화를 반영한 '진짜 현금'이에요.", g: "순이익보다 크거나 비슷하면 이익의 질이 좋아요. 순이익보다 훨씬 작으면 이유를 확인해 보세요." },
  capex: { c: "cf", n: "설비투자(CAPEX)", d: "공장, 설비, 데이터센터 등에 쓴 돈이에요. 현금이 나가서 마이너스로 표시돼요.", g: "미래 성장을 위한 투자예요. 너무 크면 남는 현금(FCF)이 줄어요." },
  fcf: { c: "cf", n: "잉여현금흐름(FCF)", d: "영업활동현금흐름 − 설비투자예요. 사업을 유지하고도 남는 현금이에요.", g: "배당, 자사주 매입, 빚 상환의 재원이에요. 꾸준히 플러스면 좋아요." },
  icf: { c: "cf", n: "투자활동현금흐름", d: "설비투자, 기업 인수, 금융상품 매매처럼 투자에 쓰거나 회수한 현금이에요.", g: "성장하는 회사는 보통 마이너스예요." },
  fin: { c: "cf", n: "재무활동현금흐름", d: "빚을 빌리거나 갚고, 배당과 자사주 매입을 한 현금 흐름이에요.", g: "주주환원을 많이 하는 회사는 크게 마이너스예요." },
  buy: { c: "cf", n: "자사주 매입", d: "회사가 시장에서 자기 주식을 사들인 돈이에요.", g: "주식 수가 줄어 1주당 가치가 올라가요. 배당과 함께 대표적인 주주환원이에요." },
  div: { c: "cf", n: "배당금 지급", d: "주주에게 현금으로 나눠 준 돈이에요." },
  sbc: { c: "cf", n: "주식보상비용", d: "직원에게 월급 대신 준 주식의 가치예요. 현금은 안 나가지만 주식 수가 늘어 기존 주주의 몫이 줄어요.", g: "매출의 10%를 넘으면 큰 편이에요. 현금흐름에는 비용으로 잡히지 않아 FCF가 실제보다 좋아 보일 수 있어요." },
  da: { c: "cf", n: "감가상각비", d: "공장·설비의 가치가 시간이 지나며 줄어드는 만큼을 해마다 비용으로 나눠 반영한 거예요.", g: "장부상 비용이라 현금이 실제로 나가지는 않아요." },
  dissue: { c: "cf", n: "차입금 조달", d: "새로 빌린 돈이에요." },
  drepay: { c: "cf", n: "차입금 상환", d: "빌린 돈을 갚은 금액이에요." },
  cwc: { c: "cf", n: "운전자본 변동", d: "매출채권·재고·매입채무가 늘고 줄면서 현금이 묶이거나 풀린 금액이에요.", g: "마이너스가 크면 외상 매출이나 재고에 현금이 묶였다는 뜻이에요." },
  // valuation
  pe: { c: "val", n: "PER(주가수익비율)", d: "주가 ÷ 주당순이익이에요. 지금 주가가 1년 이익의 몇 배인지 보여줘요.", g: "이익이 그대로라면 투자금을 이익으로 되찾는 데 몇 년 걸리는지로 볼 수도 있어요. 낮을수록 싸지만 성장이 빠른 회사는 높게 받아요. 같은 업종, 과거 평균과 비교해 보세요." },
  fpe: { c: "val", n: "선행 PER", d: "주가 ÷ 앞으로 12개월 예상 이익이에요.", g: "PER보다 낮으면 앞으로 이익이 늘 것으로 예상된다는 뜻이에요." },
  peg: { c: "val", n: "PEG", d: "PER ÷ 이익 성장률이에요. 성장 속도를 감안한 PER이에요.", g: "1 미만이면 성장에 비해 싸고, 2를 넘으면 비싼 편으로 봐요." },
  ps: { c: "val", n: "PSR(주가매출비율)", d: "시가총액 ÷ 매출이에요.", g: "이익이 적거나 적자인 회사를 비교할 때 써요. 업종마다 차이가 커요(소프트웨어는 높고 유통은 낮아요)." },
  pb: { c: "val", n: "PBR(주가순자산비율)", d: "시가총액 ÷ 자본(장부가치)이에요.", g: "1배 미만이면 장부상 가치보다 싸게 거래된다는 뜻이에요. 은행·보험 같은 금융주를 볼 때 특히 중요해요." },
  eve: { c: "val", n: "EV/EBITDA", d: "기업가치 ÷ EBITDA예요. 빚까지 포함한 회사 전체 가격이 1년 현금 창출력의 몇 배인지 보여줘요.", g: "빚이 많은 회사와 적은 회사를 공정하게 비교할 수 있어요. 낮을수록 싸요." },
  evs: { c: "val", n: "EV/매출", d: "기업가치 ÷ 매출이에요." },
  fcfy: { c: "val", n: "FCF 수익률", d: "잉여현금흐름 ÷ 시가총액이에요. 회사를 통째로 샀을 때 1년에 투자금의 몇 %를 현금으로 버는지예요.", g: "5% 이상이면 현금 창출력에 비해 싼 편, 2% 미만이면 비싼 편이에요." },
  roe: { c: "val", n: "ROE(자기자본이익률)", d: "순이익 ÷ 자본이에요. 주주가 맡긴 돈으로 1년에 몇 %를 벌었는지예요.", g: "15% 이상이면 우수해요. 다만 빚이 많거나 자사주를 많이 사서 자본이 작아도 높게 나와요." },
  roa: { c: "val", n: "ROA(총자산이익률)", d: "순이익 ÷ 자산이에요. 가진 자산 전체로 몇 %를 벌었는지예요." },
  de: { c: "val", n: "부채비율(D/E)", d: "총차입금 ÷ 자본(%)이에요. 주주 돈에 비해 빌린 돈이 얼마나 되는지예요.", g: "100% 이하면 무난한 편이에요. 업종마다 달라요(유틸리티·리츠는 높은 게 보통이에요)." },
  cr: { c: "val", n: "유동비율", d: "유동자산 ÷ 유동부채예요. 1년 안에 갚을 빚을 1년 안에 현금화할 자산으로 몇 번 갚을 수 있는지예요.", g: "1.5배 이상이면 여유 있고, 1배 미만이면 단기 자금 사정을 살펴봐야 해요." },
  beta: { c: "val", n: "베타", d: "시장(S&P 500)이 1% 움직일 때 이 주식이 평균 몇 % 움직였는지예요.", g: "1보다 크면 시장보다 크게 출렁이고, 작으면 덜 출렁여요." },
  si: { c: "val", n: "공매도 비율", d: "유통주식 중 공매도(빌려서 판 주식) 비율이에요. 주가 하락에 베팅한 물량이에요.", g: "10%를 넘으면 높은 편이에요. 주가가 급등하면 공매도를 되사면서 더 오르기도 해요(숏스퀴즈)." },
  sr: { c: "val", n: "커버 일수", d: "공매도 물량을 평소 거래량으로 다 사들이는 데 걸리는 날수예요." },
  // estimates and analysts
  consensus: { c: "est", n: "컨센서스", d: "여러 애널리스트 예상치의 평균이에요.", g: "실적 발표 때 이 숫자와 비교해 '예상 상회·하회'를 판단해요." },
  surprise: { c: "est", n: "어닝 서프라이즈", d: "실제 실적이 예상(컨센서스)보다 몇 % 좋았거나 나빴는지예요.", g: "꾸준히 예상을 넘으면 좋은 신호예요. 다만 회사가 예상을 낮게 관리하는 경우도 많아요." },
  target: { c: "est", n: "목표주가", d: "애널리스트가 12개월 뒤 적정하다고 보는 주가예요.", g: "자주 틀리고 주가를 따라 바뀌는 경우가 많아요. 숫자보다 올리는지 내리는지 방향을 참고하세요." },
  rating: { c: "est", n: "투자의견 척도", d: "애널리스트 의견을 1=강력 매수, 2=매수, 3=중립, 4=매도, 5=강력 매도로 바꿔 평균한 값이에요.", g: "2 이하면 매수 의견이 많은 거예요. 미국 애널리스트는 매도 의견을 잘 내지 않아요." },
  revision: { c: "est", n: "추정치 상향 · 하향", d: "최근 애널리스트가 이익 예상을 올리거나 내린 횟수예요.", g: "상향이 많으면 실적 기대가 좋아지고 있다는 뜻이라 주가에 좋은 신호예요." },
  // ownership and dividends
  inst: { c: "own", n: "기관 보유", d: "연기금, 자산운용사, 헤지펀드 같은 기관이 가진 지분 비율이에요.", g: "대형주는 보통 60~80%예요." },
  ins: { c: "own", n: "내부자 보유", d: "경영진, 이사, 대주주가 가진 지분 비율이에요.", g: "높으면 경영진과 주주의 이해관계가 같은 편이에요." },
  form4: { c: "own", n: "SEC Form 4", d: "내부자가 자기 회사 주식을 사고팔면 2영업일 안에 미국 증권거래위원회(SEC)에 신고하는 서류예요.", g: "매도는 세금·분산 목적의 정기 매도가 많아 신호가 약하고, 자기 돈으로 사는 매수는 좋은 신호로 봐요." },
  gov: { c: "own", n: "지배구조 위험 점수", d: "의결권 자문사 ISS가 감사, 이사회, 보상, 주주 권리를 평가한 점수예요.", g: "1이 가장 좋고 10이 가장 위험해요." },
  dy: { c: "own", n: "배당수익률", d: "1년 배당금 ÷ 주가예요. 주가 대비 배당으로 받는 비율이에요.", g: "너무 높으면(7% 이상) 주가가 크게 떨어졌거나 배당이 줄 위험이 있는지 확인하세요." },
  pay: { c: "own", n: "배당성향", d: "배당금 ÷ 순이익이에요. 번 돈 중 몇 %를 배당으로 주는지예요.", g: "60% 이하면 여유가 있고, 100%를 넘으면 번 돈보다 많이 주는 거라 오래가기 어려울 수 있어요. 리츠는 법으로 대부분을 배당해 예외예요." },
  exd: { c: "own", n: "배당락일", d: "이날 전날까지 주식을 가지고 있어야 이번 배당을 받아요.", g: "배당락일에는 보통 배당금만큼 주가가 내려가요." },
  payd: { c: "own", n: "배당 지급일", d: "배당금이 실제로 계좌에 들어오는 날이에요." },
  // ETF
  aum: { c: "etf", n: "순자산(AUM)", d: "ETF에 모인 돈 전체예요.", g: "클수록 거래가 활발하고 사고팔 때 손해(호가 차이)가 작아요." },
  er: { c: "etf", n: "총보수", d: "ETF 운용 비용으로 1년에 떼 가는 비율이에요.", g: "낮을수록 좋아요. 지수 ETF는 0.1% 안팎이 흔해요." },
  etfdy: { c: "etf", n: "분배율", d: "ETF가 1년 동안 나눠 준 분배금 ÷ 가격이에요(주식의 배당수익률과 같아요)." },
  etfpe: { c: "etf", n: "PER(보유 종목)", d: "ETF가 담은 종목들의 PER을 비중대로 평균한 값이에요." },
};
const TKEY = { "%gp": "gpm", "%oi": "opm", "%ni": "npm" };
/** free cash flow of the last four quarters as in the statements (operating cash flow − capex); Yahoo's own figure otherwise */
function fcfTTM(R) {
  const t = R && R.fs && R.fs.t;
  if (t && t.capex && t.fcf && isNum(t.fcf[1])) return t.fcf[1];
  return R && R.k ? R.k.fcf : null;
}

// ---------------------------------------------------------------- dotted term with a tooltip (hover, focus or tap)
let TERM_WIRED = false;
function term(key, label) {
  const t = TERMS[TKEY[key] || key];
  const text = label || (t ? t.n : key);
  if (!t) return text;
  if (!TERM_WIRED) {
    TERM_WIRED = true;
    window.addEventListener("scroll", hideTip, { passive: true });
    // a tap anywhere else closes it (touch screens never send a hover-out); runs before charts show their own tips
    document.addEventListener("pointerdown", (e) => { if (!(e.target && e.target.closest && e.target.closest(".term"))) hideTip(); }, true);
  }
  const b = h("button", { type: "button", class: "term", "aria-label": `${text} — 용어 설명` }, text);
  const body = () => h("div", { class: "tip-term" }, h("div", { class: "tip-t" }, t.n), h("div", { class: "tip-d" }, t.d), t.g ? h("div", { class: "tip-g" }, t.g) : null);
  const show = () => { const r = b.getBoundingClientRect(); showTip(r.left - 6, r.bottom - 8, body()); };
  b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(); });
  b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(); });
  b.addEventListener("focus", show);
  b.addEventListener("blur", hideTip);
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); show(); });
  return b;
}

// ---------------------------------------------------------------- "쉽게 읽기" box
const EMK = { ok: "✓", warn: "!", bad: "✗", na: "–" };
function easyBox(title, items, note) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return h("div", { class: "easy" },
    h("div", { class: "easy-h" }, h("b", null, title), h("span", null, "정해진 기준으로 자동 해석 · ✓ 좋음 ! 주의 ✗ 나쁨 – 참고")),
    h("ul", { class: "eck" }, list.map((x) => h("li", { class: x.lv }, h("span", { class: "mk", "aria-hidden": "true" }, EMK[x.lv] || "–"),
      h("b", null, x.t), x.d ? h("small", null, x.d) : null))),
    note ? h("p", { class: "note" }, note) : null);
}

// ---------------------------------------------------------------- readings
/** banks, insurers and brokers: deposits and claims are liabilities, no operating income or current assets reported */
function isFinSector(r) { const a = fsT("a"); return r.s === 2 && !(a && a.oi && a.ca); }
const isHeavyDebtSector = (r) => r.s === 8 || r.s === 9;   // utilities and REITs borrow to own assets
/** annual statements in plain words */
function fsRead(r, R) {
  const a = fsT("a");
  if (!a || !a.d || a.d.length < 2) return [];
  const tt = (R.fs && R.fs.t) || {};
  const cur = repCur(R), money = (v) => fmtM(v, cur);
  const fin = isFinSector(r);
  const valid = (key) => (a[key] || []).map((v, i) => (isNum(v) ? i : -1)).filter((i) => i >= 0);
  const lastOf = (key) => { const ii = valid(key); return ii.length ? { i: ii[ii.length - 1], v: a[key][ii[ii.length - 1]] } : null; };
  const firstOf = (key) => { const ii = valid(key); return ii.length ? { i: ii[0], v: a[key][ii[0]] } : null; };
  const fy = (i) => "FY" + a.d[i].slice(2, 4);
  const ttm = (key) => (tt[key] && isNum(tt[key][1]) ? tt[key][1] : null);
  const out = [];
  // 1. growth
  const r0 = firstOf("rev"), r1 = lastOf("rev");
  if (r0 && r1 && r1.i > r0.i && r0.v > 0 && r1.v > 0) {
    const yrs = r1.i - r0.i, mult = r1.v / r0.v, cagr = (Math.pow(mult, 1 / yrs) - 1) * 100;
    const prev = a.rev[r1.i - 1], yoy = isNum(prev) && prev > 0 ? (r1.v / prev - 1) * 100 : null;
    let lv, t;
    if (cagr >= 10) { lv = "ok"; t = mult >= 2 ? `매출이 ${yrs}년 새 ${fmtN(mult, 1)}배로 늘었어요` : `매출이 해마다 평균 ${fmtN(cagr, 0)}%씩 늘었어요`; }
    else if (cagr >= 0) { lv = "na"; t = `매출이 조금씩 늘고 있어요(연평균 ${fmtP(cagr, 1)})`; }
    else { lv = "warn"; t = `매출이 줄고 있어요(연평균 ${fmtP(cagr, 1)})`; }
    if (yoy != null && yoy < 0 && lv === "ok") lv = "na";
    out.push({ lv, t, d: `${fy(r0.i)} ${money(r0.v)} → ${fy(r1.i)} ${money(r1.v)}` + (yoy != null ? ` · 최근 1년 ${fmtP(yoy, 1)}` : "") });
  }
  // 2. operating margin
  const o1 = lastOf("oi");
  if (!fin && o1 && isNum(a.rev[o1.i]) && a.rev[o1.i] > 0) {
    const om = ratio(o1.v, a.rev[o1.i]), o0 = firstOf("oi");
    const om0 = o0 && o0.i < o1.i && isNum(a.rev[o0.i]) && a.rev[o0.i] > 0 ? ratio(o0.v, a.rev[o0.i]) : null;
    let lv, t;
    if (om < 0) { lv = "bad"; t = `본업에서 적자예요(영업이익률 ${fmtP(om, 1, false)})`; }
    else { lv = om >= 15 ? "ok" : om >= 5 ? "na" : "warn"; t = `100원어치 팔면 약 ${fmtN(om, 0)}원이 본업 이익으로 남아요`; }
    let d = `영업이익률 ${fmtP(om, 1, false)}`;
    if (isNum(om0)) {
      const dm = om - om0;
      d = `영업이익률 ${fy(o0.i)} ${fmtP(om0, 1, false)} → ${fy(o1.i)} ${fmtP(om, 1, false)} · ` + (dm >= 3 ? "좋아지는 중이에요" : dm <= -3 ? "나빠지는 중이에요" : "비슷하게 유지돼요");
      if (dm <= -3 && lv === "ok") lv = "na"; else if (dm <= -5 && lv === "na") lv = "warn";
    }
    out.push({ lv, t, d });
  }
  // 3. profit or loss
  const niIdx = valid("ni");
  if (niIdx.length) {
    const lastNi = a.ni[niIdx[niIdx.length - 1]], tni = ttm("ni");
    if (lastNi < 0) {
      out.push({ lv: tni != null && tni > 0 ? "na" : "bad", t: `최근 회계연도에 순손실을 냈어요(${money(lastNi)})`,
        d: tni != null ? `최근 12개월 순이익 ${money(tni)}` + (tni > 0 ? " · 최근에는 흑자로 돌아섰어요" : " · 아직 적자예요") : "" });
    } else {
      let streak = 0;
      for (let j = niIdx.length - 1; j >= 0 && a.ni[niIdx[j]] > 0; j--) streak++;
      const li = niIdx[niIdx.length - 1], npm = isNum(a.rev && a.rev[li]) && a.rev[li] > 0 ? ratio(lastNi, a.rev[li]) : null;
      out.push({ lv: "ok", t: streak === niIdx.length ? `데이터가 있는 ${streak}개 회계연도 모두 흑자예요` : streak === 1 ? "최근 회계연도에 흑자로 돌아섰어요" : `최근 ${streak}년 연속 흑자예요`,
        d: `${fy(li)} 순이익 ${money(lastNi)}` + (isNum(npm) ? ` · 순이익률 ${fmtP(npm, 1, false)}` : "") });
    }
  }
  // 4. is the profit real cash?
  const oc = lastOf("ocf"), nn = lastOf("ni");
  if (!fin && oc && nn && oc.i === nn.i) {
    if (nn.v > 0) {
      const q = oc.v / nn.v;
      out.push({ lv: q >= 0.9 ? "ok" : q >= 0.6 ? "na" : "warn",
        t: q >= 0.9 ? "번 이익이 실제 현금으로 잘 들어와요" : q >= 0.6 ? "이익의 일부만 현금으로 들어왔어요" : "이익에 비해 들어온 현금이 적어요",
        d: `영업활동현금흐름 ${money(oc.v)} ÷ 순이익 ${money(nn.v)} = ${fmtN(q * 100, 0)}%` + (q < 0.6 ? " · 외상 매출이나 재고가 늘었을 수 있어요" : "") });
    } else if (oc.v > 0) {
      out.push({ lv: "na", t: "회계상 적자지만 본업에서 현금은 들어오고 있어요", d: `영업활동현금흐름 ${money(oc.v)}` });
    } else {
      out.push({ lv: "bad", t: "본업에서 현금이 빠져나가고 있어요", d: `영업활동현금흐름 ${money(oc.v)}` });
    }
  }
  // 5. free cash flow
  const f1 = lastOf("fcf");
  if (!fin && f1 && r.s !== 9) {
    const rv = a.rev ? a.rev[f1.i] : null, fm = isNum(rv) && rv > 0 ? (f1.v / rv) * 100 : null;
    out.push(f1.v > 0 ? { lv: "ok", t: "설비투자를 하고도 현금이 남아요", d: `${fy(f1.i)} 잉여현금흐름(FCF) ${money(f1.v)}` + (isNum(fm) ? ` · 매출의 ${fmtN(fm, 0)}%` : "") }
      : { lv: "warn", t: "번 현금보다 설비투자에 더 많이 쓰고 있어요", d: `${fy(f1.i)} 잉여현금흐름(FCF) ${money(f1.v)} · 성장을 위한 투자일 수도 있지만 현금은 줄어요` });
  }
  // 6. debt
  if (!fin) {
    const cs = lastOf("csti") || lastOf("cash"), db = lastOf("td");
    const eb = ttm("ebitda") != null ? ttm("ebitda") : (lastOf("ebitda") || {}).v;
    const [okX, warnX] = isHeavyDebtSector(r) ? [5, 7] : [2, 4];
    if (cs && db) {
      const net = db.v - cs.v;
      if (net <= 0) out.push({ lv: "ok", t: "빚보다 현금이 많아요(순현금)", d: `현금·단기투자 ${money(cs.v)} · 총차입금 ${money(db.v)}` });
      else if (isNum(eb) && eb > 0) {
        const x = net / eb;
        out.push({ lv: x <= okX ? "ok" : x <= warnX ? "warn" : "bad", t: x <= okX ? "빚이 있지만 감당할 만한 수준이에요" : x <= warnX ? "빚이 다소 많은 편이에요" : "빚 부담이 큰 편이에요",
          d: `순차입금 ${money(net)} = 1년 EBITDA의 ${fmtN(x, 1)}배 (${okX}배 이하 무난, ${warnX}배 넘으면 부담)` + (isHeavyDebtSector(r) ? " · 리츠·유틸리티는 원래 빚이 많은 업종이에요" : "") });
      } else out.push({ lv: "bad", t: "빚이 현금보다 많은데 벌어들이는 현금(EBITDA)이 적어요", d: `순차입금 ${money(net)}` });
    }
    const e1 = lastOf("eq");
    if (e1 && e1.v <= 0) out.push({ lv: "warn", t: "자본이 마이너스예요(부채가 자산보다 많음)", d: "적자가 쌓였거나 자사주를 많이 사들여서 생길 수 있어요." });
    // interest and short-term liquidity: shown only when they matter
    const ix = lastOf("intx");
    if (ix && ix.v > 0 && o1 && o1.i === ix.i) {
      const cover = o1.v / ix.v;
      if (cover < 8) out.push({ lv: cover < 1.5 ? "bad" : cover < 3 ? "warn" : "na",
        t: o1.v <= 0 ? "영업이익으로 이자를 감당하지 못해요" : `영업이익으로 이자를 ${fmtN(cover, 1)}번 갚을 수 있어요`,
        d: `이자비용 ${money(ix.v)} · 3배 미만이면 이자 부담이 큰 편이에요` });
    }
    const c1 = lastOf("ca"), l1 = lastOf("cl");
    if (c1 && l1 && c1.i === l1.i && l1.v > 0 && c1.v / l1.v < 1) out.push({ lv: "warn", t: "1년 안에 갚을 빚이 1년 안에 쓸 수 있는 자산보다 많아요",
      d: `유동비율 ${fmtN(c1.v / l1.v, 2)}배 · 현금 창출력이 좋은 대기업은 1배 아래여도 문제없는 경우가 많아요` });
  } else {
    const k = R.k || {};
    out.push({ lv: "na", t: "은행·보험사는 재무제표를 읽는 법이 달라요", d: "예금·보험금이 부채로 잡혀 일반 기업처럼 부채비율·현금흐름으로 판단하지 않아요. ROE와 PBR을 주로 봐요." });
    if (isNum(k.roe)) out.push({ lv: k.roe >= 0.12 ? "ok" : k.roe >= 0.08 ? "na" : "warn", t: `주주 돈으로 1년에 ${fmtN(k.roe * 100, 1)}%를 벌었어요(ROE)`, d: "금융사는 ROE 10~15%면 양호한 편이에요." });
  }
  // 7. share count
  const s0 = firstOf("shd"), s1 = lastOf("shd");
  if (s0 && s1 && s1.i > s0.i && s0.v > 0) {
    const ch = (s1.v / s0.v - 1) * 100, per = ch / (s1.i - s0.i);
    out.push(ch <= -2 ? { lv: "ok", t: `자사주 매입으로 주식 수가 ${fmtN(-ch, 1)}% 줄었어요`, d: `${fy(s0.i)} → ${fy(s1.i)} · 1주가 가진 회사 몫이 커져요` }
      : per >= 2 ? { lv: "warn", t: `주식 수가 ${fmtN(ch, 1)}% 늘었어요(희석)`, d: `${fy(s0.i)} → ${fy(s1.i)} · 새 주식 발행이나 주식 보상 때문이에요. 기존 주주의 몫이 줄어요` }
      : { lv: "na", t: "주식 수는 거의 그대로예요", d: `${fy(s0.i)} → ${fy(s1.i)} ${fmtP(ch, 1)}` });
  }
  // 8. money returned to shareholders
  const bb = lastOf("buy"), dv = lastOf("div");
  const back = (bb && bb.v < 0 ? -bb.v : 0) + (dv && dv.v < 0 ? -dv.v : 0);
  if (back > 0) {
    const base = fin ? lastOf("ni") : lastOf("fcf");
    const pct = base && base.v > 0 ? (back / base.v) * 100 : null;
    out.push({ lv: pct != null && pct > 150 ? "warn" : "na",
      t: pct != null ? `${fin ? "순이익" : "잉여현금흐름"}의 ${fmtN(pct, 0)}%를 주주에게 돌려줬어요` : "자사주 매입과 배당으로 주주에게 돌려주고 있어요",
      d: [bb && bb.v < 0 ? `자사주 매입 ${money(-bb.v)}` : null, dv && dv.v < 0 ? `배당 ${money(-dv.v)}` : null].filter(Boolean).join(" + ") + (pct != null && pct > 150 ? " · 번 돈보다 많이 돌려줘 빚이나 현금으로 채우고 있어요" : "") });
  }
  // 9. stock pay
  const sb = lastOf("sbc");
  if (!fin && sb && isNum(a.rev && a.rev[sb.i]) && a.rev[sb.i] > 0) {
    const sp = (sb.v / a.rev[sb.i]) * 100;
    if (sp >= 10) out.push({ lv: "warn", t: `주식보상비용이 매출의 ${fmtN(sp, 0)}%로 커요`, d: "현금은 안 나가지만 주식 수를 늘려 주주 몫을 줄여요. 현금흐름에는 비용으로 잡히지 않아요." });
  }
  return out;
}
/** valuation in plain words; ctx: {med, peAvg, pePeriod} */
function valRead(r, R, ctx) {
  const k = R.k || {}, med = ctx.med || {}, out = [];
  if (isNum(r.pe) && r.pe > 0) {
    out.push({ lv: "na", t: `주가가 1년 이익의 ${fmtN(r.pe, 1)}배예요(PER)`, d: `이익이 그대로라면 투자금을 이익으로 되찾는 데 약 ${fmtN(r.pe, 0)}년이 걸린다는 뜻이에요.` });
    if (isNum(med.pe) && med.pe > 0) {
      const d = (r.pe / med.pe - 1) * 100;
      out.push({ lv: d <= -20 ? "ok" : d >= 20 ? "warn" : "na", t: d <= -20 ? "같은 업종보다 싸게 거래돼요" : d >= 20 ? "같은 업종보다 비싸게 거래돼요" : "같은 업종과 비슷한 가격이에요",
        d: `업종 중앙값 PER ${fmtN(med.pe, 1)}배보다 ${fmtN(Math.abs(d), 0)}% ${d >= 0 ? "높아요" : "낮아요"}` + (d >= 20 ? ". 그만큼 성장 기대가 반영돼 있어요" : "") });
    }
    if (isNum(ctx.peAvg) && ctx.peAvg > 0) {
      const d = (r.pe / ctx.peAvg - 1) * 100;
      out.push({ lv: d <= -15 ? "ok" : d >= 15 ? "warn" : "na", t: d <= -15 ? "자기 과거 평균보다 싸요" : d >= 15 ? "자기 과거 평균보다 비싸요" : "자기 과거 평균과 비슷해요",
        d: `${ctx.pePeriod} 평균 PER ${fmtN(ctx.peAvg, 1)}배` });
    }
  } else if (isNum(r.ps)) {
    out.push({ lv: "na", t: "이익이 적거나 적자라 PER로 보기 어려워요", d: `대신 PSR(시가총액 ÷ 매출) ${fmtN(r.ps, 1)}배로 비교해요` + (isNum(med.ps) ? ` · 업종 중앙값 ${fmtN(med.ps, 1)}배` : "") });
  }
  if (isNum(r.fpe) && r.fpe > 0 && isNum(r.pe) && r.pe > 0) {
    if (r.fpe < r.pe * 0.9) out.push({ lv: "ok", t: "앞으로 이익이 늘 것으로 예상돼요", d: `선행 PER ${fmtN(r.fpe, 1)}배가 지금 PER ${fmtN(r.pe, 1)}배보다 낮아요` });
    else if (r.fpe > r.pe * 1.1) out.push({ lv: "warn", t: "앞으로 이익이 줄 것으로 예상돼요", d: `선행 PER ${fmtN(r.fpe, 1)}배가 지금 PER ${fmtN(r.pe, 1)}배보다 높아요` });
  }
  if (isNum(k.peg) && k.peg > 0) out.push({ lv: k.peg < 1 ? "ok" : k.peg <= 2 ? "na" : "warn",
    t: k.peg < 1 ? "성장 속도에 비하면 비싸지 않아요" : k.peg <= 2 ? "성장 속도를 감안하면 보통 가격이에요" : "성장 속도에 비해 비싼 편이에요",
    d: `PEG ${fmtN(k.peg, 2)} (PER ÷ 이익 성장률 · 1 미만 싼 편, 2 초과 비싼 편)` });
  if (isNum(r.fcfy) && !isFinSector(r)) out.push({ lv: r.fcfy >= 5 ? "ok" : r.fcfy >= 2 ? "na" : "warn",
    t: r.fcfy >= 5 ? "벌어들이는 현금에 비해 싼 편이에요" : r.fcfy >= 2 ? "현금 창출력에 비해 보통 가격이에요" : r.fcfy > 0 ? "벌어들이는 현금에 비해 비싼 편이에요" : "남는 현금(FCF)이 마이너스라 현금 기준으로는 비싸요",
    d: r.fcfy > 0 ? `FCF 수익률 ${fmtP(r.fcfy, 2, false)} · 회사를 통째로 사면 1년에 투자금의 ${fmtP(r.fcfy, 1, false)}를 현금으로 버는 셈이에요` : `FCF 수익률 ${fmtP(r.fcfy, 2)} · 설비투자 등을 하고 나면 남는 현금이 없어요` });
  if (isFinSector(r) && isNum(r.pb)) {
    const roe = isNum(r.roe) ? r.roe : null;
    out.push({ lv: r.pb < 1 ? "ok" : r.pb <= 2 ? "na" : roe != null && roe >= 15 ? "na" : "warn",
      t: r.pb < 1 ? "장부가치보다 싸게 거래돼요" : r.pb <= 2 ? "장부가치의 1~2배로 보통이에요" : "장부가치의 2배 넘게 거래돼요",
      d: `PBR ${fmtN(r.pb, 2)}배` + (roe != null ? ` · ROE ${fmtN(roe, 1)}%` : "") + " · 금융주는 ROE가 높을수록 PBR도 높게 받는 게 보통이에요" });
  }
  return out;
}
/** earnings in plain words */
function earnRead(r, R) {
  const e = R.e || {}, out = [];
  const hist = (e.h || []).filter((x) => isNum(x[5]));
  if (hist.length) {
    const last4 = hist.slice(-4), beats = last4.filter((x) => x[5] > 0).length, lx = last4[last4.length - 1];
    out.push({ lv: beats >= 3 ? "ok" : beats >= 2 ? "na" : "warn", t: `최근 ${last4.length}분기 중 ${beats}번 예상보다 좋았어요`,
      d: `가장 최근 분기 EPS ${fmtN(lx[3], 2)} vs 예상 ${fmtN(lx[4], 2)} (${fmtP(lx[5], 1)})` });
  }
  const q = fsT("q");
  if (q && q.rev) {
    const li = lastI(q.rev), y = li >= 0 ? yoyAt(q.rev, li, 4) : null;
    if (isNum(y)) out.push({ lv: y >= 10 ? "ok" : y >= 0 ? "na" : "warn", t: y >= 0 ? `최근 분기 매출이 1년 전보다 ${fmtN(y, 0)}% 늘었어요` : `최근 분기 매출이 1년 전보다 ${fmtN(-y, 0)}% 줄었어요`,
      d: `20${q.d[li].slice(2, 4)}년 ${+q.d[li].slice(5, 7)}월에 끝난 분기 매출 ${fmtM(q.rev[li], repCur(R))}` });
    if (q.oi) {
      const om = ratio(q.oi[li], q.rev[li]), om4 = li >= 4 ? ratio(q.oi[li - 4], q.rev[li - 4]) : null;
      if (isNum(om) && isNum(om4)) { const d = om - om4; out.push({ lv: d >= 2 ? "ok" : d <= -2 ? "warn" : "na", t: d >= 2 ? "1년 전보다 더 많이 남기고 있어요" : d <= -2 ? "1년 전보다 덜 남기고 있어요" : "남기는 비율은 1년 전과 비슷해요", d: `분기 영업이익률 ${fmtP(om4, 1, false)} → ${fmtP(om, 1, false)}` }); }
    }
  }
  const tr0 = (e.tr || []).find((x) => x[0] === "0q"), nx = r.nx || (e.nx && e.nx.d);
  if (tr0 && isNum(tr0[7]) && nx && nx >= todayISO()) out.push({ lv: "na", t: `다음 실적 발표(${fmtD(nx, "md")})에서 EPS가 1년 전보다 ${fmtN(Math.abs(tr0[7] * 100), 0)}% ${tr0[7] >= 0 ? "늘" : "줄"} 것으로 예상돼요`,
    d: (isNum(tr0[13]) ? `매출은 ${fmtP(tr0[13] * 100, 0)} 예상 · ` : "") + (isNum(tr0[6]) ? `애널리스트 ${tr0[6]}명의 평균이에요` : "애널리스트 평균이에요") });
  return out;
}
/** analyst views in plain words */
function anRead(r, R) {
  const k = R.k || {}, e = R.e || {}, out = [];
  if (isNum(k.rm)) out.push({ lv: k.rm <= 2.5 ? "ok" : k.rm <= 3.5 ? "na" : "warn",
    t: k.rm <= 1.8 ? "애널리스트 대부분이 매수를 추천해요" : k.rm <= 2.5 ? "매수 의견이 더 많아요" : k.rm <= 3.5 ? "의견이 중립 쪽이에요" : "매도 의견이 많아요",
    d: `${isNum(k.na) ? k.na + "명의 " : ""}평균 ${fmtN(k.rm, 2)} (1=강력 매수 … 5=강력 매도)` });
  if (isNum(r.up) && k.tgt && isNum(k.tgt[0])) out.push({ lv: r.up >= 15 ? "ok" : r.up >= 0 ? "na" : "warn",
    t: r.up >= 0 ? `평균 목표주가가 현재가보다 ${fmtN(r.up, 0)}% 높아요` : `현재가가 이미 평균 목표주가보다 ${fmtN(-r.up, 0)}% 높아요`,
    d: `평균 ${fmtPx(k.tgt[0])}` + (isNum(k.tgt[3]) && isNum(k.tgt[2]) ? ` · 가장 낮은 ${fmtPx(k.tgt[3])} ~ 가장 높은 ${fmtPx(k.tgt[2])}` : "") });
  const y0 = (e.tr || []).find((x) => x[0] === "0y");
  if (y0 && (isNum(y0[19]) || isNum(y0[21]))) {
    const u = y0[19] || 0, dn = y0[21] || 0;
    const ch = isNum(y0[17]) && y0[17] !== 0 && isNum(y0[2]) ? ((y0[2] / y0[17]) - 1) * 100 * Math.sign(y0[17]) : null;
    out.push({ lv: u > dn * 2 && u >= 2 ? "ok" : dn > u * 2 && dn >= 2 ? "warn" : "na",
      t: u > dn * 2 && u >= 2 ? "올해 이익 예상이 올라가고 있어요" : dn > u * 2 && dn >= 2 ? "올해 이익 예상이 내려가고 있어요" : "올해 이익 예상은 큰 변화가 없어요",
      d: `최근 30일 상향 ${u}건 · 하향 ${dn}건` + (isNum(ch) ? ` · 90일 동안 ${fmtP(ch, 1)}` : "") });
  }
  return out;
}
/** ownership in plain words */
function ownRead(R) {
  const own = R.own || {}, k = R.k || {}, out = [];
  const ins = own.ins ?? k.ins, inst = own.inst ?? k.inst;
  if (isNum(inst)) out.push({ lv: "na", t: inst >= 0.6 ? `기관이 ${fmtR(inst, 0)}를 가지고 있어요` : `기관 보유는 ${fmtR(inst, 0)}로 낮은 편이에요`,
    d: inst >= 0.6 ? "연기금·운용사가 많이 가진 종목이라 거래가 활발해요" : "개인 투자자 비중이 커서 주가가 크게 출렁일 수 있어요" });
  if (isNum(ins)) out.push({ lv: ins >= 0.1 ? "ok" : "na", t: ins >= 0.1 ? `경영진·대주주 지분이 ${fmtR(ins, 1)}로 높아요` : `경영진·대주주 지분은 ${fmtR(ins, 1)}예요`,
    d: ins >= 0.1 ? "경영진과 주주의 이해관계가 같은 편이에요" : "대형주는 내부자 지분이 낮은 게 보통이에요" });
  const itx = R.itx || [];
  const since = new Date(Date.now() - 183 * DAYMS).toISOString().slice(0, 10);
  const recent = itx.filter((x) => x[0] && x[0] >= since);
  const buys = recent.filter((x) => insiderKind(x[3])[1] === "buy"), sells = recent.filter((x) => insiderKind(x[3])[1] === "sell");
  if (buys.length) out.push({ lv: "ok", t: `최근 6개월 내부자가 자기 돈으로 ${buys.length}번 샀어요`, d: "내부자 매수는 회사 전망을 좋게 본다는 신호로 자주 해석해요" });
  else if (sells.length) out.push({ lv: "na", t: `최근 6개월 내부자 매도 ${sells.length}건, 매수는 없어요`, d: "내부자 매도는 세금·분산 목적의 정기 매도가 많아 큰 신호는 아니에요" });
  const gov = R.p && R.p.gov;
  if (gov && isNum(gov[4])) out.push({ lv: gov[4] <= 3 ? "ok" : gov[4] >= 8 ? "warn" : "na", t: gov[4] <= 3 ? "지배구조 위험이 낮아요" : gov[4] >= 8 ? "지배구조 위험 점수가 높아요" : "지배구조 위험은 중간 수준이에요",
    d: `ISS 종합 ${gov[4]}점 (1 좋음 ~ 10 위험)` });
  return out;
}
/** dividends in plain words; streak = years of rising payouts */
function divRead(r, R, streak) {
  const k = R.k || {}, out = [];
  const reit = r.s === 9;
  if (!isNum(k.dy) || k.dy <= 0) {
    const a = fsT("a"), buys = a && a.buy ? lastV(a.buy) : null;
    out.push({ lv: "na", t: "배당을 주지 않아요", d: isNum(buys) && buys < 0 ? `대신 자사주를 사들여 주주에게 돌려줘요(지난 회계연도 ${fmtM(-buys, repCur(R))})` : "이익을 사업에 다시 투자하는 회사예요" });
    return out;
  }
  const y = k.dy * 100;
  out.push({ lv: y >= 7 ? "warn" : "na", t: y >= 7 ? `배당수익률이 ${fmtN(y, 1)}%로 매우 높아요` : y >= 3 ? `배당수익률 ${fmtN(y, 1)}%로 높은 편이에요` : y >= 1.5 ? `배당수익률 ${fmtN(y, 1)}%로 보통이에요` : `배당수익률 ${fmtN(y, 1)}%로 낮은 편이에요`,
    d: y >= 7 ? "주가가 크게 떨어졌거나 배당이 줄 위험이 있는지 확인하세요" : isNum(k.dr) ? `1주에 1년 ${fmtPx(k.dr)}${krwP(k.dr) ? " (" + krwP(k.dr) + ")" : ""}씩 받아요` : "" });
  if (isNum(k.pay) && k.pay > 0) {
    const p = k.pay * 100;
    out.push(reit ? { lv: "na", t: `번 돈(순이익)의 ${fmtN(p, 0)}%를 배당해요`, d: "리츠는 감가상각이 커서 순이익 대신 FFO(영업으로 번 현금)로 배당 여력을 봐요. 100%를 넘는 게 흔해요" }
      : { lv: p <= 60 ? "ok" : p <= 100 ? "na" : "warn", t: p <= 60 ? `번 돈의 ${fmtN(p, 0)}%만 배당해 여유가 있어요` : p <= 100 ? `번 돈의 ${fmtN(p, 0)}%를 배당해요` : `번 돈보다 많이 배당하고 있어요(${fmtN(p, 0)}%)`,
        d: p <= 60 ? "이익이 줄어도 배당을 유지할 여력이 있어요" : p <= 100 ? "이익이 줄면 배당을 늘리기 어려울 수 있어요" : "빚이나 현금으로 채우는 셈이라 오래가기 어려울 수 있어요" });
  }
  if (streak >= 2) out.push({ lv: "ok", t: `${streak}년 연속 배당을 늘렸어요`, d: "꾸준히 늘리는 회사는 이익이 안정적인 경우가 많아요" });
  return out;
}
/** the whole dictionary, grouped */
function termGlossary() {
  return h("section", { class: "mgloss" }, h("details", null,
    h("summary", null, "용어 사전"),
    h("p", { class: "intro" }, "이 페이지에 나오는 용어를 모았어요. 페이지 곳곳의 점선 밑줄 용어를 누르거나 마우스를 올려도 설명이 나와요."),
    h("div", { class: "mgl" }, TERM_GROUPS.map(([g, name]) => {
      const list = Object.values(TERMS).filter((t) => t.c === g);
      return list.length ? h("div", null, h("h3", null, name), h("dl", null, list.map((t) => h("div", null, h("dt", null, t.n), h("dd", null, t.d + (t.g ? " " : ""), t.g ? h("b", null, "읽는 법 ") : null, t.g || ""))))) : null;
    }))));
}
