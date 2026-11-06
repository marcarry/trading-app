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

/* ---------- Chart ---------- */
const S = { asset: null, tf: "1d", range: "6M", type: "candle", chart: null, main: null, vol: null, data: null, candles: [], byTime: new Map(), last: 0, seq: 0 };
const fmt = (n, p) => n.toLocaleString("de-DE", { minimumFractionDigits: p, maximumFractionDigits: p });
const prec = n => n < 1 ? 6 : n < 100 ? 4 : 2;

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
  chips($("typeBar"), TYPES, () => S.type, id => { S.type = id; renderBars(); if (S.candles.length) draw(); });
}

function ensureChart() {
  if (S.chart) return;
  if (typeof LightweightCharts === "undefined") throw new Error("Chart-Bibliothek konnte nicht geladen werden");
  S.chart = LightweightCharts.createChart($("chart"), {
    autoSize: true,
    layout: { background: { type: "solid", color: "#000" }, textColor: "#9a9a9a", fontSize: 12 },
    grid: { vertLines: { color: "#161616" }, horzLines: { color: "#161616" } },
    rightPriceScale: { borderColor: "#222" },
    timeScale: { borderColor: "#222", timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: { vertTouchDrag: false },
    localization: { locale: "de-DE" }
  });
  S.chart.subscribeCrosshairMove(p => {
    const k = p.time !== undefined ? S.byTime.get(p.time) : null;
    if (S.candles.length) showOhlc(k || S.candles[S.candles.length - 1]);
  });
}

function clearSeries() {
  if (S.main) { S.chart.removeSeries(S.main); S.main = null; }
  if (S.vol) { S.chart.removeSeries(S.vol); S.vol = null; }
}

function draw() {
  const c = S.candles, p = prec(S.last);
  const pf = { type: "price", precision: p, minMove: 1 / Math.pow(10, p) };
  clearSeries();
  if (S.type === "line") {
    S.main = S.chart.addLineSeries({ color: "#ffffff", lineWidth: 2, priceFormat: pf });
    S.main.setData(c.map(k => ({ time: k.time, value: k.c })));
  } else {
    const ohlc = c.map(k => ({ time: k.time, open: k.o, high: k.h, low: k.l, close: k.c }));
    if (S.type === "bar") {
      S.main = S.chart.addBarSeries({ upColor: UP, downColor: DOWN, priceFormat: pf });
    } else {
      S.main = S.chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: pf });
    }
    S.main.setData(ohlc);
  }
  S.main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });
  S.vol = S.chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "" });
  S.vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  S.vol.setData(c.map(k => ({ time: k.time, value: k.v, color: k.c >= k.o ? "rgba(0,200,5,0.45)" : "rgba(255,59,48,0.45)" })));
  S.main.createPriceLine({ price: S.last, color: "#888888", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "" });
  S.chart.timeScale().fitContent();
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
    S.data = d; S.candles = c; S.byTime = new Map(c.map(k => [k.time, k]));
    S.last = d.lastPrice != null ? d.lastPrice : c[c.length - 1].c;
    if (S.range !== d.range.id) { S.range = d.range.id; renderBars(); }
    draw(); showHeader();
  } catch (e) {
    if (my !== S.seq) return;
    S.candles = [];
    if (S.chart) clearSeries();
    $("price").textContent = ""; $("chg").textContent = ""; $("ohlc").textContent = "";
    $("info").className = "err"; $("info").textContent = "Fehler: " + e.message;
  }
}

function openChart(x) {
  S.asset = x;
  $("title").textContent = x.name + " · " + x.symbol;
  $("viewSearch").hidden = true; $("viewChart").hidden = false;
  renderBars(); load();
}
$("back").onclick = () => { S.seq++; $("viewChart").hidden = true; $("viewSearch").hidden = false; };
