const H = { "content-type": "application/json; charset=utf-8" };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });

export async function onRequestGet({ request }) {
  const p = new URL(request.url).searchParams;
  const source = p.get("source"), symbol = (p.get("symbol") || "").trim();
  const interval = p.get("interval") || "1d", range = p.get("range") || "1y";
  if (!symbol) return json({ error: "symbol fehlt" }, 400);
  try {
    if (source === "yahoo") return json(await yahoo(symbol, interval, range));
    if (source === "binance") return json(await binance(symbol, interval));
    return json({ error: "source muss yahoo oder binance sein" }, 400);
  } catch (e) { return json({ error: e.message }, 502); }
}

async function yahoo(symbol, interval, range) {
  const u = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) +
    "?interval=" + encodeURIComponent(interval) + "&range=" + encodeURIComponent(range);
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!r.ok) throw new Error("Yahoo antwortet mit HTTP " + r.status);
  const d = await r.json();
  const res = d.chart && d.chart.result && d.chart.result[0];
  if (!res) throw new Error((d.chart && d.chart.error && d.chart.error.description) || "Keine Daten");
  const q = res.indicators.quote[0], t = res.timestamp || [], candles = [];
  for (let i = 0; i < t.length; i++) {
    if (q.open[i] == null || q.close[i] == null) continue;
    candles.push({ t: t[i], o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 });
  }
  const m = res.meta;
  return { source: "Yahoo Finance", symbol, currency: m.currency, exchange: m.fullExchangeName || m.exchangeName,
    interval, range, dataKind: "delayed", note: "Kurs kann bis zu ca. 15 Minuten verzögert sein",
    lastPrice: m.regularMarketPrice, lastPriceTime: m.regularMarketTime, fetchedAt: Math.floor(Date.now() / 1000), candles };
}

async function binance(symbol, interval) {
  const u = "https://data-api.binance.vision/api/v3/klines?symbol=" + encodeURIComponent(symbol) +
    "&interval=" + encodeURIComponent(interval) + "&limit=500";
  const r = await fetch(u, { cf: { cacheTtl: 10, cacheEverything: true } });
  if (!r.ok) throw new Error("Binance antwortet mit HTTP " + r.status);
  const k = await r.json();
  const candles = k.map(x => ({ t: Math.floor(x[0] / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
  const last = candles[candles.length - 1];
  return { source: "Binance", symbol, currency: "EUR", exchange: "Binance Spot", interval, dataKind: "realtime",
    note: "Marktdaten von Binance, nicht identisch mit Trade Republic",
    lastPrice: last && last.c, fetchedAt: Math.floor(Date.now() / 1000), candles };
}
