"""Temporary probe (round 2): the scripts behind Amplify's holdings tables and Roundhill's daily holdings files,
as GitHub's network sees them. Writes probe_out/ (bodies + meta.json); the workflow uploads it as probe.tar.gz."""
import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
META = []


def get(url, name, accept="*/*"):
    time.sleep(0.6)
    try:
        r = S.get(url, headers={"Accept": accept}, timeout=60)
        META.append({"url": url, "file": name, "status": r.status_code, "final": r.url,
                     "type": r.headers.get("content-type"), "bytes": len(r.content)})
        if r.status_code == 200:
            (OUT / name).write_bytes(r.content)
        return r
    except Exception as e:
        META.append({"url": url, "file": name, "error": f"{type(e).__name__}: {e}"[:300]})
        return None


A = "https://amplifyetfs.com/wp-content/plugins/"
for i, u in enumerate([A + "amplify-data/js/amplify-firestore.js", A + "amplify-data/amplify-data-loader.js",
                       A + "amplify-data/data-dictionary.json",
                       A + "amplify-firestore-shortcodes/includes/js/all-holdings-table.js",
                       A + "amplify-firestore-shortcodes/includes/js/holdings-download.js",
                       A + "amplify-firestore-shortcodes/includes/js/top-holdings-table.js"]):
    get(u, f"amplify_{i}_" + u.rsplit("/", 1)[1])

R = "https://www.roundhillinvestments.com/assets/data/"
d = date.today()
for k in range(15):
    day = d - timedelta(days=k)
    r = get(R + f"FilepointRoundhill.40RU.RU_Holdings_{day:%m%d%Y}.csv", f"roundhill_holdings_{day:%Y%m%d}.csv")
    if r is not None and r.status_code == 200 and not r.content.lstrip()[:15].lower().startswith(b"<!doctype"):
        break
for k in range(15):
    day = d - timedelta(days=k)
    r = get(R + f"rex_data/REX_RAM_Holdings_{day:%Y%m%d}.csv", f"rex_RAM_holdings_{day:%Y%m%d}.csv")
    if r is not None and r.status_code == 200 and not r.content.lstrip()[:15].lower().startswith(b"<!doctype"):
        break

(OUT / "meta.json").write_text(json.dumps(META, indent=1))
print(json.dumps(META, indent=1))
