const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": s === 200 ? "public, max-age=3600" : "no-store" } });
const DAY = 86400000;
const ANNUAL_FORMS = ["10-K", "10-K/A", "10-KT", "20-F", "20-F/A", "40-F", "40-F/A"];

// Welche SEC-Kennzahlen (XBRL-Tags) abgefragt werden; mehrere Tags, weil Firmen unterschiedlich melden.
const CONCEPTS = {
  revenue: { kind: "flow", unit: "USD", tags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"] },
  grossProfit: { kind: "flow", unit: "USD", tags: ["GrossProfit"] },
  operatingIncome: { kind: "flow", unit: "USD", tags: ["OperatingIncomeLoss"] },
  netIncome: { kind: "flow", unit: "USD", tags: ["NetIncomeLoss", "ProfitLoss"] },
  epsDiluted: { kind: "flow", unit: "USD/shares", noDerive: true, tags: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"] },
  depreciation: { kind: "flow", unit: "USD", tags: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"] },
  operatingCashFlow: { kind: "flow", unit: "USD", tags: ["NetCashProvidedByUsedInOperatingActivities"] },
  capex: { kind: "flow", unit: "USD", tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"] },
  assets: { kind: "instant", unit: "USD", tags: ["Assets"] },
  liabilities: { kind: "instant", unit: "USD", tags: ["Liabilities"] },
  equity: { kind: "instant", unit: "USD", tags: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
  cash: { kind: "instant", unit: "USD", tags: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"] },
  debtLong: { kind: "instant", unit: "USD", noMerge: true, tags: ["LongTermDebtNoncurrent", "LongTermDebt"] },
  debtCurrent: { kind: "instant", unit: "USD", noMerge: true, tags: ["LongTermDebtCurrent", "DebtCurrent"] },
  shares: { kind: "instant", taxonomy: "dei", unit: "shares", tags: ["EntityCommonStockSharesOutstanding"] }
};

const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const addDay = d => new Date(Date.parse(d) + DAY).toISOString().slice(0, 10);
const slim = e => { const o = { end: e.end, val: e.val, form: e.form, filed: e.filed }; if (e.start) o.start = e.start; if (e.derived) o.derived = true; return o; };

// Liest nur die letzten Einträge einer Einheit aus dem SEC-Text, ohne den ganzen Text zu parsen (spart Rechenzeit)
function entriesOf(text, unit) {
  const key = '"' + unit + '":[';
  const i = text.indexOf(key);
  if (i < 0) return [];
  const seg = text.slice(i + key.length), arr = seg.slice(0, Math.max(0, seg.indexOf("]")));
  const tail = arr.length > 60000 ? arr.slice(-60000) : arr;
  const out = [], re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(tail))) { try { out.push(JSON.parse(m[0])); } catch (e) { /* abgeschnittener Eintrag */ } }
  return out;
}

// Mehrere Tags zusammenführen: gleiche Periode -> zuerst der Tag mit höherer Priorität, innerhalb eines Tags die zuletzt eingereichte Fassung
function mergeEntries(perTag, keyOf) {
  const best = new Map();
  perTag.forEach((entries, ti) => {
    for (const e of entries) {
      if (!e.end || typeof e.val !== "number") continue;
      const k = keyOf(e), p = best.get(k);
      if (!p || (p.ti === ti && e.filed > p.e.filed)) best.set(k, { e, ti });
    }
  });
  return [...best.values()].map(x => x.e);
}

function flowSeries(perTag, derive) {
  const all = mergeEntries(perTag, e => e.start + "|" + e.end).filter(e => e.start);
  const annual = all.filter(e => { const d = days(e.start, e.end); return d >= 350 && d <= 380; }).sort((a, b) => a.end < b.end ? -1 : 1);
  let quarter = all.filter(e => { const d = days(e.start, e.end); return d >= 80 && d <= 100; });
  if (derive) for (const a of annual) {
    const inside = quarter.filter(x => x.start >= a.start && x.end < a.end);
    if (inside.length === 3 && !quarter.some(x => x.end === a.end)) {
      const lastEnd = inside.map(x => x.end).sort().pop();
      quarter = quarter.concat([{ start: addDay(lastEnd), end: a.end, val: a.val - inside.reduce((s, x) => s + x.val, 0), form: a.form, filed: a.filed, derived: true }]);
    }
  }
  quarter.sort((a, b) => a.end < b.end ? -1 : 1);
  return { annual: annual.slice(-6).map(slim), quarterly: quarter.slice(-12).map(slim) };
}

function instantSeries(perTag, noMerge) {
  const lists = noMerge ? perTag.filter(l => l.length).slice(0, 1) : perTag;
  const all = mergeEntries(lists, e => e.end).sort((a, b) => a.end < b.end ? -1 : 1);
  return { annual: all.filter(e => ANNUAL_FORMS.includes(e.form)).slice(-6).map(slim), quarterly: all.slice(-8).map(slim) };
}

async function sec(url, ua, ttl) {
  return fetch(url, { headers: { "User-Agent": ua, "Accept": "application/json" }, cf: { cacheTtl: ttl, cacheEverything: true } });
}

export async function onRequestGet({ request, env }) {
  const ua = env && env.SEC_USER_AGENT;
  if (!ua) return J({ error: "Die Einstellung SEC_USER_AGENT fehlt in Cloudflare." }, 500);
  const sym = (new URL(request.url).searchParams.get("symbol") || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{0,9}$/.test(sym)) return J({ available: false, reason: "Für dieses Symbol gibt es keine SEC-Daten (Kürzel mit Börsenendung oder Sonderzeichen, typisch für Nicht-US-Aktien)." });
  const delay = env.SEC_DELAY_MS != null ? +env.SEC_DELAY_MS : 400;
  try {
    const tr = await sec("https://www.sec.gov/files/company_tickers.json", ua, 86400);
    if (!tr.ok) return J({ error: "SEC-Kürzelliste nicht erreichbar (HTTP " + tr.status + ")." }, 502);
    const txt = await tr.text();
    const m = new RegExp('"cik_str"\\s*:\\s*(\\d+)\\s*,\\s*"ticker"\\s*:\\s*"' + sym.replace(/-/g, "\\-") + '"\\s*,\\s*"title"\\s*:\\s*"([^"]*)"').exec(txt);
    if (!m) return J({ available: false, reason: "Kein SEC-Eintrag für „" + sym + "“. Das ist typisch für Unternehmen außerhalb der USA oder US-Zertifikate (ADR) ohne SEC-Berichte." });
    const cik = String(m[1]).padStart(10, "0"), name = m[2];

    let sic = null, sicDescription = null, fiscalYearEnd = null;
    const sr = await sec("https://data.sec.gov/submissions/CIK" + cik + ".json", ua, 86400);
    if (sr.ok) {
      const st = await sr.text(), s = /"sic"\s*:\s*"(\d*)"\s*,\s*"sicDescription"\s*:\s*"([^"]*)"/.exec(st), f = /"fiscalYearEnd"\s*:\s*"(\d{4})"/.exec(st);
      if (s) { sic = s[1]; sicDescription = s[2]; }
      if (f) fiscalYearEnd = f[1];
    } else if (sr.status === 403 || sr.status === 429) return J({ error: "Die SEC begrenzt gerade Anfragen (HTTP " + sr.status + "). Bitte später erneut versuchen." }, 503);

    const jobs = [];
    for (const [k, c] of Object.entries(CONCEPTS)) c.tags.forEach((tag, ti) => jobs.push({ k, c, tag, ti }));
    const got = [];
    for (let i = 0; i < jobs.length; i += 4) {
      const res = await Promise.all(jobs.slice(i, i + 4).map(async j => {
        const r = await sec("https://data.sec.gov/api/xbrl/companyconcept/CIK" + cik + "/" + (j.c.taxonomy || "us-gaap") + "/" + j.tag + ".json", ua, 21600);
        if (r.status === 404) return { j, text: null };
        if (!r.ok) return { j, status: r.status };
        return { j, text: await r.text() };
      }));
      got.push(...res);
      const limited = res.find(r => r.status === 403 || r.status === 429);
      if (limited) return J({ error: "Die SEC begrenzt gerade Anfragen (HTTP " + limited.status + "). Bitte später erneut versuchen." }, 503);
      if (delay && i + 4 < jobs.length) await new Promise(r => setTimeout(r, delay));
    }

    const series = {};
    let asOf = "";
    for (const [k, c] of Object.entries(CONCEPTS)) {
      const mine = got.filter(g => g.j.k === k).sort((a, b) => a.j.ti - b.j.ti);
      const perTag = mine.map(g => g.text ? entriesOf(g.text, c.unit) : []);
      if (!perTag.some(l => l.length)) continue;
      const s = c.kind === "flow" ? flowSeries(perTag, !c.noDerive) : instantSeries(perTag, c.noMerge);
      if (!s.annual.length && !s.quarterly.length) continue;
      const used = mine.filter((g, i) => perTag[i].length).map(g => g.j.tag);
      series[k] = Object.assign({ unit: c.unit, tags: c.noMerge ? used.slice(0, 1) : used }, s);
      for (const e of s.annual.concat(s.quarterly)) if (e.filed > asOf) asOf = e.filed;
    }
    if (!Object.keys(series).length) return J({ available: false, reason: "Die SEC hat für „" + sym + "“ keine auswertbaren Kennzahlen (z. B. Fonds, Holding oder abweichende Berichtsform)." });
    return J({ available: true, ticker: sym, cik, name, sic, sicDescription, fiscalYearEnd, asOf: asOf || null, source: "SEC EDGAR (XBRL, offizielle Einreichungen)", series });
  } catch (e) {
    return J({ error: "Fundamentaldaten konnten nicht geladen werden: " + e.message }, 502);
  }
}
