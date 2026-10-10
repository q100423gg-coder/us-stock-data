#!/usr/bin/env python3
"""Complete holdings of the radar's ETFs, read from the issuers' own holdings files.

Runs in the fundamentals workflow right before the page bundle is built (fundamentals.py reads the result).
  in   prev/universe.csv            the ETFs (etf == 1)
       prev/fund_store.json.gz      Yahoo's fund family of each ETF (which issuer to ask)
       prev/etf_holdings.json.gz    the last run: kept for ETFs that fail today, and for sources not due yet
  out  out/etf_holdings.json.gz     {"v": 1, "updated_at", "etfs": {T: {"src", "d", "n", "r", "at", ...}},
                                     "cusip": {CUSIP: ticker}, "figi": {ISIN: ticker or ""}}
       out/etf_holdings_status.json what happened in this run

Sources (every holding of the fund; daily except Vanguard, which publishes month-end holdings)
  vanguard    investor.vanguard.com/vmf/api/{T}/portfolio-holding/{stock|bond}   json, 500 per page
  ssga        www.ssga.com/library-content/.../holdings-daily-us-en-{t}.xlsx
  proshares   accounts.profunds.com/etfdata/ByFund/{T}-psdlyhld.csv
  direxion    www.direxion.com/holdings/{T}.csv
  globalx     assets.globalxetfs.com/funds/holdings/{t}_full-holdings_{YYYYMMDD}.csv
  vaneck      www.vaneck.com/us/en/investments/{slug}/downloads/holdings/   xlsx
  ark         assets.ark-funds.com/fund-documents/funds-etf-csv/{file}.csv
  jpm         am.jpmorgan.com/FundsMarketingHandler/excel (by CUSIP)   xlsx
  firsttrust  www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker={T}   html table
  roundhill   www.roundhillinvestments.com/assets/data/FilepointRoundhill.40RU.RU_Holdings_{MMDDYYYY}.csv   one csv for
              every Roundhill fund (REX's RAM: assets/data/rex_data/REX_RAM_Holdings_{YYYYMMDD}.csv)
  nport       every other ETF (iShares, Invesco, Schwab ... refuse automated downloads): the fund's latest Form N-PORT
              filing at the SEC (www.sec.gov, quarter-end holdings made public about 60 days later). SEC asks automated
              clients to name a contact in the User-Agent: the SEC_CONTACT secret; without it this source is skipped.
              Tickers for N-PORT holdings come from the CUSIPs the issuers' files carry (kept in the store) and, for
              the rest, from OpenFIGI's free mapping API (25 requests a minute, cached).
Commodity and crypto trusts (gold, bitcoin ...) file no N-PORT: the page says they hold the asset itself.

A holding row: [name, ticker, weight %, kind, exposure %] with trailing empty fields dropped
  weight    % of the fund's net assets; None for swaps and futures, whose market value is only a gain or loss
  kind      "" stock · B bond · C cash, money market, other assets · F fund · S swap · U future · O option · X other
  exposure  notional exposure in % of net assets, for derivatives (leveraged and inverse funds)

  python3 etf_holdings.py [TICKER ...]     (tickers: refetch only these, e.g. for a test)
"""
import csv
import gzip
import html
import io
import json
import math
import os
import re
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
PREV = HERE / "prev"
OUT = HERE / "out"
STORE = "etf_holdings.json.gz"
BUDGET = int(os.environ.get("HOLD_BUDGET_SEC", "900"))
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")

# Yahoo's fund family -> source
FAMILY = {"Vanguard": "vanguard", "State Street Investment Management": "ssga", "SPDR State Street Global Advisors": "ssga",
          "State Street Global Advisors": "ssga", "ProShares": "proshares", "Direxion Funds": "direxion",
          "Direxion": "direxion", "Global X Funds": "globalx", "Global X": "globalx", "VanEck": "vaneck",
          "ARK ETF Trust": "ark", "JPMorgan": "jpm", "First Trust": "firsttrust",
          "Roundhill Investments": "roundhill", "Roundhill Financial": "roundhill", "Amplify ETFs": "amplify"}
BY_TICKER = {"RAM": "roundhill"}               # REX's 2x DRAM fund: its daily file is on Roundhill's site
VANECK = {"SMH": "semiconductor-etf-smh", "OIH": "oil-services-etf-oih", "ESPO": "video-gaming-esports-etf-espo",
          "NLR": "uranium-nuclear-energy-etf-nlr", "GDX": "gold-miners-etf-gdx", "GDXJ": "junior-gold-miners-etf-gdxj",
          "REMX": "rare-earth-strategic-metals-etf-remx", "MOO": "agribusiness-etf-moo", "VNM": "vietnam-etf-vnm"}
ARK = {"ARKK": "ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv", "ARKW": "ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS.csv",
       "ARKG": "ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS.csv", "ARKQ": "ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv",
       "ARKF": "ARK_BLOCKCHAIN_&_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS.csv",
       "ARKX": "ARK_SPACE_&_DEFENSE_INNOVATION_ETF_ARKX_HOLDINGS.csv"}
JPM = {"JEPI": "46641Q332", "JEPQ": "46654Q203", "JPST": "46641Q837"}
NO_LIST = {"GLD", "GLDM"}                      # physical gold trusts: the only holding is gold
# commodity pools, grantor trusts and ETNs: no Form N-PORT to read
NO_NPORT = {"GLD", "GLDM", "IAU", "SLV", "SIVR", "PPLT", "PALL", "IBIT", "ETHA", "FBTC", "FETH", "GBTC", "BTC", "ETHE",
            "ETH", "BITB", "ARKB", "USO", "BNO", "UNG", "CPER", "GSG", "DBC", "DBA", "VXX"}
REFRESH_H = {"vanguard": 70, "nport": 46}      # monthly / quarterly data: ask every few days; others every run
SEC_CONTACT = os.environ.get("SEC_CONTACT", "").strip()
SEC_UA = f"us-stock-data personal-research {SEC_CONTACT}" if SEC_CONTACT else ""
FIGI_BUDGET = int(os.environ.get("HOLD_FIGI_SEC", "150"))
MIN_AGE_H = 18                                 # a second run on the same day keeps what the first one got

STATUS = {"started_at": None, "fetched": 0, "kept": 0, "failed": {}, "no_source": [], "by_src": {}, "stopped": None,
          "requests": 0, "sec": None, "sec_requests": 0, "figi": None}
