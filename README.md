# us-stock-data

추세 레이더(미국 주식 기술적 스크리너)가 매일 아침 쓰는 일봉 데이터를 모아 두는 저장소예요.
미국장이 끝나면 GitHub Actions가 야후 파이낸스에서 일봉을 받아 `data` 릴리스에 올려요.

- 대상: 시가총액 20억 달러 이상 미국 상장 종목(ADR 포함) + S&P 500 전 종목 + 지수·섹터 ETF + `extra_tickers.txt`
- 실행: 평일 22:17 UTC(한국 시간 다음 날 오전 7시 17분), 저장소 Actions 탭에서 수동 실행도 가능
- 결과 파일: `releases/download/data/prices.parquet`, `universe.csv`, `manifest.json`

Daily bars (split-adjusted, not dividend-adjusted) for US stocks with market cap >= $2B, all S&P 500
members, index/sector ETFs and `extra_tickers.txt`, refreshed by `.github/workflows/nightly-prices.yml`
after each US session. Data comes from Yahoo Finance via yfinance, for personal use.
