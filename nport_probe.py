#!/usr/bin/env python3
"""Temporary probe 4: iShares holdings (json/csv after visiting the product page), Vanguard api samples,
First Trust table, VanEck slugs. Writes probe_out/log.txt and samples."""
import json
import re
import time
import traceback
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


def get(label, url, headers=None, save=None, show=300, sess=None):
    try:
        time.sleep(0.8)
        r = (sess or S).get(url, headers=headers or BH, timeout=60, allow_redirects=True)
        ct = r.headers.get("content-type", "")
        log(f"[{label}] {r.status_code} {ct} {len(r.content)}B {r.url[:170]}")
        if r.status_code != 200:
            log("    body:", text_of(r.content)[:300])
        elif show:
            log("    head:", r.content[:show].decode("utf-8", "replace").replace("\n", " | "))
        if save and r.status_code == 200:
            (OUT / save).write_bytes(r.content[:2_500_000])
        return r
    except Exception as e:
        log(f"[{label}] ERROR {type(e).__name__}: {e}")
        return None


def main():
    page = "https://www.ishares.com/us/products/239705/ishares-phlx-semiconductor-etf"
    s2 = requests.Session()
    get("ishares-json-cold", page + "/1467271812596.ajax?tab=all&fileType=json", save="ishares_soxx_cold.json", show=400, sess=s2)
    r = get("ishares-page", page + "?siteEntryPassthrough=true", show=0, sess=s2)
    if r is not None:
        log("    cookies:", list(s2.cookies.keys()))
        # what does the page say about the holdings download
        for m in sorted(set(re.findall(r'[^"\' ]*\.ajax\?[^"\' <]*', r.text)))[:20]:
            log("    ajax link:", m)
    get("ishares-csv-warm", page + "/1467271812596.ajax?fileType=csv&fileName=SOXX_holdings&dataType=fund", save="ishares_soxx.csv", show=500, sess=s2)
    get("ishares-json-warm", page + "/1467271812596.ajax?tab=all&fileType=json", save="ishares_soxx.json", show=500, sess=s2)
    agg = "https://www.ishares.com/us/products/239458/ishares-core-total-us-bond-market-etf"
    get("ishares-agg-json", agg + "/1467271812596.ajax?tab=all&fileType=json", save="ishares_agg.json", show=500, sess=s2)
    # Vanguard samples
    jh = {"User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9"}
    r = get("vg-voo", "https://investor.vanguard.com/vmf/api/VOO/portfolio-holding/stock?start=1&count=500", jh, save="vg_voo.json", show=0)
    if r is not None and r.status_code == 200:
        j = r.json()
        log("    keys:", list(j.keys()), "size", j.get("size"), "asOf", j.get("asOfDate"))
        ent = (j.get("fund") or {}).get("entity") or []
        log("    entities:", len(ent), json.dumps(ent[:2], ensure_ascii=False)[:1500])
        log("    next:", j.get("next"))
    r = get("vg-bnd", "https://investor.vanguard.com/vmf/api/BND/portfolio-holding/bond?start=1&count=500", jh, save="vg_bnd.json", show=0)
    if r is not None and r.status_code == 200:
        j = r.json()
        log("    keys:", list(j.keys()), "size", j.get("size"), "asOf", j.get("asOfDate"))
        ent = (j.get("fund") or {}).get("entity") or []
        log("    entities:", len(ent), json.dumps(ent[:2], ensure_ascii=False)[:1500])
    r = get("vg-vxus", "https://investor.vanguard.com/vmf/api/VXUS/portfolio-holding/stock?start=8001&count=500", jh, show=0)
    if r is not None and r.status_code == 200:
        j = r.json()
        log("    vxus size", j.get("size"), "entities", len(((j.get("fund") or {}).get("entity") or [])))
    for t in ("VNQ", "BNDX", "VTEB"):
        for kind in ("stock", "bond"):
            r = get(f"vg-{t}-{kind}", f"https://investor.vanguard.com/vmf/api/{t}/portfolio-holding/{kind}?start=1&count=5", jh, show=0)
            if r is not None and r.status_code == 200:
                try:
                    j = r.json()
                    log("    size", j.get("size"), "asOf", j.get("asOfDate"))
                except Exception:
                    log("    not json")
    # First Trust table
    r = get("ft-fdn", "https://www.ftportfolios.com/Retail/Etf/EtfHoldings.aspx?Ticker=FDN", show=0)
    if r is not None and r.status_code == 200:
        t = r.text
        i = t.find("Holdings of the Fund")
        log("    around:", text_of(t[i:i + 6000].encode())[:1500] if i >= 0 else "no marker")
        tabs = re.findall(r"<table[^>]*>", t)
        log("    tables:", len(tabs), tabs[:8])
    # VanEck remaining slugs
    for slug in ("semiconductor-etf-smh", "video-gaming-esports-etf-espo", "junior-gold-miners-etf-gdxj",
                 "rare-earth-strategic-metals-etf-remx", "agribusiness-etf-moo"):
        get("vaneck", f"https://www.vaneck.com/us/en/investments/{slug}/downloads/holdings/", show=0)
    # Invesco, minimal headers
    get("invesco-min", "https://dng-api.invesco.com/cache/v1/accounts/en_US/shareclasses/QQQ/holdings/fund?idType=ticker&productType=ETF",
        {"User-Agent": UA, "Accept": "*/*"}, show=300)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log(traceback.format_exc())
    finally:
        LOG.close()
