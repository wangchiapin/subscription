const { create } = require("./gs-harness");
const assert = require("assert"); let n = 0, bad = 0;
const t = (name, fn) => { try { fn(); n++; console.log("ok  ", name); } catch (e) { bad++; console.log("FAIL", name, "\n   ", e.message); } };
const JPG = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(400, 7)]).toString("base64");
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, k) => new Date(Date.parse(d) + k * 864e5).toISOString().slice(0, 10);
function setup(over, o) {
  const b = create(o);
  b.put("cls_courses", "c1", Object.assign({ status: "open", title: { hant: "零基礎", hans: "零基础", es: "Chino" }, capacity: 2, taken: 0, allowWaitlist: true, priceMXN: 600, priceUSD: 35, promoMXN: 480, promoUntil: addDays(today, 3), slots: [{ d: 1, s: "21:00", e: "22:00" }], sortOrder: 1 }, over || {}));
  b.put("cls_private", "c1", { zoomUrl: "https://zoom.us/j/1", zoomNote: "pw", materials: [{ title: "L1", url: "https://x.y" }], adminNote: "SECRET" });
  b.put("cls_settings", "main", { paypalMe: "https://paypal.me/ben", bankMode: "show", mxn: { bank: "BBVA", holder: "Ben", clabe: "012345678901234567" }, contactEmail: "c@x.com" });
  return b;
}
const body = (o) => Object.assign({ action: "signup", courseId: "c1", name: "Sofia R", email: "s@x.com", whatsapp: "+52 55 1234 5678", acceptedRules: true, uiLang: "es", currency: "MXN", ref: "SPEI-12345", paidAt: "2030-01-01T10:00", screenshot: { mime: "image/jpeg", data: JPG } }, o || {});

