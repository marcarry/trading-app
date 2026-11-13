const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });

// Reicht Daten der SEC mit dem vorgeschriebenen User-Agent durch (nur zwei feste Adressen)
export async function onRequestGet({ request, env }) {
  const ua = env.SEC_USER_AGENT;
  if (!ua) return J({ error: "Die Cloudflare-Variable SEC_USER_AGENT fehlt." }, 500);
  const p = new URL(request.url).searchParams, cik = p.get("cik") || "";
  if (!/^\d{10}$/.test(cik)) return J({ error: "cik muss aus genau 10 Ziffern bestehen." }, 400);
  const url = p.get("kind") === "submissions"
    ? "https://data.sec.gov/submissions/CIK" + cik + ".json"
    : "https://data.sec.gov/api/xbrl/companyfacts/CIK" + cik + ".json";
  let r;
  try {
    r = await fetch(url, { headers: { "User-Agent": ua }, cf: { cacheTtl: 43200, cacheEverything: true } });
  } catch (e) { return J({ error: "SEC nicht erreichbar: " + e.message }, 502); }
  if (!r.ok) {
    const hint = r.status === 403 ? " (Zugriff verweigert: User-Agent oder Zugriffsgrenze der SEC)" : r.status === 429 ? " (zu viele Anfragen)" : r.status === 404 ? " (keine Daten für diese Firma)" : "";
    return J({ error: "SEC antwortet mit HTTP " + r.status + hint + "." }, 502);
  }
  return new Response(r.body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
