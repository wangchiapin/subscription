// 報名頁＋個人頁整合測試：真的 class-signup.gs（假 Firestore）＋真的瀏覽器
const { chromium } = require("playwright"), http = require("http"), fs = require("fs"), path = require("path");
const { create } = require("./gs-harness");
const root = path.join(__dirname, "..", "..");
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), addDays = (d, k) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
const be = create();
be.put("cls_courses", "c1", { status: "open", level: "zero", title: { hant: "零基礎中文團班", hans: "零基础中文团班", es: "Chino desde cero" }, intro: { hant: "從發音開始", hans: "从发音开始", es: "Desde la pronunciación" }, rules: { hant: "請準時", hans: "请准时", es: "Sé puntual" }, refund: { hant: "三天前可退", hans: "三天前可退", es: "Reembolso" },
  startDate: addDays(today, 7), slots: [{ d: 1, s: "21:00", e: "22:00" }, { d: 3, s: "21:00", e: "22:00" }], capacity: 2, taken: 0, minStudents: 1, allowWaitlist: true, priceUnit: "month", priceMXN: 600, priceUSD: 35, promoMXN: 480, promoUntil: addDays(today, 3), sortOrder: 1 });
be.put("cls_private", "c1", { zoomUrl: "https://zoom.us/j/777", zoomNote: "pw 123", materials: [{ title: "Lección 1", url: "https://example.com/l1" }] });
be.put("cls_settings", "main", { paypalMe: "https://paypal.me/ben790831", bankMode: "show", mxn: { bank: "BBVA", holder: "Ben W", clabe: "012345678901234567" }, contactEmail: "c@x.com" });
const png = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z", "base64");
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, "http://x");
  if (u.pathname === "/api") {
    let d = ""; q.on("data", c => d += c); q.on("end", () => { const out = q.method === "POST" ? be.post(d) : be.get(Object.fromEntries(u.searchParams)); r.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }); r.end(JSON.stringify(out)); }); return;
  }
  let p = path.join(root, decodeURIComponent(u.pathname)); if (p.endsWith("/")) p += "index.html";
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); r.end(b); } });
});
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, base = `http://localhost:${port}`;
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const mk = async (lang) => { const ctx = await b.newContext({ locale: "es-MX", timezoneId: "America/Mexico_City", viewport: { width: 390, height: 800 } }); await ctx.addInitScript(`window.CLS_API_URL="${base}/api"`); const pg = await ctx.newPage(); pg.errs = []; pg.on("pageerror", e => pg.errs.push(e.message)); return pg; };
  const pg = await mk();
  await pg.goto(base + "/class/?lang=hans"); await pg.waitForSelector(".card.click, #courses .card");
  let txt = await pg.innerText("#courses");
  ok(txt.includes("零基础中文团班"), "預設簡體顯示簡體班名");
  ok(/480/.test(txt) && /35/.test(txt), "列表顯示優惠價/美金");
  await pg.click('[data-lang="hant"]'); ok((await pg.innerText("#courses")).includes("零基礎中文團班"), "切繁體");
  await pg.click('[data-lang="es"]'); ok((await pg.innerText("#courses")).includes("Chino desde cero"), "切西文");
  await pg.click("#courses .card"); await pg.waitForSelector("#goSignup");
  const det = await pg.innerText("#detail"); ok(/Lunes|lun/i.test(det) && det.includes("21:00"), "詳情有台灣時間");
  ok(/20:00|07:00|08:00/.test(det) || /→/.test(det), "詳情有換算當地時間：" + (det.match(/→[^\n]*/) || [""])[0]);
  await pg.selectOption("#tz", "Europe/Madrid"); ok(/→/.test(await pg.innerText("#detail")), "改時區仍顯示");
  // 報名流程：先送空表單
  await pg.click("#goSignup"); await pg.waitForSelector("#f1"); await pg.click("#next");
  ok(await pg.locator("#f1 .fe:not(:empty)").count() >= 3, "空表單顯示欄位錯誤");
  await pg.fill('[name=name]', "Sofía Ramírez"); await pg.selectOption('[name=country]', { index: 1 }); await pg.fill('[name=email]', "sofia@x.com"); await pg.fill('[name=email2]', "other@x.com"); await pg.fill('[name=whatsapp]', "+52 55 1234 5678");
  const lv = await pg.$$eval('[name=studentLevel] option', o => o.map(x => x.value)); await pg.selectOption('[name=studentLevel]', lv[1]);
  await pg.click("#next"); ok(await pg.locator('#f1 [data-for=email2]:not(:empty)').count() === 1, "兩次 email 不同被擋");
  ok(await pg.locator('#f1 [data-for=source]:not(:empty)').count() === 1, "沒選「從哪裡知道」被擋");
  const srcOpts = await pg.$$eval('[name=source] option', o => o.map(x => x.value)); ok(srcOpts.join() === ",ig,fb,friend,wa,other", "「從哪裡知道」選項 " + srcOpts.join());
  await pg.selectOption('[name=source]', "ig");
  await pg.fill('[name=email2]', "sofia@x.com"); await pg.click("#next"); ok(await pg.locator('#f1 [data-for=agree]:not(:empty)').count() === 1, "沒勾同意被擋");
  await pg.check('[name=agree]'); await pg.click("#next"); await pg.waitForSelector("#f2:not([hidden])");
  ok((await pg.innerText("#curOpts")).includes("USD") || (await pg.innerText("#curOpts")).includes("US"), "有幣別選項");
  ok((await pg.innerText("#payBox")).includes("012345678901234567"), "披索顯示 CLABE");
  await pg.check('input[name=cur][value=USD]'); const href = await pg.getAttribute("#payBox a[href*=paypal]", "href"); ok(href === "https://paypal.me/ben790831/35USD", "PayPal 連結帶金額 " + href);
  await pg.check('input[name=cur][value=MXN]');
  ok(await pg.isDisabled("#submit"), "沒填完不能送出");
  await pg.fill('#f2 [name=ref]', "SPEI-998877"); await pg.fill('#f2 [name=paidAt]', today + "T10:30");
  fs.writeFileSync("/tmp/shot.jpg", png); await pg.setInputFiles("#shot", "/tmp/shot.jpg"); await pg.waitForSelector("#prev:not([hidden])", { timeout: 5000 }).catch(() => {});
  await pg.check("#ok"); ok(!(await pg.isDisabled("#submit")), "填完可送出");
  await pg.click("#submit"); await pg.waitForSelector("#vDone:not([hidden])", { timeout: 8000 });
  const su = be.all("cls_signups"); ok(su.length === 1 && su[0].status === "pending" && su[0].expectedAmount === 480, "後端收到報名（優惠價 480）");
  ok(su[0].source === "ig", "後端存下「從哪裡知道」= ig");
  ok(be.files.length === 1, "截圖存到雲端硬碟"); ok(be.mails.length === 2, "寄了兩封信");
  const link = await pg.getAttribute("#doneOpen", "href"); ok(link.includes(su[0].id), "完成頁有專屬連結");
  // 個人頁：未付款
  const my = await pg.context().newPage(); await my.goto(`${base}/class/my/?t=${su[0].id}&lang=es`); await my.waitForTimeout(800);
  let mt = await my.innerText("body"); ok(!mt.includes("zoom.us"), "未付款看不到 Zoom"); ok(/Sofía/.test(mt), "個人頁有姓名");
  // 標記已付款
  const raw = be.read("cls_signups", su[0].id); raw.status = "paid"; be.put("cls_signups", su[0].id, raw);
  await my.reload(); await my.waitForTimeout(800); mt = await my.innerText("body"); ok(mt.includes("zoom.us/j/777") || (await my.locator('a[href*="zoom.us/j/777"]').count()) === 1, "付款後看到 Zoom"); ok((await my.locator('a[href="https://example.com/l1"]').count()) === 1, "付款後看到教材");
  await my.click('[data-lang="hans"]'); ok((await my.innerText("body")).match(/[已付款|上课|教材]/), "個人頁切簡體");
  await my.goto(`${base}/class/my/?t=${"a".repeat(32)}&lang=es`); await my.waitForTimeout(600); ok((await my.locator("#err:not([hidden])").count()) === 1, "錯的連結顯示錯誤");
  // 第二人報名 → 額滿 → 候補
  const be2 = be; const raw2 = { courseId: "c1" }; 
  const r2 = be.post({ action: "signup", courseId: "c1", name: "Carlos P", email: "c2@x.com", whatsapp: "+525512340000", acceptedRules: true, uiLang: "es", currency: "MXN", ref: "REF-2222222", paidAt: "x", screenshot: { mime: "image/jpeg", data: png.toString("base64").padEnd(300, "A") } });
  ok(r2.ok, "第二人報名 " + JSON.stringify(r2).slice(0, 80));
  const pg2 = await mk(); await pg2.goto(base + "/class/?lang=es#c=c1"); await pg2.waitForSelector("#goSignup");
  ok(/lista de espera|espera/i.test(await pg2.innerText("#detail")), "額滿顯示候補");
  await pg2.click("#goSignup"); await pg2.fill('[name=name]', "Wait Lista"); await pg2.selectOption('[name=country]', { index: 1 }); await pg2.fill('[name=email]', "w@x.com"); await pg2.fill('[name=email2]', "w@x.com"); await pg2.fill('[name=whatsapp]', "+52 55 9999 8888"); await pg2.selectOption('[name=studentLevel]', lv[1]); await pg2.selectOption('[name=source]', "fb"); await pg2.check('[name=agree]');
  await pg2.click("#next"); await pg2.waitForSelector("#vDone:not([hidden])", { timeout: 8000 });
  ok(be.all("cls_signups").filter(s => s.status === "waitlist").length === 1, "候補直接送出");
  ok(be.all("cls_signups").filter(s => s.status === "waitlist")[0].source === "fb", "候補也存下「從哪裡知道」");
  ok(pg.errs.length === 0 && pg2.errs.length === 0, "無 JS 錯誤 " + pg.errs.concat(pg2.errs).join("|"));
  await b.close(); srv.close(); console.log(fails ? "FAILED " + fails : "ALL PASS"); process.exit(fails ? 1 : 0);
})();
