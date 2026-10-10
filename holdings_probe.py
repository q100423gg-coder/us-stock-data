"""Temporary probe: raw holdings pages of Amplify (BWET, HACK, BLOK, DIVO) and Roundhill (DRAM) as GitHub's network sees them.
Writes probe_out/ (bodies + meta.json); the workflow uploads it to the data release as probe.tar.gz."""
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
META = []


def get(url, name, accept="text/html,application/xhtml+xml,*/*;q=0.8"):
    time.sleep(0.8)
    try:
        r = S.get(url, headers={"Accept": accept}, timeout=60)
        (OUT / name).write_bytes(r.content)
        META.append({"url": url, "file": name, "status": r.status_code, "final": r.url,
                     "type": r.headers.get("content-type"), "bytes": len(r.content)})
        return r
    except Exception as e:
        META.append({"url": url, "file": name, "error": f"{type(e).__name__}: {e}"[:300]})
        return None


for t in ("BWET", "HACK", "BLOK", "DIVO"):
    r = get(f"https://amplifyetfs.com/{t}-holdings", f"amplify_{t}_holdings.html")
    if t == "BWET":
        get(f"https://amplifyetfs.com/{t.lower()}/", f"amplify_{t}_page.html")
    if r is not None and r.status_code == 200:
        for i, u in enumerate(sorted(set(re.findall(r'(?:href|src)="([^"]+\.(?:csv|xlsx?)(?:\?[^"]*)?)"', r.text, re.I)))[:4]):
            get(urljoin(r.url, u), f"amplify_{t}_file{i}" + Path(u.split("?")[0]).suffix)

r = get("https://www.roundhillinvestments.com/etf/dram/", "roundhill_DRAM_page.html")
if r is not None and r.status_code == 200:
    srcs = re.findall(r'<script[^>]+src="([^"]+)"', r.text)
    n = 0
    for u in srcs:
        full = urljoin(r.url, u)
        if "roundhillinvestments.com" in full and n < 30:
            get(full, f"roundhill_js_{n:02d}.js", "*/*")
            n += 1
    for i, u in enumerate(sorted(set(re.findall(r'["\'](/?(?:api|wp-json|assets/data|data)/[^"\']{3,120})["\']', r.text)))[:10]):
        get(urljoin(r.url, u), f"roundhill_ep{i}.txt", "application/json,*/*")

(OUT / "meta.json").write_text(json.dumps(META, indent=1))
print(json.dumps(META, indent=1))