CUSIPS = {}            # CUSIP -> ticker, learned from the issuers' files (they carry both)


def see_cusip(cusip, ticker):
    c = re.sub(r"[^0-9A-Z]", "", str(cusip or "").upper())
    t = tick(ticker)
    if len(c) == 9 and t and not c.startswith("X9") and re.fullmatch(r"[A-Z0-9.\-/ ]{1,12}", t):
        CUSIPS[c] = t


class Unavailable(Exception):
    pass


# ----------------------------------------------------------------------------------------------- http
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
LAST = {}


def fetch(url, accept="*/*", tries=2, pace=0.6):
    host = url.split("/")[2]
    err = None
    for k in range(tries):
        wait = LAST.get(host, 0) + pace - time.time()
        if wait > 0:
            time.sleep(wait)
        LAST[host] = time.time()
        STATUS["requests"] += 1
        try:
            r = S.get(url, headers={"Accept": accept}, timeout=60)
        except requests.RequestException as e:
            err = f"{type(e).__name__}"
            time.sleep(2 + 3 * k)
            continue
        if r.status_code == 200:
            return r
        err = f"HTTP {r.status_code}"
        if r.status_code in (400, 401, 403, 404, 406, 410):
            break
        time.sleep(2 + 3 * k)
    raise Unavailable(err or "no response")


def is_html(content):
    head = content[:600].lstrip().lower()
    return head.startswith(b"<!doctype html") or head.startswith(b"<html") or b"<html" in head


