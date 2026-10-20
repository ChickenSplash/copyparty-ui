// Paths are URL paths as copyparty uses them: percent-encoded, starting with "/",
// and folders end with "/".

export function parentOf(path) {
  const p = path.replace(/\/$/, "");
  return p.slice(0, p.lastIndexOf("/") + 1) || "/";
}

export function commonParent(paths) {
  return paths.map(parentOf).reduce((a, b) => { while (!b.startsWith(a)) a = parentOf(a); return a; });
}
