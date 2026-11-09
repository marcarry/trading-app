(() => {
  const fm = (n, p) => n.toLocaleString("de-DE", { minimumFractionDigits: p, maximumFractionDigits: p });
  const dt = t => new Date(t * 1000).toLocaleDateString("de-DE");
  const pr = n => n < 1 ? 6 : n < 100 ? 4 : 2;

  /* ---------- Tagesänderung gegenüber dem Vortagesschluss ---------- */
  async function dayChange(asset) {
    if (asset.source === "binance") {
      const r = await fetch(Data.BIN + "/api/v3/ticker/24hr?symbol=" + asset.symbol);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const x = await r.json();
      return { abs: +x.priceChange, pct: +x.priceChangePercent, basis: "den letzten 24 Std. (Binance)" };
    }
    const r = await fetch("/api/history?source=yahoo&symbol=" + encodeURIComponent(asset.symbol) + "&interval=1d&range=5d");
    const x = await r.json();
    if (!r.ok || x.error) throw new Error(x.error || "HTTP " + r.status);
    const cs = x.candles, lp = x.lastPrice, lt = x.lastPriceTime;
    if (!cs.length || lp == null) throw new Error("keine Tagesdaten");
    const prev = lt ? cs.filter(k => k.t < lt - 12 * 3600).pop() : cs[cs.length - 2];
    if (!prev) throw new Error("kein Vortagesschluss gefunden");
    return { abs: lp - prev.c, pct: (lp / prev.c - 1) * 100, basis: "dem Vortagesschluss " + fm(prev.c, pr(prev.c)) + " (" + dt(prev.t) + ")" };
  }

  /* ---------- Daten laden, bereinigen, prüfen ---------- */
  const baseLoad = Data.load;
  Data.load = async function (asset, tfId, rangeId) {
    const d = await baseLoad.call(Data, asset, tfId, rangeId);
    const c = d.candles, issues = [];
    if (asset.source === "yahoo") {
      const hasVol = c.slice(-30).some(k => k.v > 0), dropped = [];
      while (hasVol && c.length > 1 && !(c[c.length - 1].v > 0)) dropped.push(c.pop());
      if (dropped.length) issues.push({ level: "info", text: dropped.length + " Kerze(n) ohne Handelsvolumen am Ende entfernt (letzte: " + dt(dropped[0].t) + ", Schlusskurs " + fm(dropped[0].c, pr(dropped[0].c)) + "). Bei wenig gehandelten Papieren liefert die Datenquelle solche Platzhalter." });
    }
    const last = c[c.length - 1];
    if (!last) throw new Error("Keine Kursdaten nach der Bereinigung.");
    const gap = d.lastPrice != null ? Math.abs(d.lastPrice / last.c - 1) : 0;
    if (gap > (d.tf.sec < 86400 ? 0.01 : 0.005))
      issues.push({ level: "warn", text: "Kursanzeige (" + fm(d.lastPrice, pr(d.lastPrice)) + ") und letzte Kerze (" + fm(last.c, pr(last.c)) + ") weichen um " + fm(gap * 100, 1) + " % voneinander ab, die Datenquelle liefert widersprüchliche Werte." });
    d.dayChange = null;
    try { d.dayChange = await dayChange(asset); }
    catch (e) { issues.push({ level: "info", text: "Tagesänderung nicht verfügbar (" + e.message + ")." }); }
    if (d.dayChange && Math.abs(d.dayChange.pct) > 40)
      issues.push({ level: "warn", text: "Die Tagesänderung von " + fm(d.dayChange.pct, 1) + " % ist ungewöhnlich hoch, bitte Daten prüfen." });
    d.issues = issues;
    return d;
  };

  /* ---------- Kopfzeile: Heute und Zeitraum getrennt ---------- */
  const baseHeader = showHeader;
  showHeader = function () {
    baseHeader();
    const d = S.data, c = S.candles, p = prec(S.last);
    const sg = v => v >= 0 ? "+" : "";
    const line = (txt, v, small) => { const e = el("div", null, txt); e.style.color = v == null ? "#888" : v >= 0 ? "#00c805" : "#ff3b30"; if (small) e.style.fontSize = "13px"; return e; };
    const last = d.lastPrice != null ? d.lastPrice : c[c.length - 1].c, pd = last - c[0].o, rows = [];
    if (d.dayChange) rows.push(line("Heute " + sg(d.dayChange.abs) + fmt(d.dayChange.abs, p) + " " + d.currency + " (" + sg(d.dayChange.pct) + fmt(d.dayChange.pct, 2) + " %) gegenüber " + d.dayChange.basis, d.dayChange.abs));
    else rows.push(line("Heute: nicht verfügbar", null));
    rows.push(line("Zeitraum " + d.range.label + ": " + sg(pd) + fmt(pd, p) + " " + d.currency + " (" + sg(pd) + fmt(pd / c[0].o * 100, 2) + " %)", pd, true));
    $("chg").className = "";
    $("chg").replaceChildren(...rows);
    (d.issues || []).forEach(i => $("info").append(el("div", i.level === "warn" ? "err" : "sub", (i.level === "warn" ? "⚠ " : "ⓘ ") + i.text)));
  };

  /* ---------- Legende: zeigt, für welche Kerze die Werte gelten ---------- */
  const baseLegend = legend;
  legend = function (i) {
    baseLegend(i);
    const k = S.candles[i];
    if (!k) return;
    const isLast = i === S.candles.length - 1, daily = S.data.tf.sec >= 86400;
    const t = new Date(k.t * 1000).toLocaleString("de-DE", daily ? { dateStyle: "short" } : { dateStyle: "short", timeStyle: "short" });
    const s = el("span", "lg", isLast ? "Werte der letzten Kerze (" + t + ")" : "Werte vom " + t);
    s.style.color = isLast ? "#888" : "#fff";
    $("legend").prepend(s);
  };

  /* ---------- Kein Signal bei widersprüchlichen Daten ---------- */
  const baseRun = Analysis.run;
  Analysis.run = function (k, cfg, meta) {
    const r = baseRun(k, cfg, meta);
    const warn = S.data && S.data.issues ? S.data.issues.filter(i => i.level === "warn") : [];
    if (r.error || !warn.length) return r;
    if (r.rec !== "wait") { r.rec = "wait"; r.recWhy = "Die Daten sind widersprüchlich (siehe Risiken), deshalb wird kein Kauf- oder Verkaufssignal ausgegeben."; }
    else r.recWhy += " Außerdem sind die Daten widersprüchlich (siehe Risiken).";
    r.risks.unshift("Datenqualität: " + warn.map(i => i.text).join(" "));
    return r;
  };
})();
