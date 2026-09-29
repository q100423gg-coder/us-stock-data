#!/usr/bin/env python3
"""US macro indicators (FRED) and the upcoming earnings calendar (Nasdaq) for the 기업 분석 page.

Runs on GitHub Actions (macro.yml) and writes:
  out/macro.json              series shown on the macro dashboard: Korean label, unit, group,
                              observations (daily series: last 2 years daily + weekly before that)
  out/earnings_calendar.json  {TICKER: {"d": "YYYY-MM-DD", "t": "bmo"|"amc"|"", "eps": "$1.98",
                              "q": "Sep/2026", "n": "12"}} — the next report date per ticker

FRED series are read from the public fredgraph.csv endpoint (no API key). Each source is optional:
a failure leaves that series or the calendar out instead of failing the run.
"""
import csv
import io
import json
import signal
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

OUT = Path("out")
START = "2011-01-01"
DAILY_FULL_DAYS = 730           # keep daily points for the last two years, weekly before that
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

# FRED id, key, Korean label, unit, group, transform, frequency, one-line explanation
SERIES = [
    ("DFEDTARU", "FFR", "기준금리(상단)", "%", "rates", None, "D", "연준이 정한 연방기금금리 목표 범위의 위쪽 끝이에요."),
    ("DGS2", "UST2Y", "미 국채 2년물", "%", "rates", None, "D", "앞으로의 기준금리 기대를 가장 빨리 반영하는 금리예요."),
    ("DGS10", "UST10Y", "미 국채 10년물", "%", "rates", None, "D", "주식 밸류에이션과 대출 금리의 기준이 되는 장기 금리예요."),
    ("T10Y2Y", "SP10_2", "장단기 금리차(10년−2년)", "%p", "rates", None, "D", "0 아래(역전)는 경기 둔화 선행 신호로 자주 쓰여요."),
    ("T10Y3M", "SP10_3M", "장단기 금리차(10년−3개월)", "%p", "rates", None, "D", "연준이 경기 침체 확률 모형에 쓰는 금리차예요."),
    ("MORTGAGE30US", "MORT30", "30년 고정 모기지 금리", "%", "rates", None, "W", "주택 시장과 소비에 직접 영향을 주는 금리예요."),
    ("CPIAUCSL", "CPI", "소비자물가(CPI) 상승률", "% 전년비", "inflation", "yoy", "M", "소비자가 사는 상품·서비스 가격이 1년 전보다 얼마나 올랐는지예요."),
    ("CPILFESL", "CORE_CPI", "근원 CPI 상승률", "% 전년비", "inflation", "yoy", "M", "변동이 큰 식품·에너지를 뺀 물가예요. 추세를 보기 좋아요."),
    ("PCEPILFE", "CORE_PCE", "근원 PCE 상승률", "% 전년비", "inflation", "yoy", "M", "연준이 2% 목표를 잴 때 쓰는 물가예요."),
    ("T5YIE", "BEI5", "5년 기대인플레이션", "%", "inflation", None, "D", "채권 시장이 예상하는 앞으로 5년 평균 물가 상승률이에요."),
    ("UNRATE", "UNRATE", "실업률", "%", "labor", None, "M", "일할 의사가 있는데 일자리가 없는 사람의 비율이에요."),
    ("PAYEMS", "NFP", "비농업 고용 증감", "천 명", "labor", "diff", "M", "농업을 뺀 일자리가 한 달 동안 몇 개 늘었는지예요."),
    ("ICSA", "CLAIMS", "신규 실업수당 청구", "천 건", "labor", "k", "W", "매주 새로 실업수당을 신청한 사람 수로, 고용 변화를 가장 빨리 보여줘요."),
    ("CES0500000003", "WAGE", "시간당 임금 상승률", "% 전년비", "labor", "yoy", "M", "임금이 빠르게 오르면 서비스 물가가 잘 안 내려가요."),
    ("A191RL1Q225SBEA", "GDP", "실질 GDP 성장률", "% 연율", "growth", None, "Q", "물가를 뺀 경제 성장률을 연율로 환산한 값이에요."),
    ("INDPRO", "INDPRO", "산업생산 증가율", "% 전년비", "growth", "yoy", "M", "공장·광업·유틸리티 생산이 1년 전보다 얼마나 늘었는지예요."),
    ("RSAFS", "RETAIL", "소매판매 증가율", "% 전년비", "growth", "yoy", "M", "미국 경제의 70%를 차지하는 소비의 흐름이에요."),
    ("UMCSENT", "UMICH", "미시간대 소비자심리", "pt", "growth", None, "M", "소비자가 느끼는 경기와 살림살이 전망이에요."),
    ("M2SL", "M2", "M2 통화량 증가율", "% 전년비", "liquidity", "yoy", "M", "시중에 풀린 돈이 1년 전보다 얼마나 늘었는지예요."),
    ("WALCL", "FEDBS", "연준 총자산", "조 달러", "liquidity", "tn", "W", "연준이 양적완화로 늘리고 양적긴축으로 줄이는 대차대조표 규모예요."),
    ("BAMLH0A0HYM2", "HY", "하이일드 스프레드", "%p", "liquidity", None, "D", "투기등급 회사채가 국채보다 더 주는 금리예요. 벌어지면 신용 불안이에요."),
    ("NFCI", "NFCI", "금융여건지수(시카고 연은)", "지수", "liquidity", None, "W", "0보다 크면 평소보다 긴축적, 작으면 완화적인 금융 환경이에요."),
    ("VIXCLS", "VIX", "VIX 변동성지수", "pt", "market", None, "D", "S&P 500 옵션에 담긴 향후 30일 변동성 기대예요. 30 위면 공포 구간이에요."),
    ("DTWEXBGS", "USD", "달러 인덱스(광의)", "지수", "market", None, "D", "주요 교역국 통화 대비 달러 가치예요. 달러가 강하면 해외 매출 비중이 큰 기업에 불리해요."),
    ("DCOILWTICO", "WTI", "WTI 유가", "달러/배럴", "market", None, "D", "미국 기준 원유 가격이에요."),
    ("SP500", "SPX", "S&P 500", "pt", "market", None, "D", "미국 대형주 500개 지수예요."),
]
GROUPS = [("rates", "금리"), ("inflation", "물가"), ("labor", "고용"), ("growth", "성장·소비"),
          ("liquidity", "유동성·신용"), ("market", "시장")]


