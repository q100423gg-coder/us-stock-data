#!/usr/bin/env python3
"""One-off reachability probe for the 기업 분석 data sources (removed once the collectors are settled).

Writes probe_out/*.json (raw samples) and probe_out/probe.json (what worked), tarred by the workflow.
"""
import json
import time
import traceback
from pathlib import Path

OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
REPORT = {}
DECLARED_UA = "us-stock-data/1.0 (+https://github.com/q100423gg-coder/us-stock-data)"


def step(name):
    def deco(fn):
        t0 = time.time()
        try:
            REPORT[name] = {"ok": True, **(fn() or {})}
        except Exception as e:
            REPORT[name] = {"ok": False, "err": f"{type(e).__name__}: {e}"[:300], "tb": traceback.format_exc()[-800:]}
        REPORT[name]["sec"] = round(time.time() - t0, 1)
        print(name, json.dumps(REPORT[name])[:300], flush=True)
        return fn
    return deco


def save(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, default=str)[:3_000_000])


@step("fred_curl_cffi")
def _():
    from curl_cffi import requests as cr
    r = cr.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2024-01-01", impersonate="chrome", timeout=30)
    return {"status": r.status_code, "len": len(r.text), "head": r.text[:120]}


@step("fred_requests_plain")
def _():
    import requests
    r = requests.get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE", timeout=20)
    return {"status": r.status_code, "len": len(r.text), "head": r.text[:120]}


@step("fred_api_nokey")
def _():
    import requests
    r = requests.get("https://api.stlouisfed.org/fred/series/observations?series_id=UNRATE&file_type=json", timeout=20)
    return {"status": r.status_code, "head": r.text[:200]}


@step("sec_tickers")
def _():
    import requests
    r = requests.get("https://www.sec.gov/files/company_tickers.json", headers={"User-Agent": DECLARED_UA}, timeout=30)
    j = r.json() if r.status_code == 200 else {}
    return {"status": r.status_code, "n": len(j), "head": r.text[:150]}


@step("sec_companyfacts")
def _():
    import requests
    r = requests.get("https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json",
                     headers={"User-Agent": DECLARED_UA, "Accept-Encoding": "gzip, deflate"}, timeout=60)
    out = {"status": r.status_code, "bytes": len(r.content), "head": r.text[:150]}
    if r.status_code == 200:
        j = r.json()
        facts = j.get("facts", {})
        out["taxonomies"] = {k: len(v) for k, v in facts.items()}
        rev = facts.get("us-gaap", {}).get("RevenueFromContractWithCustomerExcludingAssessedTax", {})
        save("sec_msft_revenue.json", rev)
    return out


@step("sec_submissions")
def _():
    import requests
    r = requests.get("https://data.sec.gov/submissions/CIK0000789019.json", headers={"User-Agent": DECLARED_UA}, timeout=30)
    return {"status": r.status_code, "bytes": len(r.content)}


@step("bls_v1")
def _():
    import requests
    r = requests.post("https://api.bls.gov/publicAPI/v1/timeseries/data/",
                      json={"seriesid": ["CUUR0000SA0", "LNS14000000"], "startyear": "2017", "endyear": "2026"}, timeout=30)
    j = r.json()
    save("bls_v1.json", j)
    return {"status": r.status_code, "msg": j.get("status"), "message": j.get("message"),
            "series": [len(s.get("data", [])) for s in (j.get("Results") or {}).get("series", [])]}


@step("treasury_csv")
def _():
    import requests
    url = ("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all"
           "?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv")
    r = requests.get(url, timeout=30, headers={"User-Agent": DECLARED_UA})
    return {"status": r.status_code, "len": len(r.text), "head": r.text[:200]}


@step("dbnomics")
def _():
    import requests
    r = requests.get("https://api.db.nomics.world/v22/series/BLS/ln/LNS14000000?observations=1&format=json", timeout=30)
    return {"status": r.status_code, "len": len(r.text), "head": r.text[:200]}


@step("chicagofed_nfci")
def _():
    import requests
    r = requests.get("https://www.chicagofed.org/-/media/publications/nfci/nfci-data-series-csv.csv", timeout=30,
                     headers={"User-Agent": DECLARED_UA})
    return {"status": r.status_code, "len": len(r.text), "head": r.text[:200]}


YF = {}


@step("yahoo_init")
def _():
    import yfinance as yf
    from yfinance.data import YfData
    YF["yf"], YF["data"] = yf, YfData()
    return {"version": yf.__version__}


MODULES = ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price", "calendarEvents",
           "earnings", "earningsHistory", "earningsTrend", "recommendationTrend", "upgradeDowngradeHistory",
           "majorHoldersBreakdown", "institutionOwnership", "fundOwnership", "insiderTransactions",
           "insiderHolders", "netSharePurchaseActivity", "secFilings", "indexTrend", "industryTrend", "sectorTrend"]


def quote_summary(sym):
    d = YF["data"].get_raw_json(f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}",
                                params={"modules": ",".join(MODULES), "formatted": "false", "symbol": sym,
                                        "lang": "en-US", "region": "US", "corsDomain": "finance.yahoo.com"})
    return d["quoteSummary"]["result"][0]


INC = ["TotalRevenue", "CostOfRevenue", "GrossProfit", "ResearchAndDevelopment", "SellingGeneralAndAdministration",
       "OperatingExpense", "OperatingIncome", "EBITDA", "EBIT", "InterestExpense", "PretaxIncome", "TaxProvision",
       "NetIncome", "NetIncomeCommonStockholders", "DilutedEPS", "BasicEPS", "DilutedAverageShares",
       "NormalizedEBITDA", "TotalExpenses", "DividendPerShare"]