# ----------------------------------------------------------------------------------------------- values
def num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x) if math.isfinite(x) else None
    s = str(x).strip().replace(",", "").replace("$", "").replace("%", "").strip()
    if s in ("", "-", "--", "—", "N/A", "NA", "nan", "None"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    try:
        v = float(s.strip("()"))
    except ValueError:
        return None
    return -v if neg else v


def iso_date(s):
    s = str(s or "")
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m.group(0)
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    m = re.search(r"(\d{1,2})-([A-Za-z]{3})-(\d{4})", s)
    if m:
        try:
            return datetime.strptime(m.group(0), "%d-%b-%Y").date().isoformat()
        except ValueError:
            return None
    return None


def tick(t):
    t = re.sub(r"\s+", " ", str(t or "")).strip().upper()
    if t in ("", "-", "--", "N/A", "NA", "NAN", "NONE", "CASH", "USD", "-USD CASH-", "OTHER") or t.startswith("$"):
        return ""
    m = re.fullmatch(r"([A-Z0-9./-]+) (UN|UW|UQ|UR|UA|UP|US|UV)", t)      # Bloomberg US exchange codes
    return m.group(1) if m else t


OPT = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\s+[CP]\s?\d|\b(CALL|PUT)\s+(OPTION|OPT|\d)|\bFLEX\s+(OPTION|OPT)|\bOPTIONS?\s+ON\b")
CASH = re.compile(r"MONEY MARKET|MONEY MKT|\bCASH\b|LIQUIDITY|GOVT CASH|TRSRY SECURITIES CASH|TREASURY SECURITIES CASH|"
                  r"\bREPO\b|REPURCHASE|PAYABLE|RECEIVABLE|NET OTHER ASSETS|OTHER ASSETS|NET CURRENT ASSETS|COLLATERAL|"
                  r"US DOLLAR|\bUSD\b|DREYFUS|FEDERATED HERMES|FIDELITY INST|INVESCO GOVERNMENT|GOLDMAN FS|"
                  r"BLACKROCK LIQUIDITY|MARGIN|DEPOSIT|MNY MKT|MONEY MKT|\bTRS?RY\b|\bTRSY\b|FINL SQ|FIN SQ|"
                  r"PRIME MONEY|TREASURY OBLIG|GOVT OBLIG|GOVERNMENT OBLIG|TREASURY PORTFOLIO|TREAS PORTFOLIO", re.I)
BOND = re.compile(r"TREASURY BILL|T-BILL|\bBILL\b|TREASURY NOTE|TREASURY BOND|TREASURY STRIP|\bNOTES?\b|\bBONDS?\b|"
                  r"\bMTN\b|DEBENTURE|MORTGAGE ASSN|MORTGAGE CORP|\bPOOL\b|\bFNMA\b|\bFHLMC\b|\bGNMA\b|\bTBA\b|"
                  r"\d+\.\d+%|\bCOUPON\b|MUNICIPAL|\bREV\b|\bGO\b", re.I)


def kind_of(name, hint=""):
    s = f"{name} {hint}".upper()
    if "SWAP" in s:
        return "S"
    if re.search(r"\bFUTURES?\b|\bFUT\b|E-MINI|EMINI|\bFUTR\b", s):
        return "U"
    if OPT.search(s):
        return "O"
    if CASH.search(s):
        return "C"
    if re.search(r"\b(BOND|FIXED INCOME|DEBT|GOVERNMENT|CORPORATE|SECURITIZED|AGENCY)\b", hint.upper()) or BOND.search(name):
        return "B"
    if re.search(r"\bETF\b|\bFUND\b|\bETN\b", s):
        return "F"
    return ""


def mk(name, ticker, w=None, kind="", e=None):
    name = re.sub(r"\s+", " ", html.unescape(str(name or ""))).strip()[:90]
    if kind in ("B", "C"):
        ticker = ""                           # a bond's ticker is its issuer's: not the stock itself
    out = [name, ticker or "", None if w is None else round(w, 4), kind or "", None if e is None else round(e, 3)]
    while len(out) > 3 and out[-1] in ("", None):
        out.pop()
    return out


def bond_name(name, coupon=None, maturity=None):
    c = num(coupon)
    parts = [str(name or "").strip()]
    if c is not None and c != 0:
        parts.append(f"{c:g}%")
    m = str(maturity or "").strip()
    if m and m not in ("-", "--", "None"):
        if isinstance(maturity, (datetime, date)):
            m = maturity.strftime("%Y-%m-%d")
        parts.append(m[:23])
    return " ".join(p for p in parts if p)


def finish(rows):
    """merge same-named derivative legs (one swap per counterparty), then sort by weight (derivatives by
    exposure), largest first; negative positions last"""
    rows = [r for r in rows if r[0] or r[1]]
    merged, seen = [], {}
    for r in rows:
        k = r[3] if len(r) > 3 else ""
        if k in ("S", "U") and r[0]:
            j = seen.get((r[0], k))
            if j is not None:
                m = merged[j]
                m[5] = m[5] + 1
                if r[2] is not None:
                    m[2] = (m[2] or 0) + r[2]
                if len(r) > 4 and r[4] is not None:
                    m[4] = (m[4] or 0) + r[4]
                continue
            seen[(r[0], k)] = len(merged)
            merged.append([r[0], r[1], r[2], k, r[4] if len(r) > 4 else None, 1])
        else:
            merged.append(r)
    rows = []
    for r in merged:
        if len(r) == 6:
            r = mk(r[0] + (f" ({r[5]})" if r[5] > 1 else ""), r[1], r[2], r[3], r[4])
        rows.append(r)
    key = lambda r: (r[2] if r[2] is not None else (r[4] if len(r) > 4 and r[4] is not None else 0))
    rows.sort(key=lambda r: -key(r))
    return rows


def sheet_rows(content):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    return [["" if v is None else v for v in vals] for vals in ws.iter_rows(values_only=True)]


# ----------------------------------------------------------------------------------------------- parsers
def parse_vanguard(pages):
    """pages: [(kind, json)] -> (asof, rows)"""
    asof, raw = None, []
    for kind, j in pages:
        asof = asof or iso_date(j.get("asOfDate"))
        for e in ((j.get("fund") or {}).get("entity")) or []:
            nm = e.get("longName") or e.get("shortName") or ""
            raw.append((kind, nm, e))
    mv = sum(num(e.get("marketValue")) or 0 for _, _, e in raw)
    wsum = sum(num(e.get("percentWeight")) or 0 for _, _, e in raw)
    nav = mv / wsum * 100 if wsum > 0 else None
    rows = []
    for kind, nm, e in raw:
        w = num(e.get("percentWeight"))
        nt = num(e.get("notionalValue"))
        ex = nt / nav * 100 if (nt and nav) else None
        if kind == "bond":
            rows.append(mk(bond_name(nm, e.get("couponRate"), e.get("maturityDate")), tick(e.get("ticker")), w, "B", ex))
        else:
            see_cusip(e.get("cusip"), e.get("ticker"))
            k = kind_of(nm)
            rows.append(mk(nm, tick(e.get("ticker")), None if (ex and k in ("U", "S")) else w, k, ex))
    return asof, finish(rows)


def parse_ssga(content):
    asof, head, rows = None, None, []
    for cells in sheet_rows(content):
        texts = [str(c).strip() for c in cells]
        if head is None:
            joined = " ".join(x for x in texts if x)
            if not asof and re.search(r"\bas of\b", joined, re.I):
                asof = iso_date(joined)
            low = [x.lower() for x in texts]
            if "name" in low and any(x.startswith("weight") for x in low):
                head = low
            continue
        if not any(texts):
            if rows:
                break
            continue
        d = dict(zip(head, cells))
        name = d.get("name")
        w = num(d.get("weight") if "weight" in d else next((v for k, v in d.items() if k.startswith("weight")), None))
        if not name or w is None:
            continue
        cpn = d.get("coupon") or d.get("coupon rate")
        mat = d.get("maturity") or d.get("maturity date")
        is_bond = bool(str(cpn or "").strip() or str(mat or "").strip())
        if not is_bond:
            see_cusip(d.get("identifier"), d.get("ticker"))
        label = bond_name(name, cpn, mat) if is_bond else name
        rows.append(mk(label, tick(d.get("ticker")), w, "B" if is_bond and not CASH.search(str(name)) else kind_of(name, str(d.get("sector") or ""))))
    return asof, finish(rows)


def parse_proshares(text):
    lines = text.splitlines()
    asof, hi = None, None
    for i, ln in enumerate(lines[:12]):
        if "AS OF" in ln.upper() and not asof:
            asof = iso_date(ln)
        if ln.strip().lower().startswith("fund ticker"):
            hi = i
            break
    if hi is None:
        raise Unavailable("no header")
    rd = csv.reader(lines[hi:])
    head = [h.strip().lower() for h in next(rd)]
    recs = [dict(zip(head, [v.strip() for v in vals])) for vals in rd if len(vals) >= 5]
    col = lambda d, *names: next((d[k] for k in d if any(k.startswith(n) for n in names)), None)
    nav = sum(num(col(d, "market value")) or 0 for d in recs)
    rows = []
    for d in recs:
        name = col(d, "security description") or ""
        mv, ex = num(col(d, "market value")), num(col(d, "exposure value"))
        cpn, mat = col(d, "coupon"), col(d, "maturity")
        k = kind_of(name, "bond" if (cpn or mat) and not CASH.search(name) else "")
        label = bond_name(name, cpn, mat) if k == "B" else name
        w = mv / nav * 100 if (mv is not None and nav) else None
        e = ex / nav * 100 if (ex is not None and nav and k in ("S", "U", "O")) else None
        rows.append(mk(label, tick(col(d, "security ticker")), w, k, e))
    return asof, finish(rows)


def parse_direxion(text):
    lines = text.splitlines()
    hi = next((i for i, ln in enumerate(lines) if ln.startswith('"TradeDate"') or ln.startswith("TradeDate")), None)
    if hi is None:
        raise Unavailable("no header")
    asof, rows = None, []
    for d in csv.DictReader(lines[hi:]):
        name = d.get("SecurityDescription") or ""
        if not name:
            continue
        asof = asof or iso_date(d.get("TradeDate"))
        p = num(d.get("HoldingsPercent"))
        k = kind_of(name)
        if not k:
            see_cusip(d.get("Cusip"), d.get("StockTicker"))
        if k in ("S", "U"):
            rows.append(mk(name, tick(d.get("StockTicker")), None, k, p))
        else:
            rows.append(mk(name, tick(d.get("StockTicker")), p, k))
    return asof, finish(rows)


def parse_globalx(text):
    lines = text.splitlines()
    asof = next((iso_date(ln) for ln in lines[:4] if "as of" in ln.lower()), None)
    hi = next((i for i, ln in enumerate(lines[:8]) if ln.lower().startswith("% of net assets")), None)
    if hi is None:
        raise Unavailable("no header")
    rows = []
    for d in csv.DictReader(lines[hi:]):
        name = (d.get("Name") or "").strip()
        w = num(d.get("% of Net Assets"))
        if not name or w is None:
            continue
        rows.append(mk(name, tick(d.get("Ticker")), w, kind_of(name)))
    return asof, finish(rows)


def parse_vaneck(content):
    asof, head, rows = None, None, []
    for cells in sheet_rows(content):
        texts = [str(c).strip() for c in cells]
        if head is None:
            if not asof:
                asof = next((iso_date(x) for x in texts if iso_date(x)), None)
            low = [x.lower() for x in texts]
            if "holding name" in low and any("net assets" in x for x in low):
                head = low
            continue
        if not any(texts) or (texts[0] and not re.fullmatch(r"\d+", texts[0])):
            if rows:
                break
            continue
        d = dict(zip(head, cells))
        w = num(next((v for k, v in d.items() if "net assets" in k), None))
        name = str(d.get("holding name") or "").strip()
        tk = tick(d.get("ticker"))
        ac = str(d.get("asset class") or "").lower()
        if not name:
            name = "Cash" if "cash" in ac or not tk else tk
        k = ("C" if "cash" in ac else "S" if "swap" in ac else "U" if "future" in ac else "O" if "option" in ac
             else "B" if ("bond" in ac or "fixed" in ac) else "F" if ("fund" in ac or "etf" in ac) else kind_of(name))
        nt = num(d.get("notional value"))
        rows.append(mk(name, "" if k == "C" else tk, w, k))
    return asof, finish(rows)


def parse_ark(text):
    asof, rows = None, []
    for d in csv.DictReader(io.StringIO(text)):
        if not (d.get("fund") or "").strip() or not (d.get("company") or "").strip():
            continue
        asof = asof or iso_date(d.get("date"))
        name = d["company"].strip()
        see_cusip(d.get("cusip"), d.get("ticker"))
        rows.append(mk(name, tick(d.get("ticker")), num(d.get("weight (%)")), kind_of(name)))
    return asof, finish(rows)


def parse_jpm(content):
    asof, head, recs = None, None, []
    for cells in sheet_rows(content):
        texts = [str(c).strip() for c in cells]
        joined = " ".join(x for x in texts if x)
        if head is None:
            if "as of date" in joined.lower():
                asof = iso_date(joined)
            low = [x.lower() for x in texts]
            if "ticker" in low and "security description" in low:
                head = low
            continue
        if not any(texts) or joined.lower().startswith("holdings are subject"):
            if recs:
                break
            continue
        recs.append(dict(zip(head, cells)))
    mvk = next((k for k in (head or []) if k.startswith("market value")), None)
    nav = sum(num(d.get(mvk)) or 0 for d in recs) if mvk else 0
    rows = []
    for d in recs:
        name = str(d.get("security description") or "").strip()
        st = str(d.get("security type") or "")
        mv = num(d.get(mvk)) if mvk else None
        k = kind_of(name, st)
        if re.search(r"LINKED NOTE|\bELN\b|STRUCTURED", f"{name} {st}", re.I):
            k = "O"
        cpn, mat = d.get("coupon"), d.get("maturity date")
        label = bond_name(name, cpn, mat) if k == "B" else name
        rows.append(mk(label, tick(d.get("ticker")), mv / nav * 100 if (mv is not None and nav) else None, k))
    return asof, finish(rows)


OCC = re.compile(r"^[A-Z0-9]{1,6}\s+\d{6}[CP]\d{8}$")              # listed option symbol: ROOT YYMMDD C/P strike


def filepoint_rows(items, asof):
    """holdings in the fund administrators' 'Filepoint' fields (StockTicker, CUSIP, SecurityName, Weightings in %,
    MoneyMarketFlag ...). Swaps and freight futures carry their notional in Weightings: that is their exposure."""
    rows = []
    for d in items:
        name = str(d.get("SecurityName") or d.get("Name") or "").strip()
        tk, cus = str(d.get("StockTicker") or "").strip(), str(d.get("CUSIP") or d.get("Cusip") or "").strip()
        w = d.get("Weightings")
        if not name and not tk:
            continue
        mmf = d.get("MoneyMarketFlag")
        if OCC.match(tk.upper()) or re.search(r"\d{2}/\d{2}/\d{4}\s+[\d.]+\s+[CP]$", name):
            k, tk = "O", ""
        elif mmf is True or str(mmf or "").strip().upper() in ("Y", "TRUE") or tk.upper().startswith("CASH"):
            k = "C"
        elif re.search(r"\bFFA\b|\bFREIGHT\b", name, re.I):            # forward freight agreements (BWET, BDRY)
            k = "U"
        elif re.search(r"\bETF\b", name, re.I):          # "Roundhill Weekly T-Bill ETF" is a fund, not a bill
            k = "F"
        else:
            k = kind_of(name)
        if k in ("S", "U"):
            under = re.match(r"([0-9A-Z]{9})\b", tk.upper())             # "595112103 TRS 050427 NM": the CUSIP swapped
            sym = CUSIPS.get(under.group(1), "") if under else ""
            if not sym:
                m = re.fullmatch(r"([A-Z]{1,5}) SWAP", name.upper())     # "DRAM SWAP"
                sym = m.group(1) if m else ""
            rows.append(mk(name, sym, None, k, w))
            continue
        if not k:
            see_cusip(cus, tk)
        rows.append(mk(name, tick(tk), w, k))
    if not rows:
        raise Unavailable("no rows")
    return asof, finish(rows)


def parse_filepoint(text, fund, asof):
    """daily holdings file in the 'Filepoint' layout, one file for a family of funds (Date, Account, StockTicker,
    CUSIP, SecurityName, Shares, Price, MarketValue, Weightings, NetAssets, ..., MoneyMarketFlag). Its Date is the
    next session's (the basket the fund opens with); asof is the file's own date, the close it was valued at."""
    items = []
    for d in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        if (d.get("Account") or "").strip().upper() == fund:
            items.append(dict(d, Weightings=num(d.get("Weightings"))))
    if not items:
        raise Unavailable(f"{fund} not in the file")
    return filepoint_rows(items, asof)


def parse_amplify(items, asof):
    """Amplify's data feed: Filepoint fields, Weightings as '25.30%' or a number (a fraction when they add up to ~1)"""
    raw = [d.get("Weightings", d.get("Weighting", d.get("Weight", d.get("weight")))) for d in items]
    vals = [num(x) for x in raw]
    pct = any(isinstance(x, str) and x.strip().endswith("%") for x in raw)
    frac = not pct and 0 < sum(abs(v) for v in vals if v is not None) < 3
    out = [dict(d, Weightings=None if v is None else (v * 100 if frac else v)) for d, v in zip(items, vals)]
    return filepoint_rows(out, asof)


def parse_firsttrust(text):
    m = re.search(r"Holdings of the Fund as of\s*([\d/]+)", text)
    asof = iso_date(m.group(1)) if m else None
    i = text.find('class="fundSilverGrid"')
    if i < 0:
        raise Unavailable("no holdings table")
    table = text[i:text.find("</table>", i)]
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        tds = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) < 7 or tds[0].startswith("Security Name"):
            continue
        name, ident, _cusip, cls_ = tds[0], tds[1], tds[2], tds[3]
        see_cusip(_cusip, ident)
        rows.append(mk(name, tick(ident), num(tds[6]), kind_of(name, cls_)))
    return asof, finish(rows)


