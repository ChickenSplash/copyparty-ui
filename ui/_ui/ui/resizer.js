// A drag handle that resizes a side panel. The width lives in a CSS variable on
// `host` and is remembered in localStorage under `key`.
//   side: "left" for a panel on the left (dragging right grows it), "right" for one on the right
//   Arrow keys nudge it, double-click or Home resets it.
export function makeResizer(handle, { host, cssVar, key, side = "left", min = 180, max = 480, def = 264 }) {
  const clamp = (w) => Math.round(Math.min(max, Math.max(min, w)));
  const set = (w) => {
    w = clamp(w);
    host.style.setProperty(cssVar, w + "px");
    handle.setAttribute("aria-valuenow", w);
    return w;
  };
  let width = set(+localStorage.getItem(key) || def);
  const save = () => localStorage.setItem(key, width);

  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-valuemin", min);
  handle.setAttribute("aria-valuemax", max);
  handle.tabIndex = 0;

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, w0 = width, dir = side === "left" ? 1 : -1;
    handle.setPointerCapture(e.pointerId);
    document.documentElement.classList.add("resizing");
    const move = (ev) => (width = set(w0 + (ev.clientX - x0) * dir));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      document.documentElement.classList.remove("resizing");
      save();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  });

  handle.addEventListener("dblclick", () => { width = set(def); save(); });
  handle.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -16, ArrowRight: 16 }[e.key];
    if (step) width = set(width + step * (side === "left" ? 1 : -1));
    else if (e.key === "Home") width = set(def);
    else return;
    e.preventDefault();
    e.stopPropagation();
    save();
  });
}