BAL = ["TotalAssets", "CurrentAssets", "CashAndCashEquivalents", "CashCashEquivalentsAndShortTermInvestments",
       "Receivables", "Inventory", "NetPPE", "GoodwillAndOtherIntangibleAssets", "TotalLiabilitiesNetMinorityInterest",
       "CurrentLiabilities", "AccountsPayable", "CurrentDebt", "LongTermDebt", "TotalDebt", "NetDebt",
       "StockholdersEquity", "RetainedEarnings", "OrdinarySharesNumber", "WorkingCapital", "TangibleBookValue",
       "InvestedCapital", "CommonStockEquity"]
CF = ["OperatingCashFlow", "CapitalExpenditure", "FreeCashFlow", "InvestingCashFlow", "FinancingCashFlow",
      "RepurchaseOfCapitalStock", "CashDividendsPaid", "StockBasedCompensation", "DepreciationAndAmortization",
      "IssuanceOfDebt", "RepaymentOfDebt", "ChangeInWorkingCapital", "EndCashPosition"]
VAL = ["MarketCap", "EnterpriseValue", "PeRatio", "ForwardPeRatio", "PegRatio", "PsRatio", "PbRatio",
       "EnterprisesValueRevenueRatio", "EnterprisesValueEBITDARatio"]


def timeseries(sym, prefixes, keys):
    import datetime as dt
    types = ",".join(p + k for p in prefixes for k in keys)
    p1, p2 = int(dt.datetime(2010, 1, 1).timestamp()), int(time.time()) + 86400
    url = f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{sym}"
    r = YF["data"].get(url, params={"symbol": sym, "type": types, "period1": p1, "period2": p2})
    return json.loads(r.text)["timeseries"]["result"]


def ts_summary(res):
    out = {}
    for item in res:
        for k, v in item.items():
            if k in ("meta", "timestamp") or not isinstance(v, list):
                continue
            pts = [p for p in v if p]
            out[k] = [len(pts), pts[0]["asOfDate"] if pts else None, pts[-1]["asOfDate"] if pts else None]
    return out


for sym in ["MSFT", "JPM", "TSM", "INOD", "SPY"]:
    @step(f"yahoo_qs_{sym}")
    def _(sym=sym):
        r = quote_summary(sym)
        save(f"qs_{sym}.json", r)
        return {"modules": {k: (len(json.dumps(v)) if v else 0) for k, v in r.items()}}

    @step(f"yahoo_ts_{sym}")
    def _(sym=sym):
        a = timeseries(sym, ["annual", "quarterly", "trailing"], INC)
        b = timeseries(sym, ["annual", "quarterly"], BAL)
        c = timeseries(sym, ["annual", "quarterly", "trailing"], CF)
        v = timeseries(sym, ["monthly", "quarterly", "trailing"], VAL)
        save(f"ts_{sym}.json", {"inc": a, "bal": b, "cf": c, "val": v})
        return {"inc": ts_summary(a), "bal_n": len(ts_summary(b)), "cf_n": len(ts_summary(c)), "val": ts_summary(v)}

    @step(f"yahoo_chart_{sym}")
    def _(sym=sym):
        r = YF["data"].get(f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}",
                           params={"range": "max", "interval": "1mo", "events": "div,split"})
        j = json.loads(r.text)["chart"]["result"][0]
        ev = j.get("events") or {}
        save(f"chart_{sym}.json", {"meta": j.get("meta"), "n": len(j.get("timestamp") or []),
                                   "first": (j.get("timestamp") or [None])[0], "events": ev})
        return {"n": len(j.get("timestamp") or []), "divs": len(ev.get("dividends") or {}), "splits": len(ev.get("splits") or {})}

    @step(f"yahoo_news_{sym}")
    def _(sym=sym):
        n = YF["yf"].Ticker(sym).get_news(count=10)
        save(f"news_{sym}.json", n)
        return {"n": len(n)}


@step("yahoo_macro_charts")
def _():
    out = {}
    for s in ["^TNX", "^IRX", "^FVX", "^TYX", "^VIX", "DX-Y.NYB", "CL=F", "GC=F", "HG=F", "^GSPC", "BTC-USD", "HYG", "TLT"]:
        try:
            r = YF["data"].get(f"https://query2.finance.yahoo.com/v8/finance/chart/{s}", params={"range": "10y", "interval": "1d"})
            j = json.loads(r.text)["chart"]["result"][0]
            ts = j.get("timestamp") or []
            out[s] = [len(ts), ts[0] if ts else None, j["indicators"]["quote"][0]["close"][-1] if ts else None]
        except Exception as e:
            out[s] = f"{type(e).__name__}: {e}"[:120]
    return out


@step("yahoo_timing_20")
def _():
    """Throughput check: quoteSummary + 3 timeseries calls for 20 tickers, sequential."""
    syms = ["AAPL", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "BRK-B", "LLY", "V",
            "UNH", "XOM", "MA", "COST", "HD", "PG", "JNJ", "NFLX", "CRM", "ORCL"]
    t0, errs = time.time(), []
    for s in syms:
        try:
            quote_summary(s)
            timeseries(s, ["annual", "quarterly", "trailing"], INC + CF)
            timeseries(s, ["annual", "quarterly"], BAL)
            timeseries(s, ["monthly", "trailing"], VAL)
        except Exception as e:
            errs.append(f"{s}: {type(e).__name__}: {e}"[:150])
    return {"sec_per_ticker": round((time.time() - t0) / len(syms), 2), "errors": errs}


(OUT / "probe.json").write_text(json.dumps(REPORT, indent=1, default=str))
print("done")
