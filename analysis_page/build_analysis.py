#!/usr/bin/env python3
"""Build the 기업 분석 노트 artifact folder (site/) from the nightly data bundle.

  python3 build_analysis.py [--bundle analysis_bundle.tar.gz] [--macro macro.json]
                            [--radar-summary summary.json] [--radar-template template.html]
                            [--page index.html | --page-dir page/] [--out site] [--check-fresh]

Inputs
  bundle          analysis_bundle.tar.gz from the us-stock-data release (downloaded when not given)
  macro           newest macro.json (downloaded when not given; replaces the bundle's copy when newer)
  radar-summary   추세 레이더's data/summary.json: adds each ticker's verdict (v) and grade (g)
  radar-template  추세 레이더's page template: Korean names and search aliases (KO tables)
  page            the assembled page (src/index.html.txt of the published artifact), or
  page-dir        the page sources (shell.html + *.js) to assemble a new index.html

Output: site/index.html, site/data/{universe,calendar,macro,meta}.json, site/data/f/NN.json,
        site/src/build_analysis.py.txt, site/src/index.html.txt, and site/publish.json (the file list).
Exit code 3 with --check-fresh when the bundle's prices are older than the latest finished US session.
"""
import argparse
import json
import shutil
import sys
import tarfile
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
REL = "https://github.com/q100423gg-coder/us-stock-data/releases/download/data/"
RADAR_URL = "https://claude.ai/artifact/Ac73mJW8XkFSg7h6JpuL3Y"
JS_ORDER = ["core.js", "app_common.js", "app_learn.js", "app_company.js", "app_ai.js", "app_views.js", "app_macro.js", "app_main.js"]
NY = ZoneInfo("America/New_York")
KST = ZoneInfo("Asia/Seoul")


