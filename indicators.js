const Ind = (() => {
  const nulls = n => new Array(n).fill(null);

  function sma(v, p) {
    const out = nulls(v.length); let sum = 0, cnt = 0;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) { sum = 0; cnt = 0; continue; }
      sum += v[i]; cnt++;
      if (cnt > p) sum -= v[i - p];
      if (cnt >= p) out[i] = sum / p;
    }
    return out;
  }

  // EMA, Startwert = SMA der ersten p Werte (wie bei TradingView)
  function ema(v, p) {
    const out = nulls(v.length), a = 2 / (p + 1);
    let start = v.findIndex(x => x != null);
    if (start < 0 || v.length - start < p) return out;
    let sum = 0;
    for (let i = start; i < start + p; i++) sum += v[i];
    let prev = sum / p; out[start + p - 1] = prev;
    for (let i = start + p; i < v.length; i++) { prev = v[i] * a + prev * (1 - a); out[i] = prev; }
    return out;
  }

  // Glättung nach Wilder (RMA), Startwert = SMA der ersten p Werte
  function rma(v, p, from) {
    const out = nulls(v.length);
    if (v.length - from < p) return out;
    let sum = 0;
    for (let i = from; i < from + p; i++) sum += v[i];
    let prev = sum / p; out[from + p - 1] = prev;
    for (let i = from + p; i < v.length; i++) { prev = (prev * (p - 1) + v[i]) / p; out[i] = prev; }
    return out;
  }

  function bollinger(c, p, mult) {
    const mid = sma(c, p), up = nulls(c.length), low = nulls(c.length);
    for (let i = p - 1; i < c.length; i++) {
      let s = 0;
      for (let j = i - p + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / p); // Standardabweichung der Grundgesamtheit
      up[i] = mid[i] + mult * sd; low[i] = mid[i] - mult * sd;
    }
    return { mid, up, low };
  }

  function rsi(c, p) {
    const n = c.length, gain = nulls(n), loss = nulls(n), out = nulls(n);
    for (let i = 1; i < n; i++) { const d = c[i] - c[i - 1]; gain[i] = Math.max(d, 0); loss[i] = Math.max(-d, 0); }
    const ag = rma(gain, p, 1), al = rma(loss, p, 1);
    for (let i = 0; i < n; i++) if (ag[i] != null) out[i] = al[i] === 0 ? (ag[i] === 0 ? 50 : 100) : 100 - 100 / (1 + ag[i] / al[i]);
    return out;
  }

  function macd(c, f, s, g) {
    const ef = ema(c, f), es = ema(c, s), n = c.length;
    const line = nulls(n);
    for (let i = 0; i < n; i++) if (ef[i] != null && es[i] != null) line[i] = ef[i] - es[i];
    const signal = ema(line, g), hist = nulls(n);
    for (let i = 0; i < n; i++) if (line[i] != null && signal[i] != null) hist[i] = line[i] - signal[i];
    return { line, signal, hist };
  }

  function atr(k, p) {
    const tr = k.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - k[i - 1].c), Math.abs(x.l - k[i - 1].c)));
    return rma(tr, p, 0);
  }

  // VWAP: bei Intraday-Daten pro Handelstag neu (UTC-Tag), bei Tages-Kerzen und größer ab dem ersten Wert
  function vwap(k, intraday) {
    const out = nulls(k.length); let pv = 0, vol = 0, day = null;
    for (let i = 0; i < k.length; i++) {
      const d = Math.floor(k[i].t / 86400);
      if (intraday && d !== day) { pv = 0; vol = 0; }
      day = d;
      pv += (k[i].h + k[i].l + k[i].c) / 3 * k[i].v; vol += k[i].v;
      if (vol > 0) out[i] = pv / vol;
    }
    return out;
  }

  const volMa = (k, p) => sma(k.map(x => x.v), p);

  return { sma, ema, rma, bollinger, rsi, macd, atr, vwap, volMa };
})();