STATUS = {"fred": {}, "nasdaq": {}}    # written to out/macro_status.json: what worked, how long it took


def get(url, headers=None, tries=2, timeout=20):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network hiccups: back off and retry
            last = e
            if i + 1 < tries:
                time.sleep(2 * (i + 1))
    raise last


def fred(sid):
    text = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={START}", timeout=25)
    rows = list(csv.reader(io.StringIO(text)))
    obs = []
    for r in rows[1:]:
        if len(r) < 2 or not r[1] or r[1] == ".":
            continue
        try:
            obs.append((r[0], float(r[1])))
        except ValueError:
            continue
    return obs


def transform(obs, how):
    if how is None:
        return obs
    if how == "k":
        return [(d, v / 1000) for d, v in obs]
    if how == "tn":
        return [(d, v / 1e6) for d, v in obs]
    if how == "diff":
        return [(obs[i][0], obs[i][1] - obs[i - 1][1]) for i in range(1, len(obs))]
    if how == "yoy":                       # monthly index -> % change from the same month a year earlier
        by_month = {d[:7]: v for d, v in obs}
        out = []
        for d, v in obs:
            prev = by_month.get(f"{int(d[:4]) - 1:04d}{d[4:7]}")
            if prev:
                out.append((d, (v / prev - 1) * 100))
        return out
    raise ValueError(how)


def thin_daily(obs):
    """Daily points for the last DAILY_FULL_DAYS days, the last point of each ISO week before that."""
    if not obs:
        return obs
    cut = (date.fromisoformat(obs[-1][0]) - timedelta(days=DAILY_FULL_DAYS)).isoformat()
    old, new = [p for p in obs if p[0] < cut], [p for p in obs if p[0] >= cut]
    weekly = {}
    for d, v in old:
        y, w, _ = date.fromisoformat(d).isocalendar()
        weekly[(y, w)] = (d, v)
    return sorted(weekly.values()) + new


