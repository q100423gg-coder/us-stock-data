#!/usr/bin/env python3
"""Complete holdings of the radar's ETFs, read from the issuers' own holdings files.

Runs in the fundamentals workflow right before the page bundle is built (fundamentals.py reads the result).
  in   prev/universe.csv            the ETFs (etf == 1)
       prev/fund_store.json.gz      Yahoo's fund family of each ETF (which issuer to ask)
       prev/etf_holdings.json.gz    the last run: kept for ETFs that fail today, and for sources not due yet
  out  out/etf_holdings.json.gz     {"v": 1, "updated_at", "etfs": {T: {"src", "d", "n", "r", "at"}}}
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
iShares, Invesco and Schwab refuse automated downloads, so their ETFs keep Yahoo's top 10 on the page.

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
          "ARK ETF Trust": "ark", "JPMorgan": "jpm", "First Trust": "firsttrust"}
VANECK = {"SMH": "semiconductor-etf-smh", "OIH": "oil-services-etf-oih", "ESPO": "video-gaming-esports-etf-espo",
          "NLR": "uranium-nuclear-energy-etf-nlr", "GDX": "gold-miners-etf-gdx", "GDXJ": "junior-gold-miners-etf-gdxj",
          "REMX": "rare-earth-strategic-metals-etf-remx", "MOO": "agribusiness-etf-moo", "VNM": "vietnam-etf-vnm"}
ARK = {"ARKK": "ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv", "ARKW": "ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS.csv",
       "ARKG": "ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS.csv", "ARKQ": "ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv",
       "ARKF": "ARK_BLOCKCHAIN_&_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS.csv",
       "ARKX": "ARK_SPACE_&_DEFENSE_INNOVATION_ETF_ARKX_HOLDINGS.csv"}
JPM = {"JEPI": "46641Q332", "JEPQ": "46654Q203", "JPST": "46641Q837"}
NO_LIST = {"GLD", "GLDM"}                      # physical gold trusts: the only holding is gold
REFRESH_H = {"vanguard": 70}                   # monthly data: ask every three days; others every run
MIN_AGE_H = 18                                 # a second run on the same day keeps what the first one got

STATUS = {"started_at": None, "fetched": 0, "kept": 0, "failed": {}, "no_source": [], "by_src": {}, "stopped": None,
          "requests": 0}


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


SOURCES = {"vanguard": src_vanguard, "ssga": src_ssga, "proshares": src_proshares, "direxion": src_direxion,
           "globalx": src_globalx, "vaneck": src_vaneck, "ark": src_ark, "jpm": src_jpm, "firsttrust": src_firsttrust}


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
                return json.loads(gzip.decompress(p.read_bytes())).get("etfs", {})
            except Exception:
                print(f"unreadable {p}", flush=True)
    return {}


def source_of(t, fam):
    if t in NO_LIST:
        return None
    src = FAMILY.get(fam or "")
    if src == "vaneck" and t not in VANECK or src == "ark" and t not in ARK or src == "jpm" and t not in JPM:
        return None
    return src


def main():
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    STATUS["started_at"] = stamp()
    only = {x.strip().upper() for x in sys.argv[1:] if x.strip()}
    etfs = load_etfs()
    fams = load_families()
    prev = load_prev()
    store = {}
    for t in etfs:
        src = source_of(t, fams.get(t))
        old = prev.get(t)
        if not src:
            STATUS["no_source"].append(t)
            continue
        bs = STATUS["by_src"].setdefault(src, {"ok": 0, "kept": 0, "failed": 0})
        due = (not old or old.get("src") != src or age_h(old.get("at")) >= max(MIN_AGE_H, REFRESH_H.get(src, 0)))
        if only:
            due = t in only
        if not due or time.time() - t0 > BUDGET:
            if old and old.get("src") == src:
                store[t] = old
                bs["kept"] += 1
                STATUS["kept"] += 1
            if due:
                STATUS["stopped"] = "budget"
            continue
        try:
            asof, rows = SOURCES[src](t)
            if not rows:
                raise Unavailable("no rows")
            store[t] = {"src": src, "d": asof, "n": len(rows), "r": rows, "at": stamp()}
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
            if old and old.get("src") == src:
                store[t] = old
    out = {"v": 1, "updated_at": stamp(), "etfs": store}
    (OUT / STORE).write_bytes(gzip.compress(json.dumps(out, separators=(",", ":"), ensure_ascii=False).encode("utf-8")))
    STATUS["etfs"] = len(store)
    STATUS["rows"] = sum(v.get("n", 0) for v in store.values())
    STATUS["sec"] = round(time.time() - t0, 1)
    (OUT / "etf_holdings_status.json").write_text(json.dumps(STATUS, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: STATUS[k] for k in ("fetched", "kept", "etfs", "rows", "sec", "requests", "stopped")}), flush=True)
    print("failed:", json.dumps(STATUS["failed"], ensure_ascii=False, indent=0), flush=True)


if __name__ == "__main__":
    main()