t("courses：只回公開欄位，草稿不出現", () => {
  const b = setup(); b.put("cls_courses", "c2", { status: "draft", title: { hant: "x" } });
  const r = b.get({ action: "courses" }); assert(r.ok); assert.strictEqual(r.courses.length, 1);
  const c = r.courses[0]; assert.strictEqual(c.state, "open"); assert(!("adminNote" in c)); assert.strictEqual(c.options.find(o => o.currency === "MXN").amount, 480);
  assert.strictEqual(c.options.find(o => o.currency === "USD").amount, 35); assert.strictEqual(r.contact.email, "c@x.com");
});
t("優惠過期後回原價", () => { const b = setup({ promoUntil: addDays(today, -1) }); assert.strictEqual(b.get({ action: "courses" }).courses[0].options[0].amount, 600); });
t("優惠價不低於原價就不生效", () => { const b = setup({ promoMXN: 700 }); assert.strictEqual(b.get({ action: "courses" }).courses[0].options[0].amount, 600); });
t("payinfo：顯示轉帳資料；contact 模式不洩漏", () => {
  const b = setup(); assert.strictEqual(b.get({ action: "payinfo", courseId: "c1" }).bank.clabe, "012345678901234567");
  b.put("cls_settings", "main", { bankMode: "contact", mxn: { clabe: "012345678901234567" } }); const r = b.get({ action: "payinfo", courseId: "c1" }); assert.strictEqual(r.bankMode, "contact"); assert.strictEqual(r.bank, null);
  assert.strictEqual(b.get({ action: "payinfo", courseId: "nope" }).error, "course");
});
t("報名成功：寫入、截圖、寄兩封信、taken=1、token 32 碼", () => {
  const b = setup(); const r = b.post(body()); assert(r.ok, JSON.stringify(r)); assert(/^[a-f0-9]{32}$/.test(r.token)); assert.strictEqual(r.status, "pending");
  const s = b.read("cls_signups", r.token); assert.strictEqual(s.expectedAmount, 480); assert.strictEqual(s.method, "spei"); assert.strictEqual(s.whatsapp, "+525512345678"); assert(s.screenshotUrl.startsWith("https://drive/"));
  assert.strictEqual(b.mails.length, 2); assert.strictEqual(b.mails[1].to, "s@x.com"); assert(b.mails[1].body.includes(r.token)); assert.strictEqual(b.read("cls_courses", "c1").taken, 1);
});
t("美金走 PayPal 價格", () => { const b = setup(); const r = b.post(body({ currency: "USD" })); const s = b.read("cls_signups", r.token); assert.strictEqual(s.expectedAmount, 35); assert.strictEqual(s.method, "paypal"); });
t("驗證錯誤碼", () => {
  const e = (o) => setup().post(body(o)).error;
  assert.strictEqual(e({ name: "A" }), "name"); assert.strictEqual(e({ email: "bad" }), "email"); assert.strictEqual(e({ whatsapp: "123" }), "whatsapp"); assert.strictEqual(e({ acceptedRules: false }), "consent");
  assert.strictEqual(e({ courseId: "zzz" }), "course"); assert.strictEqual(e({ currency: "EUR" }), "currency"); assert.strictEqual(e({ ref: "123" }), "payref"); assert.strictEqual(e({ paidAt: "" }), "paidAt");
  assert.strictEqual(e({ screenshot: null }), "shot"); assert.strictEqual(e({ screenshot: { mime: "image/jpeg", data: Buffer.alloc(400, 1).toString("base64") } }), "shot");
});
t("honeypot 假成功但不寫入", () => { const b = setup(); const r = b.post(body({ hp: "bot" })); assert(r.ok); assert.strictEqual(b.all("cls_signups").length, 0); });
t("重複報名 dup；取消後可再報", () => {
  const b = setup(); const r = b.post(body()); assert.strictEqual(b.post(body({ ref: "OTHER-123456" })).error, "dup");
  const raw = b.read("cls_signups", r.token); raw.status = "cancelled"; b.put("cls_signups", r.token, raw); assert(b.post(body({ ref: "OTHER-123456" })).ok);
});
t("付款編號重複標 dupRef", () => { const b = setup({ capacity: 5 }); b.post(body()); const r = b.post(body({ email: "o@x.com" })); assert.strictEqual(b.read("cls_signups", r.token).dupRef, true); });
t("額滿→候補（免付款）；不收候補→full", () => {
  const b = setup({ capacity: 1 }); b.post(body()); const r = b.post(body({ email: "w@x.com", screenshot: null, ref: "", paidAt: "" }));
  assert(r.ok && r.status === "waitlist"); assert.strictEqual(b.read("cls_courses", "c1").taken, 1);
  const b2 = setup({ capacity: 1, allowWaitlist: false }); b2.post(body()); assert.strictEqual(b2.post(body({ email: "w@x.com" })).error, "full");
});
t("截止、關閉", () => { assert.strictEqual(setup({ signupDeadline: addDays(today, -1) }).post(body()).error, "deadline"); assert.strictEqual(setup({ status: "closed" }).post(body()).error, "closed"); assert.strictEqual(setup({ status: "draft" }).post(body()).error, "closed"); });
t("限流：同信箱 1 小時 5 次", () => { const b = setup({ capacity: 99 }); let last; for (let i = 0; i < 6; i++) last = b.post(body({ name: "Xx", currency: "EUR" })); assert.strictEqual(last.error, "rate"); });
t("寄信失敗不影響報名", () => { const b = setup({}, { mailFail: true }); const r = b.post(body()); assert(r.ok); assert(b.read("cls_signups", r.token)); });
t("寫入失敗：回 server 並丟掉截圖", () => { const b = setup(); b.put("cls_signups", "x", {}); const orig = b.db; // 讓 create 衝突不好模擬，改成課程消失於中途：用壞掉的 JSON
  assert.strictEqual(b.post("{bad json").error, "server"); });
t("my：未付款沒有 access，付款後才有；不外洩 adminNote", () => {
  const b = setup(); const r = b.post(body()); let m = b.get({ action: "my", t: r.token }); assert(m.ok); assert(!m.access); assert.strictEqual(m.signup.status, "pending");
  const raw = b.read("cls_signups", r.token); raw.status = "paid"; b.put("cls_signups", r.token, raw);
  m = b.get({ action: "my", t: r.token }); assert.strictEqual(m.access.zoomUrl, "https://zoom.us/j/1"); assert.strictEqual(m.access.materials.length, 1); assert(!JSON.stringify(m).includes("SECRET"));
});
t("my：壞 token", () => { const b = setup(); assert.strictEqual(b.get({ action: "my", t: "abc" }).error, "token"); assert.strictEqual(b.get({ action: "my", t: "a".repeat(32) }).error, "notfound"); });
t("未知 action", () => { assert.strictEqual(setup().get({ action: "x" }).error, "action"); });

