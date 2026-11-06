const Data = (() => {
  const BIN = "https://data-api.binance.vision";
  const DAY = 86400;
  const TIMEFRAMES = [
    { id: "1m", label: "1 Min", sec: 60, yahoo: "1m", bin: "1m", yDays: 7 },
    { id: "5m", label: "5 Min", sec: 300, yahoo: "5m", bin: "5m", yDays: 60 },
    { id: "15m", label: "15 Min", sec: 900, yahoo: "15m", bin: "15m", yDays: 60 },
    { id: "30m", label: "30 Min", sec: 1800, yahoo: "30m", bin: "30m", yDays: 60 },
    { id: "1h", label: "1 Std", sec: 3600, yahoo: "60m", bin: "1h", yDays: 730 },
    { id: "4h", label: "4 Std", sec: 14400, yahoo: "60m", bin: "4h", yDays: 730, agg: 4 },
    { id: "1d", label: "1 Tag", sec: 86400, yahoo: "1d", bin: "1d", yDays: Infinity },
    { id: "1w", label: "1 Woche", sec: 604800, yahoo: "1wk", bin: "1w", yDays: Infinity },
    { id: "1M", label: "1 Monat", sec: 2592000, yahoo: "1mo", bin: "1M", yDays: Infinity }
  ];
  const RANGES = [
    { id: "1D", label: "1T", days: 1, yahoo: "1d" },
    { id: "1W", label: "1W", days: 7, yahoo: "5d" },
    { id: "1M", label: "1M", days: 30, yahoo: "1mo" },
    { id: "3M", label: "3M", days: 90, yahoo: "3mo" },
    { id: "6M", label: "6M", days: 180, yahoo: "6mo" },
    { id: "1Y", label: "1J", days: 365, yahoo: "1y" },
    { id: "5Y", label: "5J", days: 1825, yahoo: "5y" },
    { id: "MAX", label: "Max", days: Infinity, yahoo: "max" }
  ];

  function clamp(asset, tf, range) {
    const limit = asset.source === "yahoo" ? tf.yDays : 5000 * tf.sec / DAY;
    if (range.days <= limit || (range.days === Infinity && asset.source === "binance")) return { range, note: "" };
    const ok = RANGES.filter(r => r.days <= limit).pop();
    return { range: ok, note: "Für " + tf.label + " sind höchstens " + ok.label + " verfügbar, Zeitraum angepasst." };
  }

  function aggregate(c, n) {
    const out = []; let cur = null, day = null, cnt = 0;
    for (const k of c) {
      const d = Math.floor(k.t / DAY);
      if (cur === null || d !== day || cnt === n) {
        if (cur) out.push(cur);
        cur = { ...k }; day = d; cnt = 1;
      } else {
        cur.h = Math.max(cur.h, k.h); cur.l = Math.min(cur.l, k.l); cur.c = k.c; cur.v += k.v; cnt++;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  async function yahoo(asset, tf, range) {
    const url = "/api/history?source=yahoo&symbol=" + encodeURIComponent(asset.symbol) +
      "&interval=" + tf.yahoo + "&range=" + range.yahoo;
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || "HTTP " + r.status);
    if (tf.agg) { d.candles = aggregate(d.candles, tf.agg); d.note += " · 4 Std aus 1-Std-Kerzen berechnet"; }
    return d;
  }

  async function binance(asset, tf, range) {
    const startMs = range.days === Infinity ? 0 : Date.now() - range.days * DAY * 1000;
    let end = Date.now(), all = [];
    for (let i = 0; i < 5; i++) {
      const r = await fetch(BIN + "/api/v3/klines?symbol=" + asset.symbol + "&interval=" + tf.bin + "&limit=1000&endTime=" + end);
      if (!r.ok) throw new Error("Binance HTTP " + r.status);
      const k = await r.json();
      if (!k.length) break;
      all = k.concat(all);
      end = k[0][0] - 1;
      if (k.length < 1000 || k[0][0] <= startMs) break;
    }
    const candles = all.filter(a => a[0] >= startMs)
      .map(a => ({ t: Math.floor(a[0] / 1000), o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5] }));
    return { source: "Binance", currency: "EUR", exchange: "Binance Spot", dataKind: "realtime",
      note: "Marktdaten von Binance, nicht identisch mit Trade Republic",
      fetchedAt: Math.floor(Date.now() / 1000), candles };
  }

  async function load(asset, tfId, rangeId) {
    const tf = TIMEFRAMES.find(t => t.id === tfId), want = RANGES.find(r => r.id === rangeId);
    const { range, note } = clamp(asset, tf, want);
    const d = asset.source === "binance" ? await binance(asset, tf, range) : await yahoo(asset, tf, range);
    return { ...d, tf, range, clampNote: note };
  }

  return { BIN, TIMEFRAMES, RANGES, load };
})();
