#!/usr/bin/env python3
"""Company data for the 기업 분석 노트 page. Runs nightly on GitHub Actions (fundamentals.yml).

Phase 1 — fetch (Yahoo Finance, through yfinance's cookie/crumb session):
  for every ticker in universe.csv, stalest first, within a time budget:
    quoteSummary          profile, key statistics, analyst estimates and ratings, earnings history,
                          ownership, insider transactions
    fundamentals-timeseries  annual / quarterly / trailing statements, monthly valuation measures
    chart                 10 years of monthly closes with dividends and splits
    news                  latest headlines
  Records are merged into fund_store.json.gz, which the workflow keeps in the `data` release, so a run
  that is cut short (rate limits, time budget) resumes where it stopped the next night.

Phase 2 — bundle: store + prices.parquet + macro.json + earnings_calendar.json -> analysis_bundle.tar.gz
  data/universe.json   one row per ticker (search, screener, peers) + trading dates + benchmark closes
  data/f/NN.json       NSHARDS shards: the full company record + daily closes, keyed by ticker
  data/macro.json      copied from macro.py's output
  data/calendar.json   upcoming earnings for universe tickers (Nasdaq calendar, Yahoo as fallback)
  data/meta.json       build time, price date, coverage

Amounts in statements are in millions of the reporting currency; per-share values are as reported.
"""
import gzip
import io
import json
import math
import os
import random
import re
import shutil
import sys
import tarfile
import threading
import time
import traceback
import zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREV = HERE / "prev"                      # release assets downloaded by the workflow
OUT = HERE / "out"
STORE = "fund_store.json.gz"
NSHARDS = 64
BUDGET = int(os.environ.get("FUND_BUDGET_SEC", "1500"))       # fetch phase, seconds
THREADS = int(os.environ.get("FUND_THREADS", "3"))    # overlap latency; FUND_RPS sets the pace
FRESH_H = float(os.environ.get("FUND_FRESH_HOURS", "18"))      # records younger than this are not refetched
ONLY = [x.strip().upper() for x in os.environ.get("FUND_ONLY", "").split(",") if x.strip()]

QS_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/"
TS_URL = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"
CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/"
MODULES = ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price", "calendarEvents",
           "earnings", "earningsHistory", "earningsTrend", "recommendationTrend", "upgradeDowngradeHistory",
           "majorHoldersBreakdown", "institutionOwnership", "fundOwnership", "insiderTransactions",
           "insiderHolders", "netSharePurchaseActivity", "indexTrend"]
ETF_MODULES = ["summaryProfile", "summaryDetail", "defaultKeyStatistics", "price", "fundProfile", "topHoldings"]

# statement line items: short key -> Yahoo timeseries name
INC = {"rev": "TotalRevenue", "cogs": "CostOfRevenue", "gp": "GrossProfit", "rd": "ResearchAndDevelopment",
       "sga": "SellingGeneralAndAdministration", "opx": "OperatingExpense", "oi": "OperatingIncome",
       "ebitda": "EBITDA", "nebitda": "NormalizedEBITDA", "ebit": "EBIT", "nii": "NetInterestIncome",
       "intx": "InterestExpense", "pti": "PretaxIncome", "tax": "TaxProvision", "ni": "NetIncome",
       "nic": "NetIncomeCommonStockholders", "eps": "DilutedEPS", "beps": "BasicEPS", "shd": "DilutedAverageShares"}
BAL = {"ta": "TotalAssets", "ca": "CurrentAssets", "cash": "CashAndCashEquivalents",
       "csti": "CashCashEquivalentsAndShortTermInvestments", "recv": "Receivables", "inv": "Inventory",
       "ppe": "NetPPE", "gw": "GoodwillAndOtherIntangibleAssets", "tl": "TotalLiabilitiesNetMinorityInterest",
       "cl": "CurrentLiabilities", "ap": "AccountsPayable", "cd": "CurrentDebt", "ltd": "LongTermDebt",
       "td": "TotalDebt", "nd": "NetDebt", "eq": "StockholdersEquity", "re": "RetainedEarnings",
       "so": "OrdinarySharesNumber", "wc": "WorkingCapital", "tbv": "TangibleBookValue", "ic": "InvestedCapital"}
CF = {"ocf": "OperatingCashFlow", "capex": "CapitalExpenditure", "fcf": "FreeCashFlow", "icf": "InvestingCashFlow",
      "fin": "FinancingCashFlow", "buy": "RepurchaseOfCapitalStock", "div": "CashDividendsPaid",
      "sbc": "StockBasedCompensation", "da": "DepreciationAndAmortization", "dissue": "IssuanceOfDebt",
      "drepay": "RepaymentOfDebt", "cwc": "ChangeInWorkingCapital"}
VAL = {"mc": "MarketCap", "ev": "EnterpriseValue", "pe": "PeRatio", "fpe": "ForwardPeRatio", "peg": "PegRatio",
       "ps": "PsRatio", "pb": "PbRatio", "evr": "EnterprisesValueRevenueRatio", "eve": "EnterprisesValueEBITDARatio"}
PER_SHARE = {"eps", "beps"}
FLOW_KEYS = set(INC) | set(CF)

STATUS = {"started_at": None, "fetched": 0, "failed": 0, "skipped_fresh": 0, "rate_limited": 0, "errors": [],
          "stopped": None}
LOCK = threading.Lock()


def now_utc():
    return datetime.now(timezone.utc)


def iso(ts):
    """epoch seconds -> YYYY-MM-DD (UTC)"""
    if ts is None or ts == "" or (isinstance(ts, float) and math.isnan(ts)):
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def rv(x):
    """Yahoo values arrive as plain numbers or {"raw": .., "fmt": ..}."""
    if isinstance(x, dict):
        x = x.get("raw")
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    return x


def rnd(x, nd=4):
    x = rv(x)
    if x is None or isinstance(x, (str, bool)):
        return x
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    if x == int(x) and abs(x) < 1e15:
        return int(x)
    return round(x, nd)


