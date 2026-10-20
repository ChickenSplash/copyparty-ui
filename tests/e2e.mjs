import { chromium } from "playwright";
import fs from "fs";

const B = "http://127.0.0.1:8090";
const out = process.env.SHOTS || new URL("shots", import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
// CHROME: use an existing Chromium instead of the one `npx playwright install` fetches.
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const step = async (n, fn) => { try { await fn(); console.log("ok  ", n); } catch (e) { console.log("FAIL", n, e.message.split("\n")[0]); } };

await page.goto(B + "/");
await step("login screen", async () => { await page.waitForSelector("#login:not([hidden])", { timeout: 4000 }); await shot("01-login"); });
await step("bad password", async () => {
  await page.fill("#login-pw", "nope"); await page.click("#login-form button");
  await page.waitForFunction(() => document.querySelector("#login-err").textContent.length > 0, null, { timeout: 4000 });
  console.log("   err:", await page.textContent("#login-err"));
});
await step("login", async () => {
  await page.fill("#login-pw", "test"); await page.click("#login-form button");
  await page.waitForSelector("#app:not([hidden]) .row[data-i]", { timeout: 4000 }); await shot("02-root");
});
await step("open Photos", async () => {
  await page.click("#listing >> text=Photos"); await page.waitForURL("**/Photos/"); await page.waitForSelector(".row[data-i]");
  await page.waitForTimeout(600); await shot("03-photos-list");
});
await step("grid", async () => {
  await page.click('[data-view="grid"]'); await page.click("#listing >> text=Holiday 2026"); await page.waitForURL(/Holiday/);
  await page.waitForSelector(".tile"); await page.waitForTimeout(1200); await shot("04-grid");
});
await step("viewer", async () => {
  await page.dblclick(".tile >> nth=0"); await page.waitForSelector("#viewer:not([hidden]) img");
  await page.waitForTimeout(500); await shot("05-viewer"); await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300); console.log("   ", await page.textContent("#viewer-meta")); await page.keyboard.press("Escape");
});
await step("select", async () => {
  await page.click(".tile >> nth=1 >> [data-check]"); await page.click(".tile >> nth=2 >> [data-check]");
  await page.waitForSelector("#selbar:not([hidden])"); await shot("06-selection"); await page.keyboard.press("Escape");
});
await step("back to list, upload", async () => {
  await page.click('[data-view="list"]'); await page.click('#crumbs a:has-text("Home")'); await page.waitForURL(B + "/");
  await page.click("#listing >> text=Docs"); await page.waitForURL(/Docs/);
  const big = Buffer.alloc(3 * 1024 * 1024 + 123); for (let i = 0; i < big.length; i++) big[i] = (i * 7919) & 255;
  await page.setInputFiles("#file-input", [
    { name: "hello world.txt", mimeType: "text/plain", buffer: Buffer.from("hello from the new ui\n") },
    { name: "big.bin", mimeType: "application/octet-stream", buffer: big },
    { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
  ]);
  await page.waitForFunction(() => document.querySelector("#up-title").textContent === "Uploads complete", null, { timeout: 20000 });
  await page.waitForTimeout(500); await shot("07-uploaded");
  console.log("   ", (await page.$$eval("#up-list li", (l) => l.map((x) => x.textContent.trim()))).join(" | "));
});
await step("preview text", async () => {
  await page.dblclick("#listing >> text=hello world.txt"); await page.waitForSelector("#viewer pre:has-text('hello')", { timeout: 4000 });
  await shot("08-text"); await page.keyboard.press("Escape");
});
await step("rename", async () => {
  await page.hover('.row:has-text("hello world.txt")'); await page.click('.row:has-text("hello world.txt") [data-more]');
  await shot("09-menu"); await page.click("#menu >> text=Rename");
  await page.fill("#dialog input", "renamed note.txt"); await page.click('#dialog button[value="ok"]');
  await page.waitForSelector('.row:has-text("renamed note.txt")', { timeout: 4000 });
});
await step("mkdir", async () => {
  await page.click("#mkdir-btn"); await page.fill("#dialog input", "New Stuff"); await shot("10-dialog");
  await page.click('#dialog button[value="ok"]'); await page.waitForSelector('.row:has-text("New Stuff")', { timeout: 4000 });
});
await step("delete", async () => {
  for (const n of ["renamed note.txt", "big.bin", "empty.txt", "New Stuff"]) await page.click(`.row:has-text("${n}") [data-check]`);
  await page.click("#sel-rm"); await page.click('#dialog button[value="ok"]');
  await page.waitForFunction(() => !document.querySelector(".row:not(.head)")?.textContent.includes("big.bin") && ![...document.querySelectorAll(".row")].some((r) => /big\.bin|New Stuff/.test(r.textContent)), null, { timeout: 5000 });
});
await step("search", async () => {
  await page.press("body", "/"); await page.keyboard.type("img_204");
  await page.waitForSelector("#listing .section-label", { timeout: 4000 }); await page.waitForTimeout(500); await shot("11-search");
  console.log("   ", await page.textContent("#listing .section-label"));
});
await step("light theme", async () => {
  await page.keyboard.press("Escape"); await page.click("#theme-btn"); await page.click('#crumbs a:has-text("Home")');
  await page.click("#listing >> text=Photos"); await page.waitForTimeout(800); await shot("12-light");
  await page.click("#theme-btn");
});
await step("size bars", async () => {
  await page.goto(B + "/"); await page.waitForSelector(".row[data-i]");
  const sizes = await page.$$eval(".row[data-i] .size", (els) => els.map((e) => e.textContent.trim()));
  if (!sizes.some((s) => /\d (KB|MB|GB)$/.test(s))) throw new Error("no folder sizes: " + sizes);
  const vals = await page.$$eval(".row[data-i] meter.szbar", (els) => els.map((e) => +e.value));
  if (!vals.length || Math.max(...vals) !== 1) throw new Error("bars not scaled to the biggest item: " + vals);
  console.log("   ", sizes.join(" | "));
  await page.fill("#search", "IMG"); await page.waitForSelector("#listing .section-label");
  if (await page.$("#listing meter.szbar")) throw new Error("bars shown in search results");
  await page.fill("#search", ""); await page.waitForSelector("#listing .section-label", { state: "detached" });
  await page.click('[data-sort="size"]'); await shot("14-size-bars");
  await page.click('[data-sort="name"]');
});
await step("tree: expand, open, follow", async () => {
  await page.goto(B + "/"); await page.waitForSelector('.tnode[data-path="/Photos/"]');
  await page.click("#tree-collapse"); await page.waitForSelector('.tnode[data-path="/Photos/"][aria-expanded="false"]');
  const top = await page.$$eval("#tree .tnode[data-path]", (els) => els.map((e) => e.textContent.trim()));
  console.log("   ", top.join(" | "));
  await page.click('.tnode[data-path="/Photos/"] [data-toggle]');
  await page.waitForSelector('.tnode[data-path="/Photos/Holiday%202026/"]');
  if (page.url() !== B + "/") throw new Error("the chevron navigated");
  await page.click('.tnode[data-path="/Photos/Holiday%202026/"]'); await page.waitForURL(/Holiday/);
  await page.waitForSelector('.tnode.current[data-path="/Photos/Holiday%202026/"][aria-expanded="true"]');
  await page.waitForSelector('.tnode[data-path="/Photos/Holiday%202026/IMG_2041.jpg"]');
  await shot("15-tree");
  // a file opens in the viewer, stepping through its folder
  await page.dblclick('.tnode[data-path="/Photos/Holiday%202026/IMG_2042.jpg"]'); await page.waitForSelector("#viewer:not([hidden]) img");
  console.log("   ", await page.textContent("#viewer-meta")); await page.keyboard.press("Escape");
  // navigating elsewhere reveals the folder in the tree
  await page.click("#tree-collapse"); await page.waitForSelector('.tnode[data-path="/Photos/"][aria-expanded="false"]');
  await page.goto(B + "/Projects/website/");
  await page.waitForSelector('.tnode.current[data-path="/Projects/website/"]');
  await page.waitForSelector('.tnode[data-path="/Projects/"][aria-expanded="true"]');
});
await step("tree: keyboard", async () => {
  await page.focus('.tnode.current');
  await page.keyboard.press("ArrowRight"); await page.waitForSelector('.tnode.current[aria-expanded="true"]');
  await page.keyboard.press("ArrowRight"); // into the first child
  const first = await page.evaluate(() => document.activeElement.dataset.path);
  if (!first?.startsWith("/Projects/website/")) throw new Error("ArrowRight didn't step in: " + first);
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); // to the parent, then collapse it
  await page.waitForSelector('.tnode.current[aria-expanded="false"]');
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter"); await page.waitForURL(B + "/Projects/");
  await page.keyboard.press("Home");
  console.log("   focus:", await page.evaluate(() => document.activeElement.dataset.path));
});
await step("tree: menu and changes", async () => {
  await page.goto(B + "/Docs/"); await page.waitForSelector('.tnode.current[data-path="/Docs/"]');
  await page.click('.tnode.current [data-toggle]'); await page.waitForSelector('.tnode[data-path="/Docs/notes.txt"]');
  await page.click("#mkdir-btn"); await page.fill("#dialog input", "Tree Test"); await page.click('#dialog button[value="ok"]');
  await page.waitForSelector('.tnode[data-path="/Docs/Tree%20Test/"]', { timeout: 4000 });
  await page.click('.tnode[data-path="/Docs/Tree%20Test/"]', { button: "right" }); await page.waitForSelector("#menu:not([hidden])");
  await shot("16-tree-menu");
  await page.click("#menu >> text=Delete"); await page.click('#dialog button[value="ok"]');
  await page.waitForSelector('.tnode[data-path="/Docs/Tree%20Test/"]', { state: "detached", timeout: 4000 });
});
await step("sidebar: hide, resize", async () => {
  await page.click("#sidebar-btn"); await page.waitForSelector("#sidebar", { state: "hidden" });
  await page.reload(); await page.waitForSelector(".row[data-i]");
  if (await page.isVisible("#sidebar")) throw new Error("hidden sidebar didn't stay hidden");
  await page.click("#sidebar-btn"); await page.waitForSelector("#sidebar", { state: "visible" });
  const w0 = (await page.$eval("#sidebar", (e) => e.offsetWidth));
  const h = await (await page.$("#sidebar-resize")).boundingBox();
  await page.mouse.move(h.x + 3, h.y + 200); await page.mouse.down(); await page.mouse.move(h.x + 83, h.y + 200, { steps: 5 }); await page.mouse.up();
  const w1 = (await page.$eval("#sidebar", (e) => e.offsetWidth));
  if (w1 - w0 < 60) throw new Error(`resize didn't take: ${w0} -> ${w1}`);
  await page.reload(); await page.waitForSelector("#tree .tnode");
  if ((await page.$eval("#sidebar", (e) => e.offsetWidth)) !== w1) throw new Error("width not remembered");
  await page.dblclick("#sidebar-resize");
  console.log("   ", w0, "->", w1, "-> reset", await page.$eval("#sidebar", (e) => e.offsetWidth));
});
await step("pane: folder summary", async () => {
  await page.goto(B + "/"); await page.waitForSelector("#pane-body .pv-name");
  console.log("   ", await page.textContent("#pane-body .pv-name"), "·", await page.textContent("#pane-body .pv-sub"));
  if (!(await page.$$("#pane-body .pv-list button")).length) throw new Error("no largest list");
  await shot("18-pane-folder");
});
await step("pane: click previews, double-click opens", async () => {
  await page.goto(B + "/Docs/"); await page.waitForSelector('.row:has-text("notes.txt")');
  await page.click('#listing >> text=notes.txt');
  await page.waitForSelector("#pane-body .pv-text:has-text('Notes')");
  if (await page.isVisible("#viewer")) throw new Error("single click opened the viewer");
  await page.waitForSelector('.row.active:has-text("notes.txt")');
  await shot("19-pane-text");
  await page.dblclick('#listing >> text=notes.txt'); await page.waitForSelector("#viewer:not([hidden]) pre");
  await page.keyboard.press("Escape");
});
await step("pane: keyboard", async () => {
  await page.keyboard.press("ArrowDown"); await page.waitForSelector('#pane-body .pv-name:has-text("random.bin")');
  await page.waitForSelector('.row.active:has-text("random.bin")');
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
  await page.waitForSelector('#pane-body .pv-name:has-text("backup.tar.gz")');
  await page.keyboard.press("Enter"); await page.waitForSelector("#viewer:not([hidden]) .nopreview");
  await page.keyboard.press("Escape"); await page.waitForSelector("#viewer", { state: "hidden" });
  await page.keyboard.press("Escape"); await page.waitForSelector('#pane-body .pv-name:has-text("Docs")');
});
await step("pane: image, from the tree", async () => {
  await page.goto(B + "/Photos/Holiday%202026/"); await page.waitForSelector(".tnode.current");
  if (await page.$('.tnode.current[aria-expanded="false"]')) await page.click(".tnode.current [data-toggle]");
  await page.waitForSelector('.tnode[data-path="/Photos/Holiday%202026/IMG_2043.jpg"]');
  await page.click('.tnode[data-path="/Photos/Holiday%202026/IMG_2043.jpg"]');
  await page.waitForSelector("#pane-body .pv-media img"); await page.waitForSelector('.tnode.active[data-path$="IMG_2043.jpg"]');
  await page.waitForFunction(() => document.querySelector("#pane-body .pv-media img")?.naturalWidth > 0);
  await page.waitForTimeout(400); await shot("20-pane-image");
  await page.click("#pane-body .pv-media"); await page.waitForSelector("#viewer:not([hidden]) img");
  console.log("   ", await page.textContent("#viewer-meta")); await page.keyboard.press("Escape");
});
await step("pane: selection, rename follows", async () => {
  await page.goto(B + "/Docs/"); await page.waitForSelector('.row:has-text("notes.txt")');
  await page.click('.row:has-text("notes.txt") [data-check]'); await page.click('.row:has-text("table.csv") [data-check]');
  await page.waitForSelector('#pane-body .pv-name:has-text("2 selected")'); await shot("21-pane-selection");
  await page.keyboard.press("Escape");
  await page.setInputFiles("#file-input", [{ name: "pane test.txt", mimeType: "text/plain", buffer: Buffer.from("pane\n") }]);
  await page.waitForSelector('.row:has-text("pane test.txt")', { timeout: 8000 });
  await page.click('#listing >> text=pane test.txt'); await page.waitForSelector('#pane-body .pv-name:has-text("pane test.txt")');
  await page.click('#pane-body [data-act="more"]'); await page.click("#menu >> text=Rename");
  await page.fill("#dialog input", "pane renamed.txt"); await page.click('#dialog button[value="ok"]');
  await page.waitForSelector('#pane-body .pv-name:has-text("Docs")', { timeout: 4000 }); // the old name is gone, so back to the folder
  await page.click('.row:has-text("pane renamed.txt") [data-check]'); await page.click("#sel-rm"); await page.click('#dialog button[value="ok"]');
  await page.waitForSelector('.row:has-text("pane renamed.txt")', { state: "detached", timeout: 4000 });
});
await step("pane: switch off", async () => {
  await page.click("#preview-btn"); await page.waitForSelector("#pane", { state: "hidden" });
  await page.click('#listing >> text=notes.txt'); await page.waitForSelector("#viewer:not([hidden]) pre");
  await page.keyboard.press("Escape");
  await page.reload(); await page.waitForSelector(".row[data-i]");
  if (await page.isVisible("#pane")) throw new Error("switched-off pane came back");
  await page.click("#preview-btn"); await page.waitForSelector("#pane", { state: "visible" });
  await page.setViewportSize({ width: 1000, height: 800 }); await page.waitForSelector("#pane", { state: "hidden" });
  await page.click('#listing >> text=notes.txt'); await page.waitForSelector("#viewer:not([hidden]) pre");
  await page.keyboard.press("Escape"); await page.setViewportSize({ width: 1440, height: 900 });
});
await step("missing folder", async () => {
  const n = errs.length;
  await page.goto(B + "/no-such-folder/");
  await page.waitForSelector(".empty h3:has-text(\"Can't open this folder\")", { timeout: 4000 });
  await page.waitForSelector("#crumbs a:has-text('no-such-folder')");
  errs.splice(n); // the listing's 404 is expected here
});
await step("keyboard", async () => {
  await page.goto(B + "/Photos/"); await page.waitForSelector(".row[data-i], .tile");
  await page.keyboard.press("Control+a"); await page.waitForSelector("#selbar:not([hidden])");
  console.log("   ", await page.textContent("#sel-count"));
  await page.keyboard.press("Escape"); await page.waitForSelector("#selbar", { state: "hidden" });
  await page.keyboard.press("Backspace"); await page.waitForURL(B + "/");
  await page.goBack(); await page.waitForURL(/Photos/); await page.waitForSelector("#crumbs a:has-text('Photos')");
});
await step("menu closes on outside click", async () => {
  await page.click('[data-view="list"]');
  await page.hover(".row[data-i] >> nth=0"); await page.click(".row[data-i] >> nth=0 >> [data-more]");
  await page.waitForSelector("#menu:not([hidden])"); await page.click("#crumbs"); await page.waitForSelector("#menu", { state: "hidden" });
});
await step("logout", async () => {
  await page.click("#logout-btn"); await page.waitForSelector("#login:not([hidden])", { timeout: 4000 });
  await page.fill("#login-pw", "test"); await page.click("#login-form button");
  await page.waitForSelector("#app:not([hidden]) .row[data-i], #app:not([hidden]) .tile", { timeout: 4000 });
});
await step("mobile", async () => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400); await shot("13-mobile");
  if (await page.isVisible("#tree")) throw new Error("drawer open by default");
  await page.click("#sidebar-btn"); await page.waitForSelector(".drawer-open #sidebar"); await page.waitForTimeout(300);
  await shot("17-mobile-drawer");
  await page.click('.tnode[data-path="/Docs/"]'); await page.waitForURL(/Docs/);
  await page.waitForSelector("#app:not(.drawer-open)"); await page.waitForSelector("#tree", { state: "hidden" });
});
console.log("console errors:", errs);
await browser.close();
