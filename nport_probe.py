#!/usr/bin/env python3
"""Temporary probe 3: issuers' daily holdings files (iShares, Vanguard, Invesco, Schwab, Global X, VanEck,
ARK, First Trust, JPMorgan, SSGA, ProShares, Direxion). Writes probe_out/log.txt and samples."""
import re
import time
import traceback
from datetime import date, timedelta
from pathlib import Path

import requests

OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
LOG = open(OUT / "log.txt", "w", encoding="utf-8")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
BH = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"}
S = requests.Session()


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.write(s + "\n")
    LOG.flush()


def text_of(b):
    t = b.decode("utf-8", "replace")
    t = re.sub(r"<(script|style).*?</\1>", " ", t, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def get(label, url, headers=None, save=None, show=300):
    try:
        time.sleep(0.8)
        r = S.get(url, headers=headers or BH, timeout=60, allow_redirects=True)
        ct = r.headers.get("content-type", "")
        log(f"[{label}] {r.status_code} {ct} {len(r.content)}B {r.url[:160]}")
        if r.status_code != 200:
            log("    body:", text_of(r.content)[:300])
        elif show and ("text" in ct or "json" in ct or "csv" in ct or "octet" in ct):
            log("    head:", r.content[:show].decode("utf-8", "replace").replace("\n", " | "))
        if save and r.status_code == 200:
            (OUT / save).write_bytes(r.content[:2_000_000])
        return r
    except Exception as e:
        log(f"[{label}] ERROR {type(e).__name__}: {e}")
        return None


def main():
    # iShares: the holdings csv needs siteEntryPassthrough
    get("ishares-soxx", "https://www.ishares.com/us/products/239705/ishares-phlx-semiconductor-etf/1467271812596.ajax"
        "?fileType=csv&fileName=SOXX_holdings&dataType=fund&siteEntryPassthrough=true", save="ishares_soxx.csv", show=600)
    get("ishares-agg", "https://www.ishares.com/us/products/239458/ishares-core-total-us-bond-market-etf/1467271812596.ajax"
        "?fileType=csv&fileName=AGG_holdings&dataType=fund&siteEntryPassthrough=true", save="ishares_agg.csv", show=600)
    # Vanguard: find the holdings API in the page's script
    r = get("vanguard-page", "https://investor.vanguard.com/investment-products/etfs/profile/voo", show=0)
    if r is not None and r.status_code == 200:
        mains = re.findall(r'src="([^"]*main\.[0-9a-f]+\.js)"', r.text)
        log("    main js:", mains)
        for m in mains[:1]:
            url = m if m.startswith("http") else "https://investor.vanguard.com/" + m.lstrip("/")
            js = get("vanguard-mainjs", url, show=0)
            if js is not None and js.status_code == 200:
                t = js.text
                for kw in ("portfolio-holding", "holding", "/api/"):
                    hits = sorted(set(m2.group(0) for m2 in re.finditer(r'.{0,140}' + re.escape(kw) + r'.{0,140}', t)))[:12]
                    log(f"    js '{kw}' {len(hits)} hits")
                    for x in hits:
                        log("      ", x.replace("\n", " "))
    jh = {"User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://investor.vanguard.com/investment-products/etfs/profile/voo"}
    for u in ("https://investor.vanguard.com/investment-products/etfs/profile/api/VOO/portfolio-holding/stock?start=1&count=50",
              "https://investor.vanguard.com/vmf/api/VOO/portfolio-holding/stock?start=1&count=50",
              "https://api.vanguard.com/rs/ire/01/ind/fund/0968/portfolio-holding/stock.json?start=1&count=50"):
        get("vanguard-api", u, jh, show=400)
    # Invesco
    ih = {"User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
          "Origin": "https://www.invesco.com", "Referer": "https://www.invesco.com/"}
    get("invesco-api", "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&productType=ETF",
        ih, save="invesco_api.json", show=600)
    get("invesco-csv", "https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ",
        save="invesco_qqq.csv", show=600)
    # Schwab
    get("schwab-all", "https://www.schwabassetmanagement.com/allholdings/SCHD", save="schwab_schd.html", show=0)
    get("schwab-product", "https://www.schwabassetmanagement.com/products/schd", show=0)
    # Global X: dated csv
    d = date.today()
    for k in range(0, 5):
        dd = d - timedelta(days=k)
        r = get("globalx", f"https://assets.globalxetfs.com/funds/holdings/qyld_full-holdings_{dd:%Y%m%d}.csv", save="globalx_qyld.csv", show=500)
        if r is not None and r.status_code == 200 and b"<html" not in r.content[:200].lower():
            break
    # VanEck slugs
    for slug in ("oil-services-etf-oih", "gold-miners-etf-gdx", "vietnam-etf-vnm", "uranium-nuclear-energy-etf-nlr"):
        get("vaneck", f"https://www.vaneck.com/us/en/investments/{slug}/downloads/holdings/", show=0)
    # ARK file names
    for fn in ("ARK_NEXT_GENERATION_INTERNET_ETF_ARKW_HOLDINGS.csv", "ARK_GENOMIC_REVOLUTION_ETF_ARKG_HOLDINGS.csv",
               "ARK_AUTONOMOUS_TECH._&_ROBOTICS_ETF_ARKQ_HOLDINGS.csv", "ARK_BLOCKCHAIN_&_FINTECH_INNOVATION_ETF_ARKF_HOLDINGS.csv",
               "ARK_SPACE_&_DEFENSE_INNOVATION_ETF_ARKX_HOLDINGS.csv", "ARK_SPACE_EXPLORATION_&_INNOVATION_ETF_ARKX_HOLDINGS.csv"):
        get("ark", "https://assets.ark-funds.com/fund-documents/funds-etf-csv/" + fn, show=120)
    # First Trust
    get("firsttrust", "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=FDN", save="ft_fdn.html", show=0)
    # JPMorgan
    for t, cusip in (("JEPQ", "46654Q203"), ("JPST", "46641Q837")):
        get("jpm-" + t, f"https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip={cusip}&country=us&role=adv"
            "&fundType=N_ETF&locale=en-US&isUnderlyingHolding=false&isProxyHolding=false", show=0)
    # SSGA, ProShares, Direxion: more tickers
    for t in ("spym", "jnk", "dia", "xlk", "gld", "bil"):
        get("ssga-" + t, f"https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-{t}.xlsx", show=0)
    for t in ("SQQQ", "BITO", "UVXY", "NOBL"):
        get("proshares-" + t, f"https://accounts.profunds.com/etfdata/ByFund/{t}-psdlyhld.csv", show=200)
    for t in ("TMF", "YINN", "SPXL"):
        get("direxion-" + t, f"https://www.direxion.com/holdings/{t}.csv", show=200)
    r = get("direxion-soxl", "https://www.direxion.com/holdings/SOXL.csv", show=0)
    if r is not None and r.status_code == 200:
        rows = r.text.splitlines()
        log("    soxl rows:", len(rows))
        for x in rows:
            if "SWAP" in x.upper() or "TREAS" in x.upper() or "CASH" in x.upper() or "MONEY" in x.upper():
                log("      ", x)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log(traceback.format_exc())
    finally:
        LOG.close()
