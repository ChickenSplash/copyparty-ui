import { $ } from "../core/dom.js";
import { parentOf } from "../core/paths.js";
import { state, can, clearSelection } from "../core/state.js";
import { isDialogOpen } from "../ui/dialog.js";
import { closeMenu, isMenuOpen } from "../ui/menu.js";
import { isViewerOpen, closeViewer, stepViewer } from "./viewer.js";
import { clearSearch } from "./search.js";
import { selectAll, stepActive } from "./listing.js";
import { removeItems, openItem, setActive } from "./actions.js";
import { navigate } from "./nav.js";
import { isUsageOpen } from "./usage.js";

function onKey(e) {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) || isDialogOpen();
  if (isUsageOpen()) return; // it handles its own keys
  if (isViewerOpen()) {
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowLeft") stepViewer(-1);
    else if (e.key === "ArrowRight") stepViewer(1);
    return;
  }
  if (e.key === "Escape") {
    if (isMenuOpen()) return closeMenu();
    if (document.activeElement === $("#search")) { $("#search").blur(); return clearSearch(); }
    if (state.sel.size) return clearSelection();
    if (state.active && state.paneOpen) return setActive(null);
  }
  if (typing || $("#app").hidden) return;
  // Up/Down/Enter browse the listing through the preview pane, unless focus is
  // somewhere that uses those keys itself (the pane's media controls, buttons).
  const ae = document.activeElement;
  const onPage = ae === document.body || !!ae?.closest("#listing");
  if (state.paneOpen && onPage && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    return stepActive(e.key === "ArrowDown" ? 1 : -1);
  }
  if (e.key === "Enter" && state.paneOpen && state.active && onPage) {
    e.preventDefault();
    return openItem(state.active.it, state.active.siblings);
  }
  if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === "a") { e.preventDefault(); selectAll(); }
  else if (e.key === "Delete" && state.sel.size && can("delete")) removeItems([...state.sel]);
  else if (e.key === "Backspace" && state.cwd !== "/") navigate(parentOf(state.cwd));
}

export function initKeyboard() {
  document.addEventListener("keydown", onKey);
}
