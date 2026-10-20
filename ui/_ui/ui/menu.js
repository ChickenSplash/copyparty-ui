import { $, esc, icon } from "../core/dom.js";

// items: { icon, label, run } or { icon, label, href, download }, optional
// `danger`, and "-" for a divider.
export function openMenu(anchor, items) {
  const m = $("#menu");
  m.innerHTML = "";
  for (const it of items) {
    if (it === "-") { m.append(document.createElement("hr")); continue; }
    const b = document.createElement(it.href ? "a" : "button");
    if (it.href) { b.href = it.href; if (it.download) b.download = ""; }
    b.className = it.danger ? "danger" : "";
    b.innerHTML = icon(it.icon) + `<span>${esc(it.label)}</span>`;
    b.onclick = (e) => { closeMenu(); if (it.run) { e.preventDefault(); it.run(); } };
    m.append(b);
  }
  m.hidden = false;
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.right - mw, y = r.bottom + 6;
  if (x < 8) x = 8;
  if (y + mh > innerHeight - 8) y = r.top - mh - 6;
  m.style.left = x + "px";
  m.style.top = y + "px";
  anchor.classList.add("open");
  m._anchor = anchor;
}

export function closeMenu() {
  const m = $("#menu");
  if (m.hidden) return;
  m.hidden = true;
  m._anchor?.classList.remove("open");
}

export const isMenuOpen = () => !$("#menu").hidden;

export function initMenu() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#menu") && !e.target.closest("[data-more]")) closeMenu();
  });
}
