const GROUPS = ["Trend", "Momentum", "Volatilität", "Volumen"];
const PARAMS = { period: ["Periode", 2, 500], mult: ["Abweichung (σ)", 0.5, 5], fast: ["Schnell", 2, 100], slow: ["Langsam", 3, 200], signal: ["Signal", 2, 100], avg: ["Ø-Periode", 2, 200] };
const COLORS = { line: "Farbe", signal: "Farbe Signallinie" };

function redraw() { if (S.candles.length) draw(true); }
function openSheet() { renderSheet(); $("sheet").hidden = false; }
function closeSheet() { $("sheet").hidden = true; }
$("sheetClose").onclick = closeSheet;
$("sheet").onclick = e => { if (e.target === $("sheet")) closeSheet(); };
$("reset").onclick = () => { S.cfg = defaultCfg(); saveCfg(); renderSheet(); redraw(); };

function renderSheet() {
  const box = $("sheetBody");
  box.replaceChildren();
  GROUPS.forEach(g => {
    box.append(el("div", "grp", g));
    ORDER.filter(id => IND[id].group === g).forEach(id => {
      const c = S.cfg[id], row = el("div", "irow"), head = el("div", "ihead");
      const sw = el("button", "sw" + (c.on ? " on" : ""));
      sw.setAttribute("aria-label", lab(id) + " ein- oder ausschalten");
      sw.onclick = () => { c.on = !c.on; saveCfg(); renderSheet(); redraw(); };
      const gear = el("button", "gear", S.openIn === id ? "▴" : "⚙");
      gear.onclick = () => { S.openIn = S.openIn === id ? null : id; renderSheet(); };
      head.append(sw, el("div", "iname", id === "vol" ? "Volumenbalken" : lab(id)), gear);
      row.append(head);
      if (S.openIn === id) {
        const set = el("div", "set");
        Object.keys(c.params).forEach(k => {
          const inp = el("input");
          inp.type = "number"; inp.step = "any"; inp.inputMode = "decimal"; inp.value = c.params[k];
          inp.onchange = () => {
            let v = parseFloat(String(inp.value).replace(",", "."));
            if (isNaN(v)) v = IND[id].params[k];
            v = Math.min(PARAMS[k][2], Math.max(PARAMS[k][1], v));
            if (k !== "mult") v = Math.round(v);
            c.params[k] = v;
            if (id === "macd" && c.params.fast >= c.params.slow) c.params.slow = c.params.fast + 1;
            saveCfg(); renderSheet(); redraw();
          };
          set.append(el("div", null, PARAMS[k][0]), inp);
        });
        Object.keys(c.colors).forEach(k => {
          if (id === "vol") return;
          const inp = el("input");
          inp.type = "color"; inp.value = c.colors[k];
          inp.oninput = () => { c.colors[k] = inp.value; saveCfg(); redraw(); };
          set.append(el("div", null, COLORS[k]), inp);
        });
        if (id !== "vol") {
          const sel = el("select");
          [1, 2, 3, 4].forEach(w => { const o = el("option", null, w + " px"); o.value = w; if (w === c.width) o.selected = true; sel.append(o); });
          sel.onchange = () => { c.width = +sel.value; saveCfg(); redraw(); };
          set.append(el("div", null, "Linienbreite"), sel);
        }
        if (id === "vol") set.append(el("div", "sub", "Keine Einstellungen. Der Durchschnitt hat einen eigenen Schalter."));
        row.append(set);
      }
      box.append(row);
    });
  });
}