# ----------------------------------------------------------------------------------------------- fetchers
def src_vanguard(t):
    pages = []
    for kind in ("stock", "bond"):
        start = 1
        while True:
            r = fetch(f"https://investor.vanguard.com/vmf/api/{t}/portfolio-holding/{kind}?start={start}&count=500",
                      "application/json, text/plain, */*", pace=0.8)
            if is_html(r.content):
                raise Unavailable("html instead of json")
            j = r.json()
            pages.append((kind, j))
            got = len(((j.get("fund") or {}).get("entity")) or [])
            size = int(j.get("size") or 0)
            if not got or start + got > size or start > 30000:
                break
            start += got
    return parse_vanguard(pages)


def src_ssga(t):
    r = fetch(f"https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-{t.lower()}.xlsx")
    return parse_ssga(r.content)


def src_proshares(t):
    return parse_proshares(fetch(f"https://accounts.profunds.com/etfdata/ByFund/{t}-psdlyhld.csv").text)


def src_direxion(t):
    return parse_direxion(fetch(f"https://www.direxion.com/holdings/{t}.csv").text)


def src_globalx(t):
    d = date.today()
    for _ in range(8):
        if d.weekday() < 5:
            try:
                r = fetch(f"https://assets.globalxetfs.com/funds/holdings/{t.lower()}_full-holdings_{d:%Y%m%d}.csv", tries=1)
                if not is_html(r.content):
                    return parse_globalx(r.content.decode("utf-8-sig", "replace"))
            except Unavailable:
                pass
        d -= timedelta(days=1)
    raise Unavailable("no file in the last week")