def mil(x):
    """amount -> millions, with precision that keeps small companies readable"""
    x = rv(x)
    if x is None:
        return None
    v = float(x) / 1e6
    return round(v, 1) if abs(v) >= 1000 else round(v, 3)


# ---------------------------------------------------------------- network

class RateLimited(Exception):
    """Yahoo refused the request (429, or 401/403 once the crumb is burned): pause, reset, retry later."""


class Pacer:
    """Global request pacing shared by all worker threads."""

    def __init__(self, rps):
        self.gap = 1.0 / max(0.1, rps)
        self.next = 0.0
        self.lock = threading.Lock()

    def wait(self):
        with self.lock:
            now = time.time()
            t = max(now, self.next)
            self.next = t + self.gap * random.uniform(0.8, 1.25)
        if t > now:
            time.sleep(t - now)


PACE = Pacer(float(os.environ.get("FUND_RPS", "5")))


def yf_data():
    from yfinance.data import YfData
    return YfData()


def disable_cookie_cache():
    """Never reuse a cookie persisted by an earlier run: a burned cookie would survive session resets."""
    try:
        from yfinance import cache as yfc
        yfc._CookieCacheManager._Cookie_cache = yfc._CookieCacheDummy()
    except Exception as e:
        print(f"could not disable yfinance cookie cache: {e}", flush=True)


def reset_session():
    """Fresh HTTP session, cookie and crumb (after Yahoo starts answering 401/403/429)."""
    from yfinance.data import YfData
    from yfinance._http import new_session
    d = YfData(session=new_session())
    with d._cookie_lock:
        d._cookie = None
        d._crumb = None
        d._cookie_strategy = "basic"


def get_json(url, params=None, timeout=30):
    from yfinance.exceptions import YFRateLimitError
    PACE.wait()
    try:
        r = yf_data().get(url, params=params, timeout=timeout)
    except YFRateLimitError as e:
        raise RateLimited(str(e))
    if r.status_code in (401, 403, 429):
        raise RateLimited(f"HTTP {r.status_code}")
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code} for {url.split('?')[0]}")
    return r.json()


def quote_summary(sym, modules):
    j = get_json(QS_URL + sym, params={"modules": ",".join(modules), "formatted": "false", "symbol": sym,
                                       "lang": "en-US", "region": "US", "corsDomain": "finance.yahoo.com"})
    res = (j.get("quoteSummary") or {}).get("result") or []
    if not res:
        err = (j.get("quoteSummary") or {}).get("error")
        raise RuntimeError(f"quoteSummary empty: {err}")
    return res[0]


def timeseries(sym, prefixes_keys):
    """prefixes_keys: list of (prefix, [yahoo names]) -> {type: {date: value}}"""
    types = ",".join(p + k for p, keys in prefixes_keys for k in keys)
    p1 = int(datetime(2010, 1, 1, tzinfo=timezone.utc).timestamp())
    p2 = int(time.time()) + 86400
    j = get_json(TS_URL + sym, params={"symbol": sym, "type": types, "period1": p1, "period2": p2})
    out = {}
    for item in (j.get("timeseries") or {}).get("result") or []:
        for k, v in item.items():
            if k in ("meta", "timestamp") or not isinstance(v, list):
                continue
            for p in v:
                if not p:
                    continue
                d, val = p.get("asOfDate"), (p.get("reportedValue") or {}).get("raw")
                if d and val is not None:
                    out.setdefault(k, {})[d] = val
    return out


def chart_monthly(sym):
    j = get_json(CHART_URL + sym, params={"range": "10y", "interval": "1mo", "events": "div,split"})
    res = ((j.get("chart") or {}).get("result") or [None])[0]
    if not res:
        return None
    return res


def news(sym, count=6):
    import yfinance as yf
    PACE.wait()
    try:
        items = yf.Ticker(sym).get_news(count=count) or []
    except Exception as e:
        if any(x in str(e) for x in ("429", "401", "403")) or "Rate" in type(e).__name__:
            raise RateLimited(str(e))
        return []
    return parse_news(items)


def parse_news(items):
    out = []
    for it in items:
        c = it.get("content") or it
        title = c.get("title")
        if not title:
            continue
        url = ((c.get("canonicalUrl") or {}).get("url") or (c.get("clickThroughUrl") or {}).get("url") or "")
        out.append([(c.get("pubDate") or "")[:16].replace("T", " "), title.strip(),
                    (c.get("provider") or {}).get("displayName") or "", url, c.get("contentType") or ""])
    return out


# ---------------------------------------------------------------- parse

def stmt_table(ts, prefix, mapping, keep):
    """rows for one period type: {"d": [dates oldest->newest], key: [values]}"""
    dates = sorted({d for name in mapping.values() for d in (ts.get(prefix + name) or {})})
    dates = dates[-keep:]
    if not dates:
        return None
    t = {"d": dates}
    for short, name in mapping.items():
        s = ts.get(prefix + name)
        if not s:
            continue
        vals = [s.get(d) for d in dates]
        if all(v is None for v in vals):
            continue
        t[short] = [None if v is None else (rnd(v, 4) if short in PER_SHARE else mil(v)) for v in vals]
    return t


def merge_tables(*tables):
    tables = [t for t in tables if t]
    if not tables:
        return None
    dates = sorted({d for t in tables for d in t["d"]})
    out = {"d": dates}
    for t in tables:
        idx = {d: i for i, d in enumerate(t["d"])}
        for k, vals in t.items():
            if k == "d":
                continue
            out[k] = [vals[idx[d]] if d in idx else None for d in dates]
    return out


def parse_statements(ts_flow, ts_bal):
    fs = {}
    fs["a"] = merge_tables(stmt_table(ts_flow, "annual", {**INC, **CF}, 6), stmt_table(ts_bal, "annual", BAL, 6))
    fs["q"] = merge_tables(stmt_table(ts_flow, "quarterly", {**INC, **CF}, 8), stmt_table(ts_bal, "quarterly", BAL, 8))
    trailing = {}
    for short, name in {**INC, **CF}.items():
        s = ts_flow.get("trailing" + name)
        if s:
            d = max(s)
            trailing[short] = [d, rnd(s[d], 4) if short in PER_SHARE else mil(s[d])]
    fs["t"] = trailing
    teps = ts_flow.get("trailingDilutedEPS") or {}
    return {k: v for k, v in fs.items() if v}, [[d, rnd(teps[d], 4)] for d in sorted(teps)]


