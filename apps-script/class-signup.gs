/* =====================================================================
   團班報名 · 後端（Google Apps Script）
   給報名頁 class/index.html 和學員個人頁 class/my/index.html 用。
   跟「訂閱群組」的舊後端完全獨立，互不影響。

   它做的事
     GET  ?action=courses            班級列表（只回傳公開欄位）
     GET  ?action=payinfo&courseId=  該班的實際價格、付款資料（披索轉帳資料在這一步才回傳）
     POST action=signup              送出報名：存匯款截圖到你的私人雲端硬碟、寫進 Firestore、寄信
     GET  ?action=my&t=專屬代碼       學員個人頁；老師標「已付款」之後才回傳 Zoom 連結與教材

   Firestore 集合（跟 sub_、site_ 不會撞名）
     cls_courses   班級（公開欄位）        cls_private  Zoom 連結與教材（只有已付款學員看得到）
     cls_signups   報名紀錄                cls_settings 設定（main：轉帳資料、PayPal、匯率…）

   ---------------------------------------------------------------------
   部署步驟（第一次）
   1. script.google.com → 新增專案，取名「團班報名後端」，把這個檔案整份貼進 Code.gs。
   2. 專案設定（齒輪）→ 勾選「顯示 appsscript.json 資訊清單檔案」，
      把檔案內容換成這段（要有 datastore 權限，才能讀寫 Firestore）：
        {
          "timeZone": "Asia/Taipei",
          "exceptionLogging": "STACKDRIVER",
          "runtimeVersion": "V8",
          "oauthScopes": [
            "https://www.googleapis.com/auth/datastore",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/script.send_mail",
            "https://www.googleapis.com/auth/script.external_request"
          ],
          "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
        }
   3. 專案設定 → Google Cloud Platform (GCP) 專案 → 變更專案，
      填 Firebase 專案 subscription-48d3c 的專案編號：276281656991。
      （舊的訂閱後端如果已經這樣設過，這裡照做一次就好。）
   4. 專案設定 → 指令碼屬性，新增（都是選填）：
        NOTIFY_EMAIL     收通知信的信箱（不填就用你自己的）
        SITE_BASE        https://wangchiapin.github.io/subscription
        DRIVE_FOLDER_ID  放匯款截圖的雲端硬碟資料夾 ID（不填會自動建一個「團班報名匯款截圖」）
   5. 在編輯器上方選 checkSetup，按「執行」，依畫面授權。執行紀錄看到 OK 就成功。
   6. 部署 → 新增部署作業 → 類型「網頁應用程式」
        執行身分：我    誰可以存取：所有人
      複製「網頁應用程式網址」，貼到 class/index.html 和 class/my/index.html 最上面的 API_URL。
   7. 之後改了這個檔案，要「部署 → 管理部署作業 → 編輯 → 新版本」，網址才會用新程式。
   ===================================================================== */

const PROJECT_ID = "subscription-48d3c";
const FS_BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";
const COLL = { courses: "cls_courses", priv: "cls_private", signups: "cls_signups", settings: "cls_settings" };
const SITE_BASE_DEFAULT = "https://wangchiapin.github.io/subscription";
const COUNTED = ["pending", "paid"];                       // 佔名額的報名狀態
const ACTIVE_DUP = ["pending", "paid", "waitlist"];        // 同一信箱不能重複報名同一班
const VISIBLE = ["open", "confirmed", "full"];             // 報名頁看得到的班級狀態
const PUBLIC_FIELDS = ["status", "level", "joinMode", "coverUrl", "title", "intro", "rules", "refund", "note",
  "startDate", "endDate", "signupDeadline", "slots", "capacity", "minStudents", "taken", "allowWaitlist",
  "priceUnit", "priceMXN", "priceUSD", "promoMXN", "promoUSD", "promoUntil", "sortOrder"];
const REF_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/* ---------------------------------------------------------------------
   Firestore REST（用部署者的 Google 帳號權限，不受 Firestore 規則限制）
   --------------------------------------------------------------------- */
function toFsValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue_) } };
  if (typeof v === "object") return { mapValue: { fields: toFsFields_(v) } };
  return { stringValue: String(v) };
}
function toFsFields_(o) {
  const f = {};
  Object.keys(o).forEach(function (k) { if (o[k] !== undefined) f[k] = toFsValue_(o[k]); });
  return f;
}
function fromFsValue_(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFsValue_);
  if ("mapValue" in v) return fromFsFields_(v.mapValue.fields || {});
  return null;
}
function fromFsFields_(f) {
  const o = {};
  Object.keys(f || {}).forEach(function (k) { o[k] = fromFsValue_(f[k]); });
  return o;
}
function fromFsDoc_(d) {
  const o = fromFsFields_(d.fields || {});
  o.id = String(d.name || "").split("/").pop();
  return o;
}
function fsCall_(method, url, payload) {
  const opt = { method: method, headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (payload !== undefined) { opt.contentType = "application/json"; opt.payload = JSON.stringify(payload); }
  const res = UrlFetchApp.fetch(url, opt), code = res.getResponseCode(), text = res.getContentText();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  if (code === 404) return { notFound: true };
  if (code < 200 || code >= 300) throw new Error("Firestore " + method + " " + code + ": " + text.slice(0, 300));
  return body;
}
function fsGet_(coll, id) {
  const r = fsCall_("get", FS_BASE + "/" + coll + "/" + encodeURIComponent(id));
  return r && !r.notFound ? fromFsDoc_(r) : null;
}
function fsList_(coll) {
  const out = []; let token = "";
  for (let i = 0; i < 20; i++) {
    const r = fsCall_("get", FS_BASE + "/" + coll + "?pageSize=300" + (token ? "&pageToken=" + encodeURIComponent(token) : ""));
    if (!r || r.notFound) break;
    (r.documents || []).forEach(function (d) { out.push(fromFsDoc_(d)); });
    token = r.nextPageToken || "";
    if (!token) break;
  }
  return out;
}
function fsCreate_(coll, id, obj) {
  const r = fsCall_("post", FS_BASE + "/" + coll + "?documentId=" + encodeURIComponent(id), { fields: toFsFields_(obj) });
  return fromFsDoc_(r);
}
function fsPatch_(coll, id, obj) {
  const keys = Object.keys(obj).filter(function (k) { return obj[k] !== undefined; });
  const mask = keys.map(function (k) { return "updateMask.fieldPaths=" + encodeURIComponent(k); }).join("&");
  return fsCall_("patch", FS_BASE + "/" + coll + "/" + encodeURIComponent(id) + "?" + mask, { fields: toFsFields_(obj) });
}
function fsWhereEq_(coll, field, value) {
  const r = fsCall_("post", FS_BASE + ":runQuery", {
    structuredQuery: {
      from: [{ collectionId: coll }],
      where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toFsValue_(value) } }
    }
  });
  return (r || []).filter(function (x) { return x.document; }).map(function (x) { return fromFsDoc_(x.document); });
}

/* ---------------------------------------------------------------------
   小工具
   --------------------------------------------------------------------- */
function twToday_() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
const isYmd_ = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); };
const clean_ = function (s, n) { return String(s === undefined || s === null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n); };
const cleanLong_ = function (s, n) { return String(s === undefined || s === null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n); };
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function prop_(k, d) { const v = PropertiesService.getScriptProperties().getProperty(k); return v ? v : d; }
function siteBase_() { return String(prop_("SITE_BASE", SITE_BASE_DEFAULT)).replace(/\/+$/, ""); }
function notifyEmail_() { return prop_("NOTIFY_EMAIL", Session.getEffectiveUser().getEmail()); }
function pickText_(obj, lang) {
  if (!obj || typeof obj !== "object") return String(obj || "");
  const order = lang === "es" ? ["es", "hant", "hans"] : lang === "hans" ? ["hans", "hant", "es"] : ["hant", "hans", "es"];
  for (let i = 0; i < order.length; i++) if (obj[order[i]]) return obj[order[i]];
  return "";
}
function newRef_() { let s = ""; for (let i = 0; i < 6; i++) s += REF_CHARS.charAt(Math.floor(Math.random() * REF_CHARS.length)); return s; }
function newToken_() { return Utilities.getUuid().replace(/-/g, "").toLowerCase(); }
const validToken_ = function (t) { return /^[a-f0-9]{32}$/.test(String(t || "")); };