def src_vaneck(t):
    if t not in VANECK:
        raise Unavailable("no page known")
    return parse_vaneck(fetch(f"https://www.vaneck.com/us/en/investments/{VANECK[t]}/downloads/holdings/").content)


def src_ark(t):
    if t not in ARK:
        raise Unavailable("no file known")
    r = fetch("https://assets.ark-funds.com/fund-documents/funds-etf-csv/" + ARK[t])
    return parse_ark(r.content.decode("utf-8-sig", "replace"))


def src_jpm(t):
    if t not in JPM:
        raise Unavailable("no CUSIP known")
    r = fetch(f"https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip={JPM[t]}&country=us&role=adv"
              "&fundType=N_ETF&locale=en-US&isUnderlyingHolding=false&isProxyHolding=false")
    return parse_jpm(r.content)


def src_firsttrust(t):
    r = fetch(f"https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker={t}", "text/html,*/*;q=0.8")
    return parse_firsttrust(r.text)


RH_FILES = {}          # url pattern -> (as of, text): one file serves every Roundhill fund


def src_roundhill(t):
    """the daily file behind roundhillinvestments.com's holdings tables (all Roundhill funds in one file);
    REX's RAM, which Roundhill's site also carries, has a file of its own. A missing day is a 200 'Page Not Found'."""
    base = "https://www.roundhillinvestments.com/assets/data/"
    pat = base + ("rex_data/REX_RAM_Holdings_{d:%Y%m%d}.csv" if t == "RAM" else "FilepointRoundhill.40RU.RU_Holdings_{d:%m%d%Y}.csv")
    if pat not in RH_FILES:
        RH_FILES[pat] = None
        d = datetime.now(timezone(timedelta(hours=-4))).date()       # New York's date, give or take an hour
        for _ in range(10):
            if d.weekday() < 5:
                try:
                    r = fetch(pat.format(d=d), "text/csv,*/*", tries=1)
                    if not is_html(r.content) and b"Account" in r.content[:400]:
                        RH_FILES[pat] = (d.isoformat(), r.content.decode("utf-8-sig", "replace"))
                        break
                except Unavailable:
                    pass
            d -= timedelta(days=1)
    if not RH_FILES[pat]:
        raise Unavailable("no file in the last two weeks")
    asof, text = RH_FILES[pat]
    return parse_filepoint(text, t, asof)


AMP = {}               # amplifyetfs.com's public data-feed settings, read from the site's own script


def fs_value(v):
    """a Firestore REST value -> plain Python"""
    if not isinstance(v, dict):
        return v
    for k in ("stringValue", "booleanValue", "timestampValue"):
        if k in v:
            return v[k]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "mapValue" in v:
        return {k: fs_value(x) for k, x in (v["mapValue"].get("fields") or {}).items()}
    if "arrayValue" in v:
        return [fs_value(x) for x in (v["arrayValue"].get("values") or [])]
    return None


def src_amplify(t):
    """amplifyetfs.com draws its holdings tables from a public Firestore feed (funds/{T}/holdings/{date}); the
    newest date's document carries the holdings, or a subcollection of them does"""
    if "key" not in AMP:
        AMP["key"] = None
        js = fetch("https://amplifyetfs.com/wp-content/plugins/amplify-data/js/amplify-firestore.js").text
        k, p = re.search(r'apiKey:\s*"([^"]+)"', js), re.search(r'projectId:\s*"([^"]+)"', js)
        if k and p:
            AMP.update(key=k.group(1), proj=p.group(1))
    if not AMP.get("key"):
        raise Unavailable("no data-feed settings on the site")
    base = f"https://firestore.googleapis.com/v1/projects/{AMP['proj']}/databases/(default)/documents/funds/{t}/holdings"
    docs = fetch(f"{base}?pageSize=1&orderBy=__name__%20desc&key={AMP['key']}", "application/json").json().get("documents") or []
    if not docs:
        raise Unavailable("no holdings in the feed")
    day = docs[0]["name"].rsplit("/", 1)[1]
    items = fs_value({"mapValue": {"fields": docs[0].get("fields") or {}}}).get("holdings")
    if not isinstance(items, list):
        items, tok = [], ""
        for _ in range(20):
            j = fetch(f"{base}/{day}/holdings?pageSize=300&key={AMP['key']}" + (f"&pageToken={tok}" if tok else ""),
                      "application/json").json()
            items += [fs_value({"mapValue": {"fields": x.get("fields") or {}}}) for x in j.get("documents") or []]
            tok = j.get("nextPageToken")
            if not tok:
                break
    asof = iso_date(day) or (f"{day[:4]}-{day[4:6]}-{day[6:8]}" if re.fullmatch(r"\d{8}", day) else None)
    ny = datetime.now(timezone(timedelta(hours=-4))).date()
    if asof and asof > ny.isoformat():        # dated with the next session's basket: show the close it was valued at
        d = ny
        while d.weekday() > 4:
            d -= timedelta(days=1)
        asof = d.isoformat()
    return parse_amplify(items, asof)


