
(() => {
  const st = document.createElement("style");
  st.textContent =
    ".aibtn{width:100%;margin:10px 0 0;padding:14px;border-radius:12px;border:1px solid #333;background:#111;color:#fff;font-size:16px}" +
    ".aipanel{background:#0d0d0d;border:1px solid #222;border-radius:12px;padding:14px;margin-top:8px}" +
    ".aitop{display:flex;align-items:baseline;gap:12px}.aiscore{font-size:44px;font-weight:700;line-height:1}.ailabel{font-size:18px;font-weight:600}" +
    ".aigauge{position:relative;height:8px;border-radius:4px;margin:14px 0 6px;background:linear-gradient(90deg,#ff3b30 0%,#555 50%,#00c805 100%)}" +
    ".aigauge i{position:absolute;top:-4px;width:4px;height:16px;border-radius:2px;background:#fff;transform:translateX(-50%)}" +
    ".aih{color:#888;font-size:12px;text-transform:uppercase;margin:16px 0 6px}.aip{font-size:14px;line-height:1.45;color:#ddd}" +
    ".aipanel ul{margin:6px 0;padding-left:18px;font-size:14px;line-height:1.45;color:#ddd}" +
    ".aicrit{padding:8px 0;border-bottom:1px solid #1c1c1c;font-size:13px;line-height:1.4;color:#bbb}.aicrit b{color:#fff;font-size:14px}.aitag{float:right;font-size:12px;font-weight:600}" +
    ".aidisc{margin-top:14px;font-size:12px;color:#777;line-height:1.4}" +
    ".aisection{border-top:1px solid #292929;margin-top:18px;padding-top:4px}" +
    ".aistatus{font-size:19px;font-weight:700;margin:3px 0 8px}.aiwarn{color:#ffb020}.aigood{color:#00c805}.aibad{color:#ff6b6b}" +
    ".aifact{padding:7px 0;border-bottom:1px solid #1c1c1c;font-size:13px;line-height:1.4;color:#ccc}";
  document.head.append(st);

  const btn = el("button", "aibtn");
  const panel = el("div", "aipanel");
  panel.hidden = true;
  let open = false;
  $("info").before(btn, panel);
  btn.onclick = () => { open = !open; refresh(); };

  const col = s => s > 0.2 ? "#00c805" : s < -0.2 ? "#ff3b30" : "#9a9a9a";
  const lbl = s => s > 0.2 ? "bullish" : s < -0.2 ? "bearish" : "neutral";
  const REC = {
    buy: ["Kaufsignal", "#00c805"],
    sell: ["Verkaufssignal", "#ff3b30"],
    wait: ["Abwarten", "#ffd60a"]
  };

  const ENTRY_COLORS = {
    "Guter Einstieg": "#00c805",
    "Einstieg abwarten": "#ffd60a",
    "Rücksetzer abwarten": "#ffb020",
    "Ausbruch abwarten": "#ffb020",
    "Kein attraktiver Einstieg": "#ff6b6b"
  };

  function appendList(parent, items) {
    if (!Array.isArray(items) || !items.length) return;
    const ul = el("ul");
    items.forEach(item => ul.append(el("li", null,
      typeof item === "string" ? item : JSON.stringify(item))));
    parent.append(ul);
  }

  function appendFacts(parent, items) {
    if (!Array.isArray(items) || !items.length) return;
    items.forEach(item => {
      parent.append(el("div", "aifact",
        typeof item === "string" ? item : JSON.stringify(item)));
    });
  }

  function getIssues() {
    return S.data && Array.isArray(S.data.issues) ? S.data.issues : [];
  }

  function refresh() {
    btn.textContent = "Technische Analyse " + (open ? "▴" : "▾");
    panel.hidden = !open;
    if (!open) return;

    panel.replaceChildren();
    const head = (parent, text) =>
      parent.append(el("div", "aih", text));
    const para = (parent, text, cls) =>
      parent.append(el("div", cls || "aip", text));

    if (!S.candles.length || !S.data) {
      para(panel, "Keine Kursdaten geladen.", "sub");
      return;
    }

    const r = Analysis.run(S.candles, S.cfg, {
      intraday: S.data.tf.sec < 86400,
      delayed: S.data.dataKind === "delayed"
    });

    if (r.error) {
      para(panel, r.error, "err");
      return;
    }

    const p = prec(S.last);
    const issues = getIssues();

    // 1. Technische Gesamtbewertung
    head(panel, "Technische Gesamtbewertung");

    const top = el("div", "aitop");
    const big = el("div", "aiscore",
      r.score == null ? "–" : String(r.score));
    const scoreColor = r.score == null
      ? "#9a9a9a" : col((r.score - 50) / 50 * 5);

    big.style.color = scoreColor;

    const scoreLabel = el("div", "ailabel",
      r.label || "Keine Bewertung");
    scoreLabel.style.color = scoreColor;

    top.append(big, el("div", "sub", "von 100"), scoreLabel);
    panel.append(top);

    if (r.score != null) {
      const gauge = el("div", "aigauge");
      const marker = el("i");
      marker.style.left = Math.max(0, Math.min(100, r.score)) + "%";
      gauge.append(marker);
      panel.append(gauge);
    }

    head(panel, "Aktuelle Trendrichtung");
    para(panel, r.trend.dir + ". " + r.trend.text);

    head(panel, "Technische Einschätzung");
    const rec = REC[r.rec] || REC.wait;
    const recLabel = el("div", "ailabel", rec[0]);
    recLabel.style.color = rec[1];
    panel.append(recLabel);
    para(panel, r.recWhy || "Keine weitere Begründung verfügbar.");

    head(panel, "Begründung");
    const used = r.comps.filter(c => c.s != null).length;

    para(panel, "Der Score ist die gewichtete Summe aus " +
      used + " von " + r.comps.length + " Kriterien (" +
      Math.round(r.coverage * 100) +
      " % der Gewichtung). Die stärksten Argumente für diese Richtung:");

    if (r.pro.length) appendList(panel, r.pro);
    else para(panel, "Kein Kriterium zeigt deutlich in eine Richtung.", "sub");

    head(panel, "Auswertung der Kriterien");

    r.comps.forEach(c => {
      const row = el("div", "aicrit");
      const tag = el("span", "aitag",
        c.s == null ? "nicht gewertet" :
        lbl(c.s) + " (" + (c.s >= 0 ? "+" : "") +
        c.s.toFixed(2).replace(".", ",") + ")");

      tag.style.color = c.s == null ? "#777" : col(c.s);
      row.append(tag,
        el("b", null, c.name + " · " + c.weight + " %"),
        el("div", null, c.text));
      panel.append(row);
    });

    // 2. Separate Einstiegsbewertung
    const entrySection = el("div", "aisection");
    panel.append(entrySection);
    head(entrySection, "Einstiegsbewertung");

    if (typeof Entry === "undefined" ||
        typeof Entry.run !== "function") {
      para(entrySection,
        "Entry.js wurde nicht geladen oder stellt Entry.run() nicht bereit.",
        "err");
    } else {
      let entry = null;

      try {
        entry = Entry.run(
          S.candles,
          r,
          S.data.year || null,
          issues,
          {
            price: S.last,
            timeframe: S.data.tf.id,
            range: S.data.range.id,
            source: S.data.source
          }
        );
      } catch (e) {
        para(entrySection,
          "Fehler bei der Einstiegsbewertung: " + e.message,
          "err");
      }

      if (entry) {
        let entryLabel = entry.label || "Keine Einstufung";
        let entryWhy = entry.why || "Keine Begründung verfügbar.";

        const hasWarning = issues.some(
          x => x && x.level === "warn"
        );

        if (hasWarning && entryLabel === "Guter Einstieg") {
          entryLabel = "Einstieg abwarten";
          entryWhy = "Ein positives Einstiegssignal wird wegen " +
            "einer Datenqualitätswarnung unterdrückt. " + entryWhy;
        }

        const status = el("div", "aistatus", entryLabel);
        status.style.color = ENTRY_COLORS[entryLabel] || "#ddd";
        entrySection.append(status);
        para(entrySection, entryWhy);

        if (entry.facts && entry.facts.length) {
          head(entrySection, "Wichtige Faktoren");
          appendFacts(entrySection, entry.facts);
        }

        if (entry.risk) {
          head(entrySection, "Einschätzung des Risikos");
          para(entrySection, typeof entry.risk === "string"
            ? entry.risk : JSON.stringify(entry.risk));
        }

        if (entry.cautions && entry.cautions.length) {
          head(entrySection,
            "Was dagegen spricht / worauf du achten solltest");
          appendList(entrySection, entry.cautions);
        }
      }
    }

    // 3. Risikoanalyse
    const riskSection = el("div", "aisection");
    panel.append(riskSection);
    head(riskSection, "Risikoanalyse");

    if (r.atr) {
      para(riskSection, "ATR " + r.atr.period + " = " +
        fmt(r.atr.value, p) + " (" + fmt(r.atr.pct, 2) +
        " % vom Kurs). 2×ATR = " + fmt(r.atr.stop, p) +
        " als möglicher Stop-Abstand.");
    } else {
      para(riskSection,
        "Für diese Auswahl liegt kein ausreichend belastbarer ATR-Wert vor.",
        "sub");
    }

    head(riskSection, "Unterstützung und Widerstand");

    const zoneLabel = (z, name) =>
      name + " bei " + fmt(z.level, p) + " (" +
      z.touches + (z.touches > 1 ? " Berührungen" : " Berührung") +
      ", " + fmt(Math.abs(z.level - r.price) / r.price * 100, 1) +
      " % vom Kurs)";

    const zones = [
      ...r.resist.slice().reverse().map(z => zoneLabel(z, "Widerstand")),
      ...r.support.map(z => zoneLabel(z, "Unterstützung"))
    ];

    if (zones.length) appendList(riskSection, zones);
    else para(riskSection, "Keine belastbare Zone erkannt.", "sub");

    if (r.breakout) para(riskSection, r.breakout.text);

    head(riskSection, "Risiken und Gegenargumente");
    appendList(riskSection,
      r.risks.length ? r.risks :
      ["Keine besonderen Gegenargumente erkannt."]);

    if (issues.length) {
      head(riskSection, "Datenqualität");
      appendList(riskSection, issues.map(x =>
        typeof x === "string" ? x :
        (x.message || x.text || JSON.stringify(x))));
    }

    if (r.notes && r.notes.length) {
      head(riskSection, "Weitere Hinweise");
      appendList(riskSection, r.notes);
    }

    para(panel,
      "Regelbasierte technische Auswertung der angezeigten Kursdaten " +
      "und berechneten Indikatoren. Keine KI-Prognose und keine " +
      "Anlageberatung. Die Bewertung gilt für Zeiteinheit „" +
      S.data.tf.label + "“ und Zeitraum „" +
      S.data.range.label + "“ (" + S.data.source + ").",
      "aidisc"
    );
  }

  const baseDraw = draw;
  draw = function (keep) {
    baseDraw(keep);
    refresh();
  };

  const baseLoad = load;
  load = async function () {
    await baseLoad();
    refresh();
  };

  refresh();
})();
