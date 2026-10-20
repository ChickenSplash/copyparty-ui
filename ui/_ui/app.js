"use strict";

// A minimal frontend for copyparty. The UI owns "/", copyparty is reverse-proxied
// at API (started with `rp-loc: /api`), and every folder URL here maps 1:1 to
// API + the same path.
const API = "/api";

const IMG = new Set("jpg jpeg png gif webp avif bmp heic heif tif tiff jxl svg".split(" "));
const VID = new Set("mp4 m4v mkv webm mov avi wmv flv mpg mpeg ts 3gp".split(" "));
const AUD = new Set("mp3 flac ogg opus m4a aac wav wma alac aiff".split(" "));
const CODE = new Set("js mjs ts tsx jsx py rs go c h cpp hpp cs java kt rb php sh fish bash zsh lua json yaml yml toml ini conf cfg xml html css scss sql dockerfile makefile".split(" "));
const TEXT = new Set("txt md markdown log csv tsv nfo srt vtt env gitignore".split(" "));
const ARCH = new Set("zip tar gz tgz xz bz2 7z rar zst iso dmg deb rpm".split(" "));
const THUMB = new Set([...IMG, ...VID].filter((e) => e !== "svg"));

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  cwd: "/",
  dirs: [],
  files: [],
  perms: [],
  acct: "*",
  view: localStorage.getItem("view") || "list",
  sort: JSON.parse(localStorage.getItem("sort") || '{"key":"name","dir":1}'),
  sel: new Set(),
  query: "",
  hits: null,
  loadSeq: 0,
};

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function dec(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function encSeg(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + " " + u[i];
}

const dtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
function fmtDate(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return "Today, " + dtTime.format(d);
  if (days === 1) return "Yesterday, " + dtTime.format(d);
  return dtDay.format(d);
}

function fmtDur(s) {
  if (!isFinite(s) || s < 0) return "";
  if (s < 60) return Math.ceil(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.round((s % 3600) / 60) + "m";
}

function kindOf(name, isDir) {
  if (isDir) return "dir";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : name.toLowerCase();
  if (IMG.has(ext)) return "image";
  if (VID.has(ext)) return "video";
  if (AUD.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (CODE.has(ext)) return "code";
  if (TEXT.has(ext)) return "text";
  if (ARCH.has(ext)) return "archive";
  return "file";
}

const ICON = { dir: "folder", image: "image", video: "video", audio: "audio", pdf: "pdf", code: "code", text: "text", archive: "archive", file: "file" };
const icon = (id, cls = "i") => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;

function can(p) { return state.perms.includes(p); }

function parentOf(path) {
  const p = path.replace(/\/$/, "");
  return p.slice(0, p.lastIndexOf("/") + 1) || "/";
}

async function api(path, opts = {}) {
  const r = await fetch(API + path, { credentials: "same-origin", ...opts });
  if (!r.ok) {
    let msg = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const err = new Error(msg.slice(0, 200) || r.statusText);
    err.status = r.status;
    throw err;
  }
  return r;
}

function form(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

/* ---------- toasts, dialogs, menus ---------- */

function toast(msg, kind = "ok", ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = icon(kind === "err" ? "x" : "check") + `<span>${esc(msg)}</span>`;
  $("#toasts").append(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 250); }, ms);
}

function dialog({ title, body = "", input = null, ok = "OK", danger = false }) {
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

function openMenu(anchor, items) {
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

function closeMenu() {
  const m = $("#menu");
  if (m.hidden) return;
  m.hidden = true;
  m._anchor?.classList.remove("open");
}

/* ---------- auth ---------- */

function showLogin(msg = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-err").textContent = msg;
  setTimeout(() => $("#login-pw").focus(), 30);
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#login-pw").value;
  const btn = $("button", e.target);
  btn.disabled = true;
  $("#login-err").textContent = "";
  try {
    await api("/", { method: "POST", body: form({ act: "login", cppwd: pw }) });
    const d = await (await api("/?ls")).json();
    if (d.acct === "*") throw new Error("Wrong password");
    $("#login-pw").value = "";
    $("#login").hidden = true;
    navigate(location.pathname, false);
  } catch (err) {
    const card = $(".login-card");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    $("#login-err").textContent = err.status === 403 ? "Too many attempts, try again later" : err.message;
  } finally {
    btn.disabled = false;
  }
});

$("#logout-btn").onclick = async () => {
  try { await api("/", { method: "POST", body: form({ act: "logout" }) }); } catch {}
  history.replaceState(null, "", "/");
  showLogin();
};

/* ---------- loading ---------- */

async function navigate(path, push = true) {
  if (!path.endsWith("/")) path += "/";
  if (push && path !== state.cwd) history.pushState(null, "", path);
  state.cwd = path;
  state.sel.clear();
  clearSearch(false);
  await load();
}

async function load() {
  const seq = ++state.loadSeq;
  const listing = $("#listing");
  if (!listing.children.length) listing.innerHTML = skeleton();
  let d;
  try {
    d = await (await api(state.cwd + "?ls")).json();
  } catch (err) {
    if (seq !== state.loadSeq) return;
    if (err.status === 403 || err.status === 401) return showLogin();
    $("#app").hidden = false;
    renderCrumbs();
    listing.innerHTML = emptyState("Can't open this folder", err.status === 404 ? "It may have been moved or deleted." : err.message);
    return;
  }
  if (seq !== state.loadSeq) return;
  if (d.acct === "*" && !d.perms.length) return showLogin();

  state.dirs = d.dirs.map((x) => ({ href: x.href, name: dec(x.href.replace(/\/$/, "")), sz: x.sz, ts: x.ts, dir: true, n: x.tags?.[".files"] }));
  state.files = d.files.map((x) => ({ href: x.href, name: dec(x.href), sz: x.sz, ts: x.ts, dir: false }));
  state.perms = d.perms;
  state.acct = d.acct;

  const m = /([\d.]+ \S+) free of ([\d.]+ \S+)/.exec(d.srvinf || "");
  $("#storage").textContent = m ? `${m[1]} free` : "";
  if (m) $("#storage").title = `${m[1]} free of ${m[2]}`;
  const name = (d.srvinf || "").split("<")[0].trim();
  if (name) $("#brand-name").textContent = name;

  $("#app").hidden = false;
  $$("[data-perm]").forEach((el) => (el.hidden = !can(el.dataset.perm)));
  renderCrumbs();
  render();
}

function skeleton() {
  return `<div class="table skeleton"><div class="row head"><span></span><span>Name</span></div>` +
    Array.from({ length: 6 }, () => `<div class="row"><span></span><span class="name"></span></div>`).join("") + `</div>`;
}

function emptyState(title, text, ic = "empty") {
  return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

/* ---------- rendering ---------- */

function renderCrumbs() {
  const parts = state.cwd.split("/").filter(Boolean);
  let acc = "/";
  let html = `<a href="/" data-nav="/" data-drop="/">Home</a>`;
  for (const p of parts) {
    acc += p + "/";
    html += `<span class="sep">/</span><a href="${esc(acc)}" data-nav="${esc(acc)}" data-drop="${esc(acc)}">${esc(dec(p))}</a>`;
  }
  $("#crumbs").innerHTML = html;
  $("#drop-dest").textContent = parts.length ? dec(parts[parts.length - 1]) : "Home";
  document.title = (parts.length ? dec(parts[parts.length - 1]) + " · " : "") + ($("#brand-name").textContent || "Files");
}

function sorted() {
  const { key, dir } = state.sort;
  const cmp = (a, b) => {
    let r = 0;
    if (key === "size") r = a.sz - b.sz;
    else if (key === "date") r = a.ts - b.ts;
    if (!r) r = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return r * dir;
  };
  return [...state.dirs.sort(cmp), ...state.files.sort(cmp)];
}

function items() {
  return state.hits || sorted();
}

function itemPath(it) {
  return it.path || state.cwd + it.href;
}

function thumbUrl(it) {
  return API + itemPath(it) + "?th=w";
}

function render() {
  const list = items();
  const el = $("#listing");
  $$(".seg-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));

  if (!list.length) {
    el.innerHTML = state.hits
      ? emptyState("No results", `Nothing matches “${state.query}”.`, "search")
      : emptyState("This folder is empty", can("write") ? "Drop files anywhere, or use Upload." : "Nothing here yet.");
    updateSel();
    return;
  }

  const head = state.hits ? `<p class="section-label">${list.length}${state.hitsTrunc ? "+" : ""} result${list.length === 1 ? "" : "s"}</p>` : "";

  if (state.view === "grid") {
    el.innerHTML = head + `<div class="grid">` + list.map((it, i) => {
      const k = kindOf(it.name, it.dir);
      const th = icon(ICON[k]) + (!it.dir && THUMB.has(it.name.split(".").pop().toLowerCase())
        ? `<img loading="lazy" src="${esc(thumbUrl(it))}" alt="" data-thumb>`
        : "");
      const sub = it.dir ? (it.n != null ? `${it.n} item${it.n === 1 ? "" : "s"}` : "Folder") : fmtSize(it.sz);
      return `<div class="tile ${k === "dir" ? "dir" : ""}" data-i="${i}" ${it.dir ? `data-drop="${esc(itemPath(it))}"` : ""}>
        <div class="thumb">${th}</div>
        <div class="meta"><b title="${esc(it.name)}">${esc(it.name)}</b><small>${esc(sub)}${it.path ? " · " + esc(dec(parentOf(it.path))) : ""}</small></div>
        <span class="check" data-check>${icon("check")}</span>
        <button class="icon-btn sm more" data-more title="More">${icon("dots")}</button>
      </div>`;
    }).join("") + `</div>`;
  } else {
    const { key, dir } = state.sort;
    const sh = (k, label, cls = "") =>
      `<span class="${cls}"><button data-sort="${k}" class="${key === k && dir === 1 ? "asc" : ""}">${label}${key === k ? icon("chev-down") : ""}</button></span>`;
    el.innerHTML = head + `<div class="table"><div class="row head"><span></span>${sh("name", "Name")}${sh("size", "Size", "num")}${sh("date", "Modified", "date")}<span></span></div>` +
      list.map((it, i) => {
        const k = kindOf(it.name, it.dir);
        const ext = it.name.split(".").pop().toLowerCase();
        const th = !it.dir && IMG.has(ext) && THUMB.has(ext) ? `<img loading="lazy" src="${esc(thumbUrl(it))}" alt="" data-thumb>` : "";
        return `<div class="row" data-i="${i}" ${it.dir ? `data-drop="${esc(itemPath(it))}"` : ""}>
          <span class="check" data-check>${icon("check")}</span>
          <a class="name" href="${esc(it.dir ? itemPath(it) : API + itemPath(it))}" data-open>
            <span class="ficon ${k}">${icon(ICON[k])}${th}</span>
            <span title="${esc(it.name)}">${esc(it.name)}${it.path ? `<br><small class="path-hint">${esc(dec(parentOf(it.path)))}</small>` : ""}</span>
          </a>
          <span class="num">${it.dir ? (it.n != null ? `${it.n} item${it.n === 1 ? "" : "s"}` : "") : fmtSize(it.sz)}</span>
          <span class="date">${fmtDate(it.ts)}</span>
          <button class="icon-btn sm more" data-more title="More">${icon("dots")}</button>
        </div>`;
      }).join("") + `</div>`;
  }
  updateSel();
}

// Thumbnails sit over the file-type icon; drop any that fail so the icon shows.
// (A listener rather than inline onerror, so the CSP can forbid inline script.)
document.addEventListener("error", (e) => {
  if (e.target.matches?.("img[data-thumb]")) e.target.remove();
}, true);

function updateSel() {
  const list = items();
  $$("#listing [data-i]").forEach((el) => el.classList.toggle("sel", state.sel.has(itemPath(list[+el.dataset.i]))));
  $("#listing").classList.toggle("has-sel", state.sel.size > 0);
  $("#selbar").hidden = !state.sel.size;
  $("#sel-count").textContent = `${state.sel.size} selected`;
}

/* ---------- listing interactions ---------- */

$("#listing").addEventListener("click", (e) => {
  if (e.target.closest("[data-sort]")) {
    const k = e.target.closest("[data-sort]").dataset.sort;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
    localStorage.setItem("sort", JSON.stringify(state.sort));
    return render();
  }
  const el = e.target.closest("[data-i]");
  if (!el) return;
  const it = items()[+el.dataset.i];
  const path = itemPath(it);

  if (e.target.closest("[data-more]")) {
    e.preventDefault();
    e.stopPropagation();
    return openMenu(e.target.closest("[data-more]"), itemMenu(it));
  }
  if (e.target.closest("[data-check]") || e.ctrlKey || e.metaKey || e.shiftKey || (state.sel.size && !e.target.closest("[data-open]"))) {
    e.preventDefault();
    if (e.shiftKey && state.lastSel != null) {
      const [a, b] = [state.lastSel, +el.dataset.i].sort((x, y) => x - y);
      items().slice(a, b + 1).forEach((x) => state.sel.add(itemPath(x)));
    } else {
      state.sel.has(path) ? state.sel.delete(path) : state.sel.add(path);
    }
    state.lastSel = +el.dataset.i;
    return updateSel();
  }
  e.preventDefault();
  open(it);
});

function open(it) {
  if (it.dir) return navigate(itemPath(it));
  viewer.open(it);
}

function itemMenu(it) {
  const path = itemPath(it);
  const m = [];
  if (!it.dir) m.push({ icon: "eye", label: "Preview", run: () => viewer.open(it) });
  else m.push({ icon: "folder", label: "Open", run: () => navigate(path) });
  if (it.path) m.push({ icon: "folder", label: "Show in folder", run: () => navigate(parentOf(path)) });
  m.push({ icon: "download", label: it.dir ? "Download as zip" : "Download", href: API + path + (it.dir ? "?zip=crc" : "?dl"), download: true });
  m.push({ icon: "link", label: "Copy link", run: () => copyLink(path, it.dir) });
  if (can("move")) m.push("-", { icon: "pencil", label: "Rename", run: () => rename(it) });
  if (can("delete")) m.push({ icon: "trash", label: "Delete", danger: true, run: () => remove([path]) });
  return m;
}

async function copyLink(path, isDir) {
  const url = location.origin + (isDir ? path : API + path);
  try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url, "ok", 6000); }
}

async function rename(it) {
  const path = itemPath(it);
  const name = await dialog({ title: "Rename", input: it.name, ok: "Rename" });
  if (!name || name === it.name) return;
  if (name.includes("/")) return toast("Names can't contain /", "err");
  const dst = parentOf(path) + encSeg(name) + (it.dir ? "/" : "");
  try {
    await api(path.replace(/\/$/, "") + "?move=" + API + dst.replace(/\/$/, ""), { method: "POST" });
    toast("Renamed");
    refresh();
  } catch (err) {
    toast(err.message, "err", 5000);
  }
}

async function remove(paths) {
  const names = paths.map((p) => dec(p.replace(/\/$/, "").split("/").pop()));
  const ok = await dialog({
    title: paths.length === 1 ? `Delete “${names[0]}”?` : `Delete ${paths.length} items?`,
    body: "This can't be undone.",
    ok: "Delete",
    danger: true,
  });
  if (!ok) return;
  let fail = 0;
  for (const p of paths) {
    try { await api(p.replace(/\/$/, "") + "?delete", { method: "POST" }); state.sel.delete(p); }
    catch (err) { fail++; toast(err.message, "err", 5000); }
  }
  if (!fail) toast(paths.length === 1 ? "Deleted" : `Deleted ${paths.length} items`);
  refresh();
}

function refresh() {
  if (state.hits) runSearch(state.query);
  else load();
}

$("#mkdir-btn").onclick = async () => {
  const name = await dialog({ title: "New folder", input: "", ok: "Create" });
  if (!name) return;
  try {
    await api(state.cwd, { method: "POST", body: form({ act: "mkdir", name }) });
    load();
  } catch (err) {
    toast(err.message, "err", 5000);
  }
};

$$(".seg-btn").forEach((b) => (b.onclick = () => {
  state.view = b.dataset.view;
  localStorage.setItem("view", state.view);
  render();
}));

$("#sel-clear").onclick = () => { state.sel.clear(); updateSel(); };
$("#sel-rm").onclick = () => remove([...state.sel]);
$("#sel-dl").onclick = () => {
  const paths = [...state.sel];
  if (paths.length === 1 && !paths[0].endsWith("/")) {
    location.href = API + paths[0] + "?dl";
    return;
  }
  // Zip the selection from its common parent folder.
  const parent = paths.map(parentOf).reduce((a, b) => { while (!b.startsWith(a)) a = parentOf(a); return a; });
  const f = document.createElement("form");
  f.method = "POST";
  f.enctype = "multipart/form-data";
  f.action = API + parent + "?zip=crc";
  f.innerHTML = `<input name="act" value="zip"><textarea name="files"></textarea>`;
  f.elements.files.value = paths.map((p) => p.slice(parent.length).replace(/\/$/, "")).join("\n");
  f.hidden = true;
  document.body.append(f);
  f.submit();
  f.remove();
};

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    navigate(nav.dataset.nav);
  }
  if (!e.target.closest("#menu") && !e.target.closest("[data-more]")) closeMenu();
});

