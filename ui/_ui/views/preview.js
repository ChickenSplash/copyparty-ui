// How each kind of file is previewed, shared by the full-screen viewer and the
// preview pane, so a new file type only needs adding here.
//   full: the viewer: original files, autoplay, whole text files, a download button
//   otherwise the pane: thumbnails, nothing autoplays, the start of text files
import { esc, icon } from "../core/dom.js";
import { fileUrl, thumbUrl, readText, readHead } from "../core/api.js";
import { kindOf, ICON, hasThumb, extOf } from "../core/kinds.js";

const HEAD = 32 * 1024; // how much of a text file the pane shows
const FULL_TEXT_MAX = 2e6; // bigger text files get "no preview" in the viewer
// Images browsers can show as-is; the pane loads these at full size when small.
const WEB_IMG = new Set("jpg jpeg png gif webp avif svg".split(" "));
const PANE_IMG_MAX = 2e6;

// Markup for the preview. Text files leave an empty <pre data-text> for loadText().
export function previewHtml(it, path, { full = false } = {}) {
  const url = esc(fileUrl(path));
  const thumb = hasThumb(it.name) ? esc(thumbUrl(path)) : "";
  const k = kindOf(it.name, false);
  switch (k) {
    case "image": {
      if (full) return `<img src="${url}" alt="">`;
      const src = (WEB_IMG.has(extOf(it.name)) && it.sz <= PANE_IMG_MAX) || !thumb ? url : thumb;
      // The icon shows if the image fails (the data-thumb handler removes it).
      return icon(ICON[k]) + `<img src="${src}" alt="" data-thumb>`;
    }
    case "video":
      return full
        ? `<video src="${url}" controls autoplay playsinline></video>`
        : `<video src="${url}" controls playsinline preload="metadata"${thumb ? ` poster="${thumb}"` : ""}></video>`;
    case "audio":
      return full
        ? `<audio src="${url}" controls autoplay></audio>`
        : icon(ICON[k]) + `<audio src="${url}" controls preload="none"></audio>`;
    case "pdf":
      if (full) return `<iframe src="${url}"></iframe>`;
      break;
    case "text":
    case "code":
      if (!full || it.sz < FULL_TEXT_MAX) return `<pre class="pv-text" data-text></pre>`;
  }
  if (!full) return icon(ICON[k]);
  return `<div class="nopreview"><div class="ficon">${icon(ICON[k])}</div><p>No preview for this file</p>` +
    `<p><a class="btn primary" href="${url}?dl">${icon("download")}<span>Download</span></a></p></div>`;
}

// Text and code previews show only the text; nothing goes in a media box.
export const isTextPreview = (it) => ["text", "code"].includes(kindOf(it.name, it.dir));

// Fills in the <pre data-text> that previewHtml() left in `box`, if any.
// isCurrent() says whether `box` still shows this item once the text arrives.
export async function loadText(box, it, path, { full = false, isCurrent = () => true } = {}) {
  const pre = box.querySelector("[data-text]");
  if (!pre) return;
  if (!it.sz) {
    pre.textContent = "(empty file)";
    return;
  }
  try {
    const t = full ? await readText(path) : await readHead(path, HEAD);
    if (isCurrent()) pre.textContent = t + (!full && it.sz > HEAD ? "\n…" : "");
  } catch (err) {
    if (isCurrent()) pre.textContent = err.message;
  }
}
