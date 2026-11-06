const H = { "content-type": "application/json; charset=utf-8" };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: H });
const NAMES = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL", ripple: "XRP", cardano: "ADA", dogecoin: "DOGE", polkadot: "DOT", litecoin: "LTC", chainlink: "LINK", avalanche: "AVAX" };

export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (!q) return json({ results: [], errors: [] });
  const results = [], errors = [];
  try {
    const r = await fetch("https://query1.finance.yahoo.com/v1/finance/search?newsCount=0&quotesCount=10&q=" + encodeURIComponent(q),
      { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    for (const x of d.quotes || []) {
      if (!["EQUITY", "ETF"].includes(x.quoteType)) continue;
      results.push({ source: "yahoo", symbol: x.symbol, name: x.shortname || x.longname || x.symbol, exchange: x.exchDisp || "", type: x.quoteType });
    }
  } catch (e) { errors.push("Aktiensuche (Yahoo): " + e.message); }
  try {
    const r = await fetch("https://data-api.binance.vision/api/v3/exchangeInfo", { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const ql = q.toLowerCase();
    const alias = Object.entries(NAMES).filter(([n]) => n.startsWith(ql)).map(([, b]) => b);
    const hits = (d.symbols || []).filter(s => s.status === "TRADING" && s.quoteAsset === "EUR" &&
      (s.baseAsset.toLowerCase().startsWith(ql) || alias.includes(s.baseAsset))).slice(0, 10);
    for (const s of hits) results.push({ source: "binance", symbol: s.symbol, name: s.baseAsset + " / EUR", exchange: "Binance", type: "CRYPTO" });
  } catch (e) { errors.push("Kryptosuche (Binance): " + e.message); }
  return json({ results, errors });
}
