const Analysis = (() => {
  const W = { structure: 16, ema: 10, sma: 14, rsi: 12, macd: 14, bb: 8, vwap: 8, vol: 10, sr: 8 };
  const f = (n, p = 2) => n.toLocaleString("de-DE", { minimumFractionDigits: p, maximumFractionDigits: p });
  const sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mix = parts => { let a = 0, b = 0; for (const [v, w] of parts) { a += v * w; b += w; } return b ? a / b : null; };
  const pp = p => p < 1 ? 6 : p < 100 ? 4 : 2;

  function pivots(k, w) {
    const hi = [], lo = [];
    for (let i = w; i < k.length - w; i++) {
      let isH = true, isL = true;
      for (let j = i - w; j <= i + w; j++) {
        if (j === i) continue;
        if (k[j].h >= k[i].h) isH = false;
        if (k[j].l <= k[i].l) isL = false;
      }
      if (isH) hi.push({ i, p: k[i].h });
      if (isL) lo.push({ i, p: k[i].l });
    }
    return { hi, lo };
  }

  function zones(pv, tol) {
    const pts = [...pv.hi, ...pv.lo].map(x => x.p).sort((a, b) => a - b), z = [];
    for (const p of pts) {
      const g = z[z.length - 1];
      if (g && p - g.lo <= 2 * tol) { g.pts.push(p); g.hi = p; } else z.push({ pts: [p], lo: p, hi: p });
    }
    return z.map(g => ({ level: g.pts.reduce((a, b) => a + b, 0) / g.pts.length, lo: g.lo, hi: g.hi, touches: g.pts.length }));
  }

  function run(k, cfg, meta) {
    meta = meta || {}; cfg = cfg || {};
    const n = k.length;
    if (n < 30) return { error: "Zu wenig Kerzen für eine Bewertung (mindestens 30, geladen: " + n + "). Wähle einen längeren Zeitraum." };
    const cl = k.map(x => x.c), price = cl[n - 1], d = pp(price);
    const on = id => !!(cfg[id] && cfg[id].on), par = (id, key, def) => (cfg[id] && cfg[id].params && cfg[id].params[key]) || def;
    const comps = [], pro = [], risks = [], notes = [];
    const put = (id, name, active, s, text) => comps.push({ id, name, weight: W[id], active, s, text });
    const skip = (id, name) => put(id, name, false, null, "nicht aktiviert, wird nicht gewertet");
    const nodata = (id, name, need) => put(id, name, true, null, "zu wenig Daten (mind. " + need + " Kerzen nötig, geladen: " + n + "), wird nicht gewertet");

    // ATR (immer berechnet, bewertet nur das Risiko)
    const atrP = par("atr", "period", 14), atrArr = Ind.atr(k, atrP), atrV = atrArr[n - 1];
    const atr = atrV == null ? null : { period: atrP, value: atrV, pct: atrV / price * 100, stop: 2 * atrV, active: on("atr") };

    // Trendstruktur und Preiszonen (aus Kursdaten, immer)
    const w = n >= 250 ? 5 : 3, pv = pivots(k, w);
    const tol = 0.5 * (atrV != null ? atrV : price * 0.01); // Schwelle: ½ ATR
    let trend = { dir: "unklar", text: "Zu wenige Hoch- und Tiefpunkte für eine Aussage." };
    if (pv.hi.length >= 2 && pv.lo.length >= 2) {
      const [h1, h2] = pv.hi.slice(-2), [l1, l2] = pv.lo.slice(-2);
      const cmp = (x, y) => y - x > tol ? 1 : x - y > tol ? -1 : 0; // 1 = klar höher, -1 = klar tiefer, 0 = ähnlich
      const ch = cmp(h1.p, h2.p), cl2 = cmp(l1.p, l2.p), word = c => c > 0 ? "höher" : c < 0 ? "tiefer" : "ähnlich";
      const s = ch > 0 && cl2 > 0 ? 1 : ch < 0 && cl2 < 0 ? -1 : 0;
      const dir = s > 0 ? "Aufwärtstrend" : s < 0 ? "Abwärtstrend" : "Seitwärts";
      const txt = "Letzte Hochs " + word(ch) + " (" + f(h1.p, d) + " → " + f(h2.p, d) + "), letzte Tiefs " + word(cl2) + " (" + f(l1.p, d) + " → " + f(l2.p, d) + ")" + (s === 0 ? "; kein klarer Trend (Hochs und Tiefs müssen sich beide um mehr als ½ ATR verschieben)." : ".");
      trend = { dir, text: txt };
      put("structure", "Trendstruktur", true, s, txt);
    } else nodata("structure", "Trendstruktur", "genug Hoch- und Tiefpunkte");
    const longP = n >= 205 ? 200 : n >= 55 ? 50 : 0;
    if (longP) {
      const lm = Ind.sma(cl, longP)[n - 1], above = price > lm;
      trend.long = "Übergeordnet: Kurs " + (above ? "über" : "unter") + " der SMA " + longP + " (" + f(lm, d) + ").";
      if ((trend.dir === "Aufwärtstrend" && !above) || (trend.dir === "Abwärtstrend" && above)) risks.push("Der kurzfristige " + trend.dir + " steht im Widerspruch zur übergeordneten Lage (Kurs " + (above ? "über" : "unter") + " der SMA " + longP + ").");
    }

    const zs = zones(pv, tol);
    const support = zs.filter(z => z.level < price).sort((a, b) => b.level - a.level).slice(0, 2);
    const resist = zs.filter(z => z.level > price).sort((a, b) => a.level - b.level).slice(0, 2);
    let breakout = null;
    if (n >= 5) for (const z of zs) if (z.touches >= 2) {
      if (price > z.hi && k[n - 4].c <= z.hi) breakout = { dir: "up", level: z.level, text: "Kurs ist in den letzten 3 Kerzen über die Zone bei " + f(z.level, d) + " gestiegen (früher Widerstand, nun möglicher Halt)." };
      else if (price < z.lo && k[n - 4].c >= z.lo) breakout = { dir: "down", level: z.level, text: "Kurs ist in den letzten 3 Kerzen unter die Zone bei " + f(z.level, d) + " gefallen (früher Unterstützung, nun möglicher Widerstand)." };
    }
    {
      const near = [...support, ...resist].sort((a, b) => Math.abs(a.level - price) - Math.abs(b.level - price))[0];
      if (!near) put("sr", "Preiszonen", true, null, "keine Unterstützungs- oder Widerstandszone erkannt, wird nicht gewertet");
      else {
        const dist = Math.abs(near.level - price), isSup = near.level < price;
        const close = atrV != null && dist <= atrV, strong = near.touches >= 2;
        const s = close ? (isSup ? 1 : -1) * (strong ? 0.6 : 0.3) : 0;
        put("sr", "Preiszonen", true, s, "Nächste Zone: " + (isSup ? "Unterstützung" : "Widerstand") + " bei " + f(near.level, d) + " (" + near.touches + " Berührung" + (near.touches > 1 ? "en" : "") + ", Abstand " + f(dist / price * 100, 1) + " %)" + (close ? ", nah am Kurs." : ", nicht in unmittelbarer Nähe."));
      }
    }

    // EMA
    if (!on("ema")) skip("ema", "EMA " + par("ema", "period", 50)); else {
      const p = par("ema", "period", 50), v = Ind.ema(cl, p), e = v[n - 1], e5 = v[n - 6];
      if (e == null) nodata("ema", "EMA " + p, p); else {
        const parts = [[price > e ? 1 : -1, 0.6]]; let sl = "";
        if (e5 != null) { const slope = (e - e5) / e5; parts.push([sign(slope), 0.4]); sl = ", Linie " + (slope > 0 ? "steigt" : "fällt"); }
        put("ema", "EMA " + p, true, mix(parts), "Kurs " + (price > e ? "über" : "unter") + " der EMA " + p + " (" + f(e, d) + ")" + sl + ".");
      }
    }
    // SMA
    if (!on("sma")) skip("sma", "SMA " + par("sma", "period", 200)); else {
      const p = par("sma", "period", 200), v = Ind.sma(cl, p), m = v[n - 1], m5 = v[n - 6];
      if (m == null) nodata("sma", "SMA " + p, p); else {
        const parts = [[price > m ? 1 : -1, 0.5]]; let sl = "";
        if (m5 != null) { const slope = (m - m5) / m5; parts.push([sign(slope), 0.2]); sl = ", Linie " + (slope > 0 ? "steigt" : "fällt"); }
        let rel = "";
        if (on("ema")) { const e = Ind.ema(cl, par("ema", "period", 50))[n - 1]; if (e != null) { parts.push([e > m ? 1 : -1, 0.3]); rel = "; EMA " + par("ema", "period", 50) + " liegt " + (e > m ? "über" : "unter") + " der SMA"; } }
        put("sma", "SMA " + p, true, mix(parts), "Kurs " + (price > m ? "über" : "unter") + " der SMA " + p + " (" + f(m, d) + ")" + sl + rel + ".");
      }
    }
    // RSI
    if (!on("rsi")) skip("rsi", "RSI " + par("rsi", "period", 14)); else {
      const p = par("rsi", "period", 14), r = Ind.rsi(cl, p)[n - 1];
      if (r == null) nodata("rsi", "RSI " + p, p + 1); else {
        let s, t;
        if (r >= 70) { s = 0.3; t = "überkauft (Rückschlagrisiko), Momentum aber stark"; risks.push("RSI " + p + " bei " + f(r, 1) + ": überkauft, Rückschlag möglich."); }
        else if (r <= 30) { s = -0.3; t = "überverkauft (Erholung möglich), Momentum schwach"; risks.push("RSI " + p + " bei " + f(r, 1) + ": überverkauft, Gegenbewegung möglich."); }
        else { s = (r - 50) / 20; t = r > 50 ? "über 50, Momentum positiv" : r < 50 ? "unter 50, Momentum negativ" : "genau 50, neutral"; }
        put("rsi", "RSI " + p, true, s, "RSI " + p + " = " + f(r, 1) + ": " + t + ".");
      }
    }
    // MACD
    if (!on("macd")) skip("macd", "MACD"); else {
      const q = { f: par("macd", "fast", 12), s: par("macd", "slow", 26), g: par("macd", "signal", 9) }, nm = "MACD " + q.f + "/" + q.s + "/" + q.g;
      const m = Ind.macd(cl, q.f, q.s, q.g), l = m.line[n - 1], sg = m.signal[n - 1], h = m.hist[n - 1], hp = m.hist[n - 2];
      if (sg == null || hp == null) nodata("macd", nm, q.s + q.g); else {
        const s = 0.6 * sign(l - sg) + 0.4 * sign(h - hp);
        let cross = "";
        for (let i = n - 1; i >= Math.max(1, n - 5); i--) if (m.hist[i] != null && m.hist[i - 1] != null && sign(m.hist[i]) !== sign(m.hist[i - 1]) && m.hist[i] !== 0) { cross = "; " + (m.hist[i] > 0 ? "bullische" : "bärische") + " Kreuzung " + (i === n - 1 ? "bei der letzten Kerze" : "vor " + (n - 1 - i) + " Kerze(n)"); break; }
        put("macd", nm, true, s, "MACD-Linie " + (l > sg ? "über" : "unter") + " der Signallinie, Histogramm " + (h > hp ? "steigt" : h < hp ? "fällt" : "unverändert") + cross + ".");
      }
    }
    // Bollinger
    if (!on("bb")) skip("bb", "Bollinger"); else {
      const p = par("bb", "period", 20), mu = par("bb", "mult", 2), b = Ind.bollinger(cl, p, mu), up = b.up[n - 1], lo = b.low[n - 1];
      if (up == null || up === lo) nodata("bb", "Bollinger " + p + "/" + mu, p); else {
        const pb = (price - lo) / (up - lo), s = clamp((pb - 0.5) * 2, -1, 1) * 0.6;
        let t = "Kurs bei " + f(pb * 100, 0) + " % der Bandbreite (" + (pb > 0.5 ? "obere" : "untere") + " Hälfte)";
        if (pb > 1) { t += ", über dem oberen Band"; risks.push("Kurs liegt über dem oberen Bollinger-Band: kurzfristig überdehnt."); }
        else if (pb < 0) { t += ", unter dem unteren Band"; risks.push("Kurs liegt unter dem unteren Bollinger-Band: kurzfristig überdehnt."); }
        put("bb", "Bollinger " + p + "/" + mu, true, s, t + ".");
      }
    }
    // VWAP
    if (!on("vwap")) skip("vwap", "VWAP"); else {
      const intraday = !!meta.intraday, v = Ind.vwap(k, intraday)[n - 1];
      if (v == null) nodata("vwap", "VWAP", 1); else {
        put("vwap", "VWAP", true, price > v ? 0.6 : -0.6, "Kurs " + (price > v ? "über" : "unter") + " dem VWAP (" + f(v, d) + ")" + (intraday ? "." : ", bei Tageskerzen ab Beginn der geladenen Daten berechnet, daher weniger aussagekräftig."));
      }
    }
    // Volumen
    if (!(on("vol") || on("volavg"))) skip("vol", "Volumen"); else {
      const has = k.some(x => x.v > 0);
      if (!has || n < 24) nodata("vol", "Volumen", has ? 24 : "Volumendaten");
      else {
        const avg = k.slice(n - 23, n - 3).reduce((a, x) => a + x.v, 0) / 20, rec = k.slice(n - 3).reduce((a, x) => a + x.v, 0) / 3;
        if (!(avg > 0)) nodata("vol", "Volumen", "Volumendaten"); else {
          const ratio = rec / avg, move = cl[n - 1] / cl[n - 4] - 1, s = sign(move) * clamp((ratio - 1) * 2, 0, 1);
          let t = "Volumen der letzten 3 Kerzen = " + f(ratio, 2) + "× Durchschnitt, Kurs " + (move > 0 ? "gestiegen" : move < 0 ? "gefallen" : "unverändert");
          t += ratio >= 1.2 ? ": Bewegung wird vom Volumen bestätigt." : ratio <= 0.8 ? ": geringes Volumen, Bewegung kaum bestätigt." : ": durchschnittliches Volumen, keine klare Bestätigung.";
          put("vol", "Volumen", true, s, t);
        }
      }
    }

    // Auswertung
    const avail = comps.filter(c => c.s != null), wSum = avail.reduce((a, c) => a + c.weight, 0), coverage = wSum / 100;
    const raw = wSum ? avail.reduce((a, c) => a + c.weight * c.s, 0) / wSum : 0;
    const score = wSum ? Math.round(50 + 50 * raw) : null;
    const label = score == null ? "nicht bewertbar" : score < 20 ? "stark bearish" : score < 40 ? "bearish" : score < 60 ? "neutral" : score < 80 ? "bullish" : "stark bullish";
    const bull = avail.filter(c => c.s > 0.2).length, bear = avail.filter(c => c.s < -0.2).length;
    let rec = "wait", recWhy;
    if (score == null) recWhy = "Es liegen keine auswertbaren Kriterien vor.";
    else if (coverage < 0.6) recWhy = "Nur " + Math.round(coverage * 100) + " % der Kriterien sind auswertbar (mindestens 60 % nötig). Schalte mehr Indikatoren ein oder wähle einen längeren Zeitraum.";
    else if (score >= 65 && bull >= 4 && bear <= 1) { rec = "buy"; recWhy = score + " Punkte, " + bull + " von " + avail.length + " Kriterien bullish, höchstens 1 dagegen."; }
    else if (score <= 35 && bear >= 4 && bull <= 1) { rec = "sell"; recWhy = score + " Punkte, " + bear + " von " + avail.length + " Kriterien bearish, höchstens 1 dagegen."; }
    else recWhy = "Für ein Signal müssen mindestens 4 Kriterien in dieselbe Richtung zeigen (bei höchstens 1 Gegenstimme) und der Score ≥ 65 bzw. ≤ 35 sein. Aktuell: " + score + " Punkte, " + bull + " bullish, " + bear + " bearish.";
    const dirSign = score != null && score >= 50 ? 1 : -1;
    const sup = avail.filter(c => sign(c.s) === dirSign && Math.abs(c.s) > 0.2).sort((a, b) => Math.abs(b.s) * b.weight - Math.abs(a.s) * a.weight);
    const con = avail.filter(c => sign(c.s) === -dirSign && Math.abs(c.s) > 0.2).sort((a, b) => Math.abs(b.s) * b.weight - Math.abs(a.s) * a.weight);
    con.forEach(c => risks.push(c.name + " spricht dagegen: " + c.text));
    if (atr) risks.push("Schwankung: ATR " + atr.period + " = " + f(atr.value, d) + " (" + f(atr.pct, 2) + " % vom Kurs). Ein Stop-Loss im Abstand von 2×ATR läge bei " + f(atr.stop, d) + ".");
    if (breakout) (breakout.dir === "up" ? pro : risks).push(breakout.text);
    if (coverage < 1) notes.push(Math.round(coverage * 100) + " % der Gewichtung sind auswertbar, der Rest wurde nicht mitgerechnet (weder positiv noch negativ).");
    if (meta.delayed) notes.push("Die Kursdaten sind verzögert.");
    return { score, label, trend, rec, recWhy, coverage, comps, support, resist, breakout, atr, pro: [...sup.map(c => c.name + ": " + c.text), ...pro], risks, notes, bull, bear, n, price };
  }
  return { run, pivots, zones, W };
})();