# ----------------------------------------------------------------------------------------------- SEC N-PORT
SEC = requests.Session()
SEC.headers.update({"User-Agent": SEC_UA or "us-stock-data", "Accept-Encoding": "gzip, deflate"})
SEC_IDS = {}           # ticker -> (cik, series id or None)
SEC_REFUSED = [0]


def sec_get(url, tries=3):
    """www.sec.gov / data.sec.gov, at most ~6 requests a second (SEC allows 10)"""
    if SEC_REFUSED[0] >= 3:
        raise Unavailable("SEC refused the last requests")
    err = None
    for k in range(tries):
        wait = LAST.get("sec", 0) + 0.17 - time.time()
        if wait > 0:
            time.sleep(wait)
        LAST["sec"] = time.time()
        STATUS["sec_requests"] += 1
        try:
            r = SEC.get(url, timeout=120)
        except requests.RequestException as e:
            err = type(e).__name__
            time.sleep(3 + 5 * k)
            continue
        if r.status_code == 200:
            SEC_REFUSED[0] = 0
            return r
        err = f"HTTP {r.status_code}"
        if r.status_code == 403:
            SEC_REFUSED[0] += 1
            raise Unavailable("SEC HTTP 403")
        if r.status_code == 404:
            break
        time.sleep(5 + 10 * k)
    raise Unavailable(err or "no response")


def load_sec_ids():
    """ETF tickers -> (registrant CIK, series id) from SEC's own ticker lists; UIT ETFs (SPY, QQQ, DIA) have no series"""
    mf = sec_get("https://www.sec.gov/files/company_tickers_mf.json").json()
    f = mf.get("fields") or []
    ic, ise, isy = f.index("cik"), f.index("seriesId"), f.index("symbol")
    out = {}
    for row in mf.get("data") or []:
        sym = str(row[isy] or "").upper().strip()
        if sym and sym not in out:
            out[sym] = (int(row[ic]), row[ise] or None)
    ct = sec_get("https://www.sec.gov/files/company_tickers.json").json()
    for v in ct.values():
        sym = str(v.get("ticker") or "").upper().strip()
        if sym and sym not in out:
            out[sym] = (int(v["cik_str"]), None)
    return out


def tag(block, name):
    m = re.search(rf"<{name}>(.*?)</{name}>", block, re.S)
    return html.unescape(m.group(1).strip()) if m else None


