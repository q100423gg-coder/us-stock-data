#!/usr/bin/env python3
"""Temporary probe: where can the collector read complete ETF holdings from GitHub's network?
SEC (N-PORT) with several user agents, the issuers' own holdings files, Nasdaq, OpenFIGI.
Writes probe_out/log.txt and small samples; the workflow uploads probe_out as probe.tar.gz."""
import json
import re
import time
import traceback
from pathlib import Path

import requests

OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
LOG = open(OUT / "log.txt", "w", encoding="utf-8")
BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
           "Chrome/126.0.0.0 Safari/537.36")


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.write(s + "\n")
    LOG.flush()


def text_of(r):
    t = re.sub(r"<style.*?</style>", " ", r.text, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def try_get(label, url, headers=None, save=None, method="GET", **kw):
    try:
        time.sleep(1.0)
        r = requests.request(method, url, headers=headers or {}, timeout=60, **kw)
        ct = r.headers.get("content-type", "")
        head = r.content[:300]
        log(f"[{label}] {r.status_code} {ct} {len(r.content)}B {url}")
        if r.status_code != 200:
            log("    body:", text_of(r)[:700])
        elif "text" in ct or "json" in ct or "csv" in ct:
            log("    head:", head.decode("utf-8", "replace").replace("\n", " | ")[:300])
        if save and r.status_code == 200:
            (OUT / save).write_bytes(r.content[:3_000_000])
        return r
    except Exception as e:
        log(f"[{label}] ERROR {type(e).__name__}: {e}")
        return None


def main():
    # A. SEC with several user agents (no personal e-mail address)
    uas = {
        "repo": "us-stock-data (+https://github.com/q100423gg-coder/us-stock-data)",
        "noreply": "us-stock-data 334556648+q100423gg-coder@users.noreply.github.com",
    }
    for name, ua in uas.items():
        h = {"Accept-Encoding": "gzip, deflate"}
        if ua:
            h["User-Agent"] = ua
        try_get(f"sec-www-{name}", "https://www.sec.gov/files/company_tickers_mf.json", h)
        try_get(f"sec-data-{name}", "https://data.sec.gov/submissions/CIK0000884394.json", h)
    # B. issuers' own daily holdings files
    bh = {"User-Agent": BROWSER, "Accept": "*/*"}
    issuers = [
        ("ishares-soxx", "https://www.ishares.com/us/products/239705/ishares-phlx-semiconductor-etf/1467271812596.ajax?fileType=csv&fileName=SOXX_holdings&dataType=fund", "ishares_soxx.csv"),
        ("ishares-screener", "https://www.ishares.com/us/product-screener/product-screener-v3.1.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/ishares-product-screener-backend-config&siteEntryPassthrough=true", "ishares_screener.json"),
        ("ssga-spy", "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx", "ssga_spy.xlsx"),
        ("vanguard-voo", "https://investor.vanguard.com/investment-products/etfs/profile/api/VOO/portfolio-holding/stock?start=1&count=50", "vanguard_voo.json"),
        ("vanguard-bnd", "https://investor.vanguard.com/investment-products/etfs/profile/api/BND/portfolio-holding/bond?start=1&count=50", "vanguard_bnd.json"),
        ("invesco-qqq", "https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=QQQ", "invesco_qqq.csv"),
        ("invesco-api", "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&productType=ETF", "invesco_api.json"),
        ("direxion-soxl", "https://www.direxion.com/holdings/SOXL.csv", "direxion_soxl.csv"),
        ("proshares-tqqq", "https://accounts.profunds.com/etfdata/ByFund/TQQQ-psdlyhld.csv", "proshares_tqqq.csv"),
        ("schwab-schd", "https://www.schwabassetmanagement.com/allholdings/SCHD", "schwab_schd.html"),
        ("globalx-qyld", "https://www.globalxetfs.com/funds/qyld/?download_full_holdings=true", "globalx_qyld.csv"),
        ("ark-arkk", "https://assets.ark-funds.com/fund-documents/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv", "ark_arkk.csv"),
        ("jpm-jepi", "https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip=46641Q332&country=us&role=adv&fundType=N_ETF&locale=en-US&isUnderlyingHolding=false&isProxyHolding=false", "jpm_jepi.xlsx"),
        ("vaneck-smh", "https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/downloads/holdings/", "vaneck_smh.html"),
    ]
    for label, url, save in issuers:
        try_get(label, url, bh, save)
    # C. Nasdaq
    nh = {"User-Agent": BROWSER, "Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com",
          "Referer": "https://www.nasdaq.com/"}
    try_get("nasdaq-soxx", "https://api.nasdaq.com/api/quote/SOXX/holdings?assetclass=etf", nh, "nasdaq_soxx.json")
    try_get("nasdaq-voo", "https://api.nasdaq.com/api/quote/VOO/holdings?assetclass=etf&limit=600", nh, "nasdaq_voo.json")
    # D. OpenFIGI without a key
    jobs = [{"idType": "ID_ISIN", "idValue": i, "exchCode": "US"} for i in
            ("US67066G1040", "US0378331005", "US02079K3059", "US02079K1079", "US0846707026")]
    r = try_get("openfigi", "https://api.openfigi.com/v3/mapping", {"Content-Type": "application/json"}, None,
                method="POST", data=json.dumps(jobs))
    if r is not None:
        log("    headers:", {k: v for k, v in r.headers.items() if "limit" in k.lower() or "retry" in k.lower()})
        log("    body:", r.text[:1500])


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log(traceback.format_exc())
    finally:
        LOG.close()
