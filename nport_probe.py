#!/usr/bin/env python3
"""Temporary probe: can the collector read ETF holdings from SEC N-PORT filings (and map ISINs to tickers)?
Writes probe_out/*.txt and a few raw filings; the workflow uploads probe_out as probe.tar.gz."""
import gzip
import json
import re
import time
import traceback
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import requests

OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
LOG = open(OUT / "log.txt", "w", encoding="utf-8")
UAS = ["us-stock-data/1.0 (+https://github.com/q100423gg-coder/us-stock-data) 334556648+q100423gg-coder@users.noreply.github.com",
       "us-stock-data 334556648+q100423gg-coder@users.noreply.github.com"]
S = requests.Session()


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.write(s + "\n")
    LOG.flush()


def get(url, **kw):
    time.sleep(0.25)
    r = S.get(url, timeout=60, **kw)
    return r


def strip_ns(tag):
    return tag.split("}", 1)[-1]


def main():
    # 1. which User-Agent does SEC accept
    ok_ua = None
    for ua in UAS:
        S.headers.update({"User-Agent": ua, "Accept-Encoding": "gzip, deflate"})
        r = get("https://www.sec.gov/files/company_tickers_mf.json")
        log("UA", repr(ua), "->", r.status_code, len(r.content), re.sub(r"<[^>]+>", " ", r.text)[:1200] if r.status_code != 200 else "")
        if r.status_code == 200:
            ok_ua = ua
            mf = r.json()
            break
    if not ok_ua:
        log("no UA accepted")
        return
    fields = mf["fields"]
    log("mf fields", fields, "rows", len(mf["data"]))
    rows = [dict(zip(fields, x)) for x in mf["data"]]
    by_sym = {}
    for x in rows:
        by_sym.setdefault(str(x.get("symbol") or "").upper(), x)
    r = get("https://www.sec.gov/files/company_tickers.json")
    ct = r.json() if r.status_code == 200 else {}
    ct_sym = {str(v["ticker"]).upper(): v for v in ct.values()} if ct else {}
    log("company_tickers", r.status_code, len(ct_sym))
    tests = ["SOXX", "SOXL", "VOO", "SPY", "QQQ", "DIA", "BND", "SCHD", "JEPI", "SQQQ", "VXUS", "ARKK", "TLT", "IBIT", "GLD",
             "SPYM", "TQQQ", "AGG", "MUB", "JEPQ"]
    for t in tests:
        log("map", t, "mf:", by_sym.get(t), "ct:", ct_sym.get(t))

    # 2. the series' latest N-PORT filings
    figi_isins = []
    for t in tests:
        m = by_sym.get(t)
        try:
            if m and m.get("seriesId"):
                url = (f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={m['seriesId']}&type=NPORT-P"
                       f"&dateb=&owner=include&count=10&output=atom")
            elif ct_sym.get(t):
                url = f"https://data.sec.gov/submissions/CIK{int(ct_sym[t]['cik_str']):010d}.json"
            else:
                log(t, "no SEC id")
                continue
            r = get(url)
            log("\n==", t, url, "->", r.status_code, len(r.content))
            hrefs = []
            if url.endswith(".json"):
                j = r.json()
                rec = j.get("filings", {}).get("recent", {})
                for f, acc, d, rd, doc in zip(rec.get("form", []), rec.get("accessionNumber", []), rec.get("filingDate", []),
                                              rec.get("reportDate", []), rec.get("primaryDocument", [])):
                    if f == "NPORT-P":
                        cik = int(ct_sym[t]["cik_str"])
                        hrefs.append((d, rd, f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/", doc))
                log(t, "submissions NPORT-P", hrefs[:4])
            else:
                txt = r.text
                (OUT / f"atom_{t}.xml").write_text(txt[:20000], encoding="utf-8")
                for ent in re.findall(r"<entry>(.*?)</entry>", txt, flags=re.S)[:6]:
                    fd = re.search(r"<filing-date>(.*?)</filing-date>", ent)
                    fh = re.search(r"<filing-href>(.*?)</filing-href>", ent)
                    ft = re.search(r"<filing-type>(.*?)</filing-type>", ent)
                    acc = re.search(r"<accession-number>(.*?)</accession-number>", ent)
                    log(t, "atom entry", ft and ft.group(1), fd and fd.group(1), acc and acc.group(1), fh and fh.group(1))
                    if fh:
                        base = fh.group(1).rsplit("/", 1)[0] + "/"
                        hrefs.append((fd.group(1) if fd else None, None, base, "primary_doc.xml"))
            if not hrefs:
                continue
            d, rd, base, doc = hrefs[0]
            r = get(base + "primary_doc.xml")
            log(t, "primary_doc", base + "primary_doc.xml", r.status_code, len(r.content))
            if r.status_code != 200:
                r2 = get(base)
                log(t, "index", r2.status_code, r2.text[:800])
                continue
            raw = r.content
            if t in ("SOXL", "SOXX", "SQQQ", "SPY", "TLT", "JEPI"):
                (OUT / f"{t}_primary_doc.xml.gz").write_bytes(gzip.compress(raw))
            root = ET.fromstring(raw)
            gen = {}
            for el in root.iter():
                tg = strip_ns(el.tag)
                if tg in ("seriesName", "seriesId", "repPdEnd", "repPdDate", "regName", "regCik", "netAssets", "totAssets"):
                    gen.setdefault(tg, (el.text or "").strip())
            log(t, "gen", gen)
            secs = [el for el in root.iter() if strip_ns(el.tag) == "invstOrSec"]
            cats = Counter()
            pct_sum = 0.0
            shown = 0
            for s in secs:
                kv = {strip_ns(c.tag): c for c in s}
                ac = kv.get("assetCat")
                cat = ac.text if ac is not None else None
                if cat is None:
                    cond = s.find(".//{*}assetConditional")
                    cat = "cond:" + (cond.get("assetCat") if cond is not None else "?")
                deriv = s.find(".//{*}derivativeInfo")
                if deriv is not None:
                    cat += "+deriv:" + ",".join(strip_ns(c.tag) + "/" + str(c.get("derivCat")) for c in deriv)
                cats[cat] += 1
                try:
                    pct_sum += float(kv["pctVal"].text)
                except Exception:
                    pass
                ids = s.find("{*}identifiers")
                if ids is not None:
                    for c in ids:
                        if strip_ns(c.tag) == "isin" and c.get("value", "").startswith("US") and len(figi_isins) < 40:
                            figi_isins.append(c.get("value"))
            log(t, "holdings", len(secs), "pct sum", round(pct_sum, 3), "cats", dict(cats))
            # samples: first two, first derivative, first debt
            samples = secs[:2]
            dv = next((s for s in secs if s.find(".//{*}derivativeInfo") is not None), None)
            db = next((s for s in secs if (s.find("{*}assetCat") is not None and s.find("{*}assetCat").text == "DBT")), None)
            for s in samples + [x for x in (dv, db) if x is not None]:
                txt = ET.tostring(s, encoding="unicode")
                txt = re.sub(r' xmlns(:\w+)?="[^"]+"', "", txt)
                log(t, "SAMPLE\n" + txt[:3500])
        except Exception:
            log(t, "ERROR", traceback.format_exc()[-1500:])

    # 3. OpenFIGI mapping without a key
    try:
        jobs = [{"idType": "ID_ISIN", "idValue": i, "exchCode": "US"} for i in figi_isins[:10]]
        r = requests.post("https://api.openfigi.com/v3/mapping", json=jobs, timeout=60,
                          headers={"Content-Type": "application/json"})
        log("\nopenfigi", r.status_code, dict((k, v) for k, v in r.headers.items() if "limit" in k.lower() or "retry" in k.lower()))
        log(json.dumps(r.json(), ensure_ascii=False)[:4000] if r.status_code == 200 else r.text[:800])
    except Exception:
        log("openfigi ERROR", traceback.format_exc()[-800:])


if __name__ == "__main__":
    try:
        main()
    finally:
        LOG.close()
