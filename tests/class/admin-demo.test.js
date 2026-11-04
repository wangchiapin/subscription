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
  // 未成班
  await pg.click('[data-act="go"][data-id="courses"]'); await pg.locator('[data-act="close-course"]').first().click(); await pg.click("#confirm-ok");
  await pg.waitForTimeout(300); await pg.click('[data-act="go"][data-id="signups"]'); await pg.click('[data-act="filter"][data-id="refund_pending"]');
  ok(await pg.locator(".req").count() >= 3, "未成班後待退款");
  ok(errs.length === 0, "無 console 錯誤 " + errs.join("|"));
  await b.close(); srv.close(); console.log(fails ? "FAILED " + fails : "ALL PASS"); process.exit(fails ? 1 : 0);
})();
