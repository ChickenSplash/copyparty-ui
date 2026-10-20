// Folder listings shared by everything that shows a folder (the main listing,
// the tree), so the same folder isn't fetched twice. It drops the folders a
// "changed" event names, and everything on sign-out; it subscribes as soon as
// it's imported, so that runs before any other "changed" listener reloads.
import { listDir } from "./api.js";
import { on } from "./state.js";

const store = new Map(); // path -> Promise of a listDir() result

// fresh: skip the cache, and store the new result for everyone else.
export function getDir(path, { fresh = false } = {}) {
  if (fresh || !store.has(path)) {
    const p = listDir(path);
    store.set(path, p);
    p.catch(() => { if (store.get(path) === p) store.delete(path); });
  }
  return store.get(path);
}

export function invalidate(paths = []) {
  for (const p of paths) store.delete(p);
}

on("changed", invalidate);
on("unauthorized", () => store.clear());