def download(name, dest):
    req = urllib.request.Request(REL + name, headers={"User-Agent": "build-analysis"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    return dest


def expected_session():
    """Most recent US session that has closed (weekdays; holidays are not modelled)."""
    now = datetime.now(NY)
    d = now.date()
    if now.hour * 60 + now.minute < 16 * 60 + 30:
        d -= timedelta(days=1)
    while d.weekday() > 4:
        d -= timedelta(days=1)
    return d.isoformat()


def ko_tables(template_text):
    out = {}
    for ln in template_text.splitlines():
        s = ln.strip()
        try:
            if s.startswith("const KO = {") and s.endswith("};"):
                table = json.loads(s[len("const KO = "):-1])
            elif s.startswith("for (const [k, v] of Object.entries({") and ")) if (!KO[k])" in s:
                table = json.loads(s[s.index("({") + 1:s.index(")) if (!KO[k])")])
            else:
                continue
        except ValueError:
            continue
        for k, v in table.items():
            out.setdefault(k, str(v))
    return out


def assemble_page(page_dir, cfg):
    page_dir = Path(page_dir)
    shell = (page_dir / "shell.html").read_text(encoding="utf-8")
    js = "\n".join((page_dir / f).read_text(encoding="utf-8") for f in JS_ORDER)
    return shell + "\n<script>window.__CFG = " + json.dumps(cfg, ensure_ascii=False) + ";</script>\n<script>\n" + js + "\n</script>\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle")
    ap.add_argument("--macro")
    ap.add_argument("--radar-summary")
    ap.add_argument("--radar-template")
    ap.add_argument("--page")
    ap.add_argument("--page-dir")
    ap.add_argument("--out", default=str(HERE / "site"))
    ap.add_argument("--check-fresh", action="store_true")
    a = ap.parse_args()

    out = Path(a.out)
    work = out.parent / (out.name + "_work")
    work.mkdir(parents=True, exist_ok=True)
    bundle = Path(a.bundle) if a.bundle else download("analysis_bundle.tar.gz", work / "analysis_bundle.tar.gz")
    if out.exists():
        shutil.rmtree(out)
    (out / "src").mkdir(parents=True)
    with tarfile.open(bundle, "r:gz") as tar:
        members = [m for m in tar.getmembers() if m.name.startswith("data/") and ".." not in m.name]
        tar.extractall(out, members=members)
    data = out / "data"
    # upstream names sometimes carry U+FFFD (a character lost before it reached us); the publisher refuses those
    for f in data.rglob("*.json"):
        txt = f.read_text(encoding="utf-8", errors="replace")
        if "\ufffd" in txt:
            f.write_text(txt.replace("\ufffd", "?"), encoding="utf-8")
    meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))

    # newest macro.json (the macro job can finish after the bundle was built)
    try:
        mpath = Path(a.macro) if a.macro else download("macro.json", work / "macro.json")
        new = json.loads(mpath.read_text(encoding="utf-8"))
        old_p = data / "macro.json"
        old = json.loads(old_p.read_text(encoding="utf-8")) if old_p.exists() else {}
        if new.get("series") and new.get("updated_at", "") >= old.get("updated_at", ""):
            old_p.write_text(mpath.read_text(encoding="utf-8", errors="replace").replace("\ufffd", "?"), encoding="utf-8")
    except Exception as e:
        print(f"macro.json refresh skipped: {e}", file=sys.stderr)

    uni_p = data / "universe.json"
    uni = json.loads(uni_p.read_text(encoding="utf-8"))
    cols = uni["cols"]
    n = len(cols["t"])
    # 추세 레이더 verdicts and grades
    radar_asof = None
    if a.radar_summary and Path(a.radar_summary).exists():
        rs = json.loads(Path(a.radar_summary).read_text(encoding="utf-8"))
        rc = rs.get("cols", {})
        radar_asof = (rs.get("meta") or {}).get("asof")
        pos = {t: i for i, t in enumerate(rc.get("t", []))}
        cols["v"] = [rc["ac"][pos[t]] if t in pos and "ac" in rc else None for t in cols["t"]]
        cols["g"] = [rc["g"][pos[t]] if t in pos and "g" in rc else None for t in cols["t"]]
    else:
        cols["v"] = [None] * n
        cols["g"] = [None] * n
    # Korean names
    ko = {}
    if a.radar_template and Path(a.radar_template).exists():
        ko = ko_tables(Path(a.radar_template).read_text(encoding="utf-8"))
    uni["ko"] = {t: ko[t] for t in cols["t"] if t in ko}
    built = datetime.now(KST)
    uni["built"] = built.strftime("%-m/%-d %H:%M")
    uni["radar_asof"] = radar_asof
    uni_p.write_text(json.dumps(uni, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")

    # page
    cfg = {"radarUrl": RADAR_URL}
    if a.page_dir:
        page = assemble_page(a.page_dir, cfg)
    elif a.page:
        page = Path(a.page).read_text(encoding="utf-8")
    else:
        sys.exit("--page or --page-dir is required")
    (out / "index.html").write_text(page, encoding="utf-8")
    (out / "src" / "index.html.txt").write_text(page, encoding="utf-8")
    shutil.copy(Path(__file__), out / "src" / "build_analysis.py.txt")

    files = sorted(str(p.relative_to(out)) for p in out.rglob("*") if p.is_file() and p.name != "index.html")
    (out / "publish.json").write_text(json.dumps(files, indent=0), encoding="utf-8")
    files = [f for f in files if f != "publish.json"]
    (out / "publish.json").write_text(json.dumps(files, indent=0), encoding="utf-8")
    total = sum((out / f).stat().st_size for f in files) + (out / "index.html").stat().st_size
    exp = expected_session()
    fresh = meta.get("prices_asof") == exp
    print(json.dumps({"prices_asof": meta.get("prices_asof"), "expected": exp, "fresh": fresh, "tickers": n,
                      "with_fundamentals": meta.get("with_fundamentals"), "radar_asof": radar_asof, "ko_names": len(uni["ko"]),
                      "files": len(files) + 1, "bytes": total, "fetch": {k: meta.get("fetch", {}).get(k) for k in ("fetched", "failed", "stopped")}},
                     ensure_ascii=False))
    if a.check_fresh and not fresh:
        sys.exit(3)


if __name__ == "__main__":
    main()
