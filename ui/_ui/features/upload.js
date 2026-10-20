// Upload queue, its panel, the file picker and drag-and-drop.
import { $ } from "../core/dom.js";
import { encSeg, fmtSize, fmtDur } from "../core/format.js";
import { chunkSize, hashChunks, handshake, postChunk } from "../core/up2k.js";
import { state, emit, can } from "../core/state.js";
import { toast } from "../ui/toast.js";

const PARALLEL = 3; // chunks in flight per file

const up = {
  queue: [],
  running: false,
  bytesTotal: 0,
  bytesDone: 0,
  t0: 0,

  // entries: [{ file, rel }], rel being the path below the current folder.
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
      if (job.dir === state.cwd && !state.hits) emit("changed", [job.dir]);
    }
    this.running = false;
    this.total();
    if (!this.queue.some((j) => j.state === "err"))
      setTimeout(() => { if (!this.running) $("#up-close").click(); }, 4000);
  },

  async upload(job) {
    const f = job.file, cs = chunkSize(f.size);
    const hashes = await hashChunks(f, cs, (p) => {
      job.status = `Preparing ${Math.round(p * 100)}%`;
      this.paint(job);
    });

    let hs = await handshake(job.dir, f, hashes);
    const sent = new Map(); // chunk index -> bytes counted so far
    for (let round = 0; hs.hash.length && round < 4; round++) {
      const todo = hs.hash.map((h) => hashes.indexOf(h));
      const already = f.size - todo.reduce((a, i) => a + Math.min(cs, f.size - i * cs), 0);
      if (round === 0) { job.done = already; this.bytesDone += already; }
      const worker = async () => {
        let i;
        while ((i = todo.shift()) !== undefined) {
          await this.chunk(job, hs, hashes[i], f.slice(i * cs, Math.min((i + 1) * cs, f.size)), sent, i);
        }
      };
      job.status = "Uploading";
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      hs = await handshake(job.dir, f, hashes);
    }
    if (hs.hash.length) throw new Error("Upload incomplete");
    const fresh = f.size - job.done;
    job.done = f.size;
    this.bytesDone += fresh;
    job.status = hs.name !== f.name ? `Done (saved as ${hs.name})` : "Done";
  },

  async chunk(job, hs, hash, blob, sent, idx) {
    // Roll back this chunk's progress so a retry round doesn't count it twice.
    const rollback = () => {
      const d = sent.get(idx) || 0;
      job.done -= d;
      this.bytesDone -= d;
      sent.delete(idx);
    };
    try {
      const stored = await postChunk(hs.purl, hs.wark, hash, blob, (loaded) => {
        const d = loaded - (sent.get(idx) || 0);
        sent.set(idx, loaded);
        job.done += d;
        this.bytesDone += d;
        job.status = `${Math.round((job.done / job.file.size) * 100)}%`;
        this.paint(job);
        this.total();
      });
      if (!stored) rollback();
    } catch (err) {
      rollback();
      throw err;
    }
  },

  reset() {
    $("#uploads").hidden = true;
    $("#up-list").innerHTML = "";
    this.queue = [];
    this.bytesTotal = this.bytesDone = 0;
  },
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

function initDrop() {
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const zone = $("#dropzone");
  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e) || !can("write") || $("#app").hidden) return;
    e.preventDefault();
    depth++;
    zone.classList.add("on");
  });
  window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("dragleave", () => {
    if (--depth <= 0) { depth = 0; zone.classList.remove("on"); }
  });
  window.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    zone.classList.remove("on");
    if (!can("write")) return;
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    const out = [];
    if (entries.length) for (const en of entries) await walkEntry(en, "", out);
    else for (const file of e.dataTransfer.files) out.push({ file, rel: file.name });
    up.add(out);
  });
}

export function initUploads() {
  $("#upload-btn").onclick = () => $("#file-input").click();
  $("#file-input").onchange = (e) => {
    up.add([...e.target.files].map((file) => ({ file, rel: file.name })));
    e.target.value = "";
  };
  $("#up-close").onclick = () => {
    if (up.running) return toast("Uploads still running", "err");
    up.reset();
  };
  initDrop();
}