def fetch_one(spec):
    sid = spec[0]
    t0 = time.time()
    try:
        obs = fred(sid)
        STATUS["fred"][sid] = {"ok": bool(obs), "n": len(obs), "sec": round(time.time() - t0, 1)}
        return spec, obs, None
    except Exception as e:
        STATUS["fred"][sid] = {"ok": False, "sec": round(time.time() - t0, 1), "err": f"{type(e).__name__}: {e}"[:200]}
        return spec, None, e


def macro():
    from concurrent.futures import ThreadPoolExecutor
    series, failed = {}, []
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fetch_one, SERIES))
    for (sid, key, name, unit, group, how, freq, desc), raw, err in results:
        if err is not None or not raw:
            failed.append(f"{sid}: {type(err).__name__ if err else 'empty'}")
            continue
        obs = transform(raw, how)
        if freq == "D":
            obs = thin_daily(obs)
        nd = 3 if unit in ("조 달러",) or key == "NFCI" else 2
        series[key] = dict(id=sid, name=name, unit=unit, group=group, freq=freq, desc=desc,
                           obs=[[d, round(v, nd)] for d, v in obs])
    return dict(updated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                groups=[dict(id=g, name=n) for g, n in GROUPS], series=series, failed=failed)


def earnings_calendar(days=80, budget=300):
    """Next report date per ticker from Nasdaq's public earnings calendar (at most `budget` seconds)."""
    headers = {"Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com",
               "Referer": "https://www.nasdaq.com/", "Accept-Language": "en-US,en;q=0.9"}
    today = datetime.now(ZoneInfo("America/New_York")).date()
    out, bad, good, t0 = {}, 0, 0, time.time()
    for i in range(days):
        d = today + timedelta(days=i)
        if d.weekday() > 4:
            continue
        if time.time() - t0 > budget:
            STATUS["nasdaq"]["stopped"] = "time budget"
            break
        try:
            j = json.loads(get(f"https://api.nasdaq.com/api/calendar/earnings?date={d.isoformat()}", headers,
                               tries=1, timeout=15))
            good += 1
        except Exception as e:
            bad += 1
            STATUS["nasdaq"]["last_err"] = f"{type(e).__name__}: {e}"[:200]
            if bad >= 3 and not good:           # blocked from this runner: give up quietly
                STATUS["nasdaq"]["stopped"] = "blocked"
                break
            continue
        for r in ((j or {}).get("data") or {}).get("rows") or []:
            sym = str(r.get("symbol") or "").strip().upper().replace(".", "-").replace("/", "-")
            if not sym or sym in out:
                continue
            t = str(r.get("time") or "")
            out[sym] = {"d": d.isoformat(), "t": "bmo" if "pre" in t else "amc" if "after" in t else "",
                        "eps": r.get("epsForecast") or None, "q": r.get("fiscalQuarterEnding") or None,
                        "n": r.get("noOfEsts") or None}
        time.sleep(0.4)
    STATUS["nasdaq"].update(days_ok=good, days_bad=bad, tickers=len(out), sec=round(time.time() - t0, 1))
    return out


def main():
    OUT.mkdir(exist_ok=True)
    # `timeout` sends SIGTERM: turn it into SystemExit so the status file below still gets written
    signal.signal(signal.SIGTERM, lambda *_: sys.exit("killed by timeout"))
    t0 = time.time()
    m = {"series": {}}
    try:
        m = macro()
        STATUS["fred_sec"] = round(time.time() - t0, 1)
        if m["series"]:
            (OUT / "macro.json").write_text(json.dumps(m, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"macro: {len(m['series'])} series, failed: {m['failed']}", flush=True)
        cal = earnings_calendar()
        if cal:
            payload = dict(updated_at=m["updated_at"], tickers=cal)
            (OUT / "earnings_calendar.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        print(f"earnings calendar: {len(cal)} tickers", flush=True)
    finally:
        STATUS["finished_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        STATUS["total_sec"] = round(time.time() - t0, 1)
        (OUT / "macro_status.json").write_text(json.dumps(STATUS, indent=1), encoding="utf-8")
    if len(m["series"]) < len(SERIES) // 2:
        sys.exit("too many FRED series failed")


if __name__ == "__main__":
    main()
