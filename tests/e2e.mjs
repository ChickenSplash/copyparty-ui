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
  await page.click("text=Photos"); await page.waitForURL("**/Photos/"); await page.waitForSelector(".row[data-i]");
  await page.waitForTimeout(600); await shot("03-photos-list");
});
await step("grid", async () => {
  await page.click('[data-view="grid"]'); await page.click("text=Holiday 2026"); await page.waitForURL(/Holiday/);
  await page.waitForSelector(".tile"); await page.waitForTimeout(1200); await shot("04-grid");
});
await step("viewer", async () => {
  await page.click(".tile >> nth=0"); await page.waitForSelector("#viewer:not([hidden]) img");
  await page.waitForTimeout(500); await shot("05-viewer"); await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300); console.log("   ", await page.textContent("#viewer-meta")); await page.keyboard.press("Escape");
});
await step("select", async () => {
  await page.click(".tile >> nth=1 >> [data-check]"); await page.click(".tile >> nth=2 >> [data-check]");
  await page.waitForSelector("#selbar:not([hidden])"); await shot("06-selection"); await page.keyboard.press("Escape");
});
await step("back to list, upload", async () => {
  await page.click('[data-view="list"]'); await page.click('#crumbs a:has-text("Home")'); await page.waitForURL(B + "/");
  await page.click("text=Docs"); await page.waitForURL(/Docs/);
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
  await page.click("text=hello world.txt"); await page.waitForSelector("#viewer pre:has-text('hello')", { timeout: 4000 });
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
  await page.waitForSelector(".section-label", { timeout: 4000 }); await page.waitForTimeout(500); await shot("11-search");
  console.log("   ", await page.textContent(".section-label"));
});
await step("light theme", async () => {
  await page.keyboard.press("Escape"); await page.click("#theme-btn"); await page.click('#crumbs a:has-text("Home")');
  await page.click("text=Photos"); await page.waitForTimeout(800); await shot("12-light");
  await page.click("#theme-btn");
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
});
console.log("console errors:", errs);
await browser.close();
