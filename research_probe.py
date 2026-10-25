"""Temporary: long daily histories for a strategy study (index filters, leveraged ETFs, sector rotation) plus
Kenneth French's monthly industry and momentum portfolios. Output: probe_out/ (uploaded as probe.tar.gz)."""
import io
import time
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd
import yfinance as yf

OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)
TICKERS = ("^GSPC ^NDX ^SOX ^IRX SPY QQQ IWM DIA TQQQ QLD UPRO SSO SPXL SOXL USD TECL ROM SOXX SMH "
           "XLK XLF XLE XLV XLY XLP XLI XLB XLU XLRE XLC GLD TLT IEF SHY BIL EFA EEM VNQ MTUM SPMO").split()
frames = []
for t in TICKERS:
    for attempt in range(3):
        try:
            df = yf.download(t, period="max", interval="1d", auto_adjust=False, actions=False, progress=False,
                             threads=False)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df = df.rename(columns={"Open": "o", "High": "h", "Low": "l", "Close": "c", "Adj Close": "a",
                                    "Volume": "v"})[["o", "h", "l", "c", "a", "v"]].dropna(subset=["c"])
            df.index.name = "d"
            df["t"] = t
            frames.append(df.reset_index())
            print(t, len(df), df.index.min().date(), df.index.max().date(), flush=True)
            break
        except Exception as e:
            print(t, "failed", type(e).__name__, e, flush=True)
            time.sleep(5)
    time.sleep(1)
pd.concat(frames).to_csv(OUT / "prices.csv.gz", index=False, float_format="%.6g")

FF = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
for name in ("10_Industry_Portfolios_CSV.zip", "F-F_Research_Data_Factors_CSV.zip", "F-F_Momentum_Factor_CSV.zip",
             "10_Portfolios_Prior_12_2_CSV.zip", "10_Industry_Portfolios_daily_CSV.zip"):
    try:
        req = urllib.request.Request(FF + name, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=60).read()
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            for n in z.namelist():
                (OUT / n).write_bytes(z.read(n))
                print(name, "->", n, flush=True)
    except Exception as e:
        print(name, "failed", type(e).__name__, e, flush=True)