/* ---------------------------------------------------------------------
   班級：公開欄位、狀態、價格
   --------------------------------------------------------------------- */
function publicCourse_(c) {
  const o = { id: c.id };
  PUBLIC_FIELDS.forEach(function (k) { if (c[k] !== undefined) o[k] = c[k]; });
  return o;
}
/* open 可報名；waitlist 額滿但收候補；full 額滿；deadline 報名截止；hidden 不顯示 */
function courseState_(c, today) {
  if (VISIBLE.indexOf(c.status) < 0) return "hidden";
  if (isYmd_(c.signupDeadline) && today > c.signupDeadline) return "deadline";
  const cap = Number(c.capacity) || 0, taken = Number(c.taken) || 0;
  if (c.status === "full" || (cap > 0 && taken >= cap)) return c.allowWaitlist ? "waitlist" : "full";
  return "open";
}
/* 優惠價：台灣日期 ≤ 截止日、且比原價低才生效（跟後台、訂閱頁同一套規則） */
function priceOptions_(c, today) {
  const promoOn = isYmd_(c.promoUntil) && today <= c.promoUntil;
  return ["MXN", "USD"].map(function (cur) {
    const list = Number(c["price" + cur]) || 0;
    if (!(list > 0)) return null;
    const pv = Number(c["promo" + cur]) || 0;
    return promoOn && pv > 0 && pv < list ? { currency: cur, amount: pv, list: list, promo: true } : { currency: cur, amount: list };
  }).filter(Boolean);
}
function loadSettings_() { return fsGet_(COLL.settings, "main") || {}; }
function bankInfo_(s) {
  const m = s.mxn || {};
  return s.bankMode === "show" && m.clabe ? { bank: m.bank || "", holder: m.holder || "", clabe: m.clabe || "", note: m.note || "" } : null;
}

/* ---------------------------------------------------------------------
   API：班級列表、付款資料、個人頁
   --------------------------------------------------------------------- */
function apiCourses_() {
  const today = twToday_(), s = loadSettings_();
  const list = fsList_(COLL.courses).map(function (c) {
    const state = courseState_(c, today);
    if (state === "hidden") return null;
    const o = publicCourse_(c); o.state = state; o.options = priceOptions_(c, today);
    return o;
  }).filter(Boolean).sort(function (a, b) {
    return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(a.startDate || "").localeCompare(String(b.startDate || ""));
  });
  return { ok: true, today: today, courses: list, contact: { email: s.contactEmail || "", ig: s.igUrl || "" } };
}
function apiPayInfo_(courseId) {
  const today = twToday_(), c = courseId ? fsGet_(COLL.courses, courseId) : null;
  if (!c) return { ok: false, error: "course" };
  const state = courseState_(c, today);
  if (state === "hidden") return { ok: false, error: "closed" };
  const s = loadSettings_(), options = priceOptions_(c, today);
  return {
    ok: true, state: state, options: options, promoUntil: options.some(function (o) { return o.promo; }) ? c.promoUntil : "",
    paypal: { link: s.paypalMe || "" },
    bankMode: bankInfo_(s) ? "show" : "contact", bank: bankInfo_(s),
    contact: { email: s.contactEmail || "", ig: s.igUrl || "" }
  };
}
function apiMy_(token) {
  if (!validToken_(token)) return { ok: false, error: "token" };
  const su = fsGet_(COLL.signups, token);
  if (!su) return { ok: false, error: "notfound" };
  const c = fsGet_(COLL.courses, su.courseId), s = loadSettings_();
  const out = {
    ok: true, today: twToday_(),
    signup: {
      name: su.name, ref: su.ref, status: su.status, courseId: su.courseId, currency: su.currency || "", amount: su.expectedAmount || 0,
      desiredStart: su.desiredStart || "", createdAt: su.createdAt || "", paidAt: su.paidConfirmedAt || "", uiLang: su.uiLang || "es"
    },
    course: c ? publicCourse_(c) : { id: su.courseId, title: su.courseTitle || {} },
    contact: { email: s.contactEmail || "", ig: s.igUrl || "" }
  };
  if (su.status === "paid") {
    const p = fsGet_(COLL.priv, su.courseId) || {};
    out.access = { zoomUrl: p.zoomUrl || "", zoomNote: p.zoomNote || "", materials: Array.isArray(p.materials) ? p.materials : [] };
  }
  return out;
}

