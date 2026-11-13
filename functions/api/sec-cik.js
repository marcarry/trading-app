const J = (d, s = 200, extra = {}) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", ...extra } });

// Ticker -> CIK über die offizielle Liste der SEC (ohne die große Datei komplett zu parsen)
export async function onRequestGet({ request, env }) {
  const ua = env.SEC_USER_AGENT;
  if (!ua) return J({ error: "Die Cloudflare-Variable SEC_USER_AGENT fehlt." }, 500);
  const sym = (new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) return J({ error: "Ungültiges Symbol." }, 400);
  if (sym.includes(".")) return J({ available: false, reason: "Das Kürzel " + sym + " hat ein Börsen-Suffix und ist kein US-Wert. Dafür gibt es keine SEC-Daten." });
  let r;
  try {
    r = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": ua }, cf: { cacheTtl: 86400, cacheEverything: true } });
  } catch (e) { return J({ error: "SEC nicht erreichbar: " + e.message }, 502); }
  if (!r.ok) return J({ error: "Die Ticker-Liste der SEC ist nicht erreichbar (HTTP " + r.status + ")." }, 502);
  const text = await r.text();
  const esc = sym.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const m = new RegExp('"cik_str"\\s*:\\s*(\\d+)\\s*,\\s*"ticker"\\s*:\\s*"' + esc + '"\\s*,\\s*"title"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(text);
  if (!m) return J({ available: false, reason: sym + " steht nicht in der SEC-Liste (z. B. ausländisches Unternehmen, US-Zertifikat ohne SEC-Meldepflicht, ETF oder Kryptowährung)." });
  let name = m[2];
  try { name = JSON.parse('"' + m[2] + '"'); } catch (e) {}
  return J({ available: true, cik: m[1].padStart(10, "0"), name, ticker: sym }, 200, { "cache-control": "public, max-age=86400" });
}
