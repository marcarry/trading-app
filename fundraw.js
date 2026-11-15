const Fund = (() => {
  const DAY = 86400000;
  const ANNUAL_FORMS = ["10-K", "10-K/A", "10-KT", "20-F", "20-F/A", "40-F", "40-F/A"];

  // Welche SEC-Kennzahlen (XBRL-Tags) ausgewertet werden; mehrere Tags, weil Firmen unterschiedlich melden.
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

  // Aus den kompletten SEC-Firmendaten (companyfacts) die Reihen bilden
  function build(cf) {
    const facts = (cf && cf.facts) || {}, series = {};
    let asOf = "";
    for (const [k, c] of Object.entries(CONCEPTS)) {
      const tax = facts[c.taxonomy || "us-gaap"] || {};
      const perTag = c.tags.map(tag => { const t = tax[tag], arr = t && t.units && t.units[c.unit]; return Array.isArray(arr) ? arr : []; });
      if (!perTag.some(l => l.length)) continue;
      const s = c.kind === "flow" ? flowSeries(perTag, !c.noDerive) : instantSeries(perTag, c.noMerge);
      if (!s.annual.length && !s.quarterly.length) continue;
      const used = c.tags.filter((tag, i) => perTag[i].length);
      series[k] = Object.assign({ unit: c.unit, tags: c.noMerge ? used.slice(0, 1) : used }, s);
      for (const e of s.annual.concat(s.quarterly)) if (e.filed > asOf) asOf = e.filed;
    }
    return { series, asOf: asOf || null };
  }

  async function getJson(url) {
    const r = await fetch(url), t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch (e) { /* keine JSON-Antwort */ }
    if (!r.ok || (j && j.error)) throw new Error((j && j.error) || "HTTP " + r.status);
    if (j === null) throw new Error("Unerwartete Antwort der Schnittstelle.");
    return { j, bytes: t.length };
  }

  // Komplett: Ticker -> CIK -> Firmendaten + Stammdaten (2 Anfragen an die SEC)
  async function load(symbol) {
    const t0 = Date.now();
    const c = (await getJson("/api/sec-cik?symbol=" + encodeURIComponent(symbol))).j;
    if (!c.available) return { available: false, reason: c.reason };
    const [f, s] = await Promise.all([
      getJson("/api/sec-facts?cik=" + c.cik),
      getJson("/api/sec-facts?cik=" + c.cik + "&kind=submissions").catch(() => null)
    ]);
    const b = build(f.j);
    if (!Object.keys(b.series).length) return { available: false, reason: "Die SEC hat für „" + c.ticker + "“ keine auswertbaren Kennzahlen (z. B. Fonds, Holding oder abweichende Berichtsform)." };
    const sub = (s && s.j) || {};
    return { available: true, ticker: c.ticker, cik: c.cik, name: f.j.entityName || c.name, sic: sub.sic || null, sicDescription: sub.sicDescription || null,
      fiscalYearEnd: sub.fiscalYearEnd || null, asOf: b.asOf, source: "SEC EDGAR (XBRL, offizielle Einreichungen)", series: b.series, ms: Date.now() - t0, bytes: f.bytes };
  }

  return { load, build, CONCEPTS, flowSeries, instantSeries, mergeEntries };
})();
if (typeof module !== "undefined") module.exports = Fund;
