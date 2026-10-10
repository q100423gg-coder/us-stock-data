"""Temporary probe (round 3): runs etf_holdings.py's new Roundhill and Amplify sources from GitHub's network.
Writes probe_out/ (results.json + the first raw feed answer); the workflow uploads it as probe.tar.gz."""
import json
import traceback
from pathlib import Path

import probe_etf_holdings as E          # a copy of the new etf_holdings.py (pushing that file would run the real job)

OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
res = {}
for src, fn, tickers in (("roundhill", E.src_roundhill, ("DRAM", "RAM", "MAGS")),
                         ("amplify", E.src_amplify, ("BWET", "HACK", "BLOK", "DIVO"))):
    for t in tickers:
        try:
            asof, rows = fn(t)
            res[t] = {"src": src, "asof": asof, "n": len(rows), "rows": rows[:40]}
        except Exception as e:
            res[t] = {"src": src, "error": f"{type(e).__name__}: {e}"[:400], "tb": traceback.format_exc()[-1500:]}
        print(t, json.dumps({k: v for k, v in res[t].items() if k != "rows"})[:300], flush=True)
try:                                   # the raw answer, to check the field formats
    if E.AMP.get("key"):
        base = f"https://firestore.googleapis.com/v1/projects/{E.AMP['proj']}/databases/(default)/documents/funds/BWET/holdings"
        r = E.S.get(f"{base}?pageSize=1&orderBy=__name__%20desc&key={E.AMP['key']}", timeout=60)
        (OUT / "raw_bwet.json").write_text(r.text[:200000])
        res["_raw_status"] = r.status_code
except Exception as e:
    res["_raw_error"] = f"{type(e).__name__}: {e}"
res["_amp_proj"] = E.AMP.get("proj")
res["_requests"] = E.STATUS["requests"]
(OUT / "results.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
