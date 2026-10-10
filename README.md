# us-stock-data

추세 레이더(미국 주식 기술적 스크리너)가 매일 아침 쓰는 일봉 데이터를 모아 두는 저장소예요.
미국장이 끝나면 GitHub Actions가 야후 파이낸스에서 일봉을 받아 `data` 릴리스에 올려요.

- 대상: 시가총액 20억 달러 이상 미국 상장 종목(ADR 포함) + S&P 500 전 종목 + 지수·섹터 ETF + `extra_tickers.txt`
  + 레이더 'ETF 찾기'용 ETF 목록 `etf_tickers.txt`(한 줄에 `티커 | 분류 | 한국어 이름`, 개별 종목 레버리지 ETF는 제외)
- 실행: 평일 22:17 UTC(한국 시간 다음 날 오전 7시 17분), 저장소 Actions 탭에서 수동 실행도 가능
- 결과 파일: `releases/download/data/prices.parquet`, `universe.csv`, `manifest.json`
- 기업 분석 노트용:
  - `macro.json`(FRED 매크로 지표 29개 + 국채 수익률 곡선), `earnings_calendar.json`(Nasdaq 실적 발표 예정일) —
    `macro.yml`이 평일 22:05 UTC에 `macro.py`로 받아요
  - `fund_store.json.gz`(종목별 기업 데이터 누적본), `analysis_bundle.tar.gz`(페이지용 데이터 묶음) —
    `fundamentals.yml`이 가격 수집이 끝나면 `fundamentals.py`로 야후 파이낸스에서 받아요
    (프로필, 재무제표, 투자지표, 실적·컨센서스, 애널리스트 의견, 주주 구성, 내부자 거래, 배당, 뉴스)
  - `etf_holdings.json.gz`(ETF 전체 보유종목) — 같은 작업이 번들을 만들기 전에 `etf_holdings.py`로 운용사가 공개하는
    보유종목 파일을 받아요(뱅가드·SPDR·프로셰어즈·디렉시온·글로벌X·반에크·ARK·JP모건·퍼스트 트러스트, 뱅가드는 월 1회).
    아이셰어즈·인베스코·슈왑은 자동 다운로드를 막아 둬서 페이지에 야후 상위 10개만 나와요
- `analysis_page/`: 기업 분석 노트 페이지 소스(`shell.html` + `*.js`)와 빌드 스크립트 `build_analysis.py`.
  `python3 analysis_page/build_analysis.py --page-dir analysis_page --radar-summary <레이더 summary.json>
  --radar-template <레이더 template.html>`로 `site/`를 만들고, 매일 아침 예약 작업이 같은 스크립트로 갱신해요.

Daily bars (split-adjusted, not dividend-adjusted) for US stocks with market cap >= $2B, all S&P 500
members, index/sector ETFs and `extra_tickers.txt`, refreshed by `.github/workflows/nightly-prices.yml`
after each US session. Data comes from Yahoo Finance via yfinance, for personal use.
