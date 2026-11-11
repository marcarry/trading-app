(() => {
  // Lädt zusätzlich Tageskerzen der letzten 12 Monate für 52-Wochen-Hoch und -Tief.
  // Muss VOR datafix.js eingebunden werden.
  const baseLoad = Data.load;
  Data.load = async function (asset, tfId, rangeId) {
    const d = await baseLoad.call(Data, asset, tfId, rangeId);
    d.year = null; d.yearError = null;
    try {
      if (d.tf.id === "1d" && ["1Y", "5Y", "MAX"].includes(d.range.id)) d.year = { candles: d.candles };
      else {
        const y = await baseLoad.call(Data, asset, "1d", "1Y"), c = y.candles;
        if (asset.source === "yahoo" && c.slice(-30).some(k => k.v > 0)) while (c.length > 1 && !(c[c.length - 1].v > 0)) c.pop();
        d.year = { candles: c };
      }
    } catch (e) { d.yearError = e.message; }
    return d;
  };
})();