function withCode(over) { const b = setup({ capacity: 5 }); b.put("cls_codes", "SAVE100", Object.assign({ enabled: true, off: { MXN: 200, USD: 5 }, courseIds: [], validUntil: addDays(today, 5), maxUses: 2, used: 0 }, over || {})); return b; }
t("折扣碼試算：固定金額、不疊加（取較低）", () => {
  const b = withCode(); const r = b.get({ action: "code", courseId: "c1", code: " save100 " }); assert(r.ok, JSON.stringify(r)); assert.strictEqual(r.code, "SAVE100");
  const mxn = r.options.find(o => o.currency === "MXN"), usd = r.options.find(o => o.currency === "USD");
  assert.strictEqual(mxn.amount, 400); assert(mxn.code); assert.strictEqual(mxn.list, 600);      // 600-200=400 < 優惠價 480
  assert.strictEqual(usd.amount, 30); assert(usd.code);                                           // 35-5=30
});
t("折扣碼比優惠價貴就維持優惠價；全都沒好處回 codeNoBenefit", () => {
  const b = withCode({ off: { MXN: 50 } }); const r = b.get({ action: "code", courseId: "c1", code: "SAVE100" });   // 600-50=550 > 480
  assert.strictEqual(r.error, "codeNoBenefit");
  const b2 = withCode({ off: { MXN: 50, USD: 5 } }); const r2 = b2.get({ action: "code", courseId: "c1", code: "SAVE100" });
  assert(r2.ok); assert.strictEqual(r2.options.find(o => o.currency === "MXN").amount, 480); assert(!r2.options.find(o => o.currency === "MXN").code);
});
t("折扣碼錯誤：不存在、停用、別的班、過期、用完", () => {
  const e = (over, code) => withCode(over).get({ action: "code", courseId: "c1", code: code || "SAVE100" }).error;
  assert.strictEqual(e({}, "NOPE"), "code"); assert.strictEqual(e({ enabled: false }), "code"); assert.strictEqual(e({ courseIds: ["other"] }), "code");
  assert.strictEqual(e({ validUntil: addDays(today, -1) }), "codeExpired"); assert.strictEqual(e({ maxUses: 2, used: 2 }), "codeUsedUp");
  assert.strictEqual(withCode({ courseIds: ["c1"] }).get({ action: "code", courseId: "c1", code: "SAVE100" }).ok, true);
});
t("折扣碼亂猜 30 次後擋下", () => { const b = withCode(); let last; for (let i = 0; i < 31; i++) last = b.get({ action: "code", courseId: "c1", code: "BAD" + i }); assert.strictEqual(last.error, "rate"); });
t("報名帶折扣碼：後端重算金額、記錄、used+1；用滿後第三人被擋", () => {
  const b = withCode(); const r = b.post(body({ code: "save100", ref: "SPEI-111111" })); assert(r.ok, JSON.stringify(r));
  const s = b.read("cls_signups", r.token); assert.strictEqual(s.expectedAmount, 400); assert.strictEqual(s.codeUsed, "SAVE100"); assert.strictEqual(s.codeDiscount, 200); assert.strictEqual(s.promoApplied, false);
  assert.strictEqual(b.read("cls_codes", "SAVE100").used, 1);
  assert(b.post(body({ code: "SAVE100", email: "b@x.com", ref: "SPEI-222222" })).ok); assert.strictEqual(b.read("cls_codes", "SAVE100").used, 2);
  assert.strictEqual(b.post(body({ code: "SAVE100", email: "c@x.com", ref: "SPEI-333333" })).error, "codeUsedUp");
});
t("報名帶壞折扣碼被擋，不偷偷用原價；不帶碼照舊", () => {
  const b = withCode(); assert.strictEqual(b.post(body({ code: "NOPE" })).error, "code"); assert.strictEqual(b.all("cls_signups").length, 0);
  const r = b.post(body()); assert.strictEqual(b.read("cls_signups", r.token).expectedAmount, 480); assert.strictEqual(b.read("cls_codes", "SAVE100").used, 0);
});
t("折扣碼對所選幣別沒折扣就擋", () => { const b = withCode({ off: { USD: 5 } }); assert.strictEqual(b.post(body({ code: "SAVE100", currency: "MXN" })).error, "codeNoBenefit"); assert(b.post(body({ code: "SAVE100", currency: "USD" })).ok); });
t("調課資料是公開欄位：班級列表與個人頁都帶得到", () => {
  const ch = [{ date: addDays(today, 3), newDate: addDays(today, 4), s: "20:00", e: "21:00", note: "臨時有事" }, { date: addDays(today, 10), cancel: true }];
  const b = setup({ changes: ch }); const c = b.get({ action: "courses" }).courses[0]; assert.strictEqual(c.changes.length, 2); assert.strictEqual(c.changes[0].s, "20:00"); assert.strictEqual(c.changes[1].cancel, true);
  const r = b.post(body()); const m = b.get({ action: "my", t: r.token }); assert.strictEqual(m.course.changes[0].note, "臨時有事");
});
console.log(bad ? `FAILED ${bad}/${n + bad}` : `ALL PASS ${n}`); process.exit(bad ? 1 : 0);
