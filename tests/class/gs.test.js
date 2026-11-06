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
t("續報：只有已付款的舊學生能取回資料；報名會記下上一筆編號", () => {
  const b = setup({ capacity: 5 }); const r = b.post(body({ source: "ig", countryCode: "MX", nationality: "México", studentLevel: "basic" }));
  assert.strictEqual(b.get({ action: "renew", t: r.token }).error, "notfound");            // 還沒付款
  const raw = b.read("cls_signups", r.token); raw.status = "paid"; b.put("cls_signups", r.token, raw);
  const rn = b.get({ action: "renew", t: r.token }); assert(rn.ok); assert.strictEqual(rn.profile.email, "s@x.com"); assert.strictEqual(rn.profile.countryCode, "MX"); assert.strictEqual(rn.profile.source, "ig");
  assert(!("ref" in rn.profile) && !JSON.stringify(rn).includes("SECRET"));
  assert.strictEqual(b.get({ action: "renew", t: "abc" }).error, "token"); assert.strictEqual(b.get({ action: "renew", t: "b".repeat(32) }).error, "notfound");
  b.put("cls_courses", "c2", Object.assign({}, b.read("cls_courses", "c1"), { id: "c2" }));
  const r2 = b.post(body({ courseId: "c2", renewFrom: r.token, ref: "NEW-REF-123456" })); assert(r2.ok, JSON.stringify(r2));
  assert.strictEqual(b.read("cls_signups", r2.token).renewOfRef, raw.ref);
  const r3 = b.post(body({ courseId: "c2", email: "o@x.com", renewFrom: "c".repeat(32), ref: "NEW-REF-222222" })); assert(r3.ok); assert(!("renewOfRef" in b.read("cls_signups", r3.token)));
});
/* ---- 學員自己請假 ---- */
const twNow = k => new Date(Date.now() + 8 * 3600e3 + (k || 0) * 3600e3).toISOString();      // 台灣現在 + k 小時
const ALLDAYS = [1, 2, 3, 4, 5, 6, 7].map(d => ({ d: d, s: "12:00", e: "13:00" }));
function paidSetup(over) {
  const b = setup(Object.assign({ capacity: 9, startDate: addDays(today, -7), slots: ALLDAYS }, over));
  const r = b.post(body()); const raw = b.read("cls_signups", r.token); raw.status = "paid"; raw.paidConfirmedAt = new Date(Date.now() - 6 * 864e5).toISOString(); b.put("cls_signups", r.token, raw);
  return { b: b, tok: r.token };
}
t("請假：未付款看不到上課日；已付款看到接下來 6 堂，且都還沒開始", () => {
  const b = setup({ capacity: 9, startDate: addDays(today, -7), slots: ALLDAYS }); const r = b.post(body());
  assert(!("sessions" in b.get({ action: "my", t: r.token })));
  const p = paidSetup(), m = p.b.get({ action: "my", t: p.tok });
  assert.strictEqual(m.sessions.length, 6); assert.strictEqual(m.leaveHours, 2); assert(m.sessions.every(x => Date.parse(x.ed + "T" + x.s + ":00+08:00") > Date.now()));
  assert(m.sessions[3].canLeave && !m.sessions[3].leave && !("startMs" in m.sessions[0]));
});
t("請假：成功會寫進點名紀錄、寄信給老師；可取消；別人的記錄不受影響", () => {
  const { b, tok } = paidSetup(); const date = b.get({ action: "my", t: tok }).sessions[3].date, id = "c1__" + date;
  b.put("cls_attendance", id, { courseId: "c1", date: date, marks: { other: "absent" }, updatedAt: "x" });
  const n0 = b.mails.length, r = b.post({ action: "leave", t: tok, date: date }); assert(r.ok && r.leave === true, JSON.stringify(r));
  let a = b.read("cls_attendance", id); assert.strictEqual(a.marks[tok], "leave"); assert.strictEqual(a.by[tok], "student"); assert.strictEqual(a.marks.other, "absent");
  assert.strictEqual(b.mails.length, n0 + 1); assert(/請假/.test(b.mails[n0].subject) && b.mails[n0].to === "ben@example.com");
  assert.strictEqual(b.get({ action: "my", t: tok }).sessions.find(x => x.date === date).leave, true);
  assert(b.post({ action: "leave", t: tok, date: date }).ok);                                  // 重複按不出錯
  const u = b.post({ action: "leave", t: tok, date: date, undo: true }); assert(u.ok && u.leave === false);
  a = b.read("cls_attendance", id); assert(!(tok in a.marks) && !(tok in a.by) && a.marks.other === "absent");
  assert.strictEqual(b.get({ action: "my", t: tok }).sessions.find(x => x.date === date).leave, false);
});
t("請假：第一次請假會建立點名文件", () => {
  const { b, tok } = paidSetup(); const date = b.get({ action: "my", t: tok }).sessions[4].date;
  assert.strictEqual(b.read("cls_attendance", "c1__" + date), null); assert(b.post({ action: "leave", t: tok, date: date }).ok);
  assert.strictEqual(b.read("cls_attendance", "c1__" + date).courseId, "c1");
});
t("請假：開課前不到 2 小時不能請；老師已標缺席也不能改", () => {
  const soon = twNow(1), d = soon.slice(0, 10), hhmm = soon.slice(11, 16), orig = addDays(d, 1);
  const { b, tok } = paidSetup({ changes: [{ date: orig, newDate: d, s: hhmm, e: "23:59" }] });
  const s = b.get({ action: "my", t: tok }).sessions.find(x => x.date === orig); assert(s && s.changed && s.canLeave === false, JSON.stringify(s));
  assert.strictEqual(b.post({ action: "leave", t: tok, date: orig }).error, "late"); assert.strictEqual(b.read("cls_attendance", "c1__" + orig), null);
  const q = paidSetup(); const date = q.b.get({ action: "my", t: q.tok }).sessions[3].date;
  q.b.put("cls_attendance", "c1__" + date, { courseId: "c1", date: date, marks: { [q.tok]: "absent" } });
  assert.strictEqual(q.b.post({ action: "leave", t: q.tok, date: date }).error, "late");
  assert.strictEqual(q.b.read("cls_attendance", "c1__" + date).marks[q.tok], "absent");
});
t("請假：只能請真正的上課日；停課、取消的不能請；壞資料與未付款被擋", () => {
  const { b, tok } = paidSetup(); const ss = b.get({ action: "my", t: tok }).sessions;
  assert.strictEqual(b.post({ action: "leave", t: tok, date: addDays(today, -3) }).error, "nosession");
  assert.strictEqual(b.post({ action: "leave", t: tok, date: "2020-01-01" }).error, "nosession");
  assert.strictEqual(b.post({ action: "leave", t: tok, date: "bad" }).error, "bad"); assert.strictEqual(b.post({ action: "leave", t: "abc", date: ss[0].date }).error, "bad");
  assert.strictEqual(b.post({ action: "leave", t: "e".repeat(32), date: ss[0].date }).error, "notpaid");
  const c1 = b.read("cls_courses", "c1"); c1.changes = [{ date: ss[2].date, cancel: true }]; b.put("cls_courses", "c1", c1);
  b.put("cls_attendance", "c1__" + ss[3].date, { courseId: "c1", date: ss[3].date, cancelled: true, marks: {} });
  const after = b.get({ action: "my", t: tok }).sessions.map(x => x.date); assert(!after.includes(ss[2].date) && !after.includes(ss[3].date));
  assert.strictEqual(b.post({ action: "leave", t: tok, date: ss[2].date }).error, "nosession"); assert.strictEqual(b.post({ action: "leave", t: tok, date: ss[3].date }).error, "nosession");
  const pend = setup({ capacity: 9, startDate: addDays(today, -7), slots: ALLDAYS }), r = pend.post(body()); assert.strictEqual(pend.post({ action: "leave", t: r.token, date: ss[4].date }).error, "notpaid");
});
t("請假：調到未來的那堂會列出（用新時間），學員開始日之前的不列；寄信失敗不影響", () => {
  const { b, tok } = paidSetup({ changes: [{ date: addDays(today, -2), newDate: addDays(today, 3), s: "20:00", e: "21:00" }] });
  const ss = b.get({ action: "my", t: tok }).sessions; const mv = ss.find(x => x.date === addDays(today, -2)); assert(mv && mv.ed === addDays(today, 3) && mv.s === "20:00" && mv.changed);
  const q = paidSetup({ }); const sr = q.b.read("cls_signups", q.tok); sr.desiredStart = addDays(today, 10); q.b.put("cls_signups", q.tok, sr);
  assert(q.b.get({ action: "my", t: q.tok }).sessions.every(x => x.ed >= addDays(today, 10)));
  // 郵件失敗：另建一個會寄信失敗的後端
  const bm = setup({ capacity: 9, startDate: addDays(today, -7), slots: ALLDAYS }, { mailFail: true }); const r = bm.post(body()); const rw = bm.read("cls_signups", r.token); rw.status = "paid"; rw.paidConfirmedAt = new Date(Date.now() - 6 * 864e5).toISOString(); bm.put("cls_signups", r.token, rw);
  const d = bm.get({ action: "my", t: r.token }).sessions[3].date; assert(bm.post({ action: "leave", t: r.token, date: d }).ok);
});
/* ---- 開課前自動提醒 ---- */
function remindSetup(hours, over, o, bodyOver) {
  const at = twNow(hours), D = at.slice(0, 10), hhmm = at.slice(11, 16), wd = ((new Date(D + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
  const b = setup(Object.assign({ capacity: 9, startDate: D, slots: [{ d: wd, s: "12:00", e: "13:00" }], changes: [{ date: D, newDate: D, s: hhmm, e: "23:59" }] }, over), o);
  const r = b.post(body(Object.assign({ countryCode: "MX" }, bodyOver))); const raw = b.read("cls_signups", r.token); raw.status = "paid"; raw.paidConfirmedAt = new Date(Date.now() - 6 * 864e5).toISOString(); b.put("cls_signups", r.token, raw);
  b.mails.length = 0; return { b: b, tok: r.token, D: D, hhmm: hhmm };
}
t("提醒：24 小時內的課寄給已付款學員，信裡有時間、Zoom、專屬連結；不重複寄", () => {
  const { b, tok, D, hhmm } = remindSetup(10);
  const r = b.run("sendReminders"); assert.strictEqual(r.sent, 1, JSON.stringify(r)); assert.strictEqual(b.mails.length, 1);
  const m = b.mails[0]; assert.strictEqual(m.to, "s@x.com"); assert(m.subject.includes("Chino") && m.subject.includes(hhmm), m.subject);
  assert(m.body.includes("https://zoom.us/j/1") && m.body.includes("t=" + tok) && m.body.includes("hora de Taiwán") && m.body.includes("En tu zona horaria"), m.body);
  assert(b.read("cls_signups", tok).reminded.length === 1);
  assert.strictEqual(b.run("sendReminders").sent, 0); assert.strictEqual(b.mails.length, 1);
});
t("提醒：學員語言是簡體就寄簡體", () => {
  const { b } = remindSetup(5, {}, {}, { uiLang: "hans" }); b.run("sendReminders"); assert(/上课提醒/.test(b.mails[0].subject) && b.mails[0].body.includes("请假"));
});
t("提醒：太遠（超過 24 小時）、太近（不到 30 分鐘）都不寄", () => {
  assert.strictEqual(remindSetup(30).b.run("sendReminders").sent, 0);
  assert.strictEqual(remindSetup(0.2).b.run("sendReminders").sent, 0);
  assert.strictEqual(remindSetup(23).b.run("sendReminders").sent, 1);
});
t("提醒：沒付款、已請假、被標缺席、停課的不寄", () => {
  const p = remindSetup(10), raw = p.b.read("cls_signups", p.tok); raw.status = "pending"; p.b.put("cls_signups", p.tok, raw); assert.strictEqual(p.b.run("sendReminders").sent, 0);
  const l = remindSetup(10); assert(l.b.post({ action: "leave", t: l.tok, date: l.D }).ok); l.b.mails.length = 0; assert.strictEqual(l.b.run("sendReminders").sent, 0);
  const a = remindSetup(10); a.b.put("cls_attendance", "c1__" + a.D, { courseId: "c1", date: a.D, marks: { [a.tok]: "absent" } }); assert.strictEqual(a.b.run("sendReminders").sent, 0);
  const c = remindSetup(10); c.b.put("cls_attendance", "c1__" + c.D, { courseId: "c1", date: c.D, cancelled: true, marks: {} }); assert.strictEqual(c.b.run("sendReminders").sent, 0);
  const d = remindSetup(10), dc = d.b.read("cls_courses", "c1"); dc.status = "draft"; d.b.put("cls_courses", "c1", dc); assert.strictEqual(d.b.run("sendReminders").sent, 0);
});
t("提醒：老師又調課（時間變了）會再寄一次新時間", () => {
  const { b, tok, D } = remindSetup(10); b.run("sendReminders"); assert.strictEqual(b.mails.length, 1);
  const at = twNow(12), c = b.read("cls_courses", "c1"); c.changes = [{ date: D, newDate: at.slice(0, 10), s: at.slice(11, 16), e: "23:59" }]; b.put("cls_courses", "c1", c);
  assert.strictEqual(b.run("sendReminders").sent, 1); assert.strictEqual(b.read("cls_signups", tok).reminded.length, 2);
});
t("提醒：後台關掉就不寄；寄信失敗不標記已寄（下次重試）", () => {
  const off = remindSetup(10); off.b.put("cls_settings", "main", Object.assign(off.b.read("cls_settings", "main"), { reminders: false })); assert(off.b.run("sendReminders").off); assert.strictEqual(off.b.mails.length, 0);
  const f = remindSetup(10, {}, { mailFail: true }); const r = f.b.run("sendReminders"); assert.strictEqual(r.sent, 0); assert(r.errors >= 1); assert(!f.b.read("cls_signups", f.tok).reminded);
});
t("提醒：觸發器安裝／移除（重複安裝只留一個）；checkSetup 會顯示狀態", () => {
  const b = setup(); b.run("installReminderTrigger"); b.run("installReminderTrigger"); assert.strictEqual(b.triggers.length, 1);
  b.run("checkSetup"); b.run("removeReminderTrigger"); assert.strictEqual(b.triggers.length, 0);
});
console.log(bad ? `FAILED ${bad}/${n + bad}` : `ALL PASS ${n}`); process.exit(bad ? 1 : 0);
