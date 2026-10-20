import { $ } from "../core/dom.js";

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#theme-btn use").setAttribute("href", t === "light" ? "#i-moon" : "#i-sun");
}

export function initTheme() {
  applyTheme(localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  $("#theme-btn").onclick = () => {
    const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", t);
    applyTheme(t);
  };
}
