(() => {
  const st = document.createElement("style");
  st.textContent = ".sbox{position:relative}.sbox input{padding-right:46px}#qclear{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;border-radius:50%;background:#333;color:#fff;font-size:16px;padding:0;line-height:34px}";
  document.head.append(st);
  const q = $("q"), box = el("div", "sbox"), x = el("button", null, "✕");
  x.id = "qclear"; x.hidden = true; x.setAttribute("aria-label", "Suche löschen");
  q.parentNode.insertBefore(box, q); box.append(q, x);
  const sync = () => { x.hidden = !q.value; };
  q.addEventListener("input", sync);
  x.onclick = () => { q.value = ""; sync(); q.dispatchEvent(new Event("input")); q.focus(); };
})();
