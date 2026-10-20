import { $ } from "../core/dom.js";
import { login, logout } from "../core/api.js";
import { on } from "../core/state.js";
import { navigate } from "./nav.js";

export function showLogin(msg = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-err").textContent = msg;
  setTimeout(() => $("#login-pw").focus(), 30);
}

async function onSubmit(e) {
  e.preventDefault();
  const btn = $("button", e.target);
  btn.disabled = true;
  $("#login-err").textContent = "";
  try {
    await login($("#login-pw").value);
    $("#login-pw").value = "";
    $("#login").hidden = true;
    navigate(location.pathname, false);
  } catch (err) {
    const card = $(".login-card");
    card.classList.remove("shake");
    void card.offsetWidth; // restart the animation
    card.classList.add("shake");
    $("#login-err").textContent = err.status === 403 ? "Too many attempts, try again later" : err.message;
  } finally {
    btn.disabled = false;
  }
}

export function initAuth() {
  $("#login-form").addEventListener("submit", onSubmit);
  $("#logout-btn").onclick = async () => {
    try { await logout(); } catch {}
    history.replaceState(null, "", "/");
    showLogin();
  };
  on("unauthorized", () => showLogin());
}