def parse_valuation(ts_val):
    dates = sorted({d for name in VAL.values() for d in (ts_val.get("monthly" + name) or {})})
    vm = {"d": dates} if dates else {}
    for short, name in VAL.items():
        s = ts_val.get("monthly" + name) or {}
        if s:
            vm[short] = [None if s.get(d) is None else (mil(s[d]) if short in ("mc", "ev") else rnd(s[d], 3)) for d in dates]
    cur = {}
    for short, name in VAL.items():
        s = ts_val.get("trailing" + name) or {}
        if s:
            d = max(s)
            cur[short] = [d, mil(s[d]) if short in ("mc", "ev") else rnd(s[d], 3)]
    return vm, cur


def parse_chart(res):
    if not res:
        return None, [], []
    tss = res.get("timestamp") or []
    closes = (((res.get("indicators") or {}).get("quote") or [{}])[0].get("close")) or []
    months, vals = [], []
    for t, c in zip(tss, closes):
        if c is None:
            continue
        m = datetime.fromtimestamp(int(t), tz=timezone.utc).strftime("%Y-%m")
        if months and months[-1] == m:
            vals[-1] = rnd(c, 4)
        else:
            months.append(m)
            vals.append(rnd(c, 4))
    pm = {"s": months[0], "m": months, "c": vals} if months else None
    ev = res.get("events") or {}
    cutoff = (date.today() - timedelta(days=365 * 12)).isoformat()
    divs = sorted(([iso(v.get("date") or k), rnd(v.get("amount"), 6)] for k, v in (ev.get("dividends") or {}).items()),
                  key=lambda x: x[0] or "")
    divs = [d for d in divs if d[0] and d[0] >= cutoff]
    spl = sorted(([iso(v.get("date") or k), v.get("splitRatio") or f"{v.get('numerator')}:{v.get('denominator')}"]
                  for k, v in (ev.get("splits") or {}).items()), key=lambda x: x[0] or "")
    return pm, divs, spl


