// Shared app state and a small event bus. Modules change the state, then emit
// an event; whatever draws that part of the page listens for it.
//
//   "loading"       a folder is being fetched
//   "dir"           a folder loaded or failed (breadcrumbs, permissions, storage)
//   "render"        what the listing shows changed (folder, view, sort, search)
//   "selection"     the selection changed
//   "changed"       files were created, renamed or deleted; data is the folders affected
//   "unauthorized"  the session is gone, so show the sign-in screen

export const state = {
  cwd: "/",
  dirs: [],
  files: [],
  perms: [],
  acct: "*",
  loadError: null,
  view: localStorage.getItem("view") || "list",
  sort: JSON.parse(localStorage.getItem("sort") || '{"key":"name","dir":1}'),
  sel: new Set(),
  lastSel: null,
  query: "",
  hits: null,
  hitsTrunc: false,
};

const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(fn);
}

export function emit(event, data) {
  for (const fn of handlers.get(event) || []) fn(data);
}

export const can = (perm) => state.perms.includes(perm);

// Search hits carry a full path; folder entries are relative to the current folder.
export const itemPath = (it) => it.path || state.cwd + it.href;

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

// What the listing currently shows, in display order.
export const items = () => state.hits || sorted();

export function clearSelection() {
  if (!state.sel.size) return;
  state.sel.clear();
  emit("selection");
}
