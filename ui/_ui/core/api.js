// Everything that knows copyparty's HTTP API. The UI owns "/", copyparty is
// reverse-proxied at API (started with `rp-loc: /api`), and every folder URL in
// the UI maps 1:1 to API + the same path.
import { dec } from "./format.js";

export const API = "/api";

export async function api(path, opts = {}) {
  const r = await fetch(API + path, { credentials: "same-origin", ...opts });
  if (!r.ok) {
    const msg = (await r.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

const post = (path, fields) => api(path, { method: "POST", ...(fields && { body: form(fields) }) });
const noSlash = (path) => path.replace(/\/$/, "");

/* ---------- URLs ---------- */

export const fileUrl = (path) => API + path;
export const thumbUrl = (path) => API + path + "?th=w";
export const downloadUrl = (path, isDir) => API + path + (isDir ? "?zip=crc" : "?dl");

/* ---------- session ---------- */

export async function login(password) {
  await post("/", { act: "login", cppwd: password });
  // copyparty answers a wrong password with a normal page, so check who we are now.
  const d = await (await api("/?ls")).json();
  if (d.acct === "*") throw new Error("Wrong password");
}

export const logout = () => post("/", { act: "logout" });

/* ---------- reading ---------- */

// One folder. Folder entries include their recursive size and file count.
export async function listDir(path) {
  const d = await (await api(path + "?ls")).json();
  const m = /([\d.]+ \S+) free of ([\d.]+ \S+)/.exec(d.srvinf || "");
  return {
    acct: d.acct,
    perms: d.perms,
    dirs: d.dirs.map((x) => ({ href: x.href, name: dec(x.href.replace(/\/$/, "")), sz: x.sz, ts: x.ts, dir: true, n: x.tags?.[".files"] })),
    files: d.files.map((x) => ({ href: x.href, name: dec(x.href), sz: x.sz, ts: x.ts, dir: false })),
    free: m?.[1] || "",
    total: m?.[2] || "",
    server: (d.srvinf || "").split("<")[0].trim(),
  };
}

export async function readText(path) {
  return (await api(path + "?txt")).text();
}

// The start of a file as text. A Range request, so a big file isn't downloaded.
export async function readHead(path, bytes) {
  const r = await api(path, { headers: { Range: `bytes=0-${bytes - 1}` } });
  return new TextDecoder().decode((await r.arrayBuffer()).slice(0, bytes));
}

// Filename search across every readable volume.
export async function search(q, limit = 250) {
  const term = q.replace(/["\\]/g, "").replace(/\s+/g, "*");
  const r = await api("/?srch", { method: "POST", body: JSON.stringify({ q: `name like "*${term}*"`, n: limit }) });
  const d = await r.json();
  const hits = d.hits.map((h) => {
    // Hit paths come back with the rp-loc prefix.
    let rp = "/" + h.rp.replace(/^\/+/, "");
    if (rp.startsWith(API + "/")) rp = rp.slice(API.length);
    const href = rp.split("/").pop();
    return { path: rp, href, name: dec(href), sz: h.sz, ts: h.ts, dir: false };
  });
  return { hits, truncated: !!d.trunc };
}

/* ---------- changes ---------- */

export const mkdir = (dir, name) => post(dir, { act: "mkdir", name });
export const move = (src, dst) => post(noSlash(src) + "?move=" + API + noSlash(dst));
export const remove = (path) => post(noSlash(path) + "?delete");

// Download several items as one zip. A form post, so the browser handles the download.
export function downloadZip(parent, paths) {
  const f = document.createElement("form");
  f.method = "POST";
  f.enctype = "multipart/form-data";
  f.action = API + parent + "?zip=crc";
  f.innerHTML = `<input name="act" value="zip"><textarea name="files"></textarea>`;
  f.elements.files.value = paths.map((p) => noSlash(p.slice(parent.length))).join("\n");
  f.hidden = true;
  document.body.append(f);
  f.submit();
  f.remove();
}
