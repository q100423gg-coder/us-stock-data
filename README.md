# us-stock-data

추세 레이더(미국 주식 기술적 스크리너)가 매일 아침 쓰는 일봉 데이터를 모아 두는 저장소예요.
미국장이 끝나면 GitHub Actions가 야후 파이낸스에서 일봉을 받아 `data` 릴리스에 올려요.

- 대상: 시가총액 20억 달러 이상 미국 상장 종목(ADR 포함) + S&P 500 전 종목 + 지수·섹터 ETF + `extra_tickers.txt`
- 실행: 평일 22:17 UTC(한국 시간 다음 날 오전 7시 17분), 저장소 Actions 탭에서 수동 실행도 가능
- 결과 파일: `releases/download/data/prices.parquet`, `universe.csv`, `manifest.json`
- 기업 분석 노트용:
  - `macro.json`(FRED 매크로 지표 29개 + 국채 수익률 곡선), `earnings_calendar.json`(Nasdaq 실적 발표 예정일) —
    `macro.yml`이 평일 22:05 UTC에 `macro.py`로 받아요
  - `fund_store.json.gz`(종목별 기업 데이터 누적본), `analysis_bundle.tar.gz`(페이지용 데이터 묶음) —
    `fundamentals.yml`이 가격 수집이 끝나면 `fundamentals.py`로 야후 파이낸스에서 받아요
    (프로필, 재무제표, 투자지표, 실적·컨센서스, 애널리스트 의견, 주주 구성, 내부자 거래, 배당, 뉴스)

Daily bars (split-adjusted, not dividend-adjusted) for US stocks with market cap >= $2B, all S&P 500
members, index/sector ETFs and `extra_tickers.txt`, refreshed by `.github/workflows/nightly-prices.yml`
after each US session. Data comes from Yahoo Finance via yfinance, for personal use.