window.addEventListener("popstate", () => {
  state.cwd = location.pathname.endsWith("/") ? location.pathname : location.pathname + "/";
  state.sel.clear();
  clearSearch(false);
  load();
});

/* ---------- search ---------- */

let searchTimer = 0;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) return clearSearch();
  searchTimer = setTimeout(() => runSearch(q), 250);
});

async function runSearch(q) {
  state.query = q;
  const term = q.replace(/["\\]/g, "").replace(/\s+/g, "*");
  try {
    const r = await api("/?srch", { method: "POST", body: JSON.stringify({ q: `name like "*${term}*"`, n: 250 }) });
    const d = await r.json();
    if (state.query !== q) return;
    state.hits = d.hits.map((h) => {
      let rp = "/" + h.rp.replace(/^\/+/, "");
      if (rp.startsWith(API + "/")) rp = rp.slice(API.length);
      return { path: rp, href: rp.split("/").pop(), name: dec(rp.split("/").pop()), sz: h.sz, ts: h.ts, dir: false };
    });
    state.hitsTrunc = !!d.trunc;
    state.sel.clear();
    render();
  } catch (err) {
    toast("Search failed: " + err.message, "err");
  }
}

function clearSearch(rerender = true) {
  if (!state.hits && !state.query) return;
  state.hits = null;
  state.query = "";
  $("#search").value = "";
  if (rerender) render();
}

/* ---------- viewer ---------- */

const viewer = {
  list: [],
  idx: 0,
  open(it) {
    this.list = items().filter((x) => !x.dir);
    this.idx = Math.max(0, this.list.indexOf(it));
    $("#viewer").hidden = false;
    document.body.style.overflow = "hidden";
    this.show();
  },
  close() {
    $("#viewer").hidden = true;
    $("#viewer-body").innerHTML = "";
    document.body.style.overflow = "";
  },
  step(n) {
    if (this.list.length < 2) return;
    this.idx = (this.idx + n + this.list.length) % this.list.length;
    this.show();
  },
  async show() {
    const it = this.list[this.idx];
    const url = API + itemPath(it);
    const k = kindOf(it.name, false);
    $("#viewer-name").textContent = it.name;
    $("#viewer-meta").textContent = `${fmtSize(it.sz)} · ${fmtDate(it.ts)}` + (this.list.length > 1 ? ` · ${this.idx + 1} of ${this.list.length}` : "");
    $("#viewer-dl").href = url + "?dl";
    $("#viewer-prev").hidden = $("#viewer-next").hidden = this.list.length < 2;
    const body = $("#viewer-body");
    if (k === "image") body.innerHTML = `<img src="${esc(url)}" alt="">`;
    else if (k === "video") body.innerHTML = `<video src="${esc(url)}" controls autoplay playsinline></video>`;
    else if (k === "audio") body.innerHTML = `<audio src="${esc(url)}" controls autoplay></audio>`;
    else if (k === "pdf") body.innerHTML = `<iframe src="${esc(url)}"></iframe>`;
    else if ((k === "text" || k === "code") && it.sz < 2e6) {
      body.innerHTML = `<pre></pre>`;
      try {
        const t = await (await api(itemPath(it) + "?txt")).text();
        if (this.list[this.idx] === it) $("pre", body).textContent = t;
      } catch (err) {
        $("pre", body).textContent = err.message;
      }
    } else {
      body.innerHTML = `<div class="nopreview"><div class="ficon">${icon(ICON[k])}</div><p>No preview for this file</p>` +
        `<p><a class="btn primary" href="${esc(url)}?dl">${icon("download")}<span>Download</span></a></p></div>`;
    }
  },
};

$("#viewer-close").onclick = () => viewer.close();
$("#viewer-prev").onclick = () => viewer.step(-1);
$("#viewer-next").onclick = () => viewer.step(1);
$("#viewer-body").addEventListener("click", (e) => { if (e.target === e.currentTarget) viewer.close(); });

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) || $("#dialog").open;
  if (!$("#viewer").hidden) {
    if (e.key === "Escape") viewer.close();
    else if (e.key === "ArrowLeft") viewer.step(-1);
    else if (e.key === "ArrowRight") viewer.step(1);
    return;
  }
  if (e.key === "Escape") {
    if (!$("#menu").hidden) return closeMenu();
    if (document.activeElement === $("#search")) { $("#search").blur(); return clearSearch(); }
    if (state.sel.size) { state.sel.clear(); return updateSel(); }
  }
  if (typing || $("#app").hidden) return;
  if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
    e.preventDefault();
    items().forEach((x) => state.sel.add(itemPath(x)));
    updateSel();
  } else if (e.key === "Delete" && state.sel.size && can("delete")) remove([...state.sel]);
  else if (e.key === "Backspace" && state.cwd !== "/") navigate(parentOf(state.cwd));
});