def parse_equity(sym, qs):
    ap, sd, fd = qs.get("assetProfile") or {}, qs.get("summaryDetail") or {}, qs.get("financialData") or {}
    ks, pr, ce = qs.get("defaultKeyStatistics") or {}, qs.get("price") or {}, qs.get("calendarEvents") or {}
    rec = {}
    loc = ", ".join(x for x in [ap.get("city"), ap.get("state"), ap.get("country")] if x)
    offs = []
    for o in (ap.get("companyOfficers") or [])[:8]:
        offs.append([o.get("name"), o.get("title"), rv(o.get("age")), rnd(o.get("totalPay"), 0)])
    rec["p"] = {k: v for k, v in {
        "n": pr.get("longName") or pr.get("shortName"), "sec": ap.get("sector"), "ind": ap.get("industry"),
        "emp": rv(ap.get("fullTimeEmployees")), "web": ap.get("website"), "ir": ap.get("irWebsite"), "loc": loc,
        "sum": ap.get("longBusinessSummary"), "ex": pr.get("exchangeName"), "cur": pr.get("currency"),
        "fcur": fd.get("financialCurrency"), "fye": iso(rv(ks.get("lastFiscalYearEnd"))),
        "mrq": iso(rv(ks.get("mostRecentQuarter"))), "off": offs or None,
        "gov": [rv(ap.get(k)) for k in ("auditRisk", "boardRisk", "compensationRisk", "shareHolderRightsRisk", "overallRisk")]
        if ap.get("overallRisk") is not None else None,
    }.items() if v not in (None, "", [])}
    k = {
        "px": rnd(pr.get("regularMarketPrice") or fd.get("currentPrice"), 4), "pxd": iso(rv(pr.get("regularMarketTime"))),
        "mc": mil(sd.get("marketCap") or pr.get("marketCap")), "ev": mil(ks.get("enterpriseValue")),
        "sh": mil(ks.get("sharesOutstanding")), "fl": mil(ks.get("floatShares")),
        "pe": rnd(sd.get("trailingPE"), 3), "fpe": rnd(sd.get("forwardPE") or ks.get("forwardPE"), 3),
        "peg": rnd(ks.get("pegRatio"), 3), "ps": rnd(sd.get("priceToSalesTrailing12Months"), 3),
        "pb": rnd(ks.get("priceToBook"), 3), "evr": rnd(ks.get("enterpriseToRevenue"), 3),
        "eve": rnd(ks.get("enterpriseToEbitda"), 3), "eps": rnd(ks.get("trailingEps"), 4),
        "feps": rnd(ks.get("forwardEps"), 4), "bv": rnd(ks.get("bookValue"), 4), "beta": rnd(sd.get("beta") or ks.get("beta"), 3),
        "h52": rnd(sd.get("fiftyTwoWeekHigh"), 4), "l52": rnd(sd.get("fiftyTwoWeekLow"), 4), "ath": rnd(sd.get("allTimeHigh"), 4),
        "dy": rnd(sd.get("dividendYield"), 5), "dr": rnd(sd.get("dividendRate"), 4),
        "tdr": rnd(sd.get("trailingAnnualDividendRate"), 4), "pay": rnd(sd.get("payoutRatio"), 4),
        "d5y": rnd(sd.get("fiveYearAvgDividendYield"), 3), "exd": iso(rv(sd.get("exDividendDate") or ce.get("exDividendDate"))),
        "dvd": iso(rv(ce.get("dividendDate"))),
        "rev": mil(fd.get("totalRevenue")), "gp": mil(fd.get("grossProfits")), "ebitda": mil(fd.get("ebitda")),
        "ni": mil(ks.get("netIncomeToCommon")), "ocf": mil(fd.get("operatingCashflow")), "fcf": mil(fd.get("freeCashflow")),
        "cash": mil(fd.get("totalCash")), "debt": mil(fd.get("totalDebt")),
        "gm": rnd(fd.get("grossMargins"), 4), "om": rnd(fd.get("operatingMargins"), 4), "pm": rnd(fd.get("profitMargins"), 4),
        "em": rnd(fd.get("ebitdaMargins"), 4), "roa": rnd(fd.get("returnOnAssets"), 4), "roe": rnd(fd.get("returnOnEquity"), 4),
        "cr": rnd(fd.get("currentRatio"), 3), "qr": rnd(fd.get("quickRatio"), 3), "de": rnd(fd.get("debtToEquity"), 2),
        "rg": rnd(fd.get("revenueGrowth"), 4), "eg": rnd(fd.get("earningsGrowth"), 4), "eqg": rnd(ks.get("earningsQuarterlyGrowth"), 4),
        "si": rnd(ks.get("shortPercentOfFloat"), 4), "sr": rnd(ks.get("shortRatio"), 2),
        "ins": rnd(ks.get("heldPercentInsiders"), 4), "inst": rnd(ks.get("heldPercentInstitutions"), 4),
        "tgt": [rnd(fd.get(x), 2) for x in ("targetMeanPrice", "targetMedianPrice", "targetHighPrice", "targetLowPrice")],
        "rm": rnd(fd.get("recommendationMean"), 3), "rk": fd.get("recommendationKey"), "na": rv(fd.get("numberOfAnalystOpinions")),
        "av": rv(sd.get("averageVolume")), "w52": rnd(ks.get("52WeekChange"), 4), "sp52": rnd(ks.get("SandP52WeekChange"), 4),
        "lsd": iso(rv(ks.get("lastSplitDate"))), "lsf": ks.get("lastSplitFactor"),
    }
    if all(v is None for v in k["tgt"]):
        k["tgt"] = None
    rec["k"] = {a: b for a, b in k.items() if b is not None}

    # earnings: history (reported), next date + consensus, estimate trends
    e = {}
    ec = (qs.get("earnings") or {}).get("earningsChart") or {}
    hist = []
    for x in ec.get("quarterly") or []:
        try:
            sp = float(rv(x.get("surprisePct")))
        except (TypeError, ValueError):
            sp = None
        hist.append([iso(x.get("periodEndDate")), x.get("fiscalQuarter"), x.get("calendarQuarter") or x.get("date"),
                     rnd(x.get("actual"), 4), rnd(x.get("estimate"), 4), rnd(sp, 2), iso(x.get("reportedDate"))])
    if not hist:
        for x in (qs.get("earningsHistory") or {}).get("history") or []:
            sp = rv(x.get("surprisePercent"))
            hist.append([iso(rv(x.get("quarter"))), None, None, rnd(x.get("epsActual"), 4), rnd(x.get("epsEstimate"), 4),
                         rnd(sp * 100 if sp is not None else None, 2), None])
    if hist:
        e["h"] = hist
    fc = (qs.get("earnings") or {}).get("financialsChart") or {}
    if fc.get("quarterly"):
        e["fq"] = [[x.get("date"), x.get("fiscalQuarter"), mil(x.get("revenue")), mil(x.get("earnings"))] for x in fc["quarterly"]]
    ce_e = ce.get("earnings") or {}
    if ce_e.get("earningsDate"):
        e["nx"] = {"d": iso(ce_e["earningsDate"][0]), "d2": iso(ce_e["earningsDate"][-1]) if len(ce_e["earningsDate"]) > 1 else None,
                   "est": bool(ce_e.get("isEarningsDateEstimate")),
                   "eps": [rnd(ce_e.get("earningsAverage"), 4), rnd(ce_e.get("earningsLow"), 4), rnd(ce_e.get("earningsHigh"), 4)],
                   "rev": [mil(ce_e.get("revenueAverage")), mil(ce_e.get("revenueLow")), mil(ce_e.get("revenueHigh"))]}
    if ec.get("currentFiscalQuarter"):
        e["cfq"] = ec.get("currentFiscalQuarter")
    tr = []
    for x in (qs.get("earningsTrend") or {}).get("trend") or []:
        ee, re_ = x.get("earningsEstimate") or {}, x.get("revenueEstimate") or {}
        et, er = x.get("epsTrend") or {}, x.get("epsRevisions") or {}
        tr.append([x.get("period"), x.get("endDate"),
                   rnd(ee.get("avg"), 4), rnd(ee.get("low"), 4), rnd(ee.get("high"), 4), rnd(ee.get("yearAgoEps"), 4),
                   rv(ee.get("numberOfAnalysts")), rnd(ee.get("growth"), 4),
                   mil(re_.get("avg")), mil(re_.get("low")), mil(re_.get("high")), mil(re_.get("yearAgoRevenue")),
                   rv(re_.get("numberOfAnalysts")), rnd(re_.get("growth"), 4),
                   rnd(et.get("7daysAgo"), 4), rnd(et.get("30daysAgo"), 4), rnd(et.get("60daysAgo"), 4), rnd(et.get("90daysAgo"), 4),
                   rv(er.get("upLast7days")), rv(er.get("upLast30days")), rv(er.get("downLast7Days")), rv(er.get("downLast30days"))])
    if tr:
        e["tr"] = tr
    it = (qs.get("indexTrend") or {}).get("estimates") or []
    if it:
        e["idx"] = [[x.get("period"), rnd(x.get("growth"), 4)] for x in it]
    rec["e"] = e

    rt = (qs.get("recommendationTrend") or {}).get("trend") or []
    if rt:
        rec["rt"] = [[x.get("period"), x.get("strongBuy"), x.get("buy"), x.get("hold"), x.get("sell"), x.get("strongSell")] for x in rt]
    ud = (qs.get("upgradeDowngradeHistory") or {}).get("history") or []
    if ud:
        rec["ud"] = [[iso(x.get("epochGradeDate")), x.get("firm"), x.get("toGrade"), x.get("fromGrade"), x.get("action"),
                      x.get("priceTargetAction"), rnd(x.get("currentPriceTarget"), 2), rnd(x.get("priorPriceTarget"), 2)]
                     for x in ud[:20]]
    mh = qs.get("majorHoldersBreakdown") or {}
    own = {"ins": rnd(mh.get("insidersPercentHeld"), 4), "inst": rnd(mh.get("institutionsPercentHeld"), 4),
           "instf": rnd(mh.get("institutionsFloatPercentHeld"), 4), "n": rv(mh.get("institutionsCount"))}
    for key, mod in (("top", "institutionOwnership"), ("fund", "fundOwnership")):
        rows = (qs.get(mod) or {}).get("ownershipList") or []
        if rows:
            own[key] = [[x.get("organization"), rnd(x.get("pctHeld"), 5), mil(x.get("position")), mil(x.get("value")),
                         rnd(x.get("pctChange"), 4), iso(rv(x.get("reportDate")))] for x in rows[:10]]
    rec["own"] = {a: b for a, b in own.items() if b is not None}
    itx = (qs.get("insiderTransactions") or {}).get("transactions") or []
    if itx:
        rec["itx"] = [[iso(rv(x.get("startDate"))), x.get("filerName"), x.get("filerRelation"),
                       re.sub(r"\s*per share\.?$", "", x.get("transactionText") or ""),
                       rv(x.get("shares")), rv(x.get("value")), x.get("ownership")] for x in itx[:24]]
    ih = (qs.get("insiderHolders") or {}).get("holders") or []
    if ih:
        rec["ih"] = [[x.get("name"), x.get("relation"), x.get("transactionDescription"), iso(rv(x.get("latestTransDate"))),
                      rv(x.get("positionDirect"))] for x in ih[:12]]
    ns = qs.get("netSharePurchaseActivity") or {}
    if ns:
        rec["nspa"] = [rv(ns.get(x)) for x in ("buyInfoCount", "buyInfoShares", "sellInfoCount", "sellInfoShares",
                                              "netInfoCount", "netInfoShares", "netPercentInsiderShares",
                                              "totalInsiderShares", "netInstBuyingPercent")] + [ns.get("period")]
    return rec