/* ---------------------------------------------------------------------
   名額：以 Firestore 實際報名數為準
   --------------------------------------------------------------------- */
function countTaken_(courseId) {
  return fsWhereEq_(COLL.signups, "courseId", courseId).filter(function (x) { return COUNTED.indexOf(x.status) >= 0; }).length;
}
function recount_(courseId) {
  const n = countTaken_(courseId);
  try { fsPatch_(COLL.courses, courseId, { taken: n }); } catch (e) { console.error("recount " + e); }
  return n;
}

/* ---------------------------------------------------------------------
   送出報名
   --------------------------------------------------------------------- */
function getFolder_() {
  const id = prop_("DRIVE_FOLDER_ID", "");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { console.error("folder " + e); } }
  const f = DriveApp.createFolder("團班報名匯款截圖");
  PropertiesService.getScriptProperties().setProperty("DRIVE_FOLDER_ID", f.getId());
  return f;
}
function saveShot_(shot, ref, name) {
  if (!shot || shot.mime !== "image/jpeg" || typeof shot.data !== "string" || shot.data.length < 200 || shot.data.length > 6000000) return null;
  const bytes = Utilities.base64Decode(shot.data);
  if (!bytes || bytes.length < 100 || (bytes[0] & 255) !== 255 || (bytes[1] & 255) !== 216) return null;
  const safe = String(name || "").replace(/[^\w一-龥]+/g, "_").slice(0, 30);
  const file = getFolder_().createFile(Utilities.newBlob(bytes, "image/jpeg", ref + "_" + safe + ".jpg"));
  return { url: file.getUrl(), file: file };
}
function rateLimited_(email) {
  const cache = CacheService.getScriptCache(), key = "rl_" + email.replace(/[^a-z0-9@._-]/g, "").slice(0, 120);
  const n = Number(cache.get(key) || 0);
  if (n >= 5) return true;
  cache.put(key, String(n + 1), 3600);
  return false;
}
const SOURCES_ = ["ig", "fb", "friend", "wa", "other"];   // 「從哪裡知道」可填的值
const SOURCE_LABEL_ = { ig: "Instagram", fb: "Facebook", friend: "朋友介紹", wa: "WhatsApp 群組", other: "其他" };

