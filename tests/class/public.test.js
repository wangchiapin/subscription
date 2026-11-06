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
be.put("cls_codes", "SAVE100", { enabled: true, off: { MXN: 200, USD: 5 }, courseIds: [], validUntil: addDays(today, 5), maxUses: 3, used: 0 });
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
  await pg.click("#goSignup"); await pg.waitForSelector("#f1");
  ok((await pg.locator("#f1 .policy details").count()) === 1, "報名第 1 步有隱私說明（退費寫在各班規則裡）");
  const polTxt = () => pg.evaluate(() => ({ p: document.getElementById("privBody").textContent, c: document.querySelector('[data-i="consent"]').textContent }));
  let pv = await polTxt();
  ok(/Tu nombre, correo/.test(pv.p) && pv.p.includes("c@x.com") && /aviso de privacidad/.test(pv.c), "西文說明帶入聯絡信箱、同意文字含隱私說明");
  await pg.click('[data-lang="hans"]'); pv = await polTxt();
  ok(pv.p.includes("c@x.com") && pv.p.includes("Firebase") && pv.c.includes("隐私说明"), "簡體說明");
  await pg.click('[data-lang="hant"]'); pv = await polTxt(); ok(pv.c.includes("隱私說明"), "繁體說明");
  await pg.click('[data-lang="es"]');
  await pg.click("#next");
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
  // 折扣碼
  await pg.fill("#codeIn", "NOPE"); await pg.click("#codeBtn"); await pg.waitForFunction(() => document.querySelector("#codeMsg").textContent.length > 0);
  ok(/no válido/i.test(await pg.innerText("#codeMsg")), "壞折扣碼顯示錯誤：" + await pg.innerText("#codeMsg"));
  await pg.fill("#codeIn", "save100"); await pg.click("#codeBtn"); await pg.waitForFunction(() => /aplicado/i.test(document.querySelector("#codeMsg").textContent));
  ok((await pg.innerText("#sum")).includes("400"), "套用後金額 400（折 200，比優惠價 480 低）");
  await pg.check('input[name=cur][value=USD]'); ok((await pg.getAttribute("#payBox a[href*=paypal]", "href")).endsWith("/30USD"), "PayPal 連結用折扣後金額 30");
  await pg.check('input[name=cur][value=MXN]');
  await pg.click("#codeBtn"); ok((await pg.innerText("#sum")).includes("480") && !(await pg.innerText("#sum")).includes("400"), "取消折扣碼回到優惠價 480");
  await pg.fill("#codeIn", "SAVE100"); await pg.click("#codeBtn"); await pg.waitForFunction(() => /aplicado/i.test(document.querySelector("#codeMsg").textContent));
  await pg.fill('#f2 [name=ref]', "SPEI-998877"); await pg.fill('#f2 [name=paidAt]', today + "T10:30");
  fs.writeFileSync("/tmp/shot.jpg", png); await pg.setInputFiles("#shot", "/tmp/shot.jpg"); await pg.waitForSelector("#prev:not([hidden])", { timeout: 5000 }).catch(() => {});
  await pg.check("#ok"); ok(!(await pg.isDisabled("#submit")), "填完可送出");
  await pg.click("#submit"); await pg.waitForSelector("#vDone:not([hidden])", { timeout: 8000 });
  const su = be.all("cls_signups"); ok(su.length === 1 && su[0].status === "pending" && su[0].expectedAmount === 400 && su[0].codeUsed === "SAVE100", "後端收到報名（折扣碼價 400）");
  ok(su[0].source === "ig", "後端存下「從哪裡知道」= ig");
  ok(be.read("cls_codes", "SAVE100").used === 1, "折扣碼使用次數 +1");
  ok(be.files.length === 1, "截圖存到雲端硬碟"); ok(be.mails.length === 2, "寄了兩封信");
  const link = await pg.getAttribute("#doneOpen", "href"); ok(link.includes(su[0].id), "完成頁有專屬連結");
  // 調課：報名頁詳情、個人頁都要看到
  const c1 = be.read("cls_courses", "c1"); c1.changes = [{ date: addDays(today, 3), newDate: addDays(today, 4), s: "20:00", e: "21:00", note: "老師臨時有事" }, { date: addDays(today, 9), cancel: true }]; be.put("cls_courses", "c1", c1);
  // 個人頁：未付款
  const my = await pg.context().newPage(); await my.goto(`${base}/class/my/?t=${su[0].id}&lang=es`); await my.waitForTimeout(800);
  let mt = await my.innerText("body"); ok(!mt.includes("zoom.us"), "未付款看不到 Zoom"); ok(/Sofía/.test(mt), "個人頁有姓名");
  // 標記已付款
  const raw = be.read("cls_signups", su[0].id); raw.status = "paid"; be.put("cls_signups", su[0].id, raw);
  await my.reload(); await my.waitForTimeout(800); mt = await my.innerText("body");
  ok(/老師臨時有事/.test(mt) && mt.includes("20:00"), "個人頁看到調課說明與新時間"); ok((await my.locator(".chg s").count()) === 2, "個人頁劃掉兩個原時間");
  ok(/Esta clase se cancela/.test(mt), "個人頁顯示取消不補"); ok(mt.includes("zoom.us/j/777") || (await my.locator('a[href*="zoom.us/j/777"]').count()) === 1, "付款後看到 Zoom"); ok((await my.locator('a[href="https://example.com/l1"]').count()) === 1, "付款後看到教材");
  await my.click('[data-lang="hans"]'); ok((await my.innerText("body")).match(/[已付款|上课|教材]/), "個人頁切簡體");
  await my.goto(`${base}/class/my/?t=${"a".repeat(32)}&lang=es`); await my.waitForTimeout(600); ok((await my.locator("#err:not([hidden])").count()) === 1, "錯的連結顯示錯誤");
  // 學員自己請假：個人頁按鈕 → 寫進點名紀錄 → 可取消
  await my.goto(`${base}/class/my/?t=${su[0].id}&lang=es`); await my.waitForSelector(".sesslist");
  const nb = await my.locator("[data-leave]").count(); ok(nb >= 1 && /Próximas clases/.test(await my.innerText("body")), "已付款個人頁列出接下來的課與請假按鈕 (" + nb + ")");
  const d1 = await my.locator("[data-leave]").first().getAttribute("data-leave");
  await my.locator("[data-leave]").first().click(); await my.waitForSelector('[data-undo="1"]');
  ok(be.read("cls_attendance", "c1__" + d1) && be.read("cls_attendance", "c1__" + d1).marks[su[0].id] === "leave", "按請假：點名紀錄寫入 leave");
  ok(/Con permiso/.test(await my.innerText(".sesslist")), "畫面顯示已請假");
  await my.click('[data-undo="1"]'); await my.waitForFunction(() => !document.querySelector('[data-undo="1"]'));
  ok(!(su[0].id in be.read("cls_attendance", "c1__" + d1).marks), "取消請假：標記移除");
  await my.click('[data-lang="hans"]'); ok(/我要请假/.test(await my.innerText(".sesslist")), "請假按鈕可切簡體");
  await my.click('[data-lang="es"]');
  // 續報：連結帶入舊資料、同意要重勾；個人頁（已付款）有續報按鈕
  await my.goto(`${base}/class/my/?t=${su[0].id}&lang=es`); await my.waitForTimeout(800);
  ok((await my.locator(`a[href="../?renew=${su[0].id}"]`).count()) === 1, "已付款個人頁有「報名下一期」按鈕");
  const pg3 = await mk(); await pg3.goto(`${base}/class/?lang=es&renew=${su[0].id}#c=c1`); await pg3.waitForSelector("#goSignup");
  ok(/Bienvenido de nuevo/.test(await pg3.innerText("#renewList")) || /Bienvenido de nuevo/.test(await pg3.evaluate(() => document.getElementById("renewList").textContent)), "續報：列表頁有歡迎回來");
  await pg3.click("#goSignup"); await pg3.waitForSelector("#f1:not([hidden])");
  const rv = await pg3.evaluate(() => { const f = document.getElementById("f1").elements; return { n: f.name.value, e: f.email.value, e2: f.email2.value, w: f.whatsapp.value, c: f.country.value, a: f.agree.checked, note: document.getElementById("renewNote").hidden }; });
  ok(rv.n && rv.e && rv.e === rv.e2 && rv.w && rv.c, "續報：姓名、Email、WhatsApp、國家都帶入 " + JSON.stringify(rv)); ok(rv.a === false && rv.note === false, "續報：同意沒預先勾，有歡迎說明");
  const pg4 = await mk(); await pg4.goto(`${base}/class/?lang=es&renew=${"d".repeat(32)}#c=c1`); await pg4.waitForSelector("#goSignup"); await pg4.click("#goSignup");
  ok(!(await pg4.inputValue("[name=name]")) && await pg4.evaluate(() => document.getElementById("renewNote").hidden), "續報：壞連結當作一般報名");
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
  ok(pg.errs.length + pg2.errs.length + pg3.errs.length + pg4.errs.length === 0, "無 JS 錯誤 " + pg.errs.concat(pg2.errs, pg3.errs, pg4.errs).join("|"));
  await b.close(); srv.close(); console.log(fails ? "FAILED " + fails : "ALL PASS"); process.exit(fails ? 1 : 0);
})();
