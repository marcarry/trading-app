(() => {
  const st = document.createElement("style");
  st.textContent = ".aibtn{width:100%;margin:10px 0 0;padding:14px;border-radius:12px;border:1px solid #333;background:#111;color:#fff;font-size:16px}" +
    ".aipanel{background:#0d0d0d;border:1px solid #222;border-radius:12px;padding:14px;margin-top:8px}" +
    ".aigrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.aicard{background:#141414;border-radius:10px;padding:10px;min-width:0}" +
    ".aict{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#888;text-transform:uppercase}" +
    ".aival{font-size:20px;font-weight:700;line-height:1.15;margin:6px 0 2px;overflow-wrap:anywhere}.aiscore{font-size:40px;font-weight:700;line-height:1}" +
    ".aiinfo{background:none;border:0;color:#8ab4ff;font-size:20px;padding:0 4px;line-height:1}" +
    ".aiinfobox{background:#141414;border:1px solid #2a2a2a;border-radius:10px;padding:12px;margin:8px 0;font-size:13px;line-height:1.45;color:#ccc}.aiinfobox b{color:#fff}" +
    ".aigauge{position:relative;height:6px;border-radius:3px;margin:12px 0 4px;background:linear-gradient(90deg,#ff3b30 0%,#555 50%,#00c805 100%)}" +
    ".aigauge i{position:absolute;top:-4px;width:4px;height:14px;border-radius:2px;background:#fff;transform:translateX(-50%)}" +
    ".aih{color:#888;font-size:12px;text-transform:uppercase;margin:16px 0 6px}.aip{font-size:14px;line-height:1.45;color:#ddd;margin:4px 0}" +
    ".aipanel ul{margin:6px 0;padding-left:18px;font-size:14px;line-height:1.45;color:#ddd}" +
    ".aikv{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #1c1c1c;font-size:14px}.aikv b{text-align:right}" +
    ".aicrit{padding:8px 0;border-bottom:1px solid #1c1c1c;font-size:13px;line-height:1.4;color:#bbb}.aicrit b{color:#fff;font-size:14px}.aitag{float:right;font-size:12px;font-weight:600}" +
    ".aidisc{margin-top:14px;font-size:12px;color:#777;line-height:1.4}";
  document.head.append(st);

  const btn = el("button", "aibtn"), panel = el("div", "aipanel");
  panel.hidden = true;
  let open = false, infoScore = false, infoEntry = false;
  $("info").before(btn, panel);
  btn.onclick = () => { open = !open; refresh(); };

  const GRAY = "#9a9a9a";
  const col = s => s > 0.2 ? "#00c805" : s < -0.2 ? "#ff3b30" : GRAY;
  const lbl = s => s > 0.2 ? "bullish" : s < -0.2 ? "bearish" : "neutral";
  const EC = { good: "#00c805", wait: "#ffd60a", pullback: "#ff9f0a", breakout: "#4aa3ff", no: "#ff3b30" };
  const RC = { "erhöht": "#ff3b30", mittel: "#ffd60a", gering: "#00c805" };
  const dpf = x => x < 1 ? 6 : x < 10 ? 4 : 2;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const row = (b, t) => { const x = el("div"); x.append(el("b", null, b), document.createTextNode(t)); x.style.marginTop = "6px"; return x; };

  function scoreInfo(r) {
    const b = el("div", "aiinfobox");
    b.append(
      row("Was der Score ist: ", "Eine Zusammenfassung der technischen Lage in einer Zahl von 0 bis 100. Er zeigt, wie viele der geprüften Kriterien aktuell für steigende (bullish) oder fallende (bearish) Kurse sprechen. Er ist keine Wahrscheinlichkeit und keine Prognose."),
      row("So wird gerechnet: ", "Jedes Kriterium bekommt eine Wertung von −1 (klar bearish) bis +1 (klar bullish), 0 ist neutral. Die Wertungen werden nach Gewicht gemittelt. Score = 50 + 50 × gewichteter Durchschnitt. 0 heißt: alle Kriterien klar bearish. 50: ausgeglichen. 100: alle Kriterien klar bullish."),
      row("Gewichtung: ", r.comps.map(c => c.name + " (" + c.weight + " %)").join(", ") + ". Der ATR zählt nicht mit, er zeigt nur das Risiko."),
      row("Einordnung: ", "0–19 stark bearish, 20–39 bearish, 40–59 neutral, 60–79 bullish, 80–100 stark bullish."),
      row("Nicht gewertet: ", "Kriterien, die du nicht eingeschaltet hast oder für die zu wenig Daten da sind, zählen weder positiv noch negativ. Der Score wird dann nur aus den übrigen berechnet."),
      row("Wichtig: ", "Der Score sagt nur etwas über die Gesamtlage. Ob der aktuelle Kurs ein guter Einstieg ist, steht in der Einstiegseinschätzung daneben.")
    );
    return b;
  }

  function entryInfo() {
    const b = el("div", "aiinfobox");
    b.append(
      row("Was das ist: ", "Eine zweite, unabhängige Bewertung. Eine Aktie kann einen bullishen Trend haben und trotzdem ein schlechter Einstieg sein, zum Beispiel wenn der Kurs überhitzt ist oder direkt unter dem Jahreshoch liegt."),
      row("Die Regeln, von oben nach unten geprüft: ", ""),
      row("1. Datenwarnung oder zu wenige Kriterien: ", "Einstieg abwarten."),
      row("2. Gesamtlage bearish, Abwärtstrend oder Bruch einer Unterstützung: ", "Kein attraktiver Einstieg."),
      row("3. Kurs über Jahreshoch oder Widerstand: ", "bestätigt (mindestens 2 von 3 Schlusskursen darüber und Volumen mindestens 1,2× Durchschnitt) und nicht überhitzt: Guter Einstieg. Unbestätigt: Ausbruch abwarten. Bestätigt, aber überhitzt: Rücksetzer abwarten."),
      row("4. RSI über 70 oder Kurs mehr als 3 ATR über der EMA 50: ", "Rücksetzer abwarten. RSI über 80 nahe dem Jahreshoch: Kein attraktiver Einstieg."),
      row("5. Direkt unter einem Widerstand oder unter 3 % unter dem Jahreshoch ohne Ausbruch: ", "Ausbruch abwarten."),
      row("6. Chance zu Risiko unter 0,7 zu 1: ", "Kein attraktiver Einstieg. Unter 1,5 zu 1: Einstieg abwarten."),
      row("7. Sonst: ", "Guter Einstieg nur bei Score ab 60, mindestens 4 bullishen und höchstens 1 bearishen Kriterium und vorhandenen 52-Wochen-Daten."),
      row("Wichtig: ", "Die Grenzwerte sind Faustregeln. Die Einstiegseinschätzung ist keine Prognose und keine Anlageberatung.")
    );
    return b;
  }

  function refresh() {
    btn.textContent = "KI-Analyse " + (open ? "▴" : "▾");
    panel.hidden = !open;
    if (!open) return;
    panel.replaceChildren();
    const add = n => panel.append(n);
    const head = t => add(el("div", "aih", t));
    const para = (t, cls) => add(el("div", cls || "aip", t));
    const list = items => { const ul = el("ul"); items.forEach(t => ul.append(el("li", null, t))); add(ul); };
    const kv = (k, v, color) => { const x = el("div", "aikv"), b = el("b", null, v); if (color) b.style.color = color; x.append(el("span", "sub", k), b); add(x); };
    const infoBtn = fn => { const b = el("button", "aiinfo", "ⓘ"); b.setAttribute("aria-label", "Erklärung anzeigen"); b.onclick = () => { fn(); refresh(); }; return b; };
    if (!S.candles.length) { para("Keine Kursdaten geladen.", "sub"); return; }
    const d = S.data, cur = d.currency ? " " + d.currency : "";
    const r = Analysis.run(S.candles, S.cfg, { intraday: d.tf.sec < 86400, delayed: d.dataKind === "delayed" });
    if (r.error) { para(r.error, "err"); return; }
    let e;
    try { e = Entry.run(S.candles, r, d.year, d.issues || [], { currency: d.currency }); } catch (x) { e = { error: "Einstiegsmodul nicht verfügbar (" + x.message + ")" }; }

    // Zwei getrennte Bewertungen
    const grid = el("div", "aigrid");
    const a = el("div", "aicard"), ah = el("div", "aict");
    ah.append(el("span", null, "Technische Gesamtlage"), infoBtn(() => { infoScore = !infoScore; }));
    const lc = r.score == null ? GRAY : /bullish/.test(r.label) ? "#00c805" : /bearish/.test(r.label) ? "#ff3b30" : GRAY;
    const sc = el("div", "aiscore", r.score == null ? "–" : String(r.score)), sl = el("div", "aival", cap(r.label));
    sc.style.color = lc; sl.style.color = lc;
    a.append(ah, sc, el("div", "sub", "von 100"), sl);
    if (r.score != null) { const g = el("div", "aigauge"), m = el("i"); m.style.left = r.score + "%"; g.append(m); a.append(g); }
    const bc = el("div", "aicard"), bh = el("div", "aict");
    bh.append(el("span", null, "Einstiegseinschätzung"), infoBtn(() => { infoEntry = !infoEntry; }));
    const bv = el("div", "aival", e.error ? "nicht verfügbar" : e.label);
    bv.style.color = e.error ? GRAY : EC[e.id];
    bc.append(bh, bv);
    if (!e.error) { const rk = el("div", "sub", e.risk.text); rk.style.color = RC[e.risk.level]; bc.append(rk); }
    grid.append(a, bc);
    add(grid);
    if (infoScore) add(scoreInfo(r));
    if (infoEntry) add(entryInfo());

    // Auf einen Blick
    head("Auf einen Blick");
    kv("Trend", r.trend.dir);
    if (!e.error) {
      const y = e.f.y;
      if (y) {
        kv("Jahreshoch", fmt(y.high, dpf(y.high)) + cur);
        kv("Abstand zum Jahreshoch", fmt(y.distHigh, 2) + " %", y.distHigh < 3 ? "#ff9f0a" : null);
        kv("Jahrestief", fmt(y.low, dpf(y.low)) + cur);
        kv("Abstand zum Jahrestief", fmt(y.distLow, 2) + " %");
      } else kv("Jahreshoch und -tief", "nicht verfügbar", GRAY);
      if (e.f.rsi != null) kv("RSI 14", fmt(e.f.rsi, 1) + " – " + (e.f.rsi > 80 ? "stark überkauft" : e.f.rsi > 70 ? "überkauft" : e.f.rsi < 30 ? "überverkauft" : "normal"), e.f.rsi > 70 ? "#ff9f0a" : null);
      kv("Risiko", e.risk.text, RC[e.risk.level]);
    }

    // Begründung
    head("Begründung");
    if (e.why) para("Einstieg: " + e.why.join(" "));
    const used = r.comps.filter(c => c.s != null).length;
    para("Gesamtlage: Der Score ist die gewichtete Summe aus " + used + " von " + r.comps.length + " Kriterien (" + Math.round(r.coverage * 100) + " % der Gewichtung). Die stärksten Argumente für diese Richtung:");
    if (r.pro.length) list(r.pro); else para("Kein Kriterium zeigt deutlich in eine Richtung.", "sub");

    // Trend
    head("Aktuelle Trendrichtung");
    para(r.trend.dir + ". " + r.trend.text);
    if (r.trend.long) para(r.trend.long);

    // Kennzahlen
    if (!e.error) { head("Kennzahlen"); list(e.facts); }

    // Auswertung der Kriterien
    head("Auswertung der Kriterien");
    r.comps.forEach(c => {
      const x = el("div", "aicrit"), tag = el("span", "aitag", c.s == null ? "nicht gewertet" : lbl(c.s) + " (" + (c.s >= 0 ? "+" : "") + c.s.toFixed(2).replace(".", ",") + ")");
      tag.style.color = c.s == null ? "#777" : col(c.s);
      x.append(tag, el("b", null, c.name + " · " + c.weight + " %"), el("div", null, c.text));
      add(x);
    });
    if (r.atr) {
      const x = el("div", "aicrit"), p = prec(S.last);
      x.append(el("b", null, "ATR " + r.atr.period + " (nur Risiko, keine Wertung)"), el("div", null, "ATR = " + fmt(r.atr.value, p) + " (" + fmt(r.atr.pct, 2) + " % vom Kurs), 2×ATR = " + fmt(r.atr.stop, p) + " als möglicher Stop-Abstand."));
      add(x);
    }

    // Unterstützung und Widerstand
    head("Unterstützung und Widerstand");
    const p2 = prec(S.last);
    const zl = (z, k) => k + " bei " + fmt(z.level, p2) + " (" + z.touches + (z.touches > 1 ? " Berührungen" : " Berührung") + ", " + fmt(Math.abs(z.level - r.price) / r.price * 100, 1) + " % vom Kurs)";
    const zs = [...r.resist.slice().reverse().map(z => zl(z, "Widerstand")), ...r.support.map(z => zl(z, "Unterstützung"))];
    if (zs.length) list(zs); else para("Keine belastbare Zone erkannt.", "sub");
    if (r.breakout) para(r.breakout.text);

    // Risiken
    head("Risiken und Gegenargumente");
    const risks = [...r.risks, ...(e.cautions || [])];
    list(risks.length ? risks : ["Keine besonderen Gegenargumente erkannt."]);

    // Datenhinweise
    const notes = [];
    (d.issues || []).forEach(i => notes.push((i.level === "warn" ? "⚠ " : "ⓘ ") + i.text));
    if (d.yearError) notes.push("ⓘ Die 52-Wochen-Daten konnten nicht geladen werden (" + d.yearError + ").");
    r.notes.forEach(n => notes.push(n));
    if (notes.length) { head("Datenhinweise"); list(notes); }
    para("Regelbasierte technische Auswertung der angezeigten Kursdaten und der berechneten Indikatoren, keine echte KI und keine Prognose. Keine Anlageberatung. Die Bewertung gilt nur für Zeiteinheit „" + d.tf.label + "“ und Zeitraum „" + d.range.label + "“ (" + d.source + ").", "aidisc");
  }

  const baseDraw = draw;
  draw = function (keep) { baseDraw(keep); refresh(); };
  const baseLoad = load;
  load = async function () { await baseLoad(); refresh(); };
  refresh();
})();