function apiSignup_(b) {
  if (b.hp) return { ok: true, ref: "------" };                      // 防機器人欄位被填：假裝成功
  const today = twToday_();
  const name = clean_(b.name, 80), email = clean_(b.email, 120).toLowerCase();
  const wa = "+" + String(b.whatsapp || "").replace(/\D/g, "");
  if (name.length < 2) return { ok: false, error: "name" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "email" };
  if (wa.length < 9 || wa.length > 16) return { ok: false, error: "whatsapp" };
  if (!b.acceptedRules) return { ok: false, error: "consent" };
  if (!b.courseId) return { ok: false, error: "course" };
  const uiLang = ["hans", "hant", "es"].indexOf(b.uiLang) >= 0 ? b.uiLang : "es";
  if (rateLimited_(email)) return { ok: false, error: "rate" };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let saved = null;
  try {
    const c = fsGet_(COLL.courses, String(b.courseId));
    if (!c) return { ok: false, error: "course" };
    c.taken = countTaken_(c.id);
    const state = courseState_(c, today);
    if (state === "hidden") return { ok: false, error: "closed" };
    if (state === "deadline") return { ok: false, error: "deadline" };
    if (state === "full") return { ok: false, error: "full" };
    const waitlist = state === "waitlist";

    const dup = fsWhereEq_(COLL.signups, "courseId", c.id).filter(function (x) {
      return String(x.email || "").toLowerCase() === email && ACTIVE_DUP.indexOf(x.status) >= 0;
    });
    if (dup.length) return { ok: false, error: "dup", ref: dup[0].ref };

    const ref = newRef_(), token = newToken_();
    const doc = {
      courseId: c.id, courseTitle: c.title || {}, ref: ref, status: waitlist ? "waitlist" : "pending",
      name: name, email: email, whatsapp: wa,
      country: clean_(b.nationality || b.country, 40), countryCode: clean_(b.countryCode, 8),
      studentLevel: clean_(b.studentLevel, 20), source: SOURCES_.indexOf(b.source) >= 0 ? b.source : "", desiredStart: isYmd_(b.desiredStart) ? b.desiredStart : "",
      note: cleanLong_(b.note, 500), uiLang: uiLang,
      acceptedRules: true, acceptedAt: new Date().toISOString(), createdAt: new Date().toISOString()
    };
    if (!waitlist) {
      const opt = priceOptions_(c, today).filter(function (o) { return o.currency === b.currency; })[0];
      if (!opt) return { ok: false, error: "currency" };
      const payRef = clean_(b.ref, 80);
      if (payRef.length < 6) return { ok: false, error: "payref" };
      if (!clean_(b.paidAt, 20)) return { ok: false, error: "paidAt" };
      saved = saveShot_(b.screenshot, ref, name);
      if (!saved) return { ok: false, error: "shot" };
      doc.currency = opt.currency; doc.expectedAmount = opt.amount; doc.listAmount = opt.list || opt.amount; doc.promoApplied = !!opt.promo;
      doc.method = opt.currency === "MXN" ? "spei" : "paypal";
      doc.payRef = payRef; doc.paidAt = clean_(b.paidAt, 20); doc.screenshotUrl = saved.url;
      doc.dupRef = fsWhereEq_(COLL.signups, "payRef", payRef).length > 0;
    }
    fsCreate_(COLL.signups, token, doc);
    saved = null;                                                    // 已寫入 Firestore，截圖要保留
    const taken = recount_(c.id);
    c.taken = taken;
    try { notify_(c, doc, token); } catch (e) { console.error("mail " + e); }
    return { ok: true, ref: ref, token: token, status: doc.status, myUrl: myUrl_(token, uiLang) };
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    if (saved && saved.file) { try { saved.file.setTrashed(true); } catch (e) { /* 忽略 */ } }
    return { ok: false, error: "server" };
  } finally { lock.releaseLock(); }
}

/* ---------------------------------------------------------------------
   信件
   --------------------------------------------------------------------- */
