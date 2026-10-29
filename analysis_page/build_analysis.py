#!/usr/bin/env python3
"""Build the 기업 분석 노트 artifact folder (site/) from the nightly data bundle.

  python3 build_analysis.py [--bundle analysis_bundle.tar.gz] [--macro macro.json]
                            [--radar-summary summary.json] [--radar-template template.html]
                            [--page index.html | --page-dir page/] [--out site] [--check-fresh]

Inputs
  bundle          analysis_bundle.tar.gz from the us-stock-data release (downloaded when not given)
  macro           newest macro.json (downloaded when not given; replaces the bundle's copy when newer)
  radar-summary   추세 레이더's data/summary.json: adds each ticker's verdict (v) and grade (g), stocks and ETFs,
                  and the Korean labels of the ETFs
  radar-template  추세 레이더's page template: Korean names and search aliases (KO tables)
  page            the assembled page (src/index.html.txt of the published artifact), or
  page-dir        the page sources (shell.html + *.js) to assemble a new index.html

Market brief (the home page's "왜 움직였나" card, written by the daily task from the news):
  build_analysis.py --brief-facts [--out site]          after a build: the session's numbers as JSON (index and
                                                        sector ETFs, biggest large-cap movers, recent reports,
                                                        upcoming reports) for the research
  build_analysis.py --add-brief brief.json [--out site] checks brief.json and adds it as site/data/brief.json
                                                        (and to publish.json); a bad file is reported and skipped

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


INDEX_ETF = [("SPY", "S&P 500"), ("QQQ", "나스닥 100"), ("DIA", "다우"), ("IWM", "러셀 2000"), ("SOXX", "반도체"),
             ("TLT", "미국 장기채"), ("GLD", "금"), ("USO", "원유")]
SECTOR_ETF = [("XLK", "기술"), ("XLC", "커뮤니케이션"), ("XLY", "경기소비재"), ("XLF", "금융"), ("XLV", "헬스케어"),
              ("XLI", "산업재"), ("XLP", "필수소비재"), ("XLE", "에너지"), ("XLU", "유틸리티"), ("XLRE", "부동산"), ("XLB", "소재")]


def brief_facts(out):
    """The built site's numbers for the latest session, as the research's starting point."""
    data = out / "data"
    meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))
    u = json.loads((data / "universe.json").read_text(encoding="utf-8"))
    c = u["cols"]
    keys = ("t", "n", "q", "s", "ch", "mc", "lr", "ls", "nx", "sp5")
    rows = [{k: (c[k][i] if k in c else None) for k in keys} for i in range(len(c["t"]))]
    by = {r["t"]: r for r in rows}
    ko = u.get("ko") or {}
    sec = [x[1] for x in u.get("sectors") or []]
    name = lambda t: (ko.get(t) or "").split("|")[0] or by[t]["n"]
    num = lambda v: isinstance(v, (int, float))
    dates = u.get("dates") or []
    asof = meta.get("prices_asof") or (dates[-1] if dates else None)
    prev = dates[-2] if len(dates) > 1 else None
    one = lambda r: dict(t=r["t"], name=name(r["t"]), ch=r["ch"], mc_b=round(r["mc"], 1) if num(r["mc"]) else None,
                         sector=sec[r["s"]] if num(r["s"]) and 0 <= r["s"] < len(sec) else None)
    eq = [r for r in rows if r["q"] == "EQUITY" and num(r["ch"]) and num(r["mc"])]
    big = [r for r in eq if r["mc"] >= 20]
    soon = sorted((r for r in eq if r["mc"] >= 50 and r["nx"] and asof and r["nx"] > asof), key=lambda r: (r["nx"], -r["mc"]))
    facts = dict(
        asof=asof,
        indices=[dict(t=t, label=l, ch=by[t]["ch"]) for t, l in INDEX_ETF if t in by],
        sectors=sorted([dict(t=t, label=l, ch=by[t]["ch"]) for t, l in SECTOR_ETF if t in by and num(by[t]["ch"])],
                       key=lambda x: -x["ch"]),
        up=[one(r) for r in sorted(big, key=lambda r: -r["ch"])[:10]],
        down=[one(r) for r in sorted(big, key=lambda r: r["ch"])[:10]],
        mega=[one(r) for r in sorted(eq, key=lambda r: -r["mc"])[:10]],
        reported=[dict(one(r), reported=r["lr"], surprise_pct=r["ls"]) for r in sorted(
            (r for r in big if r["lr"] in (asof, prev)), key=lambda r: -abs(r["ch"]))[:15]],
        upcoming=[dict(one(r), date=r["nx"]) for r in soon[:12]],
        note="ch: % change on the session; mc_b: market cap in $B; reported = the latest report date (a report "
             "after the close moves the price the next session)",
    )
    print(json.dumps(facts, ensure_ascii=False, indent=1))


def add_brief(path, out):
    """Check the written brief, attach the session's numbers from the built data, and add it to the site.

    brief.json (Korean text, written by the daily task from the news; numbers are refs into sources, 1-based):
      {"asof": "YYYY-MM-DD", "headline": "...",
       "drivers": [{"title": "...", "body": "...", "tickers": ["VRT"], "src": [1, 2]}],      1-6 items; add "ah": true
                                                                                    to a driver about after-hours news
                                                                                    (its chips then show no session move)
       "movers":  [{"t": "VRT", "why": "...", "src": [3]}],                                   0-10 items
       "next":    ["..."],                                                                    0-5 items
       "sources": [{"title": "...", "url": "https://...", "site": "Reuters"}]}                1-16 items
    A bad file is reported (BRIEF_SKIPPED=...) and left out; it never fails the build.
    """
    def txt(v, n):
        return " ".join(str(v or "").replace("\ufffd", "").split())[:n]
    try:
        b = json.loads(Path(path).read_text(encoding="utf-8"))
        src = [dict(title=txt(x.get("title"), 160), url=str(x.get("url") or "").strip(), site=txt(x.get("site"), 40))
               for x in b.get("sources") or [] if isinstance(x, dict) and str(x.get("url") or "").startswith("https://")][:16]
        ref = lambda v: sorted({i for i in (v or []) if isinstance(i, int) and 1 <= i <= len(src)})
        tick = lambda v: txt(v, 12).upper().replace(".", "-")
        drv = [dict(title=txt(d.get("title"), 80), body=txt(d.get("body"), 700), ah=d.get("ah") is True,
                    tickers=list(dict.fromkeys(tick(t) for t in d.get("tickers") or [] if txt(t, 12)))[:8], src=ref(d.get("src")))
               for d in b.get("drivers") or [] if isinstance(d, dict) and txt(d.get("title"), 80) and txt(d.get("body"), 700)][:6]
        mov = [dict(t=tick(m.get("t")), why=txt(m.get("why"), 240), src=ref(m.get("src")))
               for m in b.get("movers") or [] if isinstance(m, dict) and txt(m.get("t"), 12) and txt(m.get("why"), 240)][:10]
        asof = txt(b.get("asof"), 10)
        datetime.strptime(asof, "%Y-%m-%d")
        brief = dict(asof=asof, made=datetime.now(KST).isoformat(timespec="minutes"), headline=txt(b.get("headline"), 300),
                     drivers=drv, movers=mov, next=[txt(x, 200) for x in b.get("next") or [] if txt(x, 200)][:5], sources=src)
        if not (brief["headline"] and drv and src):
            raise ValueError("headline, at least one driver and at least one https source are required")
    except Exception as e:
        print(f"BRIEF_SKIPPED={type(e).__name__}: {e}")
        return
    # the session's moves from the built data (only when the brief is about that session)
    data = out / "data"
    try:
        meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))
        c = json.loads((data / "universe.json").read_text(encoding="utf-8"))["cols"]
        chg = {t: v for t, v in zip(c["t"], c["ch"]) if isinstance(v, (int, float))}
    except Exception:
        meta, chg = {}, {}
    if chg and meta.get("prices_asof") == asof:
        brief["tape"] = [dict(t=t, label=l, ch=chg[t]) for t, l in INDEX_ETF if t in chg]
        brief["sectors"] = sorted((dict(t=t, label=l, ch=chg[t]) for t, l in SECTOR_ETF if t in chg), key=lambda x: -x["ch"])
        for m in mov:
            m["ch"] = chg.get(m["t"])
        for d in drv:
            if not d["ah"]:
                d["ch"] = {t: chg[t] for t in d["tickers"] if t in chg}
    else:
        print(f"BRIEF_NOTE=prices are for {meta.get('prices_asof')}, the brief for {asof}: no session numbers attached")
    data.mkdir(parents=True, exist_ok=True)
    (data / "brief.json").write_text(json.dumps(brief, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    pub = out / "publish.json"
    files = json.loads(pub.read_text(encoding="utf-8")) if pub.exists() else []
    if "data/brief.json" not in files:
        files.append("data/brief.json")
        pub.write_text(json.dumps(sorted(files), indent=0), encoding="utf-8")
    print(f"BRIEF_ADDED={asof} drivers={len(drv)} movers={len(mov)} next={len(brief['next'])} sources={len(src)}")


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
    ap.add_argument("--brief-facts", action="store_true")
    ap.add_argument("--add-brief")
    a = ap.parse_args()

    out = Path(a.out)
    if a.brief_facts:
        return brief_facts(out)
    if a.add_brief:
        return add_brief(a.add_brief, out)
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
    etf_ko = {}
    if a.radar_summary and Path(a.radar_summary).exists():
        rs = json.loads(Path(a.radar_summary).read_text(encoding="utf-8"))
        radar_asof = (rs.get("meta") or {}).get("asof")
        # stocks are in `cols`, ETFs in the columnar `etf` block (same verdict codes and grades)
        vg = {}
        for rc in (rs.get("etf") or {}, rs.get("cols") or {}):
            if not isinstance(rc, dict) or not isinstance(rc.get("t"), list):
                continue
            ac, gr = rc.get("ac") or [], rc.get("g") or []
            for i, t in enumerate(rc["t"]):
                vg[t] = (ac[i] if i < len(ac) else None, gr[i] if i < len(gr) else None)
        e = rs.get("etf") or {}
        if isinstance(e, dict) and isinstance(e.get("t"), list) and isinstance(e.get("nm"), list):
            etf_ko = {t: nm for t, nm in zip(e["t"], e["nm"]) if isinstance(nm, str) and nm.strip()}
        cols["v"] = [vg.get(t, (None, None))[0] for t in cols["t"]]
        cols["g"] = [vg.get(t, (None, None))[1] for t in cols["t"]]
    else:
        cols["v"] = [None] * n
        cols["g"] = [None] * n
    # Korean names
    ko = {}
    if a.radar_template and Path(a.radar_template).exists():
        ko = ko_tables(Path(a.radar_template).read_text(encoding="utf-8"))
    # ETFs: the radar's Korean labels (반도체 3배, 나스닥 100 ...) as display names and search aliases
    for t, nm in etf_ko.items():
        ko.setdefault(t, nm.replace("|", "/"))
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