def parse_etf(sym, qs):
    sp, sd, ks, pr = qs.get("summaryProfile") or {}, qs.get("summaryDetail") or {}, qs.get("defaultKeyStatistics") or {}, qs.get("price") or {}
    fp, th = qs.get("fundProfile") or {}, qs.get("topHoldings") or {}
    rec = {"p": {k: v for k, v in {"n": pr.get("longName") or pr.get("shortName"), "sum": sp.get("longBusinessSummary"),
                                   "ex": pr.get("exchangeName"), "cur": pr.get("currency"), "fam": fp.get("family"),
                                   "cat": fp.get("categoryName") or ks.get("category")}.items() if v}}
    fees = (fp.get("feesExpensesInvestment") or {})
    rec["k"] = {a: b for a, b in {
        "px": rnd(pr.get("regularMarketPrice"), 4), "pxd": iso(rv(pr.get("regularMarketTime"))),
        "aum": mil(sd.get("totalAssets")), "pe": rnd(sd.get("trailingPE"), 3), "dy": rnd(sd.get("yield"), 5),
        "tdr": rnd(sd.get("trailingAnnualDividendRate"), 4), "er": rnd(fees.get("annualReportExpenseRatio"), 5),
        "h52": rnd(sd.get("fiftyTwoWeekHigh"), 4), "l52": rnd(sd.get("fiftyTwoWeekLow"), 4), "beta": rnd(ks.get("beta3Year"), 3),
        "av": rv(sd.get("averageVolume")), "ytd": rnd(ks.get("ytdReturn"), 4), "r3y": rnd(ks.get("threeYearAverageReturn"), 4),
        "r5y": rnd(ks.get("fiveYearAverageReturn"), 4)}.items() if b is not None}
    hold = [[h.get("symbol"), h.get("holdingName"), rnd(h.get("holdingPercent"), 5)] for h in th.get("holdings") or []]
    sw = []
    for d in th.get("sectorWeightings") or []:
        for k, v in d.items():
            sw.append([k, rnd(v, 5)])
    rec["etf"] = {"hold": hold, "sw": sw}
    return rec


QS_KEYS = ("p", "k", "e", "rt", "ud", "own", "itx", "ih", "nspa", "etf")
FULL_KEYS = ("fs", "teps", "vm", "vc", "pm", "dv", "sp")


def stamp():
    return now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_record(sym, is_etf, old, want):
    """Refresh the parts of one record that are due. want: subset of {"qs", "full", "news"}."""
    rec = dict(old or {})
    rec["t"], rec["q"] = sym, "ETF" if is_etf else "EQUITY"
    if "qs" in want:
        if is_etf:
            try:
                qs = quote_summary(sym, ETF_MODULES)
            except RateLimited:
                raise
            except Exception:
                qs = quote_summary(sym, [m for m in ETF_MODULES if m != "topHoldings"])
            part = parse_etf(sym, qs)
        else:
            part = parse_equity(sym, quote_summary(sym, MODULES))
        for k in QS_KEYS:
            rec.pop(k, None)
        rec.update(part)
        rec["at_qs"] = stamp()
    if "full" in want:
        part = {}
        if not is_etf:
            flow = list(INC.values()) + list(CF.values())
            ts_flow = timeseries(sym, [("annual", flow), ("quarterly", flow), ("trailing", flow)])
            ts_bal = timeseries(sym, [("annual", list(BAL.values())), ("quarterly", list(BAL.values())),
                                      ("monthly", list(VAL.values())), ("trailing", list(VAL.values()))])
            fs, teps = parse_statements(ts_flow, ts_bal)
            part["fs"] = fs
            if teps:
                part["teps"] = teps
            vm, vcur = parse_valuation(ts_bal)
            if vm:
                part["vm"] = vm
            if vcur:
                part["vc"] = vcur
        pm, divs, spl = parse_chart(chart_monthly(sym))
        if pm:
            part["pm"] = {"s": pm["s"], "c": pm["c"]}
        if divs:
            part["dv"] = divs
        if spl:
            part["sp"] = spl
        for k in FULL_KEYS:
            rec.pop(k, None)
        rec.update(part)
        rec["at_full"] = stamp()
    if "news" in want:
        rec["nw"] = news(sym)
        rec["at_news"] = stamp()
    rec["at"] = max(x for x in (rec.get("at_qs"), rec.get("at_full"), rec.get("at_news")) if x)
    return rec


