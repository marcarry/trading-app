const Entry = (() => {
  const LABEL = { good: "Guter Einstieg", wait: "Einstieg abwarten", pullback: "Rücksetzer abwarten", breakout: "Ausbruch abwarten", no: "Kein attraktiver Einstieg" };
  const num = (n, p) => n.toLocaleString("de-DE", { minimumFractionDigits: p, maximumFractionDigits: p });
  const dp = x => x < 1 ? 6 : x < 10 ? 4 : 2;
  const day = t => new Date(t * 1000).toLocaleDateString("de-DE");
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

  // Volumen der letzten 3 Kerzen im Vergleich zum Durchschnitt der 20 Kerzen davor
  function volRatio(k) {
    const n = k.length;
    if (n < 24) return null;
    const avg = mean(k.slice(n - 23, n - 3).map(x => x.v)), rec = mean(k.slice(n - 3).map(x => x.v));
    return avg > 0 ? rec / avg : null;
  }

  // 52-Wochen-Werte aus Tageskerzen
  function yearStats(year, price) {
    if (!year || !year.candles || year.candles.length < 20) return null;
    const yc = year.candles, lastT = yc[yc.length - 1].t, w = yc.filter(x => x.t >= lastT - 365 * 86400);
    if (w.length < 20) return null;
    let hi = -Infinity, lo = Infinity, hiT = 0, loT = 0;
    for (const x of w) { if (x.h > hi) { hi = x.h; hiT = x.t; } if (x.l < lo) { lo = x.l; loT = x.t; } }
    if (price > hi) { hi = price; hiT = lastT; }
    if (price < lo) { lo = price; loT = lastT; }
    const spanDays = (lastT - w[0].t) / 86400, prior = w.slice(0, -3);
    return { high: hi, low: lo, highT: hiT, lowT: loT, spanDays, partial: spanDays < 330,
      hiPrev: prior.length ? Math.max(...prior.map(x => x.h)) : null, closes3: w.slice(-3).map(x => x.c), vr: volRatio(w),
      distHigh: (hi - price) / hi * 100, distLow: (price / lo - 1) * 100 };
  }

  function features(k, r, year, issues) {
    const n = k.length, cl = k.map(x => x.c), price = cl[n - 1];
    const rsi = Ind.rsi(cl, 14)[n - 1], ema = Ind.ema(cl, 50)[n - 1], atr = Ind.atr(k, 14)[n - 1];
    const f = { price, rsi, atr, ema, extPct: null, extATR: null, vr: volRatio(k) };
    if (ema != null) { f.extPct = (price / ema - 1) * 100; if (atr) f.extATR = (price - ema) / atr; }
    const y = f.y = yearStats(year, price);
    f.yearMissing = !y;
    f.dataBad = (issues || []).some(i => i.level === "warn");
    f.score = r.score; f.coverage = r.coverage; f.bull = r.bull; f.bear = r.bear;
    f.trendDown = r.trend.dir === "Abwärtstrend";
    // Ausbruch: zuerst über das bisherige Jahreshoch, sonst über eine erkannte Widerstandszone
    let b = null;
    if (y && y.hiPrev != null && price > y.hiPrev) {
      const held = y.closes3.filter(c => c > y.hiPrev).length;
      b = { dir: "up", kind: "52w", level: y.hiPrev, held, vr: y.vr, confirmed: held >= 2 && y.vr != null && y.vr >= 1.2 };
    } else if (r.breakout && r.breakout.dir === "up") {
      const lvl = r.breakout.level, held = [cl[n - 1], cl[n - 2]].filter(c => c > lvl).length;
      b = { dir: "up", kind: "zone", level: lvl, held, vr: f.vr, confirmed: held >= 2 && f.vr != null && f.vr >= 1.2 };
    }
    f.breakout = b;
    f.breakdown = !!(r.breakout && r.breakout.dir === "down");
    // Chance und Risiko
    const res = f.res = r.resist[0] || null, sup = f.sup = r.support[0] || null;
    const cands = [res && res.level, y && y.high > price * 1.0005 ? y.high : null].filter(v => v != null);
    f.target = cands.length ? Math.min(...cands) : null;
    f.nearRes = !!(f.target != null && atr && f.target - price <= 1.5 * atr) || !!(y && y.distHigh > 0 && y.distHigh < 3);
    f.riskEstimated = !sup;
    f.riskDist = sup ? price - sup.level : (atr ? 2 * atr : null);
    f.rr = f.target != null && f.riskDist > 0 ? (f.target - price) / f.riskDist : null;
    return f;
  }

  function decide(f) {
    const n2 = v => num(v, dp(f.price));
    const out = (id, ...why) => ({ id, label: LABEL[id], why });
    if (f.dataBad) return out("wait", "Die Datenlage ist unzuverlässig (siehe Hinweise), deshalb gibt es keine belastbare Einstiegseinschätzung.");
    if (f.score == null || f.coverage < 0.6) return out("wait", "Die Gesamtlage ist nicht ausreichend belegt: zu wenige aktivierte oder berechenbare Kriterien. Schalte mehr Indikatoren ein oder wähle einen längeren Zeitraum.");
    if (f.breakdown) return out("no", "Der Kurs ist unter eine wichtige Unterstützungszone gefallen.");
    if (f.score < 40 || f.trendDown) return out("no", "Die technische Gesamtlage ist bearish oder es liegt ein Abwärtstrend vor.");
    const hot = f.rsi != null && f.rsi > 70, veryHot = f.rsi != null && f.rsi > 80, ext = f.extATR != null && f.extATR > 3;
    const nearHigh = !!(f.y && f.y.distHigh > 0 && f.y.distHigh < 3);
    const b = f.breakout;
    if (b) {
      const lv = n2(b.level) + (b.kind === "52w" ? " (bisheriges Jahreshoch)" : " (Widerstandszone)");
      if (!b.confirmed) {
        const miss = [];
        if (b.held < 2) miss.push("weniger als 2 Schlusskurse über dem Niveau");
        if (b.vr == null) miss.push("kein aussagekräftiges Volumen verfügbar");
        else if (b.vr < 1.2) miss.push("Volumen nur " + num(b.vr, 2) + "× Durchschnitt (mind. 1,2× nötig)");
        return out("breakout", "Der Kurs liegt über " + lv + ", der Ausbruch ist aber nicht bestätigt: " + miss.join(", ") + ".");
      }
      if (hot || ext) return out("pullback", "Der Ausbruch über " + lv + " ist bestätigt, der Kurs ist aber überhitzt" + (hot ? " (RSI " + num(f.rsi, 1) + ")" : "") + (ext ? " und weit über der EMA 50" : "") + ". Ein Rücksetzer auf das ehemalige Widerstandsniveau ist möglich.");
      if (f.yearMissing) return out("wait", "Der Ausbruch ist bestätigt, die 52-Wochen-Werte sind aber nicht verfügbar, daher lässt sich der Einstieg nicht abschließend bewerten.");
      if (!(f.bull >= 3 && f.bear <= 2)) return out("wait", "Der Ausbruch ist bestätigt, aber die übrigen Kriterien stützen ihn nicht eindeutig.");
      return out("good", "Bestätigter Ausbruch über " + lv + ": " + b.held + " von 3 Schlusskursen darüber, Volumen " + num(b.vr, 2) + "× Durchschnitt, Kurs nicht überhitzt.");
    }
    if (veryHot && (nearHigh || ext)) return out("no", "Der RSI von " + num(f.rsi, 1) + " ist stark überkauft" + (nearHigh ? " und der Kurs liegt nur " + num(f.y.distHigh, 1) + " % unter dem Jahreshoch" : "") + (ext ? ", der Kurs ist weit über der EMA 50" : "") + ": besonders hohes Rückschlagrisiko.");
    if (hot || ext) return out("pullback", (hot ? "Der RSI von " + num(f.rsi, 1) + " ist " + (veryHot ? "stark " : "") + "überkauft" : "Der Kurs liegt " + num(f.extATR, 1) + " ATR über der EMA 50 und ist kurzfristig überdehnt") + ", das Rückschlagrisiko ist erhöht." + (nearHigh ? " Zusätzlich liegt der Kurs nur " + num(f.y.distHigh, 1) + " % unter dem Jahreshoch." : "") + " Ein Rücksetzer wäre der bessere Einstieg.");
    if (f.nearRes) return out("breakout", nearHigh ? "Der Kurs liegt nur " + num(f.y.distHigh, 1) + " % unter dem Jahreshoch (" + n2(f.y.high) + "). Ohne bestätigten Ausbruch ist das ein Widerstand, kein Einstiegssignal." : "Der Kurs liegt direkt unter einem Widerstand bei " + n2(f.target) + ". Erst ein bestätigter Ausbruch (Schlusskurse darüber, erhöhtes Volumen) wäre ein Signal.");
    if (f.rr != null && f.rr < 0.7) return out("no", "Das Risiko ist deutlich größer als die Chance: bis zum nächsten Ziel " + n2(f.target) + " sind es " + num((f.target - f.price) / f.price * 100, 1) + " %, das Rückschlagrisiko bis " + n2(f.price - f.riskDist) + " beträgt " + num(f.riskDist / f.price * 100, 1) + " % (Chance:Risiko 1:" + num(1 / f.rr, 1) + ").");
    if (f.rr != null && f.rr < 1.5) return out("wait", "Das Chance-Risiko-Verhältnis von 1:" + num(1 / f.rr, 1) + " ist zu schwach für einen Einstieg auf dem aktuellen Kurs.");
    if (f.score < 60) return out("wait", "Die technische Gesamtlage ist nur neutral.");
    if (f.rr == null) return out("wait", "Die Chance lässt sich nicht einschätzen, es ist kein Widerstand oder Ziel in Sicht.");
    if (f.yearMissing) return out("wait", "Die 52-Wochen-Werte sind nicht verfügbar, daher lässt sich nicht prüfen, ob der Kurs nahe am Jahreshoch liegt.");
    if (!(f.bull >= 4 && f.bear <= 1)) return out("wait", "Es stimmen zu wenige Kriterien überein (mindestens 4 bullish und höchstens 1 bearish nötig).");
    return out("good", "Die Gesamtlage ist bullish, der Kurs ist nicht überhitzt und nicht am Widerstand, und das Chance-Risiko-Verhältnis beträgt " + num(f.rr, 1) + " : 1.");
  }

  function run(k, r, year, issues, meta) {
    meta = meta || {};
    if (!r || r.error) return { error: r && r.error ? r.error : "Keine Analyse verfügbar." };
    const f = features(k, r, year, issues), d = decide(f), n2 = v => num(v, dp(f.price)), cur = meta.currency ? " " + meta.currency : "", facts = [], cautions = [];
    const y = f.y;
    if (y) {
      facts.push("Jahreshoch: " + n2(y.high) + cur + " (" + day(y.highT) + "), Abstand " + num(y.distHigh, 2) + " %" + (y.partial ? " (Daten erst seit " + num(y.spanDays, 0) + " Tagen, kein volles Jahr)" : ""));
      facts.push("Jahrestief: " + n2(y.low) + cur + " (" + day(y.lowT) + "), Abstand " + num(y.distLow, 2) + " %");
      if (y.distHigh === 0) facts.push("Der Kurs erreicht gerade ein neues Jahreshoch.");
      else if (y.distHigh < 3) facts.push("Der Kurs liegt weniger als 3 % unter dem Jahreshoch.");
    } else facts.push("52-Wochen-Hoch und -Tief: nicht verfügbar.");
    if (f.rsi != null) facts.push("RSI 14: " + num(f.rsi, 1) + (f.rsi > 80 ? ", stark überkauft" : f.rsi > 70 ? ", überkauft" : f.rsi < 30 ? ", überverkauft (kein automatisches Kaufsignal)" : ", normal"));
    if (f.extPct != null) facts.push("Abstand zur EMA 50: " + (f.extPct >= 0 ? "+" : "") + num(f.extPct, 1) + " %" + (f.extATR != null ? " (" + num(f.extATR, 1) + " ATR)" : "") + (f.extATR != null && f.extATR > 3 ? ", überdehnt" : ""));
    if (f.sup) facts.push("Nächste Unterstützung: " + n2(f.sup.level) + " (" + num((f.sup.level / f.price - 1) * 100, 1) + " %)");
    else facts.push("Keine Unterstützung in der Nähe erkannt, das Risiko ist mit 2×ATR geschätzt.");
    if (f.target != null) facts.push("Nächster Widerstand: " + n2(f.target) + " (+" + num((f.target / f.price - 1) * 100, 1) + " %)");
    else facts.push("Kein Widerstand voraus erkannt.");
    if (f.rr != null) facts.push("Chance zu Risiko: " + num(f.rr, 1) + " : 1" + (f.riskEstimated ? " (Risiko geschätzt)" : ""));
    const hot = f.rsi != null && f.rsi > 70, ext3 = f.extATR != null && f.extATR > 3, nearHigh = !!(y && y.distHigh > 0 && y.distHigh < 3);
    const lvl = (hot || ext3 || (nearHigh && f.rsi > 65) || (f.rr != null && f.rr < 1)) ? "erhöht" : ((f.rsi > 65) || (f.extATR > 2) || nearHigh || (f.rr != null && f.rr < 1.5)) ? "mittel" : "gering";
    const risk = { level: lvl, text: lvl === "erhöht" ? "Erhöhter Rücksetzer möglich" : lvl === "mittel" ? "Mittleres Rücksetzer-Risiko" : "Geringes Rücksetzer-Risiko" };
    if (f.rsi != null && f.rsi > 60 && f.rsi <= 70) cautions.push("Der RSI (" + num(f.rsi, 1) + ") nähert sich dem überkauften Bereich.");
    if (y && y.distHigh >= 3 && y.distHigh < 8) cautions.push("Das Jahreshoch ist nur " + num(y.distHigh, 1) + " % entfernt.");
    if (f.vr != null && f.vr < 0.8) cautions.push("Das Volumen liegt unter dem Durchschnitt (" + num(f.vr, 2) + "×).");
    if (f.atr && f.atr / f.price * 100 > 5) cautions.push("Hohe Schwankung: ATR " + num(f.atr / f.price * 100, 1) + " % vom Kurs.");
    if (f.riskEstimated) cautions.push("Keine Unterstützung in der Nähe erkannt, das Risiko ist geschätzt.");
    return { id: d.id, label: d.label, why: d.why, facts, cautions, risk, f };
  }
  return { run, decide, features, yearStats, volRatio, LABEL };
})();
