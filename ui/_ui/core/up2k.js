// copyparty's up2k upload protocol: hash the file in chunks, handshake to learn
// which chunks the server still needs, then POST those chunks.
import { API } from "./api.js";
import { encSeg } from "./format.js";

// Same chunk sizing as copyparty's up2k.js / u2c.py; chunks stay at or under 32 MiB
// for files up to 128 GiB, which keeps every request under Cloudflare's 100 MB cap.
export function chunkSize(size) {
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

export async function hashChunks(file, cs, onProgress) {
  const hashes = [];
  for (let ofs = 0; ofs < file.size; ofs += cs) {
    const buf = await file.slice(ofs, Math.min(ofs + cs, file.size)).arrayBuffer();
    hashes.push(b64url(await crypto.subtle.digest("SHA-512", buf)));
    onProgress(ofs / file.size);
  }
  return hashes;
}

// Returns { hash: [chunk hashes still needed], purl, wark, name }.
export async function handshake(dir, file, hashes) {
  const r = await fetch(API + dir, {
    method: "POST",
    credentials: "same-origin",
    body: JSON.stringify({ name: file.name, size: file.size, lmod: Math.floor(file.lastModified / 1000), hash: hashes }),
  });
  const t = await r.text();
  if (r.status === 409 || /file already exists/.test(t)) throw new Error("Already exists");
  if (!r.ok) throw new Error(t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "HTTP " + r.status);
  const hs = JSON.parse(t);
  // purl already includes the rp-loc prefix.
  hs.purl = hs.purl.split("/").map(encSeg).join("/");
  return hs;
}

// Resolves true when the chunk was stored, false when the server already had it.
// XHR rather than fetch, for upload progress.
export function postChunk(purl, wark, hash, blob, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", purl);
    x.setRequestHeader("X-Up2k-Hash", hash);
    x.setRequestHeader("X-Up2k-Wark", wark);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => {
      if (x.status < 300) return res(true);
      if (x.status === 400 && /already got that/.test(x.responseText)) return res(false);
      rej(new Error("Chunk failed: HTTP " + x.status));
    };
    x.onerror = () => rej(new Error("Network error"));
    x.send(blob);
  });
}
