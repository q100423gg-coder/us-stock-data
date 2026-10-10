#!/usr/bin/env python3
"""Nightly US daily bars for the 추세 레이더 screener. Runs on GitHub Actions after the US close.

Universe (rebuilt on every run):
  * US-listed common stocks and ADRs with market cap >= MIN_CAP, from the Nasdaq screener list
    that zyhe16/top-us-stock-tickers mirrors every weekday
  * every current S&P 500 member (datasets/s-and-p-500-companies), whatever its size
  * the index and sector ETFs the page shows (ETFS)
  * the ETFs of the page's ETF list, etf_tickers.txt ("TICKER | category | Korean name" per line)
  * anything listed in extra_tickers.txt (one symbol per line, # comments allowed)

Output (out/):
  prices.parquet   date, ticker, open, high, low, close, volume — Yahoo Finance daily bars,
                   split-adjusted (not dividend-adjusted), last DAYS calendar days
  universe.csv     ticker, name, sector, industry, market_cap, country, sp500, etf
  manifest.json    updated_at (UTC), asof (latest session), counts, tickers that failed

Every run re-downloads the whole window, so splits and Yahoo's late corrections of the newest
bar are picked up by the next run. Tickers that fail keep their rows from the previous run
(prev/prices.parquet, downloaded by the workflow), and when Yahoo leaves out a session the previous
run already had, that run's bars for it are kept, so a rerun never moves the data backwards.
"""
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yfinance as yf

MIN_CAP = 2e9
DAYS = 800
BATCH = 50
PAUSE = 2.0
ETFS = ["SPY", "QQQ", "IWM", "DIA", "RSP", "SOXX",
        "XLK", "XLV", "XLF", "XLY", "XLC", "XLI", "XLP", "XLE", "XLU", "XLRE", "XLB"]
TICKERS_CSV = "https://raw.githubusercontent.com/zyhe16/top-us-stock-tickers/main/data/v2/tickers.csv"
SP500_CSV = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
HERE = Path(__file__).resolve().parent
OUT, PREV = HERE / "out", HERE / "prev" / "prices.parquet"
NY = ZoneInfo("America/New_York")

EQUITY = re.compile(r"Common|Ordinary|Depositary|Depository|Registry|\bADS\b|Class [A-Z]\b|Shares|Stock|\bInc\b|Corp|Ltd|plc|N\.V\.|S\.A\.", re.I)
NOT_EQUITY = re.compile(r"\bPreferred\b|\bNotes?\b|Debenture|\bWarrants?\b|\bRights?\b|Corporate Units|Equity Units?|"
                        r"Interest in a Share|\bFund\b|Term Trust|\bETF\b|\bETN\b|Subordinated|Senior", re.I)


def norm(t):
    return str(t).strip().upper().replace(".", "-").replace("/", "-")


def clean_name(s):
    s = str(s)
    for cut in (" American Depositary", " American Depository", " New York Registry", " Common Stock", " Common Shares",
                " Ordinary Shares", " Class A", " Class B", " Class C", " Common Units", " Depositary Shares"):
        i = s.find(cut)
        if i > 0:
            s = s[:i]
    return s.strip(" ,")


def load_etf_list():
    """etf_tickers.txt -> [(ticker, category, Korean name)]; the category goes into universe.csv's sector column."""
    f = HERE / "etf_tickers.txt"
    out, seen = [], set()
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            ln = ln.split("#")[0].strip()
            if not ln:
                continue
            p = [x.strip() for x in ln.split("|")]
            t = norm(p[0])
            if t and t not in seen:
                seen.add(t)
                out.append((t, p[1] if len(p) > 1 and p[1] else None, p[2] if len(p) > 2 and p[2] else t))
    return out


def build_universe():
    t = pd.read_csv(TICKERS_CSV)
    t["ticker"] = t["symbol"].map(norm)
    t = t[~t["symbol"].astype(str).str.contains(r"[\^$\s]", regex=True)]
    name = t["name"].astype(str)
    adr = name.str.contains("American Deposit", case=False)
    common = name.str.contains(EQUITY) & (~name.str.contains(NOT_EQUITY) | adr)
    t = t[common].drop_duplicates("ticker")

    sp = pd.read_csv(SP500_CSV)
    sp["ticker"] = sp["Symbol"].map(norm)
    sp_set = set(sp["ticker"])
    extra_f = HERE / "extra_tickers.txt"
    extra = [norm(x.split("#")[0]) for x in extra_f.read_text().splitlines()] if extra_f.exists() else []
    extra = [x for x in extra if x]

    big = t[(t["market_cap"] >= MIN_CAP) | t["ticker"].isin(sp_set | set(extra))].copy()
    big = big[big["ticker"] != "BRK-A"]                       # same company as BRK-B
    rows = [dict(ticker=r.ticker, name=clean_name(r.name), sector=r.sector, industry=r.industry,
                 market_cap=r.market_cap, country=r.country, sp500=int(r.ticker in sp_set), etf=0)
            for r in big.itertuples()]
    have = {r["ticker"] for r in rows}
    for tk, nm in zip(sp["ticker"], sp["Security"]):          # members missing from the Nasdaq list
        if tk not in have:
            rows.append(dict(ticker=tk, name=nm, sector=None, industry=None,
                             market_cap=None, country="United States", sp500=1, etf=0))
            have.add(tk)
    for x in extra:
        if x not in have:
            rows.append(dict(ticker=x, name=x, sector=None, industry=None, market_cap=None, country=None, sp500=0, etf=0))
            have.add(x)
    for e in ETFS:
        rows.append(dict(ticker=e, name=e, sector=None, industry="ETF", market_cap=None, country="United States", sp500=0, etf=1))
        have.add(e)
    for e, cat, nm in load_etf_list():                         # the page's ETF list
        if e not in have:
            rows.append(dict(ticker=e, name=nm, sector=cat, industry="ETF", market_cap=None, country="United States",
                             sp500=0, etf=1))
            have.add(e)
    return pd.DataFrame(rows).drop_duplicates("ticker")


