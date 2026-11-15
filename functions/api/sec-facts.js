const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// Reicht Daten der SEC mit dem vorgeschriebenen User-Agent durch (nur zwei feste Adressen)
export async function onRequestGet({ request, env }) {
  const ua = env.SEC_USER_AGENT;
  if (!ua) return J({ error: "Die Cloudflare-Variable SEC_USER_AGENT fehlt." }, 500);
  const p = new URL(request.url).searchParams, cik = p.get("cik") || "";
  if (!/^\d{10}$/.test(cik)) return J({ error: "cik muss aus genau 10 Ziffern bestehen." }, 400);
  const url = p.get("kind") === "submissions"
    ? "https://data.sec.gov/submissions/CIK" + cik + ".json"
    : "https://data.sec.gov/api/xbrl/companyfacts/CIK" + cik + ".json";
  const wait = env.SEC_RETRY_MS != null ? +env.SEC_RETRY_MS : 2000;
  let r;
  try {
    for (let i = 0; ; i++) {
      r = await fetch(url, { headers: { "User-Agent": ua }, cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 43200, "300-599": -1 } } });
      if ((r.status === 403 || r.status === 429) && i < 1) { await new Promise(res => setTimeout(res, wait)); continue; }
      break;
    }
  } catch (e) { return J({ error: "SEC nicht erreichbar: " + e.message }, 502); }
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240); } catch (e) {}
    const hint = r.status === 403 ? " (Zugriff verweigert)" : r.status === 429 ? " (zu viele Anfragen)" : r.status === 404 ? " (keine Daten für diese Firma)" : "";
    return J({ error: "SEC antwortet mit HTTP " + r.status + hint + ".", detail }, 502);
  }
  return new Response(r.body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
