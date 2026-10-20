export function dec(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Like encodeURIComponent, but also escapes the characters it leaves alone.
export function encSeg(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + " " + u[i];
}

const dtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
export function fmtDate(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return "Today, " + dtTime.format(d);
  if (days === 1) return "Yesterday, " + dtTime.format(d);
  return dtDay.format(d);
}

const dtFull = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtDateLong = (ts) => dtFull.format(new Date(ts * 1000));

export function fmtDur(s) {
  if (!isFinite(s) || s < 0) return "";
  if (s < 60) return Math.ceil(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.round((s % 3600) / 60) + "m";
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
