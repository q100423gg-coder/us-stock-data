#!/usr/bin/env python3
"""Temporary probe 5: iShares holdings with the headers the product page's own script sends."""
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


def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.write(s + "\n")
    LOG.flush()


def get(label, sess, url, headers, save=None):
    try:
        time.sleep(0.8)
        r = sess.get(url, headers=headers, timeout=60)
        ct = r.headers.get("content-type", "")
        body = r.content[:400].decode("utf-8", "replace").replace("\n", " | ")
        log(f"[{label}] {r.status_code} {ct} {len(r.content)}B html={b'<html' in r.content[:2000].lower()}")
        log("    head:", body)
        if save and r.status_code == 200:
            (OUT / save).write_bytes(r.content[:2_500_000])
        return r
    except Exception as e:
        log(f"[{label}] ERROR {type(e).__name__}: {e}")


def main():
    page = "https://www.ishares.com/us/products/239705/ishares-phlx-semiconductor-etf"
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    s.get(page + "?siteEntryPassthrough=true", headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}, timeout=60)
    log("cookies:", list(s.cookies.keys()))
    xh = {"Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", "Referer": page}
    get("json-xhr", s, page + "/1467271812596.ajax?tab=all&fileType=json", xh, "ishares_soxx.json")
    get("csv-ref", s, page + "/1467271812596.ajax?fileType=csv&fileName=SOXX_holdings&dataType=fund",
        {"Accept": "text/csv,*/*;q=0.8", "Referer": page}, "ishares_soxx.csv")
    get("csv-xhr", s, page + "/1467271812596.ajax?fileType=csv&fileName=SOXX_holdings&dataType=fund", xh)
    # a fresh session without the entry page
    s2 = requests.Session()
    s2.headers.update({"User-Agent": UA})
    get("json-xhr-cold", s2, page + "/1467271812596.ajax?tab=all&fileType=json", xh)
    agg = "https://www.ishares.com/us/products/239458/ishares-core-total-us-bond-market-etf"
    get("agg-json-xhr", s, agg + "/1467271812596.ajax?tab=all&fileType=json", dict(xh, Referer=agg), "ishares_agg.json")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log(traceback.format_exc())
    finally:
        LOG.close()
