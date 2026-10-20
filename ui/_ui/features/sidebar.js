// The left sidebar that holds the tree: shown or hidden (remembered), resizable,
// and a slide-out drawer on narrow screens.
import { $ } from "../core/dom.js";
import { on } from "../core/state.js";
import { makeResizer } from "../ui/resizer.js";

const narrow = matchMedia("(max-width: 760px)");
const app = () => $("#app");

const isOpen = () => (narrow.matches ? app().classList.contains("drawer-open") : !app().classList.contains("sidebar-off"));

function setOpen(open) {
  if (narrow.matches) app().classList.toggle("drawer-open", open);
  else {
    app().classList.toggle("sidebar-off", !open);
    localStorage.setItem("sidebar", open ? "on" : "off");
  }
  $("#sidebar-btn").setAttribute("aria-expanded", isOpen());
}

export function initSidebar() {
  app().classList.toggle("sidebar-off", localStorage.getItem("sidebar") === "off");
  $("#sidebar-btn").setAttribute("aria-expanded", isOpen());
  $("#sidebar-btn").onclick = () => setOpen(!isOpen());
  $("#sidebar-scrim").onclick = () => setOpen(false);
  narrow.addEventListener("change", () => {
    app().classList.remove("drawer-open");
    $("#sidebar-btn").setAttribute("aria-expanded", isOpen());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && narrow.matches && isOpen()) setOpen(false);
  });
  // The drawer covers the page, so close it once a folder opens.
  on("dir", () => { if (narrow.matches) setOpen(false); });

  makeResizer($("#sidebar-resize"), { host: app(), cssVar: "--sidebar-w", key: "sidebar-w", min: 180, max: 480, def: 264 });
}