def nport_filings(cik, series):
    """newest first: [(filing date, accession, folder url)] of original NPORT-P filings"""
    out = []
    if series:
        r = sec_get(f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={series}&type=NPORT-P"
                    "&dateb=&owner=include&count=20&output=atom")
        for e in re.findall(r"<entry>(.*?)</entry>", r.text, re.S):
            if tag(e, "filing-type") != "NPORT-P":
                continue
            href, acc, fd = tag(e, "filing-href"), tag(e, "accession-number"), tag(e, "filing-date")
            if href and acc:
                out.append((fd or "", acc, href.rsplit("/", 1)[0] + "/"))
    else:
        j = sec_get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json").json()
        rec = (j.get("filings") or {}).get("recent") or {}
        for form, acc, fd in zip(rec.get("form") or [], rec.get("accessionNumber") or [], rec.get("filingDate") or []):
            if form == "NPORT-P":
                out.append((fd, acc, f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/"))
    out.sort(reverse=True)
    return out


def _local(t):
    return t.rsplit("}", 1)[-1]


def _kids(el):
    return {_local(c.tag): c for c in el}


def _txt(el, name):
    if el is None:
        return None
    for c in el.iter():
        if _local(c.tag) == name:
            return (c.text or "").strip() or None
    return None


NPORT_PARSER = 3       # bump when parse_nport changes: stored filings are read again
DERIV_KIND = {"swapDeriv": "S", "futrDeriv": "U", "optionSwaptionWarrantDeriv": "O", "fwdDeriv": "X", "othDeriv": "X"}
BOND_CATS = {"DBT", "AMBS", "ABS-MBS", "ABS-APCP", "ABS-CBDO", "ABS-O", "LON", "SN"}


def parse_nport(content):
    """Form N-PORT primary_doc.xml -> (as of, rows, unresolved {id(row): (cusip, isin)})"""
    import xml.etree.ElementTree as ET
    asof, net, recs = None, None, []
    for ev, el in ET.iterparse(io.BytesIO(content), events=("end",)):
        name = _local(el.tag)
        if name == "repPdDate" and not asof:
            asof = (el.text or "").strip()[:10]
        elif name == "netAssets" and net is None:
            net = num(el.text)
        elif name == "invstOrSec":
            k = _kids(el)
            g = lambda n: ((k[n].text or "").strip() if n in k and k[n].text else None)
            ids = {}
            if "identifiers" in k:
                for c in k["identifiers"]:
                    ids[_local(c.tag)] = c.get("value")
            cat = g("assetCat") or (k["assetConditional"].get("assetCat") if "assetConditional" in k else None) or ""
            icat = g("issuerCat") or (k["issuerConditional"].get("issuerCat") if "issuerConditional" in k else None) or ""
            dv = k.get("derivativeInfo")
            dk, dnot, dpay, dref = None, None, None, None
            if dv is not None and len(dv):
                d0 = dv[0]
                dk = DERIV_KIND.get(_local(d0.tag), "X")
                dnot = num(_txt(d0, "notionalAmt"))
                dpay = _txt(d0, "payOffProf")
                dref = _txt(d0, "indexName") or _txt(d0, "issueTitle") or _txt(d0, "issuerName")
            debt = k.get("debtSec")
            sl = k.get("securityLending")      # "Y" answers come as <cashCollateralCondition isCashCollateral="Y" .../>
            coll = sl is not None and any(_local(c.tag) == "cashCollateralCondition" and (c.get("isCashCollateral") or "").upper() == "Y"
                                          or _local(c.tag) == "isCashCollateral" and (c.text or "").strip().upper() == "Y" for c in sl.iter())
            recs.append({"coll": coll, "name": g("name") or "", "title": g("title") or "", "cusip": g("cusip") or "",
                         "isin": ids.get("isin") or "", "ticker": ids.get("ticker") or "", "pct": num(g("pctVal")),
                         "cat": cat, "icat": icat, "pay": g("payoffProfile"), "dk": dk, "dnot": dnot, "dpay": dpay,
                         "dref": dref, "mat": _txt(debt, "maturityDt") if debt is not None else None,
                         "rate": _txt(debt, "annualizedRt") if debt is not None else None})
            el.clear()
    rows, unresolved, coll = [], {}, set()
    for x in recs:
        nm, ti = x["name"], x["title"]
        if x["dk"]:
            kind = x["dk"]
            label = ti or nm
            if x["dref"] and x["dref"].lower() not in label.lower():
                label = f"{label} · {x['dref']}"
            ex = x["dnot"] / net * 100 if (x["dnot"] is not None and net) else None
            if ex is not None and (x["dpay"] or "").lower() == "short" and ex > 0:
                ex = -ex
            w = None if (kind in ("S", "U") and ex is not None) else x["pct"]
            rows.append(mk(label, "", w, kind, ex))
            continue
        if x["cat"] in BOND_CATS:
            rows.append(mk(bond_name(nm or ti, x["rate"], x["mat"]), "", x["pct"], "B"))
            continue
        if x["cat"] in ("STIV", "RA"):
            row = mk(bond_name(nm or ti, x["rate"], x["mat"]) if x["mat"] else (nm or ti), "", x["pct"], "C")
            if x["coll"]:                      # cash received for lent securities, reinvested: listed after the rest
                row[0] = (row[0] + " (증권 대여 담보)")[:100]
                coll.add(id(row))
            rows.append(row)
            continue
        if x["cat"] in ("EC", "EP"):
            kind = "F" if x["icat"] == "RF" else ""
        else:
            kind = kind_of(nm or ti) or "X"
        label = ti if (ti and nm and nm.lower() in ti.lower()) else (nm or ti)
        cus = re.sub(r"[^0-9A-Z]", "", x["cusip"].upper())
        isin = re.sub(r"[^0-9A-Z]", "", x["isin"].upper())
        tk = tick(x["ticker"]) or CUSIPS.get(cus) or (CUSIPS.get(isin[2:11]) if isin.startswith("US") and len(isin) == 12 else None) or ""
        row = mk(label, tk, x["pct"], kind)
        if not tk and kind in ("", "F") and (len(cus) == 9 and cus != "000000000" or isin.startswith("US")):
            unresolved[id(row)] = (cus if len(cus) == 9 and cus != "000000000" else "", isin)
        rows.append(row)
    rows = finish(rows)
    rows = [r for r in rows if id(r) not in coll] + [r for r in rows if id(r) in coll]
    return asof, rows, {i: unresolved[id(r)] for i, r in enumerate(rows) if id(r) in unresolved}


def resolve(entry, figi):
    """fill tickers of an N-PORT entry's unresolved rows from the CUSIP map and the OpenFIGI cache"""
    u = entry.get("u") or {}
    left = {}
    for i, (cus, isin) in u.items():
        i = int(i)
        if i >= len(entry["r"]):
            continue
        tk = CUSIPS.get(cus) or (CUSIPS.get(isin[2:11]) if isin.startswith("US") and len(isin) == 12 else None) or figi.get(isin)
        if tk:
            row = entry["r"][i]
            row[1] = tick(tk)
        else:
            left[str(i)] = [cus, isin]
    if left:
        entry["u"] = left
    else:
        entry.pop("u", None)


def figi_lookup(isins, budget):
    """US ISINs -> ticker ("" when OpenFIGI knows none), 10 per request, 25 requests a minute without a key"""
    out, t0 = {}, time.time()
    for i in range(0, len(isins), 10):
        if time.time() - t0 > budget:
            break
        batch = isins[i:i + 10]
        for attempt in range(2):
            wait = LAST.get("figi", 0) + 2.5 - time.time()
            if wait > 0:
                time.sleep(wait)
            LAST["figi"] = time.time()
            try:
                r = requests.post("https://api.openfigi.com/v3/mapping", timeout=60,
                                  json=[{"idType": "ID_ISIN", "idValue": x, "exchCode": "US"} for x in batch])
            except requests.RequestException:
                r = None
            if r is not None and r.status_code == 429:
                time.sleep(min(60, int(r.headers.get("ratelimit-reset") or 30)))
                continue
            break
        if r is None or r.status_code != 200:
            break
        for x, res in zip(batch, r.json()):
            data = (res or {}).get("data") or []
            pick = next((d for d in data if d.get("exchCode") == "US" and d.get("ticker")), None) or (data[0] if data else {})
            out[x] = str(pick.get("ticker") or "").replace("/", ".")
    return out


def src_nport(t, old):
    """('same', None) when the newest filing is the one we have, else (as of, rows, meta)"""
    cik, series = SEC_IDS[t]
    fl = nport_filings(cik, series)
    if not fl:
        raise Unavailable("no N-PORT filing")
    fd, acc, folder = fl[0]
    if old and old.get("src") == "nport" and old.get("acc") == acc and old.get("pv") == NPORT_PARSER:
        return "same", None, None
    asof, rows, unresolved = parse_nport(sec_get(folder + "primary_doc.xml").content)
    return asof, rows, {"acc": acc, "filed": fd, "pv": NPORT_PARSER, "u": {str(i): list(v) for i, v in unresolved.items()}}


SOURCES = {"vanguard": src_vanguard, "ssga": src_ssga, "proshares": src_proshares, "direxion": src_direxion,
           "globalx": src_globalx, "vaneck": src_vaneck, "ark": src_ark, "jpm": src_jpm, "firsttrust": src_firsttrust,
           "roundhill": src_roundhill, "amplify": src_amplify}


# ----------------------------------------------------------------------------------------------- run
def now_utc():
    return datetime.now(timezone.utc)


def stamp():
    return now_utc().strftime("%Y-%m-%dT%H:%M:%SZ")


def age_h(ts):
    try:
        return (now_utc() - datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 3600
    except (TypeError, ValueError):
        return 1e9


def load_etfs():
    p = PREV / "universe.csv"
    out = []
    with open(p, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if str(r.get("etf") or "").strip() in ("1", "1.0", "True", "true"):
                out.append(r["ticker"].strip().upper())
    return sorted(set(out))


def load_families():
    p = PREV / "fund_store.json.gz"
    if not p.exists():
        return {}
    store = json.loads(gzip.decompress(p.read_bytes()))
    return {t: ((r.get("p") or {}).get("fam") or "") for t, r in (store.get("tickers") or {}).items()}


def load_prev():
    for p in (OUT / STORE, PREV / STORE):
        if p.exists():
            try:
                return json.loads(gzip.decompress(p.read_bytes()))
            except Exception:
                print(f"unreadable {p}", flush=True)
    return {}


def source_of(t, fam):
    if t in NO_LIST:
        return None
    src = BY_TICKER.get(t) or FAMILY.get(fam or "")
    if src == "vaneck" and t not in VANECK or src == "ark" and t not in ARK or src == "jpm" and t not in JPM:
        src = None
    if not src and SEC_IDS and t in SEC_IDS and t not in NO_NPORT:
        src = "nport"
    return src


def main():
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    STATUS["started_at"] = stamp()
    only = {x.strip().upper() for x in sys.argv[1:] if x.strip()}
    etfs = load_etfs()
    fams = load_families()
    prev_all = load_prev()
    prev = prev_all.get("etfs") or {}
    CUSIPS.update(prev_all.get("cusip") or {})
    figi = dict(prev_all.get("figi") or {})
    if SEC_UA:
        try:
            SEC_IDS.update(load_sec_ids())
            STATUS["sec"] = f"ok, {len(SEC_IDS)} tickers"
        except Exception as e:
            STATUS["sec"] = f"unavailable: {type(e).__name__}: {e}"[:200]
    else:
        STATUS["sec"] = "no SEC_CONTACT"
    print("SEC:", STATUS["sec"], flush=True)
    store = {}
    seed = not prev_all.get("cusip")          # first run with the CUSIP map: Vanguard's files carry most US stocks
    for t in etfs:
        src = source_of(t, fams.get(t))
        old = prev.get(t)
        if not src:
            STATUS["no_source"].append(t)
            if old and old.get("src") == "nport" and not SEC_IDS:
                store[t] = old                # SEC unreachable today: keep the last filing
            continue
        bs = STATUS["by_src"].setdefault(src, {"ok": 0, "kept": 0, "same": 0, "failed": 0})
        due = (not old or old.get("src") != src or age_h(old.get("at")) >= max(MIN_AGE_H, REFRESH_H.get(src, 0))
               or (seed and src == "vanguard") or (src == "nport" and old.get("pv") != NPORT_PARSER))
        if only:
            due = t in only
        if not due or time.time() - t0 > BUDGET:
            if old:                           # (a source switch not reached today keeps the old source's list)
                store[t] = old
                bs["kept"] += 1
                STATUS["kept"] += 1
            if due:
                STATUS["stopped"] = "budget"
            continue
        try:
            if src == "nport":
                asof, rows, meta = src_nport(t, old)
                if asof == "same":
                    store[t] = dict(old, at=stamp())
                    bs["same"] += 1
                    STATUS["kept"] += 1
                    continue
            else:
                (asof, rows), meta = SOURCES[src](t), {}
            if not rows:
                raise Unavailable("no rows")
            store[t] = dict({"src": src, "d": asof, "n": len(rows), "r": rows, "at": stamp()}, **{k: v for k, v in meta.items() if v})
            bs["ok"] += 1
            STATUS["fetched"] += 1
            print(f"{t:6s} {src:10s} {asof} {len(rows):6d} rows", flush=True)
        except Exception as e:
            msg = f"{type(e).__name__}: {e}"[:160]
            STATUS["failed"][t] = f"{src}: {msg}"
            bs["failed"] += 1
            print(f"{t:6s} {src:10s} FAILED {msg}", flush=True)
            if not isinstance(e, Unavailable):
                traceback.print_exc()
            if old:                           # the last good list, whichever source gave it
                store[t] = old
    # tickers for N-PORT holdings: the issuers' CUSIPs first, then OpenFIGI for the biggest unknown US holdings
    for v in store.values():
        if v.get("u"):
            resolve(v, figi)
    want = {}
    for v in store.values():
        for i, (cus, isin) in (v.get("u") or {}).items():
            row = v["r"][int(i)]
            if isin.startswith("US") and len(isin) == 12 and isin not in figi:
                want[isin] = max(want.get(isin, 0), row[2] or 0)
    if want:
        got = figi_lookup(sorted(want, key=lambda x: -want[x]), FIGI_BUDGET)
        figi.update(got)
        STATUS["figi"] = f"asked {len(got)} of {len(want)}, found {sum(1 for x in got.values() if x)}"
        for v in store.values():
            if v.get("u"):
                resolve(v, figi)
    out = {"v": 1, "updated_at": stamp(), "etfs": store, "cusip": CUSIPS, "figi": figi}
    (OUT / STORE).write_bytes(gzip.compress(json.dumps(out, separators=(",", ":"), ensure_ascii=False).encode("utf-8")))
    STATUS["etfs"] = len(store)
    STATUS["rows"] = sum(v.get("n", 0) for v in store.values())
    STATUS["unresolved"] = sum(len(v.get("u") or {}) for v in store.values())
    STATUS["cusips"] = len(CUSIPS)
    STATUS["seconds"] = round(time.time() - t0, 1)
    (OUT / "etf_holdings_status.json").write_text(json.dumps(STATUS, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: STATUS[k] for k in ("fetched", "kept", "etfs", "rows", "seconds", "requests", "sec_requests",
                                             "stopped", "sec", "figi", "unresolved", "cusips")}), flush=True)
    print("failed:", json.dumps(STATUS["failed"], ensure_ascii=False, indent=0), flush=True)


if __name__ == "__main__":
    main()