def frames_from(df, tickers):
    """yf.download result -> {ticker: DataFrame(date, open, high, low, close, volume)}."""
    out = {}
    if df is None or df.empty:
        return out
    multi = isinstance(df.columns, pd.MultiIndex)
    for t in tickers:
        try:
            if multi:
                lv0 = set(df.columns.get_level_values(0))
                sub = df[t] if t in lv0 else df.xs(t, axis=1, level=1)
            else:
                sub = df
        except KeyError:
            continue
        sub = sub.rename(columns=str.lower)
        if "close" not in sub:
            continue
        sub = sub[["open", "high", "low", "close", "volume"]].dropna(subset=["close"])
        sub = sub[sub["close"] > 0]
        if sub.empty:
            continue
        idx = pd.to_datetime(sub.index)
        idx = idx.tz_localize(None) if idx.tz is not None else idx
        f = pd.DataFrame({"date": idx.normalize(), "open": sub["open"].values, "high": sub["high"].values,
                          "low": sub["low"].values, "close": sub["close"].values,
                          "volume": sub["volume"].fillna(0).values})
        o = f["open"].fillna(f["close"])
        f["high"] = np.fmax(np.fmax(f["high"].fillna(f["close"]), o), f["close"])     # Yahoo's newest bar can be
        f["low"] = np.fmin(np.fmin(f["low"].fillna(f["close"]), o), f["close"])       # briefly inconsistent
        f["open"] = o
        out[t] = f
    return out


def download(tickers, start):
    got, failed = {}, []
    for i in range(0, len(tickers), BATCH):
        b = tickers[i:i + BATCH]
        df = None
        for attempt in range(4):
            try:
                df = yf.download(b, start=start, auto_adjust=False, actions=False, group_by="ticker",
                                 threads=True, progress=False, timeout=30)
                break
            except Exception as e:                           # rate limits: back off and retry
                print(f"  batch {i // BATCH}: {type(e).__name__}: {e}; retrying", flush=True)
                time.sleep(20 * (attempt + 1))
        res = frames_from(df, b)
        got.update(res)
        failed += [t for t in b if t not in res]
        print(f"  batch {i // BATCH + 1}/{-(-len(tickers) // BATCH)}: {len(res)}/{len(b)}", flush=True)
        time.sleep(PAUSE)
    return got, failed


def main():
    OUT.mkdir(exist_ok=True)
    uni = build_universe()
    tickers = uni["ticker"].tolist()
    start = (datetime.now(timezone.utc) - timedelta(days=DAYS)).strftime("%Y-%m-%d")
    print(f"universe: {len(tickers)} tickers (>= ${MIN_CAP / 1e9:.0f}B, S&P 500, ETFs, extras); start {start}", flush=True)

    got, failed = download(tickers, start)
    if failed:                                               # one slower second pass for what failed
        print(f"retrying {len(failed)} tickers", flush=True)
        time.sleep(30)
        more, failed = download(failed, start)
        got.update(more)

    # never publish the current New York session before it has closed
    now_ny = datetime.now(NY)
    if now_ny.hour * 60 + now_ny.minute < 16 * 60 + 15:
        today = pd.Timestamp(now_ny.date())
        got = {t: f[f["date"] < today] for t, f in got.items()}

    parts = [f.assign(ticker=t) for t, f in got.items() if len(f)]
    prices = pd.concat(parts, ignore_index=True)
    kept = filled = 0
    if PREV.exists():
        # keep the previous run's rows for today's failures, and the previous run's newer sessions for the rest:
        # Yahoo's daily bars sometimes leave the newest session out for a while (seen around 00:00 UTC), and a
        # rerun must never publish older data than the release already has. Today's bars win where both exist.
        prev = pd.read_parquet(PREV)
        last = prices.groupby("ticker")["date"].max()
        newest = prev["ticker"].map(last)
        keep_f = prev["ticker"].isin(failed)
        keep_n = newest.notna() & (prev["date"] > newest)
        kept, filled = int(prev.loc[keep_f, "ticker"].nunique()), int(prev.loc[keep_n, "ticker"].nunique())
        prices = pd.concat([prices, prev[keep_f | keep_n]], ignore_index=True)
    prices = prices[["date", "ticker", "open", "high", "low", "close", "volume"]]
    prices = prices.drop_duplicates(["ticker", "date"], keep="first").sort_values(["ticker", "date"])
    prices["volume"] = prices["volume"].astype("float64")
    prices.to_parquet(OUT / "prices.parquet", index=False, compression="zstd")

    asof = prices.loc[prices["ticker"] == "SPY", "date"].max()
    uni.to_csv(OUT / "universe.csv", index=False)
    manifest = dict(
        updated_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        asof=asof.strftime("%Y-%m-%d") if pd.notna(asof) else None,
        tickers=int(prices["ticker"].nunique()), rows=int(len(prices)), universe=len(tickers),
        min_cap=MIN_CAP, start=start, failed=len(failed), kept_from_previous=int(kept),
        newer_from_previous=int(filled), failed_tickers=sorted(failed)[:300],
    )
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(json.dumps({k: v for k, v in manifest.items() if k != "failed_tickers"}), flush=True)
    if pd.isna(asof) or len(got) < 0.8 * len(tickers):
        sys.exit("too many tickers failed; not publishing")


if __name__ == "__main__":
    main()
