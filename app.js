const $ = id => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const NAMES = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL", ripple: "XRP", cardano: "ADA", dogecoin: "DOGE", polkadot: "DOT", litecoin: "LTC", chainlink: "LINK", avalanche: "AVAX" };
const TYPES = [{ id: "candle", label: "Kerzen" }, { id: "line", label: "Linie" }, { id: "bar", label: "Balken" }];
const UP = "#00c805", DOWN = "#ff3b30";
let binSyms = null, timer, seq = 0;

/* ---------- Suche ---------- */
$("q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 350); });

async function binanceSearch(q) {
  if (!binSyms) {
    const r = await fetch(Data.BIN + "/api/v3/ticker/price");
    if (!r.ok) throw new Error("HTTP " + r.status);
    binSyms = (await r.json()).map(x => x.symbol).filter(s => s.endsWith("EUR") && s.length > 3);
  }
  const ql = q.toLowerCase();
  const alias = Object.entries(NAMES).filter(([n]) => n.startsWith(ql)).map(([, b]) => b);
  return binSyms.filter(s => { const b = s.slice(0, -3); return b.toLowerCase().startsWith(ql) || alias.includes(b); })
    .slice(0, 10).map(s => ({ source: "binance", symbol: s, name: s.slice(0, -3) + " / EUR", exchange: "Binance" }));
}

async function search() {
  const q = $("q").value.trim(), my = ++seq, res = [], errs = [];
  if (!q) { $("list").replaceChildren(); $("errs").replaceChildren(); return; }
  await Promise.all([
    (async () => { try {
      const r = await fetch("/api/search?q=" + encodeURIComponent(q));
      const d = await r.json();
      res.push(...d.results);
      (d.errors || []).filter(e => !e.startsWith("Kryptosuche")).forEach(e => errs.push(e));
    } catch (e) { errs.push("Aktiensuche nicht erreichbar: " + e.message); } })(),
    (async () => { try { res.push(...await binanceSearch(q)); }
      catch (e) { errs.push("Kryptosuche (Binance direkt): " + e.message); } })()
  ]);
  if (my !== seq) return;
  const box = $("list");
  box.replaceChildren();
  $("errs").replaceChildren(...errs.map(e => el("div", "err", e)));
  if (!res.length && !errs.length) box.append(el("div", "sub", "Keine Treffer."));
  res.forEach(x => {
    const row = el("div", "row");
    row.append(el("div", null, x.name), el("div", "sub", x.symbol + " · " + x.exchange + " · " + (x.source === "binance" ? "Binance" : "Yahoo Finance")));
    row.onclick = () => openChart(x);
    box.append(row);
  });
}

/* ---------- Indikator-Definitionen ---------- */
const IND = {
  ema:    { group: "Trend",       params: { period: 50 }, colors: { line: "#f5a623" }, width: 2 },
  sma:    { group: "Trend",       params: { period: 200 }, colors: { line: "#4aa3ff" }, width: 2 },
  bb:     { group: "Volatilität", params: { period: 20, mult: 2 }, colors: { line: "#9b8cff" }, width: 1 },
  vwap:   { group: "Volumen",     params: {}, colors: { line: "#ff6bd6" }, width: 2 },
  rsi:    { group: "Momentum",    params: { period: 14 }, colors: { line: "#c58bff" }, width: 2 },
  macd:   { group: "Momentum",    params: { fast: 12, slow: 26, signal: 9 }, colors: { line: "#4aa3ff", signal: "#ff9f0a" }, width: 2 },
  atr:    { group: "Volatilität", params: { period: 14 }, colors: { line: "#32d2c8" }, width: 2 },
  vol:    { group: "Volumen",     params: {}, colors: { line: "#888888" }, width: 1 },
  volavg: { group: "Volumen",     params: { avg: 20 }, colors: { line: "#ffd60a" }, width: 2 }
};
const ORDER = ["ema", "sma", "bb", "vwap", "rsi", "macd", "atr", "vol", "volavg"];

function defaultCfg() {
  const c = {};
  for (const id of ORDER) { const d = IND[id]; c[id] = { on: id === "vol", params: { ...d.params }, colors: { ...d.colors }, width: d.width }; }
  return c;
}
const cfgKey = a => "tradingapp:ind:" + a.source + ":" + a.symbol;
function loadCfg(a) {
  const c = defaultCfg();
  try {
    const s = JSON.parse(localStorage.getItem(cfgKey(a)) || "null");
    if (s) for (const id of ORDER) if (s[id]) Object.assign(c[id], { on: !!s[id].on, params: { ...c[id].params, ...s[id].params }, colors: { ...c[id].colors, ...s[id].colors }, width: s[id].width || c[id].width });
  } catch (e) {}
  return c;
}
function saveCfg() { try { localStorage.setItem(cfgKey(S.asset), JSON.stringify(S.cfg)); } catch (e) {} }

function lab(id) {
  const q = S.cfg[id].params;
  return { ema: "EMA " + q.period, sma: "SMA " + q.period, bb: "Bollinger " + q.period + "/" + q.mult, vwap: "VWAP",
    rsi: "RSI " + q.period, macd: "MACD " + q.fast + "/" + q.slow + "/" + q.signal, atr: "ATR " + q.period,
    vol: "Volumen", volavg: "Volumen-Ø " + q.avg }[id];
}

/* ---------- Chart ---------- */
const S = { asset: null, tf: "1d", range: "6M", type: "candle", chart: null, series: [], data: null, candles: [], byTime: new Map(), idx: new Map(), last: 0, seq: 0, cfg: defaultCfg(), vals: {}, notes: [], openIn: null };
const fmt = (n, p) => n.toLocaleString("de-DE", { minimumFractionDigits: p, maximumFractionDigits: p });
const prec = n => n < 1 ? 6 : n < 100 ? 4 : 2;
const pf = pp => ({ type: "custom", formatter: v => fmt(v, pp), minMove: 1 / Math.pow(10, pp) });

function chips(box, items, active, pick) {
  box.replaceChildren();
  items.forEach(it => {
    const b = el("button", "chip" + (it.id === active() ? " on" : ""), it.label);
    b.onclick = () => pick(it.id);
    box.append(b);
  });
}
function renderBars() {
  chips($("tfBar"), Data.TIMEFRAMES, () => S.tf, id => { S.tf = id; renderBars(); load(); });
  chips($("rangeBar"), Data.RANGES, () => S.range, id => { S.range = id; renderBars(); load(); });
  chips($("typeBar"), TYPES, () => S.type, id => { S.type = id; renderBars(); if (S.candles.length) draw(true); });
  const b = el("button", "chip ind", "Indikatoren");
  b.onclick = () => openSheet();
  $("typeBar").append(b);
}

function ensureChart() {
  if (S.chart) return;
  if (typeof LightweightCharts === "undefined") throw new Error("Chart-Bibliothek konnte nicht geladen werden");
  S.chart = LightweightCharts.createChart($("chart"), {
    autoSize: true,
    layout: { background: { type: "solid", color: "#000" }, textColor: "#9a9a9a", fontSize: 12, panes: { separatorColor: "#222" } },
    grid: { vertLines: { color: "#161616" }, horzLines: { color: "#161616" } },
    rightPriceScale: { borderColor: "#222" },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: { vertTouchDrag: false },
    localization: { locale: "de-DE" }
  });
  S.chart.subscribeCrosshairMove(p => {
    if (!S.candles.length) return;
    const i = p.time !== undefined && S.idx.has(p.time) ? S.idx.get(p.time) : S.candles.length - 1;
    showOhlc(S.candles[i]); legend(i);
  });
}

function clearSeries() {
  S.series.forEach(s => { try { S.chart.removeSeries(s); } catch (e) {} });
  S.series = [];
  try { while (S.chart.panes().length > 1) S.chart.removePane(S.chart.panes().length - 1); } catch (e) {}
}

function lineData(vals) {
  const o = [];
  for (let i = 0; i < vals.length; i++) if (vals[i] != null) o.push({ time: S.candles[i].time, value: vals[i] });
  return o;
}

function draw(keep) {
  const LW = LightweightCharts, c = S.candles, cf = S.cfg, p = prec(S.last), cl = c.map(k => k.c);
  const vr = keep ? S.chart.timeScale().getVisibleLogicalRange() : null;
  const intraday = S.data.tf.sec < 86400;
  clearSeries();
  S.vals = {}; S.notes = [];
  const add = (type, opt, pane) => { const s = S.chart.addSeries(type, opt, pane); S.series.push(s); return s; };
  const line = (vals, color, width, pane, o) => {
    const s = add(LW.LineSeries, { color, lineWidth: width, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceFormat: pf(p), ...o }, pane);
    s.setData(lineData(vals)); return s;
  };
  const calc = (id, fn, need) => {
    const v = fn();
    if (!(Array.isArray(v) ? v : v.line || v.mid).some(x => x != null)) { S.notes.push(lab(id) + ": zu wenig Daten (mind. " + need + " Kerzen, geladen: " + c.length + ")"); return null; }
    S.vals[id] = v; return v;
  };

  // Hauptserie
  const volOn = cf.vol.on || cf.volavg.on;
  let main;
  if (S.type === "line") {
    main = add(LW.LineSeries, { color: "#ffffff", lineWidth: 2, priceFormat: pf(p) }, 0);
    main.setData(lineData(cl));
  } else {
    main = S.type === "bar"
      ? add(LW.BarSeries, { upColor: UP, downColor: DOWN, priceFormat: pf(p) }, 0)
      : add(LW.CandlestickSeries, { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: pf(p) }, 0);
    main.setData(c.map(k => ({ time: k.time, open: k.o, high: k.h, low: k.l, close: k.c })));
  }
  main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: volOn ? 0.25 : 0.06 } });

  // Volumen
  if (cf.vol.on) {
    const v = add(LW.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false }, 0);
    v.setData(c.map(k => ({ time: k.time, value: k.v, color: k.c >= k.o ? "rgba(0,200,5,0.45)" : "rgba(255,59,48,0.45)" })));
  }
  if (cf.volavg.on) {
    const pr = cf.volavg.params.avg, v = calc("volavg", () => Ind.volMa(c, pr), pr);
    if (v) line(v, cf.volavg.colors.line, cf.volavg.width, 0, { priceScaleId: "vol", priceFormat: { type: "volume" } });
  }
  if (volOn) S.chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

  // Indikatoren im Hauptchart
  for (const id of ["ema", "sma"]) if (cf[id].on) {
    const pr = cf[id].params.period, v = calc(id, () => Ind[id](cl, pr), pr);
    if (v) line(v, cf[id].colors.line, cf[id].width, 0);
  }
  if (cf.bb.on) {
    const pr = cf.bb.params.period, m = cf.bb.params.mult, b = calc("bb", () => Ind.bollinger(cl, pr, m), pr);
    if (b) { const col = cf.bb.colors.line, w = cf.bb.width; line(b.up, col, w, 0); line(b.low, col, w, 0); line(b.mid, col, w, 0, { lineStyle: 2 }); }
  }
  if (cf.vwap.on) {
    const v = calc("vwap", () => Ind.vwap(c, intraday), 1);
    if (v) {
      line(v, cf.vwap.colors.line, cf.vwap.width, 0);
      if (!intraday) S.notes.push("VWAP: bei Tageskerzen und größer ab Beginn der geladenen Daten berechnet");
    }
  }

  // Eigene Fenster
  let pane = 0;
  if (cf.rsi.on) {
    const pr = cf.rsi.params.period, v = calc("rsi", () => Ind.rsi(cl, pr), pr + 1);
    if (v) {
      pane++;
      const s = line(v, cf.rsi.colors.line, cf.rsi.width, pane, { priceFormat: pf(1), lastValueVisible: true, title: lab("rsi"), autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
      [[70, "#666666", 2], [50, "#444444", 3], [30, "#666666", 2]].forEach(([price, color, ls]) => s.createPriceLine({ price, color, lineWidth: 1, lineStyle: ls, axisLabelVisible: true, title: "" }));
    }
  }
  if (cf.macd.on) {
    const q = cf.macd.params, m = calc("macd", () => Ind.macd(cl, q.fast, q.slow, q.signal), q.slow + q.signal);
    if (m) {
      pane++;
      const pp = Math.min(p + 1, 6);
      const h = add(LW.HistogramSeries, { priceFormat: pf(pp), lastValueVisible: false, priceLineVisible: false }, pane);
      h.setData(m.hist.map((x, i) => x == null ? null : { time: c[i].time, value: x, color: x >= 0 ? "rgba(0,200,5,0.6)" : "rgba(255,59,48,0.6)" }).filter(Boolean));
      line(m.line, cf.macd.colors.line, cf.macd.width, pane, { priceFormat: pf(pp), lastValueVisible: true, title: lab("macd") });
      line(m.signal, cf.macd.colors.signal, cf.macd.width, pane, { priceFormat: pf(pp) });
    }
  }
  if (cf.atr.on) {
    const pr = cf.atr.params.period, v = calc("atr", () => Ind.atr(c, pr), pr);
    if (v) { pane++; line(v, cf.atr.colors.line, cf.atr.width, pane, { lastValueVisible: true, title: lab("atr") }); }
  }

  try { S.chart.panes().forEach((pn, i) => pn.setStretchFactor(i === 0 ? 3.5 : 1.2)); } catch (e) {}
  $("chart").style.minHeight = (330 + pane * 130) + "px";
  if (vr) S.chart.timeScale().setVisibleLogicalRange(vr); else S.chart.timeScale().fitContent();
  legend(c.length - 1);
}

function legend(i) {
  const box = $("legend"), p = prec(S.last), f = (v, pp) => v == null ? "–" : fmt(v, pp);
  box.replaceChildren();
  const add = (color, txt) => { const s = el("span", "lg"), d = el("i"); d.style.background = color; s.append(d, document.createTextNode(txt)); box.append(s); };
  for (const id of ORDER) {
    const c = S.cfg[id], v = S.vals[id];
    if (!c.on || !v) continue;
    const L = lab(id), col = c.colors.line;
    if (id === "bb") add(col, L + "  " + f(v.low[i], p) + " | " + f(v.mid[i], p) + " | " + f(v.up[i], p));
    else if (id === "macd") add(col, L + "  " + f(v.line[i], p + 1) + " · Signal " + f(v.signal[i], p + 1) + " · Hist " + f(v.hist[i], p + 1));
    else if (id === "atr") { const a = v[i]; add(col, L + "  " + f(a, p) + (a == null ? "" : "  (2×ATR = " + f(2 * a, p) + " Stop-Abstand, " + fmt(200 * a / S.candles[i].c, 1) + " % vom Kurs)")); }
    else if (id === "volavg") { const a = v[i]; add(col, L + "  " + (a == null ? "–" : a.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + (a > 0 ? "  (Kerze: " + fmt(S.candles[i].v / a, 2) + "× Ø)" : ""))); }
    else if (id === "rsi") add(col, L + "  " + f(v[i], 1));
    else add(col, L + "  " + f(v[i], p));
  }
  S.notes.forEach(n => box.append(el("span", "lg note", n)));
}

function showOhlc(k) {
  const p = prec(S.last), daily = S.data.tf.sec >= 86400;
  const dt = new Date(k.t * 1000).toLocaleString("de-DE", daily ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" });
  const vol = k.v.toLocaleString("de-DE", { maximumFractionDigits: k.v < 100 ? 4 : 0 });
  $("ohlc").textContent = dt + "   O " + fmt(k.o, p) + "   H " + fmt(k.h, p) + "   L " + fmt(k.l, p) + "   C " + fmt(k.c, p) + "   Vol " + vol;
  $("ohlc").className = "ohlc " + (k.c >= k.o ? "up" : "down");
}

function showHeader() {
  const d = S.data, c = S.candles, p = prec(S.last);
  const diff = S.last - c[0].o, chg = diff / c[0].o * 100, sign = diff >= 0 ? "+" : "";
  $("price").textContent = fmt(S.last, p) + " " + d.currency;
  $("chg").textContent = sign + fmt(diff, p) + " " + d.currency + " (" + sign + fmt(chg, 2) + " %)";
  $("chg").className = diff >= 0 ? "up" : "down";
  const t = d.lastPriceTime || d.fetchedAt;
  $("info").className = "sub";
  $("info").textContent = [d.dataKind === "realtime" ? "Echtzeit" : "Verzögert", d.source, d.exchange,
    (d.lastPriceTime ? "Letzter Kurs " : "Abgerufen ") + new Date(t * 1000).toLocaleString("de-DE"), d.note, d.clampNote].filter(Boolean).join(" · ");
  showOhlc(c[c.length - 1]);
}

async function load() {
  const my = ++S.seq;
  $("info").className = "sub"; $("info").textContent = "Lade …";
  try {
    const d = await Data.load(S.asset, S.tf, S.range);
    if (my !== S.seq) return;
    const off = t => t - new Date(t * 1000).getTimezoneOffset() * 60;
    const c = d.candles.map(k => ({ ...k, time: off(k.t) })).sort((a, b) => a.time - b.time)
      .filter((k, i, a) => i === 0 || k.time > a[i - 1].time);
    if (!c.length) throw new Error("Keine Kursdaten für diese Auswahl.");
    ensureChart();
    S.data = d; S.candles = c; S.byTime = new Map(c.map(k => [k.time, k])); S.idx = new Map(c.map((k, i) => [k.time, i]));
    S.last = d.lastPrice != null ? d.lastPrice : c[c.length - 1].c;
    if (S.range !== d.range.id) { S.range = d.range.id; renderBars(); }
    draw(false); showHeader();
  } catch (e) {
    if (my !== S.seq) return;
    S.candles = [];
    if (S.chart) clearSeries();
    $("price").textContent = ""; $("chg").textContent = ""; $("ohlc").textContent = ""; $("legend").replaceChildren();
    $("info").className = "err"; $("info").textContent = "Fehler: " + e.message;
  }
}

function openChart(x) {
  S.asset = x; S.cfg = loadCfg(x); S.openIn = null;
  $("title").textContent = x.name + " · " + x.symbol;
  $("viewSearch").hidden = true; $("viewChart").hidden = false;
  renderBars(); load();
}
$("back").onclick = () => { S.seq++; closeSheet(); $("viewChart").hidden = true; $("viewSearch").hidden = false; };
