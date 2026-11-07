(() => {
  const st = document.createElement("style");
  st.textContent = ".aibtn{width:100%;margin:10px 0 0;padding:14px;border-radius:12px;border:1px solid #333;background:#111;color:#fff;font-size:16px}" +
    ".aipanel{background:#0d0d0d;border:1px solid #222;border-radius:12px;padding:14px;margin-top:8px}" +
    ".aitop{display:flex;align-items:baseline;gap:12px}.aiscore{font-size:44px;font-weight:700;line-height:1}.ailabel{font-size:18px;font-weight:600;text-transform:capitalize}" +
    ".aigauge{position:relative;height:8px;border-radius:4px;margin:14px 0 6px;background:linear-gradient(90deg,#ff3b30 0%,#555 50%,#00c805 100%)}" +
    ".aigauge i{position:absolute;top:-4px;width:4px;height:16px;border-radius:2px;background:#fff;transform:translateX(-50%)}" +
    ".aih{color:#888;font-size:12px;text-transform:uppercase;margin:16px 0 6px}.aip{font-size:14px;line-height:1.45;color:#ddd}" +
    ".aipanel ul{margin:6px 0;padding-left:18px;font-size:14px;line-height:1.45;color:#ddd}" +
    ".aicrit{padding:8px 0;border-bottom:1px solid #1c1c1c;font-size:13px;line-height:1.4;color:#bbb}.aicrit b{color:#fff;font-size:14px}.aitag{float:right;font-size:12px;font-weight:600}" +
    ".aidisc{margin-top:14px;font-size:12px;color:#777;line-height:1.4}";
  document.head.append(st);

  const btn = el("button", "aibtn"), panel = el("div", "aipanel");
  panel.hidden = true;
  let open = false;
  $("info").before(btn, panel);
  btn.onclick = () => { open = !open; refresh(); };

  const col = s => s > 0.2 ? "#00c805" : s < -0.2 ? "#ff3b30" : "#9a9a9a";
  const lbl = s => s > 0.2 ? "bullish" : s < -0.2 ? "bearish" : "neutral";
  const REC = { buy: ["Kaufsignal", "#00c805"], sell: ["Verkaufssignal", "#ff3b30"], wait: ["Abwarten", "#ffd60a"] };

  function refresh() {
    btn.textContent = "KI-Analyse " + (open ? "▴" : "▾");
    panel.hidden = !open;
    if (!open) return;
    panel.replaceChildren();
    const head = t => panel.append(el("div", "aih", t));
    const para = (t, cls) => panel.append(el("div", cls || "aip", t));
    const list = items => { const ul = el("ul"); items.forEach(t => ul.append(el("li", null, t))); panel.append(ul); };
    if (!S.candles.length) { para("Keine Kursdaten geladen.", "sub"); return; }
    const r = Analysis.run(S.candles, S.cfg, { intraday: S.data.tf.sec < 86400, delayed: S.data.dataKind === "delayed" });
    if (r.error) { para(r.error, "err"); return; }
    const p = prec(S.last);

    // 1 + 2: Score und Einordnung
    const top = el("div", "aitop"), big = el("div", "aiscore", r.score == null ? "–" : String(r.score)), lab = el("div", "ailabel", r.label);
    const c0 = r.score == null ? "#9a9a9a" : col((r.score - 50) / 50 * 5);
    big.style.color = c0; lab.style.color = c0;
    top.append(big, el("div", "sub", "von 100"), lab);
    panel.append(top);
    if (r.score != null) { const g = el("div", "aigauge"), m = el("i"); m.style.left = r.score + "%"; g.append(m); panel.append(g); }

    // 3: Trend
    head("Aktuelle Trendrichtung");
    para(r.trend.dir + ". " + r.trend.text);

    // 4: Einschätzung
    head("Einschätzung");
    const rc = REC[r.rec], rb = el("div", "ailabel", rc[0]);
    rb.style.color = rc[1]; panel.append(rb);
    para(r.recWhy);

    // 7: Begründung
    head("Begründung");
    const used = r.comps.filter(c => c.s != null).length;
    para("Der Score ist die gewichtete Summe aus " + used + " von " + r.comps.length + " Kriterien (" + Math.round(r.coverage * 100) + " % der Gewichtung). Die stärksten Argumente für diese Richtung:");
    if (r.pro.length) list(r.pro); else para("Kein Kriterium zeigt deutlich in eine Richtung.", "sub");

    // 5: Auswertung der Kriterien
    head("Auswertung der Kriterien");
    r.comps.forEach(c => {
      const row = el("div", "aicrit"), tag = el("span", "aitag", c.s == null ? "nicht gewertet" : lbl(c.s) + " (" + (c.s >= 0 ? "+" : "") + c.s.toFixed(2).replace(".", ",") + ")");
      tag.style.color = c.s == null ? "#777" : col(c.s);
      row.append(tag, el("b", null, c.name + " · " + c.weight + " %"), el("div", null, c.text));
      panel.append(row);
    });
    if (r.atr) {
      const row = el("div", "aicrit");
      row.append(el("b", null, "ATR " + r.atr.period + " (nur Risiko, keine Wertung)"), el("div", null, "ATR = " + fmt(r.atr.value, p) + " (" + fmt(r.atr.pct, 2) + " % vom Kurs), 2×ATR = " + fmt(r.atr.stop, p) + " als möglicher Stop-Abstand."));
      panel.append(row);
    }

    // 6: Preiszonen
    head("Unterstützung und Widerstand");
    const zl = (z, k) => k + " bei " + fmt(z.level, p) + " (" + z.touches + (z.touches > 1 ? " Berührungen" : " Berührung") + ", " + fmt(Math.abs(z.level - r.price) / r.price * 100, 1) + " % vom Kurs)";
    const zs = [...r.resist.slice().reverse().map(z => zl(z, "Widerstand")), ...r.support.map(z => zl(z, "Unterstützung"))];
    if (zs.length) list(zs); else para("Keine belastbare Zone erkannt.", "sub");
    if (r.breakout) para(r.breakout.text);

    // 8: Risiken
    head("Risiken und Gegenargumente");
    list(r.risks.length ? r.risks : ["Keine besonderen Gegenargumente erkannt."]);

    // Hinweise
    if (r.notes.length) { head("Hinweise"); list(r.notes); }
    para("Regelbasierte technische Auswertung der angezeigten Kursdaten und der berechneten Indikatoren, keine echte KI und keine Prognose. Keine Anlageberatung. Die Bewertung gilt nur für Zeiteinheit „" + S.data.tf.label + "“ und Zeitraum „" + S.data.range.label + "“ (" + S.data.source + ").", "aidisc");
  }

  const baseDraw = draw;
  draw = function (keep) { baseDraw(keep); refresh(); };
  const baseLoad = load;
  load = async function () { await baseLoad(); refresh(); };
  refresh();
})();
