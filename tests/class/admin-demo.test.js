// 後台示範模式測試：node tests/class/admin-demo.test.js（需要 playwright 與 Chrome）
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "..");
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : "text/html; charset=utf-8" }); r.end(d); } }); });
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } else console.log("ok  ", m); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = `http://localhost:${srv.address().port}/class/admin/?demo=1`;
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const pg = await b.newPage(); const errs = []; pg.on("pageerror", e => errs.push(e.message)); pg.on("console", m => m.type() === "error" && !/ERR_TUNNEL|net::ERR/.test(m.text()) && errs.push(m.text()));
  await pg.goto(base); await pg.waitForSelector("#main");
  ok(await pg.locator("#app").isVisible(), "示範模式直接進後台");
  await pg.click('[data-act="go"][data-id="settings"]'); await pg.click('[data-act="seed"]');
  await pg.click('[data-act="go"][data-id="courses"]');
  ok(await pg.locator(".cc").count() === 2, "示範班級 2 個");
  ok((await pg.locator("#main").innerText()).includes("2 / 6") || (await pg.locator("#main").innerText()).includes("3 / 6"), "人數顯示");
  // 新增班級＋繁轉簡
  await pg.click('[data-act="new-course"]');
  await pg.fill('[name=t_title_hant]', "設定螢幕軟體班"); await pg.fill('[name=t_intro_hant]', "選單");
  await pg.click('[data-act="ltab"][data-id="hans"]'); await pg.click('[data-act="to-hans"]');
  ok((await pg.inputValue('[name=t_title_hans]')) === "设定萤幕软体班", "繁轉簡台灣用字");
  await pg.fill('[name=priceMXN]', "500"); await pg.fill('[name=startDate]', "2030-01-01");
  await pg.click('#cf button[type=submit]'); await pg.waitForSelector("#dlg", { state: "hidden" });
  ok(await pg.locator(".cc").count() === 3, "新增後 3 個");
  // 驗證錯誤
  await pg.click('[data-act="new-course"]'); await pg.click('#cf button[type=submit]');
  ok(await pg.locator("#cf-err").isVisible(), "空白班級被擋");
  await pg.click('[data-act="close"]');
  // 報名：標記已付款
  await pg.click('[data-act="go"][data-id="signups"]'); await pg.click('[data-act="filter"][data-id="pending"]');
  await pg.click('[data-act="mark-paid"]'); await pg.click('#mpf button[type=submit]'); await pg.waitForSelector("#dlg", { state: "hidden" });
  ok(await pg.locator(".req").count() === 0, "待確認清空（已轉已付款）");
  await pg.click('[data-act="filter"][data-id="paid"]'); ok(await pg.locator(".req").count() === 3, "已付款 3 筆");
  await pg.click('[data-act="notify"]'); const txt = await pg.inputValue("#nt"); ok(txt.includes("class/my/?t="), "通知含專屬連結"); await pg.click('[data-act="close"]');
  // 收入、設定
  await pg.click('[data-act="go"][data-id="income"]'); ok((await pg.locator("#main").innerText()).includes("合計"), "收入頁");
  await pg.click('[data-act="go"][data-id="settings"]'); await pg.fill('[name=clabe]', "123"); await pg.selectOption('[name=bankMode]', "show"); await pg.click('#sf button[type=submit]');
  ok(await pg.locator("#sf-err").isVisible(), "CLABE 驗證");
  // 點名：預設全部出席；標缺席、請假；停課
  await pg.click('[data-act="go"][data-id="courses"]'); await pg.locator('[data-act="attendance"][data-id="demo-c1"]').click(); await pg.waitForSelector("[data-att]");
  ok((await pg.locator("[data-att] .list-line").count()) === 2, "點名列出 2 位已付款學員");
  ok((await pg.locator("[data-att] .chip.on", { hasText: "出席" }).count()) === 2, "預設都是出席");
  await pg.locator("[data-att] .list-line").first().locator('[data-v="absent"]').click();
  await pg.locator("[data-att] .list-line").nth(1).locator('[data-v="leave"]').click();
  ok((await pg.locator("[data-att] .chip.on", { hasText: "缺席" }).count()) === 1 && (await pg.locator("[data-att] .chip.on", { hasText: "請假" }).count()) === 1, "缺席與請假有標到");
  await pg.click('[data-act="close"]');
  await pg.click('[data-act="go"][data-id="signups"]'); await pg.click('[data-act="filter"][data-id="paid"]');
  await pg.locator('[data-row="demo-s2"] [data-act="toggle"]').click();
  const sm = await pg.locator('[data-row] .panel:visible').first().innerText(); ok(/上課 \d+ 堂：出席 \d+、缺席 1、請假 0/.test(sm), "名單詳情顯示累計 " + (sm.match(/上課[^\n]*|還沒有上課日/) || [""])[0]);
  await pg.click('[data-act="go"][data-id="courses"]'); await pg.locator('[data-act="attendance"][data-id="demo-c1"]').click(); await pg.waitForSelector("[data-att]");
  await pg.click('[data-act="att-cancel"]'); ok((await pg.locator("[data-att] .list-line").count()) === 0, "停課後不列學員");
  await pg.click('[data-act="att-cancel"]'); await pg.click('[data-act="close"]');
  // 調課：單堂改時間、取消不補、通知、刪除
  await pg.click('[data-act="go"][data-id="courses"]'); await pg.click('[data-act="changes"][data-id="demo-c1"]'); await pg.waitForSelector("[data-chg]");
  await pg.click('#chf button[type=submit]'); ok((await pg.innerText("#chf-err")).includes("一樣"), "新時間跟原本一樣被擋");
  await pg.fill('#chf [name=s]', "20:00"); await pg.fill('#chf [name=e]', "21:00"); await pg.fill('#chf [name=note]', "老師臨時有事"); await pg.click('#chf button[type=submit]');
  await pg.waitForSelector('[data-act="chg-del"]'); ok((await pg.locator("[data-chg]").innerText()).includes("20:00"), "調課已存並列出");
  await pg.selectOption('#chf [name=odate]', { index: 1 }); await pg.check('#chf [name=kind][value=cancel]'); ok(!(await pg.locator("#chf-new").isVisible()), "取消不補時隱藏新時間");
  await pg.click('#chf button[type=submit]'); await pg.waitForFunction(() => document.querySelectorAll('[data-act="chg-del"]').length === 2);
  ok((await pg.locator("[data-chg]").innerText()).includes("取消，不補課"), "取消不補已存");
  await pg.click('[data-act="chg-notify"]'); await pg.waitForSelector("[data-bcid]");
  const bt = await pg.locator("[data-bcid] a.btn.primary").first().getAttribute("href"); const dec = decodeURIComponent(bt);
  ok(/調課|调课|cambio/i.test(dec) || dec.includes("20:00"), "整班調課通知帶新時間");
  ok(dec.includes("20:00") && /取消|cancela/.test(dec), "通知含改時間與取消兩行");
  await pg.click('[data-act="close"]'); ok((await pg.locator('[data-card="demo-c1"]').innerText()).includes("調課（2）"), "班級卡顯示調課（2）");
  await pg.click('[data-act="changes"][data-id="demo-c1"]'); await pg.waitForSelector("[data-chg]"); await pg.locator('[data-act="chg-del"]').first().click();
  await pg.waitForFunction(() => document.querySelectorAll('[data-act="chg-del"]').length === 1); await pg.click('[data-act="close"]');
  // 編輯班級存檔後調課不能被洗掉
  await pg.click('[data-act="edit-course"][data-id="demo-c1"]'); await pg.click('#cf button[type=submit]'); await pg.waitForSelector("#dlg", { state: "hidden" });
  ok((await pg.locator('[data-card="demo-c1"]').innerText()).includes("調課（1）"), "編輯班級後調課還在");
  // 折扣碼：新增、驗證、停用、刪除
  await pg.click('[data-act="go"][data-id="settings"]'); ok((await pg.locator("[data-code]").count()) === 1, "示範折扣碼 1 個");
  await pg.click('[data-act="new-code"]'); await pg.click('#cdf button[type=submit]'); ok(await pg.locator("#cd-err").isVisible(), "空白折扣碼被擋");
  await pg.fill('[name=code]', "ab"); await pg.fill('[name=offMXN]', "50"); await pg.click('#cdf button[type=submit]'); ok((await pg.innerText("#cd-err")).includes("3～20"), "太短被擋");
  await pg.fill('[name=code]', "welcome100"); await pg.click('#cdf button[type=submit]'); ok((await pg.innerText("#cd-err")).includes("已經存在"), "重複被擋");
  await pg.fill('[name=code]', "new50"); await pg.click('#cdf button[type=submit]'); await pg.waitForSelector("#dlg", { state: "hidden" });
  ok((await pg.locator("[data-code]").count()) === 2 && (await pg.innerText("#main")).includes("NEW50"), "新增折扣碼");
  await pg.locator('[data-code="NEW50"] [data-act="toggle-code"]').click(); ok((await pg.locator('[data-code="NEW50"]').innerText()).includes("已停用"), "停用");
  await pg.locator('[data-code="NEW50"] [data-act="del-code"]').click(); await pg.click("#confirm-ok"); await pg.waitForTimeout(200); ok((await pg.locator("[data-code]").count()) === 1, "刪除");
  // 未成班
  await pg.click('[data-act="go"][data-id="courses"]'); await pg.locator('[data-act="close-course"]').first().click(); await pg.click("#confirm-ok");
  await pg.waitForTimeout(300); await pg.click('[data-act="go"][data-id="signups"]'); await pg.click('[data-act="filter"][data-id="refund_pending"]');
  ok(await pg.locator(".req").count() >= 3, "未成班後待退款");
  ok(errs.length === 0, "無 console 錯誤 " + errs.join("|"));
  await b.close(); srv.close(); console.log(fails ? "FAILED " + fails : "ALL PASS"); process.exit(fails ? 1 : 0);
})();