function myUrl_(token, lang) { return siteBase_() + "/class/my/?t=" + token + "&lang=" + lang; }
function notify_(c, doc, token) {
  const title = pickText_(c.title, "hant");
  const lines = [
    (doc.status === "waitlist" ? "【候補】" : "【新報名】") + title + "　" + doc.name + "　編號 " + doc.ref,
    "", "姓名：" + doc.name, "Email：" + doc.email, "WhatsApp：" + doc.whatsapp, "國家：" + doc.country,
    "程度：" + (doc.studentLevel || "-"), "從哪裡知道：" + (SOURCE_LABEL_[doc.source] || "-"), "想開始上課：" + (doc.desiredStart || "最近一次"),
    doc.status === "waitlist" ? "（額滿，已加入候補，未付款）" : "付款：" + doc.currency + " " + doc.expectedAmount + "（" + (doc.method === "spei" ? "披索轉帳" : "PayPal") + "）　憑證編號：" + doc.payRef + (doc.dupRef ? "　⚠ 這個編號跟別筆重複" : ""),
    doc.screenshotUrl ? "匯款截圖：" + doc.screenshotUrl : "", doc.note ? "備註：" + doc.note : "",
    "", "到後台確認：" + siteBase_() + "/class/admin/"
  ].filter(function (x, i) { return x !== "" || i > 0; });
  MailApp.sendEmail({ to: notifyEmail_(), subject: "[團班報名] " + doc.name + " → " + title + "（" + doc.ref + "）", body: lines.join("\n"), name: "團班報名" });
  MailApp.sendEmail({ to: doc.email, subject: studentSubject_(doc.uiLang, title), body: studentBody_(doc, title, myUrl_(token, doc.uiLang)), name: "每天一分鐘 · Ben", replyTo: notifyEmail_() });
}
function studentSubject_(lang, title) {
  return lang === "es" ? "Recibimos tu inscripción: " + title : lang === "hans" ? "已收到你的报名：" + title : "已收到你的報名：" + title;
}
function studentBody_(doc, title, url) {
  const w = doc.status === "waitlist";
  if (doc.uiLang === "es") {
    return "Hola " + doc.name + ",\n\n" + (w ? "Ahora estás en la lista de espera de «" + title + "». Te avisaremos si se libera un lugar.\n"
      : "Recibimos tu inscripción a «" + title + "». Revisaremos tu pago y te confirmaremos pronto.\n")
      + "\nTu referencia: " + doc.ref + "\nTu enlace personal (guárdalo): " + url
      + "\n\nCuando confirmemos tu pago, en ese enlace verás el enlace de Zoom y los materiales.\n\nBen";
  }
  const hans = doc.uiLang === "hans", T = function (a, b) { return hans ? a : b; };
  return doc.name + " " + T("你好，", "你好，") + "\n\n" + (w ? T("你已加入「" + title + "」的候补名单，有名额时会通知你。", "你已加入「" + title + "」的候補名單，有名額時會通知你。")
    : T("已收到你对「" + title + "」的报名，我核对付款后会尽快确认。", "已收到你對「" + title + "」的報名，我核對付款後會盡快確認。"))
    + "\n\n" + T("报名编号：", "報名編號：") + doc.ref + "\n" + T("你的专属连结（请保存）：", "你的專屬連結（請保存）：") + url
    + "\n\n" + T("付款确认后，从这个连结就能看到上课连结和教材。", "付款確認後，從這個連結就能看到上課連結和教材。") + "\n\nBen";
}

/* ---------------------------------------------------------------------
   入口
   --------------------------------------------------------------------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "courses") return json_(apiCourses_());
    if (p.action === "payinfo") return json_(apiPayInfo_(p.courseId));
    if (p.action === "my") return json_(apiMy_(p.t));
    return json_({ ok: false, error: "action" });
  } catch (err) { console.error(err && err.stack ? err.stack : String(err)); return json_({ ok: false, error: "server" }); }
}
function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!b.action || b.action === "signup") return json_(apiSignup_(b));
    return json_({ ok: false, error: "action" });
  } catch (err) { console.error(err && err.stack ? err.stack : String(err)); return json_({ ok: false, error: "server" }); }
}

/* 在編輯器按「執行」：第一次授權，並檢查連線是否正常 */
function checkSetup() {
  const s = loadSettings_(), courses = fsList_(COLL.courses);
  const folder = getFolder_();
  Logger.log("OK　Firestore 連線正常：設定 " + (Object.keys(s).length ? "已建立" : "尚未建立（到後台設定頁儲存一次）") + "，班級 " + courses.length + " 個");
  Logger.log("截圖資料夾：" + folder.getUrl());
  Logger.log("通知信箱：" + notifyEmail_() + "　今日寄信額度：" + MailApp.getRemainingDailyQuota());
}