# ---------------------------------------------------------------- phase 1

def load_universe():
    import csv
    path = PREV / "universe.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    return rows


def load_store():
    p = PREV / STORE
    if p.exists():
        try:
            with gzip.open(p, "rt", encoding="utf-8") as f:
                store = json.load(f)
            for rec in store.get("tickers", {}).values():       # records from before the refresh tiers
                if rec.get("at") and not rec.get("at_qs"):
                    rec["at_qs"] = rec["at_full"] = rec["at_news"] = rec["at"]
            return store
        except Exception as e:
            print(f"store unreadable ({e}); starting fresh", flush=True)
    return {"v": 1, "tickers": {}}


def save_store(store):
    OUT.mkdir(exist_ok=True)
    tmp = OUT / (STORE + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(store, f, separators=(",", ":"), ensure_ascii=False)
    tmp.replace(OUT / STORE)


FULL_DAYS = float(os.environ.get("FUND_FULL_DAYS", "6"))       # statements / chart refresh cadence


def age_h(ts, now):
    if not ts:
        return 1e9
    return (now - datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 3600


def due_order(universe, store, calendar):
    """[(sym, want)] in priority order: missing records, post-earnings refreshes, then stalest quotes."""
    now = now_utc()
    today = now.date()
    items = []
    for r in universe:
        t = r["ticker"]
        if ONLY and t not in ONLY:
            continue
        rec = store["tickers"].get(t)
        if ONLY or rec is None or not rec.get("at_qs"):
            items.append((0, -1e9, t, {"qs", "full", "news"}))
            continue
        a_qs, a_full, a_news = age_h(rec.get("at_qs"), now), age_h(rec.get("at_full"), now), age_h(rec.get("at_news"), now)
        nx = (calendar.get(t) or {}).get("d") or ((rec.get("e") or {}).get("nx") or {}).get("d")
        full_at = rec.get("at_full")
        reported = bool(nx and full_at) and full_at[:10] <= nx < today.isoformat()
        big = (float(r.get("market_cap") or 0) >= 2e10) or str(r.get("sp500")) == "1"
        want = set()
        if a_qs >= FRESH_H or reported:
            want.add("qs")
        if reported or a_full >= FULL_DAYS * 24:
            want.add("full")
        if a_news >= (FRESH_H if big else 72):
            want.add("news")
        if not want:
            STATUS["skipped_fresh"] += 1
            continue
        items.append((1 if reported else 2, -max(a_qs, a_full / 24), t, want))
    items.sort(key=lambda x: (x[0], x[1], x[2]))
    return [(t, w) for _, _, t, w in items]


def phase_fetch(universe, store, calendar):
    etfs = {r["ticker"] for r in universe if str(r.get("etf")) == "1"}
    order = due_order(universe, store, calendar)
    n_full = sum(1 for _, w in order if "full" in w)
    print(f"fetch: {len(order)} due of {len(universe)} ({n_full} full); budget {BUDGET}s, {THREADS} threads, "
          f"{1 / PACE.gap:.1f} req/s", flush=True)
    disable_cookie_cache()
    t0 = time.time()
    pause_until = [0.0]
    strikes = [0]
    stop = threading.Event()
    it = iter(order)

    def blocked(sym, e):
        """Yahoo pushed back: pause everyone, start a fresh session, give up after repeated strikes."""
        with LOCK:
            STATUS["rate_limited"] += 1
            strikes[0] += 1
            k = strikes[0]
            pause = min(600, 30 * 2 ** (k - 1))
            if pause_until[0] < time.time() + pause:
                pause_until[0] = time.time() + pause
            if k >= 6:
                STATUS["stopped"] = "blocked by Yahoo"
                stop.set()
        print(f"  blocked at {sym} ({e}); pause {pause}s, new session (strike {k})", flush=True)
        if stop.is_set():
            return
        time.sleep(max(0, pause_until[0] - time.time()))
        try:
            reset_session()
        except Exception as ex:
            print(f"  session reset failed: {ex}", flush=True)

    def worker():
        while not stop.is_set():
            with LOCK:
                nxt = next(it, None)
            if nxt is None:
                return
            sym, want = nxt
            if time.time() - t0 > BUDGET:
                STATUS["stopped"] = "time budget"
                stop.set()
                return
            wait = pause_until[0] - time.time()
            if wait > 0:
                time.sleep(wait)
            for attempt in range(3):
                if stop.is_set():
                    return
                try:
                    rec = fetch_record(sym, sym in etfs, store["tickers"].get(sym), want)
                    with LOCK:
                        store["tickers"][sym] = rec
                        STATUS["fetched"] += 1
                        strikes[0] = 0
                        n = STATUS["fetched"]
                    if n % 100 == 0:
                        print(f"  {n} fetched, {time.time() - t0:.0f}s", flush=True)
                    break
                except RateLimited as e:
                    blocked(sym, e)
                except Exception as e:
                    with LOCK:
                        STATUS["failed"] += 1
                        if len(STATUS["errors"]) < 60:
                            STATUS["errors"].append(f"{sym}: {type(e).__name__}: {e}"[:220])
                    break

    with ThreadPoolExecutor(max_workers=THREADS) as pool:
        for _ in range(THREADS):
            pool.submit(worker)
    STATUS["fetch_sec"] = round(time.time() - t0, 1)
    STATUS["due"] = len(order)
    print(f"fetch done: {STATUS['fetched']} ok, {STATUS['failed']} failed, {STATUS['rate_limited']} blocks, "
          f"{STATUS['fetch_sec']}s, stopped={STATUS['stopped']}", flush=True)


# ---------------------------------------------------------------- phase 2

SECTOR_KO = {"Technology": "기술", "Healthcare": "헬스케어", "Financial Services": "금융", "Consumer Cyclical": "경기소비재",
             "Communication Services": "커뮤니케이션", "Industrials": "산업재", "Consumer Defensive": "필수소비재",
             "Energy": "에너지", "Utilities": "유틸리티", "Real Estate": "부동산", "Basic Materials": "소재"}
SECTORS = list(SECTOR_KO)
# Nasdaq screener sectors (universe.csv) -> Yahoo sectors, for tickers without a Yahoo record yet
NASDAQ_SECTOR = {"Technology": "Technology", "Health Care": "Healthcare", "Finance": "Financial Services",
                 "Consumer Discretionary": "Consumer Cyclical", "Telecommunications": "Communication Services",
                 "Industrials": "Industrials", "Consumer Staples": "Consumer Defensive", "Energy": "Energy",
                 "Utilities": "Utilities", "Real Estate": "Real Estate", "Basic Materials": "Basic Materials"}


def load_prices():
    """prices.parquet -> {ticker: (dates list, closes list)} and the global sorted date list"""
    path = PREV / "prices.parquet"
    import pandas as pd
    try:
        df = pd.read_parquet(path, columns=["date", "ticker", "close"])
    except Exception:
        duck = os.environ.get("DUCKDB_BIN")
        if not duck:
            raise
        import subprocess
        csv_path = OUT / "_prices.csv"
        subprocess.run([duck, "-c", f"COPY (SELECT date, ticker, close FROM read_parquet('{path}')) TO '{csv_path}' (HEADER)"],
                       check=True)
        df = pd.read_csv(csv_path)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    df = df.sort_values(["ticker", "date"])
    dates = sorted(df["date"].unique().tolist())
    out = {}
    for t, g in df.groupby("ticker", sort=False):
        out[t] = (g["date"].tolist(), g["close"].astype(float).tolist())
    return dates, out


def delta_cents(closes):
    out, prev = [], 0
    for c in closes:
        v = int(round(c * 100))
        out.append(v - prev)
        prev = v
    return out


def pct(a, b):
    try:
        if a is None or b is None or b == 0:
            return None
        return round((a / b - 1) * 100, 2)
    except (TypeError, ZeroDivisionError):
        return None


def ret_over(dates, closes, days_back):
    if not closes:
        return None
    last_d = date.fromisoformat(dates[-1])
    target = (last_d - timedelta(days=days_back)).isoformat()
    base = None
    for d, c in zip(dates, closes):
        if d <= target:
            base = c
        else:
            break
    return pct(closes[-1], base)


def shard_of(t):
    return zlib.crc32(t.encode()) % NSHARDS


def screener_row(t, urow, rec, px, calendar):
    """one universe row: identity, price stats, fundamentals scaled to the latest close"""
    k = (rec or {}).get("k") or {}
    p = (rec or {}).get("p") or {}
    e = (rec or {}).get("e") or {}
    dts, cls = px if px else ([], [])
    close = cls[-1] if cls else k.get("px")
    scale = (close / k["px"]) if (close and k.get("px")) else 1.0
    mc = k.get("mc")
    mc_now = mc * scale if mc else (float(urow["market_cap"]) / 1e6 if urow.get("market_cap") else None)
    eps, feps, bv = k.get("eps"), k.get("feps"), k.get("bv")
    rev, ebitda, fcf = k.get("rev"), k.get("ebitda"), k.get("fcf")
    debt, cash = k.get("debt") or 0, k.get("cash") or 0
    ev_now = (mc_now + debt - cash) if mc_now and (k.get("debt") is not None or k.get("cash") is not None) else None
    tgt = (k.get("tgt") or [None])[0]
    nx = (calendar.get(t) or {}).get("d") or (e.get("nx") or {}).get("d")
    sec = p.get("sec") or NASDAQ_SECTOR.get(urow.get("sector") or "")
    last_rep = (e.get("h") or [None])[-1]
    ch = pct(cls[-1], cls[-2]) if len(cls) >= 2 else None
    hi = max(cls[-252:]) if cls else None
    row = {
        "t": t, "n": p.get("n") or urow.get("name") or t, "q": (rec or {}).get("q") or ("ETF" if str(urow.get("etf")) == "1" else "EQUITY"),
        "s": SECTORS.index(sec) if sec in SECTOR_KO else -1, "i": p.get("ind") or urow.get("industry") or "",
        "sh": shard_of(t), "sp5": int(str(urow.get("sp500")) == "1"), "cty": urow.get("country") or "",
        "c": rnd(close, 4), "ch": ch,
        "r1m": ret_over(dts, cls, 30), "r3m": ret_over(dts, cls, 91), "r6m": ret_over(dts, cls, 182), "r1y": ret_over(dts, cls, 365),
        "ytd": None, "fh": pct(close, hi) if hi else None,
        "mc": round(mc_now / 1000, 3) if mc_now else None,                       # $ billions
        "pe": rnd(close / eps, 2) if (close and eps and eps > 0) else None,
        "fpe": rnd(close / feps, 2) if (close and feps and feps > 0) else None,
        "ps": rnd(mc_now / rev, 2) if (mc_now and rev and rev > 0) else None,
        "pb": rnd(close / bv, 2) if (close and bv and bv > 0) else None,
        "eve": rnd(ev_now / ebitda, 2) if (ev_now and ebitda and ebitda > 0) else None,
        "peg": k.get("peg"), "dy": rnd(k["dy"] * 100, 2) if k.get("dy") is not None else None,
        "rg": rnd(k["rg"] * 100, 1) if k.get("rg") is not None else None,
        "eg": rnd(k["eg"] * 100, 1) if k.get("eg") is not None else None,
        "gm": rnd(k["gm"] * 100, 1) if k.get("gm") is not None else None,
        "om": rnd(k["om"] * 100, 1) if k.get("om") is not None else None,
        "pm": rnd(k["pm"] * 100, 1) if k.get("pm") is not None else None,
        "roe": rnd(k["roe"] * 100, 1) if k.get("roe") is not None else None,
        "de": k.get("de"), "cr": k.get("cr"),
        "fcfy": rnd(fcf / mc_now * 100, 2) if (fcf is not None and mc_now) else None,
        "rm": k.get("rm"), "up": pct(tgt, close) if (tgt and close) else None, "na": k.get("na"),
        "nx": nx, "beta": k.get("beta"), "si": rnd(k["si"] * 100, 2) if k.get("si") is not None else None,
        "lr": last_rep[6] if last_rep else None, "ls": last_rep[5] if last_rep else None,
        "at": (rec or {}).get("at", "")[:10] or None,
    }
    if dts:
        y0 = f"{dts[-1][:4]}-01-01"
        base = None
        for d, c in zip(dts, cls):
            if d < y0:
                base = c
            else:
                break
        row["ytd"] = pct(cls[-1], base)
    if row["q"] == "ETF":
        row["dy"] = rnd(k["dy"] * 100, 2) if k.get("dy") is not None else None
        row["mc"] = round(k["aum"] / 1000, 3) if k.get("aum") else None
    return row


def phase_bundle(universe, store, calendar):
    t0 = time.time()
    dates, prices = load_prices()
    site = OUT / "bundle"
    if site.exists():
        shutil.rmtree(site)
    (site / "data" / "f").mkdir(parents=True)
    di = {d: i for i, d in enumerate(dates)}
    cols, shards = {}, [dict() for _ in range(NSHARDS)]
    for urow in universe:
        t = urow["ticker"]
        rec = store["tickers"].get(t)
        px = prices.get(t)
        row = screener_row(t, urow, rec, px, calendar)
        for k, v in row.items():
            cols.setdefault(k, []).append(v)
        full = dict(rec or {"t": t, "q": row["q"], "p": {"n": row["n"]}})
        if px:
            full["px"] = {"i0": di[px[0][0]], "c": delta_cents(px[1])}
        shards[row["sh"]][t] = full
    n = len(cols["t"])
    bench = {}
    for b in ("SPY", "QQQ"):
        if b in prices:
            bench[b] = {"i0": di[prices[b][0][0]], "c": delta_cents(prices[b][1])}
    uni = {"v": 1, "dates": dates, "sectors": [[s, SECTOR_KO[s]] for s in SECTORS], "bench": bench, "cols": cols, "n": n}
    (site / "data" / "universe.json").write_text(json.dumps(uni, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    sizes = []
    for i, sh in enumerate(shards):
        s = json.dumps(sh, separators=(",", ":"), ensure_ascii=False)
        (site / "data" / "f" / f"{i:02d}.json").write_text(s, encoding="utf-8")
        sizes.append(len(s))
    # earnings calendar for universe tickers: Nasdaq first, Yahoo's own date as fallback
    cal = {}
    uni_set = set(cols["t"])
    today = date.today().isoformat()
    for t, v in calendar.items():
        if t in uni_set and v.get("d") and v["d"] >= today:
            cal[t] = {"d": v["d"], "t": v.get("t") or "", "eps": v.get("eps"), "q": v.get("q"), "n": v.get("n"), "src": "nasdaq"}
    for t in uni_set - set(cal):
        nx = (((store["tickers"].get(t) or {}).get("e") or {}).get("nx") or {})
        if nx.get("d") and nx["d"] >= today:
            eps = (nx.get("eps") or [None])[0]
            cal[t] = {"d": nx["d"], "t": "", "eps": (f"${eps:.2f}" if isinstance(eps, (int, float)) else None),
                      "est": nx.get("est"), "src": "yahoo"}
    (site / "data" / "calendar.json").write_text(json.dumps({"v": 1, "tickers": cal}, separators=(",", ":")), encoding="utf-8")
    macro_src = PREV / "macro.json"
    if macro_src.exists() and macro_src.stat().st_size > 100:
        shutil.copy(macro_src, site / "data" / "macro.json")
    have = sum(1 for t in cols["t"] if store["tickers"].get(t))
    ats = sorted(r["at"] for r in store["tickers"].values() if r.get("at"))
    meta = {"built_at": now_utc().strftime("%Y-%m-%dT%H:%M:%SZ"), "prices_asof": dates[-1] if dates else None,
            "tickers": n, "with_fundamentals": have, "oldest_record": ats[0] if ats else None,
            "newest_record": ats[-1] if ats else None, "shards": NSHARDS, "shard_bytes_max": max(sizes),
            "shard_bytes_total": sum(sizes), "macro": macro_src.exists(), "calendar": len(cal), "fetch": STATUS}
    (site / "data" / "meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    with tarfile.open(OUT / "analysis_bundle.tar.gz", "w:gz") as tar:
        tar.add(site / "data", arcname="data")
    print(f"bundle: {n} tickers ({have} with fundamentals), shards {sum(sizes) / 1e6:.1f} MB "
          f"(max {max(sizes) / 1e3:.0f} KB), {time.time() - t0:.1f}s", flush=True)


def main():
    OUT.mkdir(exist_ok=True)
    STATUS["started_at"] = now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")
    universe = load_universe()
    store = load_store()
    cal_path = PREV / "earnings_calendar.json"
    calendar = json.loads(cal_path.read_text()).get("tickers", {}) if cal_path.exists() else {}
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("all", "fetch"):
        try:
            phase_fetch(universe, store, calendar)
        except Exception:
            STATUS["errors"].append(traceback.format_exc()[-600:])
            print(traceback.format_exc(), flush=True)
        uni_set = {r["ticker"] for r in universe}
        store["tickers"] = {t: r for t, r in store["tickers"].items() if t in uni_set}
        store["updated_at"] = now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")
        save_store(store)
    if mode in ("all", "bundle"):
        phase_bundle(universe, store, calendar)
    (OUT / "fund_status.json").write_text(json.dumps(STATUS, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
