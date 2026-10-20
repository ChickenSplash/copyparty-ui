const IMG = new Set("jpg jpeg png gif webp avif bmp heic heif tif tiff jxl svg".split(" "));
const VID = new Set("mp4 m4v mkv webm mov avi wmv flv mpg mpeg ts 3gp".split(" "));
const AUD = new Set("mp3 flac ogg opus m4a aac wav wma alac aiff".split(" "));
const CODE = new Set("js mjs ts tsx jsx py rs go c h cpp hpp cs java kt rb php sh fish bash zsh lua json yaml yml toml ini conf cfg xml html css scss sql dockerfile makefile".split(" "));
const TEXT = new Set("txt md markdown log csv tsv nfo srt vtt env gitignore".split(" "));
const ARCH = new Set("zip tar gz tgz xz bz2 7z rar zst iso dmg deb rpm".split(" "));
// copyparty can thumbnail these (not svg, which it serves as-is).
const THUMB = new Set([...IMG, ...VID].filter((e) => e !== "svg"));

export const extOf = (name) => name.split(".").pop().toLowerCase();

export function kindOf(name, isDir) {
  if (isDir) return "dir";
  const ext = name.includes(".") ? extOf(name) : name.toLowerCase();
  if (IMG.has(ext)) return "image";
  if (VID.has(ext)) return "video";
  if (AUD.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (CODE.has(ext)) return "code";
  if (TEXT.has(ext)) return "text";
  if (ARCH.has(ext)) return "archive";
  return "file";
}

// Sprite icon for each kind.
export const ICON = { dir: "folder", image: "image", video: "video", audio: "audio", pdf: "pdf", code: "code", text: "text", archive: "archive", file: "file" };

export const hasThumb = (name) => THUMB.has(extOf(name));
export const isImage = (name) => IMG.has(extOf(name));
