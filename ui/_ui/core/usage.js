// Folder sizes for the whole file store, as a tree (what the usage view draws).
// One request to the du plugin; if that fails (plugin not loaded, index not
// ready), crawl every folder's ?ls instead: slower, but the same tree.
//
// Node: { name, path, sz, n, own, dirs, parent }
//   path   URL path like the rest of the app ("/", "/Backups/Pictures/")
//   sz, n  bytes and file count, including subfolders
//   own    bytes in files directly in this folder (sz minus the subfolders)
//   dirs   subfolders, largest first
//
// Dot-folders aren't nodes either way. From the plugin their bytes still count
// towards the parent (they show up in its `own`); a crawl can't see them.
import { folderSizes } from "./api.js";
import { getDir } from "./cache.js";
import { dec, encSeg } from "./format.js";
import { on } from "./state.js";

const CRAWL_PARALLEL = 6;

let pending = null; // Promise of { root, source: "index" | "crawl", at }

export function getUsage({ fresh = false } = {}) {
  if (fresh || !pending) {
    const p = (async () => {
      let root, source = "index";
      try {
        root = fromRows(await folderSizes());
      } catch {
        root = await crawl();
        source = "crawl";
      }
      return { root, source, at: Date.now() };
    })();
    pending = p;
    p.catch(() => { if (pending === p) pending = null; });
  }
  return pending;
}

// The node for a folder path, matching on decoded names, so it doesn't matter
// how the path was percent-encoded. Null if it isn't in the tree.
export function findNode(root, path) {
  let node = root;
  for (const seg of path.split("/").filter(Boolean).map(dec)) {
    node = node.dirs.find((d) => d.name === seg);
    if (!node) return null;
  }
  return node;
}

// The folder and its parents, root first.
export function lineage(node) {
  const out = [];
  for (let n = node; n; n = n.parent) out.unshift(n);
  return out;
}

on("changed", () => { pending = null; });
on("unauthorized", () => { pending = null; });

function makeNode(name, parent) {
  const node = { name, path: parent ? parent.path + encSeg(name) + "/" : "/", sz: 0, n: 0, own: 0, dirs: [], parent };
  parent?.dirs.push(node);
  return node;
}

function finish(node) {
  node.dirs.sort((a, b) => b.sz - a.sz);
  node.own = Math.max(0, node.sz - node.dirs.reduce((s, d) => s + d.sz, 0));
  node.dirs.forEach(finish);
  return node;
}

function fromRows(rows) {
  const root = makeNode("", null);
  const byPath = new Map([["", root]]);
  const at = (path) => {
    let node = byPath.get(path);
    if (!node) {
      const i = path.lastIndexOf("/");
      node = makeNode(path.slice(i + 1), at(i < 0 ? "" : path.slice(0, i)));
      byPath.set(path, node);
    }
    return node;
  };
  for (const [path, sz, n] of rows) Object.assign(at(path), { sz, n });
  return finish(root);
}

// Walk every folder (through the listing cache, so it also warms it) and add
// sizes up from the files, rather than trusting each listing's folder sizes.
async function crawl() {
  const root = makeNode("", null);
  const queue = [root];
  const visit = async (node) => {
    let d;
    try { d = await getDir(node.path); } catch { return; } // unreadable: counts as empty
    for (const f of d.files) { node.own += f.sz; node.n++; }
    for (const x of d.dirs) queue.push(makeNode(x.name, node));
  };
  const busy = new Set();
  const workers = Array.from({ length: CRAWL_PARALLEL }, async () => {
    // A worker can find the queue empty while others are still listing, so it
    // waits on them rather than quitting early.
    while (queue.length || busy.size) {
      if (!queue.length) { await Promise.race(busy); continue; }
      const p = visit(queue.shift());
      busy.add(p);
      await p;
      busy.delete(p);
    }
  });
  await Promise.all(workers);
  const total = (node) => {
    node.dirs.forEach(total);
    node.sz = node.own + node.dirs.reduce((s, d) => s + d.sz, 0);
    node.n += node.dirs.reduce((s, d) => s + d.n, 0);
  };
  total(root);
  return finish(root);
}