/* ---------- theme ---------- */

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#theme-btn use").setAttribute("href", t === "light" ? "#i-moon" : "#i-sun");
}
applyTheme(localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
$("#theme-btn").onclick = () => {
  const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem("theme", t);
  applyTheme(t);
};

/* ---------- uploads (up2k protocol) ---------- */

// Same chunk sizing as copyparty's up2k.js / u2c.py; chunks stay at or under 32 MiB
// for files up to 128 GiB, which keeps every request under Cloudflare's 100 MB cap.
function chunkSize(size) {
  let cs = 1024 * 1024, step = 512 * 1024;
  for (;;) {
    for (const mul of [1, 2]) {
      const n = Math.ceil(size / cs);
      if (n <= 256 || (cs >= 32 * 1024 * 1024 && n <= 4096)) return cs;
      cs += step;
      step *= mul;
    }
  }
}

function b64url(buf) {
  let s = "";
  const b = new Uint8Array(buf, 0, 33);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
}

const up = {
  queue: [],
  running: false,
  bytesTotal: 0,
  bytesDone: 0,
  t0: 0,

  add(entries) {
    if (!entries.length) return;
    const dest = state.cwd;
    for (const { file, rel } of entries) {
      const sub = rel.split("/").slice(0, -1).map(encSeg).join("/");
      const job = { file, name: file.name, dir: dest + (sub ? sub + "/" : ""), done: 0, status: "Waiting", el: null };
      job.el = document.createElement("li");
      job.el.innerHTML = `<span class="n"></span><span class="s"></span><div class="bar"><i></i></div>`;
      $(".n", job.el).textContent = rel;
      $("#up-list").append(job.el);
      this.queue.push(job);
      this.bytesTotal += file.size;
      this.paint(job);
    }
    $("#uploads").hidden = false;
    if (!this.running) this.run();
  },

  paint(job) {
    const pct = job.file.size ? (job.done / job.file.size) * 100 : job.state === "done" ? 100 : 0;
    $(".bar i", job.el).style.width = pct + "%";
    $(".s", job.el).textContent = job.status;
    job.el.className = job.state || "";
  },

  total() {
    const pct = this.bytesTotal ? (this.bytesDone / this.bytesTotal) * 100 : 0;
    $("#up-bar").style.width = pct + "%";
    const left = this.queue.filter((j) => !j.state).length;
    const el = (Date.now() - this.t0) / 1000;
    const spd = this.bytesDone / Math.max(el, 0.5);
    $("#up-title").textContent = left ? `Uploading ${left} file${left === 1 ? "" : "s"}` : "Uploads complete";
    $("#up-meta").textContent = left
      ? `${fmtSize(this.bytesDone)} of ${fmtSize(this.bytesTotal)} · ${fmtSize(spd)}/s · ${fmtDur((this.bytesTotal - this.bytesDone) / spd)} left`
      : `${fmtSize(this.bytesTotal)} uploaded`;
  },

  async run() {
    this.running = true;
    this.t0 = Date.now();
    let job;
    while ((job = this.queue.find((j) => !j.state && !j.busy))) {
      job.busy = true;
      try {
        await this.upload(job);
        job.state = "done";
      } catch (err) {
        job.state = "err";
        job.status = err.message.slice(0, 80);
        this.bytesDone += job.file.size - job.done;
      }
      this.paint(job);
      this.total();
      if (job.dir === state.cwd && !state.hits) load();
    }
    this.running = false;
    this.total();
    if (!this.queue.some((j) => j.state === "err"))
      setTimeout(() => { if (!this.running) $("#up-close").click(); }, 4000);
  },

  async upload(job) {
    const f = job.file, cs = chunkSize(f.size);
    const hashes = [];
    for (let ofs = 0; ofs < f.size; ofs += cs) {
      const buf = await f.slice(ofs, Math.min(ofs + cs, f.size)).arrayBuffer();
      hashes.push(b64url(await crypto.subtle.digest("SHA-512", buf)));
      job.status = `Preparing ${Math.round((ofs / f.size) * 100)}%`;
      this.paint(job);
    }

    const handshake = async () => {
      const r = await fetch(API + job.dir, {
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ name: f.name, size: f.size, lmod: Math.floor(f.lastModified / 1000), hash: hashes }),
      });
      const t = await r.text();
      if (r.status === 409 || /file already exists/.test(t)) throw new Error("Already exists");
      if (!r.ok) throw new Error(t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "HTTP " + r.status);
      return JSON.parse(t);
    };

    let hs = await handshake();
    const sent = new Map();
    for (let round = 0; hs.hash.length && round < 4; round++) {
      const todo = hs.hash.map((h) => hashes.indexOf(h));
      const already = f.size - todo.reduce((a, i) => a + Math.min(cs, f.size - i * cs), 0);
      if (round === 0) { job.done = already; this.bytesDone += already; }
      const purl = hs.purl.split("/").map(encSeg).join("/");
      const worker = async () => {
        let i;
        while ((i = todo.shift()) !== undefined) {
          await this.chunk(job, purl, hs.wark, hashes[i], f.slice(i * cs, Math.min((i + 1) * cs, f.size)), sent, i);
        }
      };
      job.status = "Uploading";
      await Promise.all([worker(), worker(), worker()]);
      hs = await handshake();
    }
    if (hs.hash.length) throw new Error("Upload incomplete");
    const fresh = f.size - job.done;
    job.done = f.size;
    this.bytesDone += fresh;
    job.status = hs.name !== f.name ? `Done (saved as ${hs.name})` : "Done";
  },

  chunk(job, purl, wark, hash, blob, sent, idx) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", purl);
      x.setRequestHeader("X-Up2k-Hash", hash);
      x.setRequestHeader("X-Up2k-Wark", wark);
      x.setRequestHeader("Content-Type", "application/octet-stream");
      x.upload.onprogress = (e) => {
        const d = e.loaded - (sent.get(idx) || 0);
        sent.set(idx, e.loaded);
        job.done += d;
        this.bytesDone += d;
        job.status = `${Math.round((job.done / job.file.size) * 100)}%`;
        this.paint(job);
        this.total();
      };
      x.onload = () => {
        if (x.status < 300) return res();
        // Roll back progress so a retry round doesn't count these bytes twice.
        const d = sent.get(idx) || 0;
        job.done -= d;
        this.bytesDone -= d;
        sent.delete(idx);
        x.status === 400 && /already got that/.test(x.responseText) ? res() : rej(new Error("Chunk failed: HTTP " + x.status));
      };
      x.onerror = () => rej(new Error("Network error"));
      x.send(blob);
    });
  },
};

$("#upload-btn").onclick = () => $("#file-input").click();
$("#file-input").onchange = (e) => {
  up.add([...e.target.files].map((file) => ({ file, rel: file.name })));
  e.target.value = "";
};
$("#up-close").onclick = () => {
  if (up.running) return toast("Uploads still running", "err");
  $("#uploads").hidden = true;
  $("#up-list").innerHTML = "";
  up.queue = [];
  up.bytesTotal = up.bytesDone = 0;
};

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, rel: prefix + file.name });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, prefix + entry.name + "/", out);
    }
  }
}

let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e) || !can("write") || $("#app").hidden) return;
  e.preventDefault();
  dragDepth++;
  $("#dropzone").classList.add("on");
});
window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) { dragDepth = 0; $("#dropzone").classList.remove("on"); }
});
window.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $("#dropzone").classList.remove("on");
  if (!can("write")) return;
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  const out = [];
  if (entries.length) for (const en of entries) await walkEntry(en, "", out);
  else for (const file of e.dataTransfer.files) out.push({ file, rel: file.name });
  up.add(out);
});

/* ---------- boot ---------- */

navigate(location.pathname, false);
