// What you can do to files and folders: open, download, link, rename, delete, new folder.
import { $ } from "../core/dom.js";
import * as cp from "../core/api.js";
import { getDir } from "../core/cache.js";
import { dec, encSeg } from "../core/format.js";
import { parentOf, commonParent } from "../core/paths.js";
import { state, on, emit, items, itemPath, clearSelection } from "../core/state.js";
import { dialog } from "../ui/dialog.js";
import { toast } from "../ui/toast.js";
import { navigate } from "./nav.js";
import { openViewer } from "./viewer.js";
import { openUsage } from "./usage.js";

// siblings: the list the item came from (the viewer steps through its files);
// the main listing when not given.
const preview = (it, siblings = items()) => openViewer(it, siblings.filter((x) => !x.dir));

export function openItem(it, siblings) {
  if (it.dir) return navigate(itemPath(it));
  preview(it, siblings);
}

// The item shown in the preview pane; null shows the current folder instead.
export function setActive(it, siblings = items(), opts) {
  state.active = it ? { it, path: itemPath(it), siblings, cwd: state.cwd } : null;
  emit("active", opts);
}

// A single click: previews a file in the pane when that's showing, otherwise
// opens it. Folders always open.
export function clickItem(it, siblings) {
  if (it.dir || !state.paneOpen) return openItem(it, siblings);
  setActive(it, siblings);
}

// What you may do to the item at `path`. copyparty gives permissions per folder,
// and a subfolder can be a section of its own with other rules (the read-only
// /Backups inside Home), so a folder's own listing decides for the folder, and
// its parent's for a file. Listings are cached, so this is usually instant.
// Nothing is allowed if the listing fails.
export async function permsAt(path) {
  const dir = path.endsWith("/") ? path : parentOf(path);
  if (dir === state.cwd) return state.perms;
  try { return (await getDir(dir)).perms; } catch { return []; }
}

const canAll = async (paths, perm) => (await Promise.all(paths.map(permsAt))).every((p) => p.includes(perm));

// Entries for an item's "more" menu.
export async function itemMenu(it, siblings) {
  const path = itemPath(it);
  const perms = await permsAt(path);
  const m = [];
  if (!it.dir) m.push({ icon: "eye", label: "Preview", run: () => preview(it, siblings) });
  else m.push({ icon: "folder", label: "Open", run: () => navigate(path) }, { icon: "usage", label: "Storage usage", run: () => openUsage(path) });
  if (it.path) m.push({ icon: "folder", label: "Show in folder", run: () => navigate(parentOf(path)) });
  m.push({ icon: "download", label: it.dir ? "Download as zip" : "Download", href: cp.downloadUrl(path, it.dir), download: true });
  m.push({ icon: "link", label: "Copy link", run: () => copyLink(path, it.dir) });
  if (perms.includes("move")) m.push("-", { icon: "pencil", label: "Rename", run: () => rename(it) });
  if (perms.includes("delete")) m.push({ icon: "trash", label: "Delete", danger: true, run: () => removeItems([path]) });
  return m;
}

export async function copyLink(path, isDir) {
  const url = location.origin + (isDir ? path : cp.fileUrl(path));
  try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { toast(url, "ok", 6000); }
}

async function rename(it) {
  const path = itemPath(it);
  const name = await dialog({ title: "Rename", input: it.name, ok: "Rename" });
  if (!name || name === it.name) return;
  if (name.includes("/")) return toast("Names can't contain /", "err");
  try {
    await cp.move(path, parentOf(path) + encSeg(name) + (it.dir ? "/" : ""));
    toast("Renamed");
    emit("changed", [parentOf(path)]);
  } catch (err) {
    toast(err.message, "err", 5000);
  }
}

export async function removeItems(paths) {
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
    try { await cp.remove(p); state.sel.delete(p); }
    catch (err) { fail++; toast(err.message, "err", 5000); }
  }
  if (!fail) toast(paths.length === 1 ? "Deleted" : `Deleted ${paths.length} items`);
  emit("changed", [...new Set(paths.map(parentOf))]);
}

async function newFolder() {
  const name = await dialog({ title: "New folder", input: "", ok: "Create" });
  if (!name) return;
  try {
    await cp.mkdir(state.cwd, name);
    emit("changed", [state.cwd]);
  } catch (err) {
    toast(err.message, "err", 5000);
  }
}

export async function deleteSelection() {
  const paths = [...state.sel];
  if (paths.length && (await canAll(paths, "delete"))) removeItems(paths);
}

// The selection bar's Delete shows only when every selected item can be deleted.
let selSeq = 0;
async function syncSelDelete() {
  const n = ++selSeq;
  const ok = state.sel.size > 0 && (await canAll([...state.sel], "delete"));
  if (n === selSeq) $("#sel-rm").hidden = !ok;
}

function downloadSelection() {
  const paths = [...state.sel];
  if (paths.length === 1 && !paths[0].endsWith("/")) {
    location.href = cp.downloadUrl(paths[0], false);
    return;
  }
  cp.downloadZip(commonParent(paths), paths);
}

export function initActions() {
  $("#mkdir-btn").onclick = newFolder;
  $("#sel-clear").onclick = clearSelection;
  $("#sel-rm").onclick = deleteSelection;
  $("#sel-dl").onclick = downloadSelection;
  on("selection", syncSelDelete);
  on("dir", syncSelDelete);
}
