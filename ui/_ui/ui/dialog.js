import { $, esc } from "../core/dom.js";

// Resolves to the trimmed input (when `input` is given), true for a plain
// confirmation, or null when cancelled. `body` is HTML.
export function dialog({ title, body = "", input = null, ok = "OK", danger = false }) {
  const dlg = $("#dialog"), f = $("#dialog-form");
  f.innerHTML = `<h2>${esc(title)}</h2>${body ? `<p>${body}</p>` : ""}` +
    (input !== null ? `<input class="field" name="v" value="${esc(input)}" autocomplete="off" spellcheck="false">` : "") +
    `<div class="actions"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button>` +
    `<button class="btn primary${danger ? " danger" : ""}" value="ok">${esc(ok)}</button></div>`;
  dlg.returnValue = "";
  dlg.showModal();
  const inp = $("input", f);
  if (inp) {
    inp.focus();
    // Select the name without its extension.
    const dot = input.lastIndexOf(".");
    inp.setSelectionRange(0, dot > 0 ? dot : input.length);
  }
  return new Promise((res) => {
    dlg.addEventListener("close", () => {
      if (dlg.returnValue !== "ok") return res(null);
      res(inp ? inp.value.trim() : true);
    }, { once: true });
  });
}

export const isDialogOpen = () => $("#dialog").open;
