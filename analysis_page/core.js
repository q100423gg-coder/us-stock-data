"use strict";
/* =====================================================================
   기업 분석 노트 — core: DOM helpers, formatting, storage, data, search,
   tooltip and the SVG chart primitives used by every view.
   ===================================================================== */

// ---------------------------------------------------------------- DOM
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;            // trusted, page-authored markup only
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === "") continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const SVGNS = "http://www.w3.org/2000/svg";
function sv(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") el.textContent = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------------------------------------------------------------- storage (per-viewer conveniences only)
const LS = {
  get(k, d) { try { const v = localStorage.getItem("fa:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("fa:" + k, JSON.stringify(v)); } catch (e) { /* private mode, quota */ } },
  del(k) { try { localStorage.removeItem("fa:" + k); } catch (e) { /* ignore */ } },
};

// ---------------------------------------------------------------- numbers & dates
const isNum = (v) => typeof v === "number" && isFinite(v);
function fmtN(v, nd = 0) {
  if (!isNum(v)) return "–";
  return v.toLocaleString("en-US", { minimumFractionDigits: nd, maximumFractionDigits: nd });
}
function fmtP(v, nd = 1, sign = true) {                      // v already in percent units
  if (!isNum(v)) return "–";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: nd, maximumFractionDigits: nd });
  return (v > 0 && sign ? "+" : v < 0 ? "−" : "") + s + "%";
}
function fmtR(v, nd = 1) {                                    // ratio from 0..1 to percent
  return isNum(v) ? fmtP(v * 100, nd, false) : "–";
}
function fmtX(v, nd = 1) { return isNum(v) ? fmtN(v, nd) + "배" : "–"; }
function fmtPx(v) {
  if (!isNum(v)) return "–";
  const nd = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4;
  return "$" + fmtN(v, nd);
}
/** amounts stored in millions -> "$331.8B" */
function fmtM(vm, cur) {
  if (!isNum(vm)) return "–";
  const sym = !cur || cur === "USD" ? "$" : "";
  const suf = !cur || cur === "USD" ? "" : " " + cur;
  const a = Math.abs(vm), sg = vm < 0 ? "−" : "";
  let s;
  if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "T";
  else if (a >= 1e3) s = (a / 1e3).toFixed(a >= 1e5 ? 0 : a >= 1e4 ? 1 : 2) + "B";
  else if (a >= 1) s = a.toFixed(a >= 100 ? 0 : 1) + "M";
  else s = (a * 1000).toFixed(0) + "K";
  return sg + sym + s + suf;
}
/** amounts in millions -> Korean units, e.g. 3,318억 달러 */
function fmtKo(vm) {
  if (!isNum(vm)) return "";
  const won = Math.abs(vm) * 1e6, sg = vm < 0 ? "−" : "";
  if (won >= 1e12) return sg + (won / 1e12).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "조 달러";
  if (won >= 1e8) return sg + Math.round(won / 1e8).toLocaleString("en-US") + "억 달러";
  if (won >= 1e4) return sg + Math.round(won / 1e4).toLocaleString("en-US") + "만 달러";
  return sg + Math.round(won).toLocaleString("en-US") + "달러";
}
function fmtShares(vm) {                                       // share counts stored in millions
  if (!isNum(vm)) return "–";
  if (Math.abs(vm) >= 1000) return fmtN(vm / 1000, 2) + "B주";
  return fmtN(vm, vm >= 100 ? 0 : 1) + "M주";
}
function fmtBig(v) {                                           // plain counts (shares, dollars)
  if (!isNum(v)) return "–";
  const a = Math.abs(v), sg = v < 0 ? "−" : "";
  if (a >= 1e12) return sg + (a / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return sg + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sg + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sg + (a / 1e3).toFixed(1) + "K";
  return sg + fmtN(a, 0);
}
const cls = (v) => (isNum(v) ? (v > 0 ? "up" : v < 0 ? "dn" : "") : "");
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function pd(s) { return s ? new Date(s.length <= 10 ? s + "T00:00:00" : s) : null; }
function fmtD(s, style) {
  const d = typeof s === "string" ? pd(s) : s;
  if (!d || isNaN(d)) return "–";
  const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
  if (style === "md") return `${m}/${dd}`;
  if (style === "mdw") return `${m}월 ${dd}일 (${WD[d.getDay()]})`;
  if (style === "ym") return `${String(y).slice(2)}.${String(m).padStart(2, "0")}`;
  if (style === "long") return `${y}년 ${m}월 ${dd}일`;
  return `${y}.${String(m).padStart(2, "0")}.${String(dd).padStart(2, "0")}`;
}
function daysBetween(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function relTime(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return Math.round(s / 60) + "분 전";
  if (s < 86400) return Math.round(s / 3600) + "시간 전";
  return Math.round(s / 86400) + "일 전";
}
/** fiscal period label from an ISO period-end date: "FY26" / "3Q26" */
function perLabel(iso, annual, fyeMonth) {
  const d = pd(iso);
  if (!d) return "";
  const y = d.getFullYear() % 100, m = d.getMonth() + 1;
  if (annual) return "FY" + String(y).padStart(2, "0");
  return `${String(y).padStart(2, "0")}.${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- Korean labels
const SECTOR_KO = ["기술", "헬스케어", "금융", "경기소비재", "커뮤니케이션", "산업재", "필수소비재", "에너지", "유틸리티", "부동산", "소재"];
const REC_KO = { strong_buy: "강력 매수", buy: "매수", hold: "중립", underperform: "시장 하회", sell: "매도", none: "의견 없음" };
const GRADE_KO = {
  "Strong Buy": "강력 매수", "Buy": "매수", "Outperform": "시장 상회", "Overweight": "비중 확대", "Accumulate": "매수",
  "Market Outperform": "시장 상회", "Sector Outperform": "업종 상회", "Positive": "긍정적", "Top Pick": "최선호",
  "Conviction Buy": "확신 매수", "Speculative Buy": "투기적 매수", "Long-Term Buy": "장기 매수", "Moderate Buy": "매수",
  "Add": "비중 확대", "Hold": "중립", "Neutral": "중립", "Equal-Weight": "비중 유지", "Equal-weight": "비중 유지",
  "Market Perform": "시장 수익률", "Sector Perform": "업종 수익률", "Peer Perform": "업종 수익률", "In-Line": "시장 수익률",
  "Sector Weight": "비중 유지", "Mixed": "혼조", "Perform": "시장 수익률", "Fair Value": "적정 가치",
  "Sell": "매도", "Underperform": "시장 하회", "Underweight": "비중 축소", "Reduce": "비중 축소", "Negative": "부정적",
  "Sector Underperform": "업종 하회", "Market Underperform": "시장 하회", "Strong Sell": "강력 매도",
};
const ACTION_KO = { up: "상향", down: "하향", main: "유지", init: "신규", reit: "재확인" };
const PT_KO = { Raises: "목표가 상향", Lowers: "목표가 하향", Maintains: "목표가 유지", Announces: "목표가 제시", Adjusts: "목표가 조정", Sets: "목표가 제시" };
const RADAR_KO = ["매도", "비중 축소", "관망", "보유", "매수 대기", "매수"];
function gradeKo(g) { return (g && GRADE_KO[g]) || g || "–"; }
function relationKo(r) {
  if (!r) return "–";
  const m = [[/chief executive officer|^ceo/i, "CEO"], [/chief financial officer|^cfo/i, "CFO"], [/chief operating officer|^coo/i, "COO"],
    [/chief technology officer|^cto/i, "CTO"], [/chief accounting officer/i, "최고회계책임자"], [/general counsel/i, "법무 총괄"],
    [/chairman/i, "이사회 의장"], [/president/i, "사장"], [/10%|beneficial owner/i, "10% 이상 대주주"], [/director/i, "이사"],
    [/officer/i, "임원"]];
  for (const [re, ko] of m) if (re.test(r)) return ko;
  return r;
}
function insiderKind(text) {
  const t = (text || "").toLowerCase();
  if (t.startsWith("sale")) return ["매도", "sell"];
  if (t.startsWith("purchase")) return ["매수", "buy"];
  if (t.includes("award") || t.includes("grant")) return ["주식 보상", "award"];
  if (t.includes("gift")) return ["증여", "gift"];
  if (t.includes("exercise") || t.includes("conversion")) return ["옵션 행사", "exercise"];
  if (t.includes("tax")) return ["세금 납부", "tax"];
  if (!t) return ["지분 변동", "other"];
  return ["기타", "other"];
}

// ---------------------------------------------------------------- data
const DATA = { uni: null, rows: [], bySym: new Map(), dates: [], shards: new Map(), macro: null, cal: null, meta: null, ko: {} };
async function loadJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(path + " → HTTP " + r.status);
  return r.json();
}
async function loadUniverse() {
  const u = await loadJSON("data/universe.json");
  DATA.uni = u;
  DATA.dates = u.dates || [];
  const c = u.cols, n = c.t.length, keys = Object.keys(c);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = {};
    for (const k of keys) r[k] = c[k][i];
    rows[i] = r;
  }
  DATA.rows = rows;
  for (const r of rows) DATA.bySym.set(r.t, r);
  DATA.ko = u.ko || {};
  return u;
}
function row(t) { return DATA.bySym.get(t) || null; }
function koName(t) { const k = DATA.ko[t]; return k ? k.split("|")[0] : ""; }
function shortEn(n) {
  if (!n) return "";
  let s = n.replace(/^The\s+/, "");
  for (let i = 0; i < 3; i++) s = s.replace(/,?\s+(Incorporated|Corporation|Company|Limited|Holdings?|Inc\.?|Corp\.?|Co\.?|Ltd\.?|plc|PLC|N\.V\.|S\.A\.|L\.P\.|AG|SE)$/, "");
  return s.trim();
}
function dispName(t) { const r = row(t); return koName(t) || shortEn(r && r.n) || t; }
async function getRec(t) {
  const r = row(t);
  if (!r) return null;
  const sh = r.sh;
  if (!DATA.shards.has(sh)) DATA.shards.set(sh, loadJSON(`data/f/${String(sh).padStart(2, "0")}.json`).catch((e) => { DATA.shards.delete(sh); throw e; }));
  const shard = await DATA.shards.get(sh);
  return shard[t] || null;
}
/** delta-coded cents -> [dates[], closes[]] */
function decodePx(px) {
  if (!px || !px.c) return [[], []];
  const d = [], c = [];
  let v = 0;
  for (let i = 0; i < px.c.length; i++) {
    v += px.c[i];
    d.push(DATA.dates[px.i0 + i]);
    c.push(v / 100);
  }
  return [d, c];
}
async function loadMacro() {
  if (!DATA.macro) DATA.macro = loadJSON("data/macro.json").catch((e) => { DATA.macro = null; throw e; });
  return DATA.macro;
}
async function loadCal() {
  if (!DATA.cal) DATA.cal = loadJSON("data/calendar.json").catch((e) => { DATA.cal = null; throw e; });
  return DATA.cal;
}

// ---------------------------------------------------------------- search
let SEARCH = null;
function buildSearch() {
  SEARCH = DATA.rows.map((r) => {
    const ko = (DATA.ko[r.t] || "").toLowerCase().split("|").filter(Boolean);
    return { t: r.t, tl: r.t.toLowerCase(), en: (r.n || "").toLowerCase(), ko, mc: r.mc || 0 };
  });
}
function search(q, limit = 8) {
  q = (q || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!q || !SEARCH) return [];
  const qn = q.replace(/[.\/]/g, "-"), qs = q.replace(/\s/g, "");
  const out = [];
  for (const e of SEARCH) {
    let sc = 0;
    if (e.tl === qn) sc = 100;
    else if (e.tl.startsWith(qn)) sc = 80 - (e.tl.length - qn.length);
    for (const k of e.ko) {
      const ks = k.replace(/\s/g, "");
      if (ks === qs) sc = Math.max(sc, 95);
      else if (ks.startsWith(qs)) sc = Math.max(sc, 75);
      else if (qs.length >= 2 && ks.includes(qs)) sc = Math.max(sc, 55);
    }
    if (q.length >= 2) {
      if (e.en.startsWith(q)) sc = Math.max(sc, 70);
      else if (e.en.includes(" " + q)) sc = Math.max(sc, 50);
      else if (q.length >= 3 && e.en.includes(q)) sc = Math.max(sc, 35);
    }
    if (sc > 0) out.push([sc + Math.log10(1 + e.mc) * 2, e.t]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map((x) => x[1]);
}

// ---------------------------------------------------------------- tooltip (one per page)
const TIP = { el: null };
function tipEl() {
  if (!TIP.el) { TIP.el = h("div", { class: "tip", role: "tooltip", hidden: true }); document.body.append(TIP.el); }
  return TIP.el;
}
function showTip(clientX, clientY, content) {
  const el = tipEl();
  clear(el);
  el.append(content);
  el.hidden = false;
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  let x = clientX + 14, y = clientY + 14;
  if (x + r.width > vw - 8) x = clientX - r.width - 14;
  if (x < 8) x = 8;
  if (y + r.height > vh - 8) y = clientY - r.height - 14;
  if (y < 8) y = 8;
  el.style.left = x + "px";
  el.style.top = y + "px";
}
function hideTip() { if (TIP.el) TIP.el.hidden = true; }
/** tooltip body: title + rows of [color, value, label] */
function tipBody(title, rows) {
  return h("div", null,
    title ? h("div", { class: "tip-t" }, title) : null,
    rows.map(([color, val, label, dashed]) => h("div", { class: "tip-r" },
      color ? h("i", { class: "lkey" + (dashed ? " dash" : ""), style: { background: color } }) : h("i", { class: "lkey none" }),
      h("b", null, val), label ? h("span", null, label) : null)));
}

// ---------------------------------------------------------------- chart helpers
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * p;
}
function niceTicks(lo, hi, count = 4) {
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; lo -= d; hi += d; }
  const st = niceStep(hi - lo, count);
  const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
  const out = [];
  for (let v = a; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return out;
}
function textW(s, size = 11) { return String(s).length * size * 0.62 + 2; }
const CHARTS = new Set();                     // live charts, redrawn when their box resizes
const RO = typeof ResizeObserver !== "undefined" ? new ResizeObserver((ents) => {
  for (const e of ents) {
    const c = e.target.__chart;
    if (!c) continue;
    const w = Math.round(e.contentRect.width);
    if (w > 0 && Math.abs(w - (c.w || 0)) > 3) { c.w = w; c.draw(); }
  }
}) : null;
function mountChart(host, draw) {
  const c = { w: Math.round(host.clientWidth) || 600, draw: () => draw(c.w) };
  host.__chart = c;
  CHARTS.add(c);
  if (RO) RO.observe(host);
  c.draw();
  return c;
}
function legend(items) {                         // [{name, color, kind: "line"|"box"|"dash"}]
  return h("div", { class: "legend" }, items.map((it) => h("span", { class: "k" },
    h("i", { class: "lk " + (it.kind || "box"), style: { background: it.color } }), h("span", null, it.name))));
}
const DAYMS = 864e5;
function timeTicks(t0, t1, maxTicks) {
  const span = (t1 - t0) / DAYMS, out = [];
  const d0 = new Date(t0);
  if (span <= 75) {
    const step = span <= 20 ? 3 : span <= 40 ? 7 : 14;
    for (let t = t0; t <= t1; t += step * DAYMS) out.push([t, fmtD(new Date(t), "md")]);
    return out;
  }
  const months = span / 30.4;
  let mstep = [1, 2, 3, 6, 12, 24, 36, 60].find((m) => months / m <= maxTicks) || 60;
  if (mstep >= 12) {
    const ystep = mstep / 12;
    for (let y = d0.getFullYear() + 1; ; y += ystep) {
      const t = new Date(y, 0, 1).getTime();
      if (t > t1) break;
      if (t >= t0) out.push([t, String(y)]);
    }
    if (out.length < 2) mstep = 6; else return out;
  }
  const m0 = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
  for (let d = m0; d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + mstep, 1)) {
    if (d.getMonth() % mstep !== 0 && mstep > 1) continue;
    out.push([d.getTime(), d.getMonth() === 0 ? String(d.getFullYear()) : (d.getMonth() + 1) + "월"]);
  }
  return out;
}

/**
 * Line chart over time or over categories.
 * opt: { height, series:[{name, color, x:[ms|index], y:[], area?, width?, dash?}], cats?: [labels] (categorical x),
 *        yFmt, tipTitle(i or ms), yZero, refs:[{y, label}], band:{lo, hi, label}, endLabel: bool, xTicks: n }
 */
function lineChart(host, opt) {
  const H = opt.height || 220;
  const fmt = opt.yFmt || ((v) => fmtN(v, 2));
  mountChart(host, (W) => {
    clear(host);
    const ser = opt.series.filter((s) => s.y.some(isNum));
    if (!ser.length) { host.append(h("p", { class: "empty" }, "표시할 데이터가 없어요.")); return; }
    let lo = Infinity, hi = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (const s of ser) for (let i = 0; i < s.y.length; i++) {
      const v = s.y[i];
      if (!isNum(v)) continue;
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      x0 = Math.min(x0, s.x[i]); x1 = Math.max(x1, s.x[i]);
    }
    for (const r of opt.refs || []) if (isNum(r.y)) { lo = Math.min(lo, r.y); hi = Math.max(hi, r.y); }
    if (opt.band) { lo = Math.min(lo, opt.band.lo); hi = Math.max(hi, opt.band.hi); }
    if (opt.yZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1;
    const ticks = niceTicks(opt.yZero && lo >= 0 ? 0 : lo - pad, hi + pad, H < 150 ? 3 : 4);
    const yl = ticks[0], yh = ticks[ticks.length - 1];
    const cats = opt.cats;
    const ml = Math.max(...ticks.map((t) => textW(fmt(t)))) + 10;
    const endW = opt.endLabel ? textW(fmt(ser[0].y.filter(isNum).slice(-1)[0]), 11) + 14 : 0;
    const m = { l: ml, r: Math.max(10, endW), t: 10, b: 24 };
    const pw = Math.max(40, W - m.l - m.r), ph = H - m.t - m.b;
    const X = cats ? (i) => m.l + (cats.length <= 1 ? pw / 2 : (i / (cats.length - 1)) * pw)
                   : (t) => m.l + (x1 === x0 ? pw / 2 : ((t - x0) / (x1 - x0)) * pw);
    const Y = (v) => m.t + ph - ((v - yl) / (yh - yl || 1)) * ph;
    const svg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.label || "차트" });
    // grid + y ticks
    for (const t of ticks) {
      const y = Y(t);
      svg.append(sv("line", { x1: m.l, x2: m.l + pw, y1: y, y2: y, class: t === 0 && yl < 0 ? "axis0" : "grid" }));
      svg.append(sv("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", class: "tick", text: fmt(t) }));
    }
    // x ticks
    if (cats) {
      const every = Math.ceil(cats.length / Math.max(2, Math.floor(pw / 56)));
      cats.forEach((c, i) => { if (i % every === 0 || i === cats.length - 1) svg.append(sv("text", { x: X(i), y: H - 6, "text-anchor": "middle", class: "tick", text: c })); });
    } else {
      for (const [t, lab] of timeTicks(x0, x1, Math.max(2, Math.floor(pw / 64)))) {
        const x = X(t);
        if (x < m.l + 14 || x > m.l + pw - 14) continue;
        svg.append(sv("text", { x, y: H - 6, "text-anchor": "middle", class: "tick", text: lab }));
      }
    }
    if (opt.band) {
      const yb0 = Y(opt.band.hi), yb1 = Y(opt.band.lo);
      svg.append(sv("rect", { x: m.l, y: yb0, width: pw, height: Math.max(1, yb1 - yb0), class: "bandr" }));
    }
    for (const r of opt.refs || []) {
      if (!isNum(r.y)) continue;
      const y = Y(r.y);
      svg.append(sv("line", { x1: m.l, x2: m.l + pw, y1: y, y2: y, class: "ref" }));
      if (r.label) svg.append(sv("text", { x: m.l + 4, y: y - 5, class: "reflab", text: r.label }));
    }
    // series
    for (const s of ser) {
      let d = "", started = false, first = null, last = null;
      for (let i = 0; i < s.y.length; i++) {
        const v = s.y[i];
        if (!isNum(v)) { started = false; continue; }
        const x = cats ? X(s.x[i]) : X(s.x[i]), y = Y(v);
        d += (started ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
        started = true;
        if (!first) first = [x, y];
        last = [x, y];
      }
      if (s.area && first) {
        const base = Y(yl <= 0 && yh >= 0 ? 0 : yl);
        svg.append(sv("path", { d: d + `L${last[0].toFixed(1)} ${base}L${first[0].toFixed(1)} ${base}Z`, fill: s.color, "fill-opacity": 0.1, stroke: "none" }));
      }
      svg.append(sv("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": s.dash || null }));
      if (s.dots) {
        for (let i = 0; i < s.y.length; i++) if (isNum(s.y[i])) svg.append(sv("circle", { cx: X(s.x[i]), cy: Y(s.y[i]), r: 3.5, fill: s.color, class: "ring" }));
      }
    }
    if (opt.endLabel && ser[0]) {
      const s = ser[0];
      let li = s.y.length - 1;
      while (li >= 0 && !isNum(s.y[li])) li--;
      if (li >= 0) {
        const x = X(s.x[li]), y = Y(s.y[li]);
        svg.append(sv("circle", { cx: x, cy: y, r: 4, fill: s.color, class: "ring" }));
        svg.append(sv("text", { x: x + 8, y: y + 4, class: "endlab", text: fmt(s.y[li]) }));
      }
    }
    // hover layer: crosshair snapping to the nearest x
    const xs = [];
    const base = ser[0];
    const allX = cats ? cats.map((_, i) => i) : Array.from(new Set(ser.flatMap((s) => s.x.filter((_, i) => isNum(s.y[i]))))).sort((a, b) => a - b);
    for (const xv of allX) xs.push(xv);
    const cross = sv("line", { class: "cross", y1: m.t, y2: m.t + ph, x1: m.l, x2: m.l, visibility: "hidden" });
    const dots = sv("g");
    svg.append(cross, dots);
    const hit = sv("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent", tabindex: 0, class: "hit" });
    svg.append(hit);
    const lookup = ser.map((s) => { const mp = new Map(); s.x.forEach((xv, i) => { if (isNum(s.y[i])) mp.set(xv, s.y[i]); }); return mp; });
    function at(clientX, clientY, idx) {
      const rect = svg.getBoundingClientRect();
      let xv;
      if (idx != null) xv = xs[idx];
      else {
        const px = clientX - rect.left;
        let best = 0, bd = Infinity;
        for (let i = 0; i < xs.length; i++) { const dd = Math.abs(X(xs[i]) - px); if (dd < bd) { bd = dd; best = i; } }
        xv = xs[best];
        hit.__i = best;
      }
      const x = X(xv);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("visibility", "visible");
      clear(dots);
      const rows = [];
      ser.forEach((s, k) => {
        const v = lookup[k].get(xv);
        if (!isNum(v)) return;
        dots.append(sv("circle", { cx: x, cy: Y(v), r: 4, fill: s.color, class: "ring" }));
        rows.push([s.color, (s.fmt || fmt)(v), ser.length > 1 || s.tipName ? s.name : "", !!s.dash]);
      });
      const title = opt.tipTitle ? opt.tipTitle(xv) : cats ? cats[xv] : fmtD(new Date(xv));
      showTip(clientX != null ? clientX : rect.left + x, clientY != null ? clientY : rect.top + m.t, tipBody(title, rows));
    }
    hit.addEventListener("pointermove", (e) => at(e.clientX, e.clientY));
    hit.addEventListener("pointerdown", (e) => at(e.clientX, e.clientY));
    hit.addEventListener("pointerleave", () => { hideTip(); cross.setAttribute("visibility", "hidden"); clear(dots); });
    hit.addEventListener("focus", () => { hit.__i = xs.length - 1; at(null, null, hit.__i); });
    hit.addEventListener("blur", () => { hideTip(); cross.setAttribute("visibility", "hidden"); clear(dots); });
    hit.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      hit.__i = Math.max(0, Math.min(xs.length - 1, (hit.__i ?? xs.length - 1) + (e.key === "ArrowRight" ? 1 : -1)));
      at(null, null, hit.__i);
    });
    host.append(svg);
  });
}

/**
 * Grouped column chart over categories (periods). Negative values grow down from zero.
 * opt: { height, cats:[labels], series:[{name, color, values:[], kind?: "bar"|"tick"|"line"}], yFmt, tipTitle(i), note(i) }
 */
function barChart(host, opt) {
  const H = opt.height || 220;
  const fmt = opt.yFmt || ((v) => fmtN(v, 0));
  mountChart(host, (W) => {
    clear(host);
    const cats = opt.cats, n = cats.length;
    const ser = opt.series.filter((s) => s.values.some(isNum));
    if (!n || !ser.length) { host.append(h("p", { class: "empty" }, "표시할 데이터가 없어요.")); return; }
    let lo = 0, hi = 0;
    for (const s of ser) for (const v of s.values) if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (hi === lo) hi = lo + 1;
    const ticks = niceTicks(lo, hi, H < 170 ? 3 : 4);
    const yl = ticks[0], yh = ticks[ticks.length - 1];
    const ml = Math.max(...ticks.map((t) => textW(fmt(t)))) + 10;
    const m = { l: ml, r: 8, t: 12, b: 24 };
    const pw = Math.max(40, W - m.l - m.r), ph = H - m.t - m.b;
    const band = pw / n;
    const bars = ser.filter((s) => (s.kind || "bar") === "bar");
    const bw = Math.max(3, Math.min(24, (band * 0.72 - (bars.length - 1) * 2) / Math.max(1, bars.length)));
    const gw = bars.length * bw + (bars.length - 1) * 2;
    const Y = (v) => m.t + ph - ((v - yl) / (yh - yl || 1)) * ph;
    const svg = sv("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opt.label || "차트" });
    for (const t of ticks) {
      const y = Y(t);
      svg.append(sv("line", { x1: m.l, x2: m.l + pw, y1: y, y2: y, class: t === 0 ? "axis0" : "grid" }));
      svg.append(sv("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", class: "tick", text: fmt(t) }));
    }
    const every = Math.ceil(n / Math.max(2, Math.floor(pw / 50)));
    cats.forEach((c, i) => {
      if (i % every === 0 || i === n - 1) svg.append(sv("text", { x: m.l + band * (i + 0.5), y: H - 6, "text-anchor": "middle", class: "tick", text: c }));
    });
    const y0 = Y(0);
    const hl = sv("rect", { class: "bandhl", y: m.t, height: ph, width: band, x: -999 });
    svg.append(hl);
    for (let i = 0; i < n; i++) {
      const cx = m.l + band * (i + 0.5);
      bars.forEach((s, k) => {
        const v = s.values[i];
        if (!isNum(v) || v === 0) return;
        const x = cx - gw / 2 + k * (bw + 2), y = Y(v), hgt = Math.abs(y - y0);
        const r = Math.min(4, bw / 2, hgt);
        let d;
        if (v > 0) d = `M${x} ${y0}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${y0}Z`;
        else d = `M${x} ${y0}V${y - r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y - r}V${y0}Z`;
        svg.append(sv("path", { d, fill: s.color, opacity: s.faded && s.faded(i) ? 0.45 : 1 }));
      });
      for (const s of ser.filter((z) => z.kind === "tick")) {
        const v = s.values[i];
        if (!isNum(v)) continue;
        const y = Y(v);
        svg.append(sv("line", { x1: cx - gw / 2 - 4, x2: cx + gw / 2 + 4, y1: y, y2: y, stroke: s.color, "stroke-width": 2.5, "stroke-linecap": "round" }));
      }
    }
    for (const s of ser.filter((z) => z.kind === "line")) {
      let d = "", st = false;
      s.values.forEach((v, i) => { if (!isNum(v)) { st = false; return; } d += (st ? "L" : "M") + (m.l + band * (i + 0.5)).toFixed(1) + " " + Y(v).toFixed(1); st = true; });
      svg.append(sv("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round" }));
      s.values.forEach((v, i) => { if (isNum(v)) svg.append(sv("circle", { cx: m.l + band * (i + 0.5), cy: Y(v), r: 3.5, fill: s.color, class: "ring" })); });
    }
    if (opt.labels) {                                  // value labels on the chosen categories only
      for (const i of opt.labels) {
        const cx = m.l + band * (i + 0.5);
        bars.forEach((s, k) => {
          const v = s.values[i];
          if (!isNum(v)) return;
          const x = cx - gw / 2 + k * (bw + 2) + bw / 2, y = Y(v);
          svg.append(sv("text", { x, y: v >= 0 ? y - 5 : y + 13, "text-anchor": "middle", class: "vlab", text: (s.labFmt || fmt)(v) }));
        });
      }
    }
    // hover per category band
    for (let i = 0; i < n; i++) {
      const hit = sv("rect", { x: m.l + band * i, y: m.t, width: band, height: ph, fill: "transparent", tabindex: 0, class: "hit" });
      const show = (e) => {
        hl.setAttribute("x", m.l + band * i);
        const rows = ser.map((s) => [s.color, isNum(s.values[i]) ? (s.fmt || fmt)(s.values[i]) : "–", s.name, s.kind === "tick"]);
        const extra = opt.note ? opt.note(i) : null;
        const body = tipBody(opt.tipTitle ? opt.tipTitle(i) : cats[i], rows);
        if (extra) body.append(h("div", { class: "tip-n" }, extra));
        const rect = hit.getBoundingClientRect();
        showTip(e && e.clientX != null ? e.clientX : rect.left + rect.width / 2, e && e.clientY != null ? e.clientY : rect.top, body);
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("focus", () => show(null));
      hit.addEventListener("pointerleave", () => { hl.setAttribute("x", -999); hideTip(); });
      hit.addEventListener("blur", () => { hl.setAttribute("x", -999); hideTip(); });
      svg.append(hit);
    }
    host.append(svg);
  });
}

/** tiny trend line for cards (no axes). values: numbers; returns an svg element */
function spark(values, color, w = 120, h0 = 32) {
  const v = values.filter(isNum);
  const svg = sv("svg", { width: w, height: h0, viewBox: `0 0 ${w} ${h0}`, class: "spark", "aria-hidden": "true" });
  if (v.length < 2) return svg;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (hi === lo) { hi += 1; lo -= 1; }
  const X = (i) => 2 + (i / (v.length - 1)) * (w - 4), Y = (x) => 3 + (1 - (x - lo) / (hi - lo)) * (h0 - 6);
  let d = "";
  v.forEach((x, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(x).toFixed(1); });
  svg.append(sv("path", { d: d + `L${X(v.length - 1)} ${h0}L${X(0)} ${h0}Z`, fill: color, "fill-opacity": 0.1 }));
  svg.append(sv("path", { d, fill: "none", stroke: color, "stroke-width": 1.5, "stroke-linejoin": "round" }));
  svg.append(sv("circle", { cx: X(v.length - 1), cy: Y(v[v.length - 1]), r: 3, fill: color }));
  return svg;
}

/** horizontal range track with markers: marks [{v, label, cls}] */
function rangeTrack(lo, hi, marks, opt = {}) {
  const wrap = h("div", { class: "rtrack" + (opt.cls ? " " + opt.cls : "") });
  const bar = h("div", { class: "rt-bar" });
  wrap.append(bar);
  if (!isNum(lo) || !isNum(hi) || hi <= lo) return wrap;
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  if (opt.fillTo != null && isNum(opt.fillTo)) bar.append(h("i", { class: "rt-fill", style: { width: pos(opt.fillTo) + "%" } }));
  for (const mk of marks) {
    if (!isNum(mk.v)) continue;
    bar.append(h("span", { class: "rt-mk " + (mk.cls || ""), style: { left: pos(mk.v) + "%" }, title: mk.title || "" }));
  }
  wrap.append(h("div", { class: "rt-ends" }, h("span", null, opt.loLabel || fmtPx(lo)), h("span", null, opt.hiLabel || fmtPx(hi))));
  return wrap;
}

/** percentile rank of v among values (0..100); higherBetter false flips it */
function pctRank(values, v, higherBetter = true) {
  if (!isNum(v)) return null;
  let below = 0, eq = 0, n = 0;
  for (const x of values) { if (!isNum(x)) continue; n++; if (x < v) below++; else if (x === v) eq++; }
  if (n < 5) return null;
  const p = ((below + eq / 2) / n) * 100;
  return higherBetter ? p : 100 - p;
}
function median(values) {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const k = Math.floor(v.length / 2);
  return v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
}
function mean(values) { const v = values.filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function stdev(values) {
  const v = values.filter(isNum);
  if (v.length < 3) return null;
  const mu = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (v.length - 1));
}

// ---------------------------------------------------------------- minimal, safe markdown for AI notes
function mdInline(s) {
  // s is already HTML-escaped
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function mdToHtml(md) {
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  const out = [];
  let list = null, para = [], table = null;
  const flushP = () => { if (para.length) { out.push("<p>" + mdInline(esc(para.join(" "))) + "</p>"); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.t}>` + list.items.map((x) => "<li>" + mdInline(esc(x)) + "</li>").join("") + `</${list.t}>`); list = null; } };
  const flushT = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
    const cells = rows.map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => mdInline(esc(c.trim()))));
    if (cells.length) {
      out.push('<div class="mdt"><table><thead><tr>' + cells[0].map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" +
        cells.slice(1).map((r) => "<tr>" + r.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>");
    }
    table = null;
  };
  for (const raw of lines) {
    const ln = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(ln)) { flushP(); flushL(); (table = table || []).push(ln); continue; }
    flushT();
    if (!ln.trim()) { flushP(); flushL(); continue; }
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); const lv = Math.min(4, m[1].length + 1); out.push(`<h${lv}>` + mdInline(esc(m[2])) + `</h${lv}>`); continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(ln)) { flushP(); flushL(); out.push("<hr>"); continue; }
    if ((m = ln.match(/^\s*>\s?(.*)$/))) { flushP(); flushL(); out.push("<blockquote>" + mdInline(esc(m[1])) + "</blockquote>"); continue; }
    if ((m = ln.match(/^\s*[-*•]\s+(.*)$/))) { flushP(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
    flushL();
    para.push(ln.trim());
  }
  flushP(); flushL(); flushT();
  return out.join("\n");
}
