/* 團班後台
   登入：Google 帳號，只有 ALLOWED_EMAILS 裡的信箱能進；真正的防線是 Firestore 規則（見 README）。
   網址加 ?demo=1 會用「本機示範模式」：資料只存在這個瀏覽器，不用登入，也不會碰到真的資料。 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCHZz8Hh7m45bJfZC9aK_f_NvUD-aUeuzU",
  authDomain: "subscription-48d3c.firebaseapp.com",
  projectId: "subscription-48d3c",
  storageBucket: "subscription-48d3c.firebasestorage.app",
  messagingSenderId: "276281656991",
  appId: "1:276281656991:web:de242ba22373816c3044aa",
  measurementId: "G-VSH3HQ2K21"
};
const ALLOWED_EMAILS = ["a2224907@gmail.com"];
const COLL = { courses: "cls_courses", priv: "cls_private", signups: "cls_signups", settings: "cls_settings" };   // Apps Script（class-signup.gs）也用這些名字
const SITE_BASE = "https://wangchiapin.github.io/subscription";
const DEMO_MODE = new URLSearchParams(location.search).has("demo");
const FIREBASE_READY = !DEMO_MODE && !String(FIREBASE_CONFIG.apiKey).startsWith("YOUR_");
const allowList = ALLOWED_EMAILS.map(e => e.toLowerCase());
const isAllowed = email => allowList.includes(String(email || "").toLowerCase());

/* ===================================================================== 常數 */
const COUNTED = ["pending", "paid"];                                   // 佔名額
const COURSE_STATUS = { draft: "草稿（不公開）", open: "招生中", confirmed: "已成班", full: "額滿", closed: "未成班關閉／結束" };
const SIGNUP_STATUS = { pending: "待確認", paid: "已付款", waitlist: "候補", refund_pending: "待退款", refunded: "已退款", cancelled: "已取消" };
const LEVELS = { zero: "零基礎", basic: "初級", mid: "中級", high: "中高級以上", all: "不限程度" };
const SOURCES = { ig: "Instagram", fb: "Facebook", friend: "朋友介紹", wa: "WhatsApp 群組", other: "其他" };
const STUDENT_LEVELS = { zero: "完全沒學過", some: "學過一點", basic: "初級", mid: "中級", high: "中高級以上" };
const JOIN_MODES = { rolling: "隨時可加入", monthly: "每月開新梯次" };
const UNITS = { month: "每月", course: "整期", session: "每堂" };
const WD = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];
const LANGS = [["hant", "繁體"], ["hans", "簡體"], ["es", "西文"]];
const TEXTS = [["title", "班級名稱", "text"], ["intro", "班級介紹", "area"], ["rules", "班級規定", "area"], ["refund", "退費、請假、補課規定", "area"], ["note", "其他說明（選填）", "area"]];
const DEFAULT_RATES = { USD: 32, MXN: 1.7 };
const COUNTRY_TZ = { MX: "America/Mexico_City", ES: "Europe/Madrid", CO: "America/Bogota", AR: "America/Argentina/Buenos_Aires", CL: "America/Santiago", PE: "America/Lima", VE: "America/Caracas",
  EC: "America/Guayaquil", GT: "America/Guatemala", CR: "America/Costa_Rica", PA: "America/Panama", UY: "America/Montevideo", PY: "America/Asuncion", BO: "America/La_Paz", DO: "America/Santo_Domingo", CU: "America/Havana", US: "America/New_York" };

/* ===================================================================== 小工具 */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = CLS.esc;
const pad = CLS.pad;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clean = o => JSON.parse(JSON.stringify(o));
const isYmd = CLS.isYmd;
const twToday = CLS.twToday;
const num = v => { const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
const money = (n, c) => c === "MXN" ? `$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} MXN` : c === "USD" ? `US$ ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;
const titleOf = o => (o && (o.hant || o.hans || o.es)) || "（未命名）";
const fmtTs = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isUrl = s => /^https?:\/\/\S+$/i.test(String(s || ""));
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800);
}
function openDlg(title, html) { $("#dlg-title").textContent = title; $("#dlg-body").innerHTML = html; const d = $("#dlg"); if (!d.open) d.showModal(); }
const closeDlg = () => { const d = $("#dlg"); if (d.open) d.close(); };
function confirmBox(title, text, okLabel) {
  return new Promise(res => {
    $("#confirm-body").innerHTML = `<h2 style="font-size:18px;margin:0 0 8px">${esc(title)}</h2>${text ? `<p class="hint">${esc(text)}</p>` : ""}`;
    $("#confirm-ok").textContent = okLabel || "確定";
    const d = $("#confirm"), done = v => { d.close(); res(v); };
    $("#confirm-ok").onclick = () => done(true); $("#confirm-cancel").onclick = () => done(false);
    d.oncancel = () => res(false); d.showModal();
  });
}

/* ===================================================================== 資料層：本機示範 或 Firestore（含登入） */
const LS_KEY = "cls-admin-v1";
const local = {
  mode: "local",
  data: { courses: [], priv: [], signups: [], settings: null },
  async start(cb) {
    this.cb = cb;
    try { const raw = localStorage.getItem(LS_KEY); if (raw) this.data = JSON.parse(raw); } catch (e) { /* 忽略 */ }
    ["courses", "priv", "signups"].forEach(k => { this.data[k] = this.data[k] || []; });
    cb(this.data);
  },
  persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) { /* 忽略 */ } this.cb(this.data); },
  async put(kind, obj) {
    obj = clean(obj);
    if (kind === "settings") this.data.settings = obj;
    else { const arr = this.data[kind], i = arr.findIndex(x => x.id === obj.id); if (i >= 0) arr[i] = obj; else arr.push(obj); }
    this.persist();
  },
  async remove(kind, ids) { ids = [].concat(ids); this.data[kind] = this.data[kind].filter(x => !ids.includes(x.id)); this.persist(); },
  async wipe() { this.data = { courses: [], priv: [], signups: [], settings: null }; this.persist(); }
};

async function makeFirestore() {
  const V = "12.17.1";
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const au = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const db = fs.getFirestore(app), auth = au.getAuth(app);
  const data = { courses: [], priv: [], signups: [], settings: null };
  let unsubs = [];
  const api = {
    mode: "firebase",
    onAuth: cb => au.onAuthStateChanged(auth, cb),
    async signIn() {
      const p = new au.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
      try { await au.signInWithPopup(auth, p); }
      catch (e) { if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return au.signInWithRedirect(auth, p); throw e; }
    },
    signOut: () => au.signOut(auth),
    start(cb) {
      api.stop();
      const onErr = err => { console.error(err); toast(err.code === "permission-denied" ? "沒有讀寫權限，請確認 Firestore 規則與登入帳號" : "讀取資料失敗"); };
      const watch = kind => fs.onSnapshot(fs.collection(db, COLL[kind]), snap => { data[kind] = snap.docs.map(d => ({ ...d.data(), id: d.id })); cb(data); }, onErr);
      unsubs = [watch("courses"), watch("priv"), watch("signups"),
        fs.onSnapshot(fs.doc(db, COLL.settings, "main"), snap => { data.settings = snap.exists() ? snap.data() : null; cb(data); }, onErr)];
    },
    stop() { unsubs.forEach(u => u()); unsubs = []; data.courses = []; data.priv = []; data.signups = []; data.settings = null; },
    async put(kind, obj) {
      obj = clean(obj);
      if (kind === "settings") return fs.setDoc(fs.doc(db, COLL.settings, "main"), obj);
      const { id, ...rest } = obj; return fs.setDoc(fs.doc(db, COLL[kind], id), rest);
    },
    async remove(kind, ids) { const b = fs.writeBatch(db); [].concat(ids).forEach(id => b.delete(fs.doc(db, COLL[kind], id))); return b.commit(); }
  };
  return api;
}

/* ===================================================================== 狀態與計算 */
const state = { courses: [], priv: [], signups: [], settings: {}, view: "courses", filter: "pending", courseFilter: "", q: "", mode: "local", user: null, loginMsg: "", open: new Set() };
let store = local;
const mergeSettings = s => ({ ...(s || {}), rates: { ...DEFAULT_RATES, ...((s && s.rates) || {}) }, mxn: { ...((s && s.mxn) || {}) } });
const courseById = id => state.courses.find(c => c.id === id);
const privOf = id => state.priv.find(p => p.id === id) || { id };
const signupById = id => state.signups.find(s => s.id === id);
const signupsOf = cid => state.signups.filter(s => s.courseId === cid);
const takenOf = cid => signupsOf(cid).filter(s => COUNTED.includes(s.status)).length;
const pendingCount = () => state.signups.filter(s => s.status === "pending").length;
const courseTitle = cid => { const c = courseById(cid); if (c) return titleOf(c.title); const s = state.signups.find(x => x.courseId === cid); return s ? titleOf(s.courseTitle) + "（已刪除）" : "（已刪除的班級）"; };
const rates = () => state.settings.rates;
const toTwd = (amt, cur) => cur === "TWD" ? Math.round(amt) : Math.round(amt * (rates()[cur] || 0));
const promoActive = c => isYmd(c.promoUntil) && twToday() <= c.promoUntil;
const scheduleText = c => (c.slots || []).map(s => `${WD[s.d - 1]} ${s.s}–${s.e}`).join("、") || "未設定";
function priceText(c) {
  const bits = ["MXN", "USD"].filter(k => num(c["price" + k])).map(k => {
    const pv = num(c["promo" + k]);
    return `${money(c["price" + k], k)}${pv ? `（優惠 ${money(pv, k)}）` : ""}`;
  });
  return bits.length ? bits.join(" ／ ") + `　${UNITS[c.priceUnit || "month"]}${c.promoUntil ? `，優惠至 ${c.promoUntil}${promoActive(c) ? "" : "（已過期）"}` : ""}` : "未設定";
}
function missingLangs(c) {
  const miss = new Set();
  ["title", "intro", "rules", "refund"].forEach(k => {
    const o = c[k] || {}, any = LANGS.some(l => o[l[0]]);
    if (any) LANGS.forEach(l => { if (!o[l[0]]) miss.add(l[1]); });
  });
  return Array.from(miss);
}
async function syncTaken(cid) {
  const c = courseById(cid); if (!c) return;
  const n = takenOf(cid); if (Number(c.taken) === n) return;
  try { await store.put("courses", { ...c, taken: n }); } catch (e) { console.error(e); }
}
async function setStatus(s, status, extra) {
  const o = { ...s, status, statusAt: new Date().toISOString(), ...(extra || {}) };
  await store.put("signups", o);
  state.signups = state.signups.map(x => x.id === o.id ? o : x);           // 先更新本機，名額才算得對
  await syncTaken(s.courseId);
}

/* ===================================================================== 畫面：框架 */
function render() { renderTop(); renderTabs(); renderMain(); }
function renderTop() {
  const fb = state.mode === "firebase";
  $("#conn").textContent = fb ? (state.user ? state.user.email : "") : "本機示範模式";
  $("#logout").hidden = !fb;
  const b = $("#banner"); b.hidden = fb;
  if (!fb) b.textContent = "目前是本機示範模式：資料只存在這個瀏覽器，不是真的資料，也不需要登入。";
}
function renderTabs() {
  const tabs = [["courses", "班級"], ["signups", "報名"], ["income", "收入"], ["settings", "設定"]];
  $("#tabs").innerHTML = tabs.map(t => `<button class="tab ${state.view === t[0] ? "on" : ""}" data-act="go" data-id="${t[0]}">${t[1]}${t[0] === "signups" && pendingCount() ? `<span class="flag">${pendingCount()}</span>` : ""}</button>`).join("");
}
function renderMain() {
  const m = $("#main");
  if (state.view === "courses") m.innerHTML = viewCourses();
  else if (state.view === "signups") m.innerHTML = viewSignups();
  else if (state.view === "income") m.innerHTML = viewIncome();
  else m.innerHTML = viewSettings();
}

/* ===================================================================== 班級 */
function courseCard(c) {
  const taken = takenOf(c.id), cap = Number(c.capacity) || 0, min = Number(c.minStudents) || 0, miss = missingLangs(c);
  const reached = min > 0 && taken >= min && (c.status === "open");
  const canClose = ["open", "confirmed", "full"].includes(c.status);
  return `<article class="cc ${esc(c.status)}" data-card="${esc(c.id)}">
    <div class="cc-top"><div><h2>${esc(titleOf(c.title))}</h2>
      <span class="tag ${c.status === "open" || c.status === "confirmed" ? "good" : c.status === "full" ? "warn" : ""}">${esc(COURSE_STATUS[c.status] || c.status)}</span>
      <span class="tag">${esc(LEVELS[c.level] || "")}</span></div>
      <select data-act="set-cstatus" data-id="${esc(c.id)}" aria-label="改狀態">${Object.keys(COURSE_STATUS).map(k => `<option value="${k}" ${k === c.status ? "selected" : ""}>${COURSE_STATUS[k]}</option>`).join("")}</select></div>
    <dl class="kv" style="margin-top:10px">
      <dt>開課日</dt><dd>${esc(c.startDate || "未設定")}${c.endDate ? ` ～ ${esc(c.endDate)}` : ""}（${esc(JOIN_MODES[c.joinMode] || "")}）</dd>
      <dt>上課時間</dt><dd>${esc(scheduleText(c))}（台灣時間）</dd>
      <dt>人數</dt><dd>${taken} / ${cap || "不限"}　${min ? `最低開班 ${min} 人 ` : ""}${reached ? `<span class="okTxt">已達開班人數</span>` : ""}</dd>
      <dt>價錢</dt><dd>${esc(priceText(c))}</dd>
      ${c.signupDeadline ? `<dt>報名截止</dt><dd>${esc(c.signupDeadline)}</dd>` : ""}
      <dt>報名頁</dt><dd><a href="../#c=${esc(c.id)}" target="_blank" rel="noopener">${esc(SITE_BASE + "/class/#c=" + c.id)}</a></dd></dl>
    ${miss.length ? `<p class="hint warnTxt">還缺${esc(miss.join("、"))}的文字（學員切到那個語言會看到別的語言）</p>` : ""}
    <div class="acts"><button class="btn sm primary" data-act="edit-course" data-id="${esc(c.id)}">編輯</button>
      <button class="btn sm" data-act="course-signups" data-id="${esc(c.id)}">看報名（${signupsOf(c.id).length}）</button>
      <button class="btn sm" data-act="batch-notify" data-id="${esc(c.id)}">通知學生</button>
      <button class="btn sm" data-act="dup-course" data-id="${esc(c.id)}">複製</button>
      ${canClose ? `<button class="btn sm danger" data-act="close-course" data-id="${esc(c.id)}">未成班：關閉並標待退款</button>` : ""}
      <button class="btn sm danger" data-act="del-course" data-id="${esc(c.id)}">刪除</button></div></article>`;
}
function viewCourses() {
  const list = state.courses.slice().sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || String(b.startDate || "").localeCompare(String(a.startDate || "")));
  return `<div class="head"><h1>班級</h1><button class="btn primary" data-act="new-course">＋ 新增班級</button></div>`
    + (list.length ? list.map(courseCard).join("") : `<div class="empty">還沒有班級。<br><button class="btn primary" style="margin-top:10px" data-act="new-course">新增第一個班級</button></div>`);
}

const blankCourse = () => ({ id: uid(), status: "draft", level: "zero", joinMode: "rolling", sortOrder: 1, coverUrl: "", title: {}, intro: {}, rules: {}, refund: {}, note: {}, startDate: "", endDate: "", signupDeadline: "",
  slots: [{ d: 1, s: "21:00", e: "22:00" }], capacity: 8, minStudents: 4, taken: 0, allowWaitlist: true, priceUnit: "month", priceMXN: 0, priceUSD: 0, promoMXN: 0, promoUSD: 0, promoUntil: "" });
const sel = (name, map, val) => `<select name="${name}">${Object.keys(map).map(k => `<option value="${k}" ${String(k) === String(val) ? "selected" : ""}>${esc(map[k])}</option>`).join("")}</select>`;
const slotRow = (s = { d: 1, s: "21:00", e: "22:00" }) => `<div class="row3" data-slot><select name="slotD">${WD.map((w, i) => `<option value="${i + 1}" ${s.d === i + 1 ? "selected" : ""}>${w}</option>`).join("")}</select>
  <input type="time" name="slotS" value="${esc(s.s)}"><input type="time" name="slotE" value="${esc(s.e)}"><button type="button" class="btn sm ghost" data-act="rm-row" aria-label="刪除這一列">✕</button></div>`;
const matRow = (m = { title: "", url: "", note: "" }) => `<div class="row3 mat" data-mat><input name="matT" placeholder="名稱，例如：第 1 課講義" value="${esc(m.title)}"><input name="matU" placeholder="https://…" value="${esc(m.url)}"><input name="matN" placeholder="備註（選填）" value="${esc(m.note || "")}"><button type="button" class="btn sm ghost" data-act="rm-row" aria-label="刪除這一列">✕</button></div>`;

function openCourseForm(id) {
  const isNew = !id, c = isNew ? blankCourse() : clean(courseById(id)), p = isNew ? {} : privOf(id);
  const langPane = l => `<div data-lg="${l[0]}" ${l[0] === "hant" ? "" : "hidden"}>${l[0] === "hans" ? `<p style="margin:0 0 8px"><button type="button" class="btn sm" data-act="to-hans">用繁體自動轉成簡體（台灣用字）</button></p>` : ""}
    ${TEXTS.map(t => `<label><span class="lbl">${t[1]}（${l[1]}）</span>${t[2] === "text" ? `<input type="text" name="t_${t[0]}_${l[0]}" value="${esc((c[t[0]] || {})[l[0]] || "")}" maxlength="120">` : `<textarea name="t_${t[0]}_${l[0]}" rows="4">${esc((c[t[0]] || {})[l[0]] || "")}</textarea>`}</label>`).join("")}</div>`;
  openDlg(isNew ? "新增班級" : "編輯班級", `<form id="cf" class="form" novalidate data-id="${esc(c.id)}" data-new="${isNew ? 1 : 0}">
    <h3>基本</h3>
    <div class="grid3"><label><span class="lbl">狀態</span>${sel("status", COURSE_STATUS, c.status)}</label><label><span class="lbl">程度</span>${sel("level", LEVELS, c.level)}</label><label><span class="lbl">加入方式</span>${sel("joinMode", JOIN_MODES, c.joinMode)}</label></div>
    <div class="grid3"><label><span class="lbl">排序（小的在前）</span><input type="number" name="sortOrder" value="${esc(c.sortOrder)}"></label>
      <label style="grid-column:span 2"><span class="lbl">封面圖網址（選填）</span><input type="text" name="coverUrl" value="${esc(c.coverUrl)}" placeholder="https://…"></label></div>
    <h3>班級文字</h3>
    <div class="ltabs" id="ltabs">${LANGS.map((l, i) => `<button type="button" data-act="ltab" data-id="${l[0]}" class="${i === 0 ? "on" : ""}">${l[1]}</button>`).join("")}</div>
    ${LANGS.map(langPane).join("")}
    <h3>時間（台灣時間）</h3>
    <div class="grid3"><label><span class="lbl">開課日期</span><input type="date" name="startDate" value="${esc(c.startDate)}"></label><label><span class="lbl">結束日（選填）</span><input type="date" name="endDate" value="${esc(c.endDate)}"></label><label><span class="lbl">報名截止日（選填）</span><input type="date" name="signupDeadline" value="${esc(c.signupDeadline)}"></label></div>
    <div><span class="lbl">每週上課時間</span><div id="slots">${(c.slots || []).map(slotRow).join("")}</div><button type="button" class="btn sm" data-act="add-slot">＋ 加一個時段</button>
      <p class="hint">學員會同時看到台灣時間和自己的當地時間。</p></div>
    <h3>人數</h3>
    <div class="grid3"><label><span class="lbl">名額上限（0＝不限）</span><input type="number" name="capacity" min="0" value="${esc(c.capacity)}"></label><label><span class="lbl">最低開班人數</span><input type="number" name="minStudents" min="0" value="${esc(c.minStudents)}"></label>
      <label class="chk" style="align-self:end"><input type="checkbox" name="allowWaitlist" ${c.allowWaitlist ? "checked" : ""}><span>額滿後收候補</span></label></div>
    <h3>價錢（填 0＝不收那種幣別）</h3>
    <div class="grid3"><label><span class="lbl">墨西哥披索 MXN</span><input type="number" name="priceMXN" min="0" step="any" value="${esc(c.priceMXN || "")}"></label><label><span class="lbl">美金 USD（PayPal）</span><input type="number" name="priceUSD" min="0" step="any" value="${esc(c.priceUSD || "")}"></label><label><span class="lbl">計價單位</span>${sel("priceUnit", UNITS, c.priceUnit)}</label></div>
    <div class="grid3"><label><span class="lbl">優惠價 MXN</span><input type="number" name="promoMXN" min="0" step="any" value="${esc(c.promoMXN || "")}"></label><label><span class="lbl">優惠價 USD</span><input type="number" name="promoUSD" min="0" step="any" value="${esc(c.promoUSD || "")}"></label><label><span class="lbl">優惠截止日（台灣日期）</span><input type="date" name="promoUntil" value="${esc(c.promoUntil)}"></label></div>
    <h3>只有已付款學員看得到</h3>
    <label><span class="lbl">Zoom 連結</span><input type="text" name="zoomUrl" value="${esc(p.zoomUrl || "")}" placeholder="https://zoom.us/j/…"></label>
    <label><span class="lbl">Zoom 備註（會議號碼、密碼…）</span><textarea name="zoomNote" rows="2">${esc(p.zoomNote || "")}</textarea></label>
    <div><span class="lbl">教材與連結</span><div id="mats">${(p.materials || []).map(matRow).join("")}</div><button type="button" class="btn sm" data-act="add-mat">＋ 加一個教材</button></div>
    <label><span class="lbl">給自己的備註（學員看不到）</span><textarea name="adminNote" rows="2">${esc(p.adminNote || "")}</textarea></label>
    <div id="cf-err" class="err-box" hidden></div>
    <div class="foot sticky-foot"><button type="button" class="btn" data-act="close">取消</button><button type="submit" class="btn primary">儲存</button></div></form>`);
}
function readCourseForm() {
  const f = $("#cf"), v = n => (f.elements[n] ? f.elements[n].value : "").trim(), c = {};
  const old = courseById(f.dataset.id) || {};
  TEXTS.forEach(t => { c[t[0]] = {}; LANGS.forEach(l => { const x = v(`t_${t[0]}_${l[0]}`); if (x) c[t[0]][l[0]] = x; }); });
  Object.assign(c, {
    id: f.dataset.id, status: v("status"), level: v("level"), joinMode: v("joinMode"), sortOrder: Number(v("sortOrder")) || 0, coverUrl: v("coverUrl"),
    startDate: v("startDate"), endDate: v("endDate"), signupDeadline: v("signupDeadline"),
    slots: $$("[data-slot]", f).map(r => ({ d: Number($("[name=slotD]", r).value), s: $("[name=slotS]", r).value, e: $("[name=slotE]", r).value })),
    capacity: Math.floor(num(v("capacity"))), minStudents: Math.floor(num(v("minStudents"))), allowWaitlist: f.elements.allowWaitlist.checked,
    priceUnit: v("priceUnit"), priceMXN: num(v("priceMXN")), priceUSD: num(v("priceUSD")), promoMXN: num(v("promoMXN")), promoUSD: num(v("promoUSD")), promoUntil: v("promoUntil"),
    taken: Number(old.taken) || 0, createdAt: old.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  const priv = { id: c.id, zoomUrl: v("zoomUrl"), zoomNote: v("zoomNote"), adminNote: v("adminNote"),
    materials: $$("[data-mat]", f).map(r => ({ title: $("[name=matT]", r).value.trim(), url: $("[name=matU]", r).value.trim(), note: $("[name=matN]", r).value.trim() })).filter(m => m.title || m.url) };
  return { c, priv };
}
function validateCourse({ c, priv }) {
  const errs = [];
  if (!titleOf(c.title) || titleOf(c.title) === "（未命名）") errs.push("請至少填一個語言的班級名稱");
  if (c.slots.some(s => !s.s || !s.e)) errs.push("上課時段的開始與結束時間都要填");
  if (c.endDate && c.startDate && c.endDate < c.startDate) errs.push("結束日不能早於開課日");
  if (c.capacity && c.minStudents > c.capacity) errs.push("最低開班人數不能大於名額上限");
  if (!c.priceMXN && !c.priceUSD && c.status !== "draft") errs.push("至少要設定一種價錢（披索或美金），否則學員無法報名");
  ["MXN", "USD"].forEach(k => { if (c["promo" + k] && (!c["price" + k] || c["promo" + k] >= c["price" + k])) errs.push(`${k} 優惠價要比原價低`); });
  if ((c.promoMXN || c.promoUSD) && !c.promoUntil) errs.push("有優惠價就要填優惠截止日");
  if (c.coverUrl && !isUrl(c.coverUrl)) errs.push("封面圖網址要以 http 或 https 開頭");
  if (priv.zoomUrl && !isUrl(priv.zoomUrl)) errs.push("Zoom 連結要以 http 或 https 開頭");
  if (priv.materials.some(m => !m.title || !isUrl(m.url))) errs.push("每個教材都要有名稱，網址要以 http 或 https 開頭");
  return errs;
}
async function saveCourse(e) {
  e.preventDefault();
  const data = readCourseForm(), errs = validateCourse(data), box = $("#cf-err");
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(esc).join("<br>"); return; }
  box.hidden = true;
  try {
    await store.put("courses", data.c); await store.put("priv", data.priv);
    state.courses = state.courses.filter(x => x.id !== data.c.id).concat(data.c);
    await syncTaken(data.c.id);
  } catch (err) { console.error(err); box.hidden = false; box.textContent = "儲存失敗，請確認登入帳號與 Firestore 規則"; return; }
  closeDlg();
  const miss = missingLangs(data.c);
  toast(miss.length ? `已儲存（還缺${miss.join("、")}的文字）` : "已儲存"); render();
}
async function delCourse(id) {
  const c = courseById(id); if (!c) return;
  const n = signupsOf(id).length;
  if (!(await confirmBox(`刪除「${titleOf(c.title)}」？`, n ? `這個班有 ${n} 筆報名。刪除班級後，報名資料仍會保留，但學員的專屬頁面會看不到班級內容。` : "刪除後無法復原。", "刪除"))) return;
  try { await store.remove("courses", id); await store.remove("priv", id); toast("已刪除"); } catch (e) { console.error(e); toast("刪除失敗"); }
}
async function closeCourse(id) {
  const c = courseById(id); if (!c) return;
  const targets = signupsOf(id).filter(s => ["pending", "paid"].includes(s.status)), waits = signupsOf(id).filter(s => s.status === "waitlist");
  if (!(await confirmBox(`「${titleOf(c.title)}」未成班，要關閉嗎？`, `班級會改成「未成班關閉」，${targets.length} 位待確認／已付款的學員標成「待退款」，${waits.length} 位候補標成「已取消」。之後可以用「通知學生」寄退款說明。`, "關閉並標待退款"))) return;
  try {
    for (const s of targets) await setStatus(s, "refund_pending", { closedByCourse: true });
    for (const s of waits) await setStatus(s, "cancelled", { closedByCourse: true });
    await store.put("courses", { ...courseById(id), status: "closed", updatedAt: new Date().toISOString() });
    toast("已關閉，學員已標成待退款");
  } catch (e) { console.error(e); toast("操作失敗"); }
}
async function dupCourse(id) {
  const c = courseById(id); if (!c) return;
  const n = { ...clean(c), id: uid(), status: "draft", taken: 0, title: { ...c.title }, createdAt: new Date().toISOString() };
  LANGS.forEach(l => { if (n.title[l[0]]) n.title[l[0]] += l[0] === "es" ? " (copia)" : "（複製）"; });
  try { await store.put("courses", n); const p = privOf(id); await store.put("priv", { ...clean(p), id: n.id }); toast("已複製成草稿"); } catch (e) { console.error(e); toast("複製失敗"); }
}
async function setCourseStatus(id, st) {
  const c = courseById(id); if (!c || c.status === st) return;
  if (st === "closed" && signupsOf(id).some(s => COUNTED.includes(s.status))) { toast("這個班還有待確認／已付款的學員，請用「未成班：關閉並標待退款」"); render(); return; }
  try { await store.put("courses", { ...c, status: st, updatedAt: new Date().toISOString() }); toast(`已改成「${COURSE_STATUS[st]}」`); } catch (e) { console.error(e); toast("儲存失敗"); }
}

/* ===================================================================== 報名 */
const filterSignups = () => {
  const q = state.q.trim().toLowerCase();
  return state.signups.filter(s => (state.filter === "all" || s.status === state.filter) && (!state.courseFilter || s.courseId === state.courseFilter)
    && (!q || [s.name, s.email, s.whatsapp, s.ref, s.payRef].some(v => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
};
const myLink = (s, lang) => `${SITE_BASE}/class/my/?t=${s.id}&lang=${lang || s.uiLang || "es"}`;
const waHref = (s, text) => `https://wa.me/${String(s.whatsapp || "").replace(/\D/g, "")}${text ? "?text=" + encodeURIComponent(text) : ""}`;
function signupRow(s) {
  const open = state.open.has(s.id), pend = s.status === "pending";
  const amt = s.expectedAmount ? `${money(s.expectedAmount, s.currency)}${s.promoApplied ? "（優惠價）" : ""}` : "";
  const btn = (act, label, cls) => `<button class="btn sm ${cls || ""}" data-act="${act}" data-id="${esc(s.id)}">${label}</button>`;
  const acts = {
    pending: [btn("mark-paid", "標記已付款", "primary"), btn("notify", "通知"), btn("to-refund", "待退款"), btn("to-cancel", "取消")],
    paid: [btn("notify", "通知學生", "primary"), btn("to-refund", "待退款"), btn("to-pending", "移回待確認")],
    waitlist: [btn("mark-paid", "標記已付款（私下收款）", "primary"), btn("notify", "通知"), btn("to-cancel", "取消")],
    refund_pending: [btn("to-refunded", "標記已退款", "primary"), btn("notify", "通知"), btn("to-pending", "移回待確認")],
    refunded: [btn("to-pending", "移回待確認")], cancelled: [btn("to-pending", "移回待確認")]
  }[s.status] || [];
  return `<article class="req ${esc(s.status)}" data-row="${esc(s.id)}">
    <div class="req-top"><div><b>${esc(s.name)}</b><span class="sub">${esc(courseTitle(s.courseId))}${amt ? "　" + esc(amt) : ""}${s.method ? "　" + (s.method === "spei" ? "披索轉帳" : "PayPal") : ""}</span></div><span class="badge b-${esc(s.status)}">${esc(SIGNUP_STATUS[s.status] || s.status)}</span></div>
    <span class="sub">編號 ${esc(s.ref)}　${esc(fmtTs(s.createdAt))}${s.dupRef ? `　<span class="warnTxt">⚠ 付款編號跟別筆重複</span>` : ""}${s.desiredStart ? `　想從 ${esc(s.desiredStart)} 開始` : ""}</span>
    <div class="acts">${acts.join("")}<button class="btn sm ghost" data-act="toggle" data-id="${esc(s.id)}" aria-expanded="${open}">${open ? "收起" : "詳情"}</button></div>
    <div class="panel" ${open ? "" : "hidden"}><dl class="kv">
      <dt>Email</dt><dd><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></dd>
      <dt>WhatsApp</dt><dd><a href="${esc(waHref(s))}" target="_blank" rel="noopener">${esc(s.whatsapp)}</a></dd>
      <dt>國家／程度</dt><dd>${esc(s.country || "-")}／${esc(STUDENT_LEVELS[s.studentLevel] || "-")}</dd>
      <dt>從哪裡知道</dt><dd>${esc(SOURCES[s.source] || "-")}</dd>
      ${s.payRef ? `<dt>付款憑證編號</dt><dd>${esc(s.payRef)}（學員填的付款時間：${esc(s.paidAt || "-")}）</dd>` : ""}
      ${s.screenshotUrl ? `<dt>匯款截圖</dt><dd><a href="${esc(s.screenshotUrl)}" target="_blank" rel="noopener">開啟截圖</a></dd>` : ""}
      ${s.paidConfirmedAt ? `<dt>確認收款</dt><dd>${esc(fmtTs(s.paidConfirmedAt))}　${esc(money(s.paidAmount, s.paidCurrency))}</dd>` : ""}
      ${s.note ? `<dt>學員備註</dt><dd>${esc(s.note)}</dd>` : ""}
      <dt>同意規定</dt><dd>${s.acceptedAt ? esc(fmtTs(s.acceptedAt)) : "-"}</dd>
      <dt>專屬連結</dt><dd><a href="${esc(myLink(s))}" target="_blank" rel="noopener">開啟學員看到的頁面</a></dd></dl>
      <label><span class="lbl">給自己的備註</span><textarea data-note="${esc(s.id)}" rows="2">${esc(s.adminNote || "")}</textarea></label>
      <div class="acts"><button class="btn sm" data-act="save-note" data-id="${esc(s.id)}">儲存備註</button><button class="btn sm danger" data-act="del-signup" data-id="${esc(s.id)}">刪除這筆</button></div></div></article>`;
}
function viewSignups() {
  const counts = { all: state.signups.length }; Object.keys(SIGNUP_STATUS).forEach(k => { counts[k] = state.signups.filter(s => s.status === k).length; });
  const rows = filterSignups();
  return `<div class="head"><h1>報名</h1><button class="btn" data-act="export-csv">匯出 CSV</button></div>
    <div class="tiles"><div class="tile"><b>${counts.pending}</b><span>待確認</span></div><div class="tile"><b>${counts.paid}</b><span>已付款</span></div><div class="tile"><b>${counts.waitlist}</b><span>候補</span></div><div class="tile"><b>${counts.refund_pending}</b><span>待退款</span></div></div>
    <div class="chips">${["all", ...Object.keys(SIGNUP_STATUS)].map(k => `<button class="chip ${state.filter === k ? "on" : ""}" data-act="filter" data-id="${k}">${k === "all" ? "全部" : SIGNUP_STATUS[k]} <b>${counts[k]}</b></button>`).join("")}</div>
    <div class="tools"><select id="cfilter" aria-label="班級"><option value="">全部班級</option>${state.courses.map(c => `<option value="${esc(c.id)}" ${state.courseFilter === c.id ? "selected" : ""}>${esc(titleOf(c.title))}</option>`).join("")}</select>
      <input id="q" type="search" placeholder="搜尋姓名、Email、WhatsApp、編號" value="${esc(state.q)}"></div>
    <div id="srows">${rows.length ? rows.map(signupRow).join("") : `<div class="empty">這裡沒有報名。</div>`}</div>`;
}

/* 標記已付款：金額可以改（披索匯款常有手續費差額） */
function openMarkPaid(id) {
  const s = signupById(id); if (!s) return;
  const c = courseById(s.courseId), cur = s.currency || (c && num(c.priceMXN) ? "MXN" : "USD");
  const amt = s.expectedAmount || (c ? num(c[(cur === "MXN" ? "priceMXN" : "priceUSD")]) : 0);
  openDlg(`確認收款：${s.name}`, `<form id="mpf" class="form" data-id="${esc(id)}"><p class="hint">請先確認真的收到款項（銀行帳戶或 PayPal），再按確認。</p>
    ${s.screenshotUrl ? `<p><a href="${esc(s.screenshotUrl)}" target="_blank" rel="noopener">開啟學員的匯款截圖</a>${s.payRef ? `　憑證編號：${esc(s.payRef)}` : ""}</p>` : ""}
    <div class="grid2"><label><span class="lbl">實收金額</span><input type="number" name="amt" step="any" min="0" value="${esc(amt)}"></label>
      <label><span class="lbl">幣別</span><select name="cur"><option value="MXN" ${cur === "MXN" ? "selected" : ""}>墨西哥披索</option><option value="USD" ${cur === "USD" ? "selected" : ""}>美金</option></select></label></div>
    <div class="foot"><button type="button" class="btn" data-act="close">取消</button><button type="submit" class="btn primary">確認已收款</button></div></form>`);
}
async function doMarkPaid(e) {
  e.preventDefault();
  const f = e.target, s = signupById(f.dataset.id), a = num(f.elements.amt.value), cur = f.elements.cur.value;
  if (!s || !a) { toast("請填實收金額"); return; }
  try { await setStatus(s, "paid", { paidConfirmedAt: new Date().toISOString(), paidAmount: a, paidCurrency: cur, paidTwd: toTwd(a, cur) }); closeDlg(); toast("已標記為已付款，學員的專屬頁面會顯示上課連結"); }
  catch (err) { console.error(err); toast("儲存失敗"); }
}

/* ---------- 通知學生：產生訊息草稿，用 WhatsApp 或 Email 開啟（不會自動寄出） ---------- */
const WDL = { hans: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], hant: WD, es: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] };
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fmtYmdL = (s, l) => { const p = CLS.parseYmd(s); return !p ? "" : l === "es" ? `${p.d} de ${MES[p.m - 1]} de ${p.y}` : `${p.y}年${p.m}月${p.d}日`; };
const TW_LABEL = { hans: "台湾时间", hant: "台灣時間", es: "hora de Taiwán" };
const tzLabel = (z, l) => { const r = CLS.TZS.filter(x => x[0] === z)[0]; return r ? r[l === "hans" ? 1 : l === "hant" ? 2 : 3] : z; };
function schedText(c, s, l) {
  if (!c || !(c.slots || []).length) return "";
  const tz = COUNTRY_TZ[s.countryCode], base = twToday();
  return c.slots.map(sl => {
    const v = CLS.slotView(sl, tz || "Asia/Taipei", base);
    return `• ${WDL[l][sl.d - 1]} ${sl.s}–${sl.e} (${TW_LABEL[l]})` + (tz ? `｜${tzLabel(tz, l)} ${WDL[l][v.locDay - 1]} ${v.locS}–${v.locE}` : "");
  }).join("\n");
}
const MSG = {
  paid: {
    hans: v => `${v.name} 你好！\n已确认收到你的付款，欢迎加入「${v.title}」。\n报名编号：${v.ref}\n\n上课连结和教材都放在你的专属页面（请保存这个网址）：\n${v.link}\n${v.start}${v.sched}\n有任何问题随时告诉我。\nBen`,
    hant: v => `${v.name} 你好！\n已確認收到你的付款，歡迎加入「${v.title}」。\n報名編號：${v.ref}\n\n上課連結和教材都放在你的專屬頁面（請保存這個網址）：\n${v.link}\n${v.start}${v.sched}\n有任何問題隨時告訴我。\nBen`,
    es: v => `Hola ${v.name}:\nConfirmamos tu pago. ¡Bienvenido/a a «${v.title}»!\nReferencia: ${v.ref}\n\nEl enlace de Zoom y los materiales están en tu página personal (guarda esta dirección):\n${v.link}\n${v.start}${v.sched}\nCualquier duda, escríbeme.\nBen`
  },
  confirmed: {
    hans: v => `${v.name} 你好！\n「${v.title}」已经成班，我们会照时间开课。\n${v.start}${v.sched}\n上课连结在你的专属页面：\n${v.link}\n到时见！\nBen`,
    hant: v => `${v.name} 你好！\n「${v.title}」已經成班，我們會照時間開課。\n${v.start}${v.sched}\n上課連結在你的專屬頁面：\n${v.link}\n到時見！\nBen`,
    es: v => `Hola ${v.name}:\n¡La clase «${v.title}» ya está confirmada!\n${v.start}${v.sched}\nEl enlace de Zoom está en tu página personal:\n${v.link}\n¡Nos vemos!\nBen`
  },
  cancelled: {
    hans: v => `${v.name} 你好！\n很抱歉，「${v.title}」因为报名人数不足，这一期没有开成。\n你付的 ${v.amount} 我会全额退还：${v.refundHow}\n谢谢你的支持与谅解，之后有新的班我会再通知你。\nBen`,
    hant: v => `${v.name} 你好！\n很抱歉，「${v.title}」因為報名人數不足，這一期沒有開成。\n你付的 ${v.amount} 我會全額退還：${v.refundHow}\n謝謝你的支持與諒解，之後有新的班我會再通知你。\nBen`,
    es: v => `Hola ${v.name}:\nLamentablemente la clase «${v.title}» no se abrió en esta ocasión por falta de inscritos.\nTe reembolsaré el pago completo (${v.amount}): ${v.refundHow}\nGracias por tu apoyo y comprensión; te avisaré cuando abra un nuevo grupo.\nBen`
  },
  reminder: {
    hans: v => `${v.name} 你好！\n提醒你，「${v.title}」快开课了。\n${v.start}${v.sched}\n上课连结在你的专属页面：\n${v.link}\nBen`,
    hant: v => `${v.name} 你好！\n提醒你，「${v.title}」快開課了。\n${v.start}${v.sched}\n上課連結在你的專屬頁面：\n${v.link}\nBen`,
    es: v => `Hola ${v.name}:\nTe recuerdo que la clase «${v.title}» empieza pronto.\n${v.start}${v.sched}\nEl enlace de Zoom está en tu página personal:\n${v.link}\nBen`
  },
  spot: {
    hans: v => `${v.name} 你好！\n「${v.title}」有名额了！如果你还想加入，请回覆我，我会告诉你付款方式。\n${v.start}${v.sched}\nBen`,
    hant: v => `${v.name} 你好！\n「${v.title}」有名額了！如果你還想加入，請回覆我，我會告訴你付款方式。\n${v.start}${v.sched}\nBen`,
    es: v => `Hola ${v.name}:\n¡Se liberó un lugar en «${v.title}»! Si todavía quieres unirte, respóndeme y te digo cómo pagar.\n${v.start}${v.sched}\nBen`
  }
};
const MSG_LABEL = { paid: "已確認付款（附專屬連結）", confirmed: "成班通知", cancelled: "未成班、退款說明", reminder: "開課提醒", spot: "候補有名額了" };
const SUBJECT = { paid: { hans: "已确认付款", hant: "已確認付款", es: "Pago confirmado" }, confirmed: { hans: "班级成班通知", hant: "班級成班通知", es: "Clase confirmada" }, cancelled: { hans: "班级未开成与退款", hant: "班級未開成與退款", es: "Clase no abierta y reembolso" }, reminder: { hans: "开课提醒", hant: "開課提醒", es: "Recordatorio de clase" }, spot: { hans: "候补有名额了", hant: "候補有名額了", es: "Lugar disponible" } };
function buildMsg(kind, s, l) {
  const c = courseById(s.courseId), cur = s.paidCurrency || s.currency, amt = s.paidAmount || s.expectedAmount || 0;
  const refundHow = cur === "MXN"
    ? { hans: "请回覆你的 CLABE 银行账号，我转回给你。", hant: "請回覆你的 CLABE 銀行帳號，我轉回給你。", es: "responde con tu CLABE y te transfiero el monto." }[l]
    : { hans: "我会从 PayPal 原路退回。", hant: "我會從 PayPal 原路退回。", es: "lo devolveré por PayPal." }[l];
  const v = { name: s.name, ref: s.ref, title: CLS.pick(c ? c.title : s.courseTitle, l), link: myLink(s, l), sched: schedText(c, s, l), amount: amt ? money(amt, cur) : "", refundHow,
    start: c && isYmd(c.startDate) ? { hans: "开课日期：", hant: "開課日期：", es: "Inicio: " }[l] + fmtYmdL(c.startDate, l) + "\n" : "" };
  v.sched = v.sched ? { hans: "上课时间：\n", hant: "上課時間：\n", es: "Horario:\n" }[l] + v.sched + "\n" : "";
  return { text: MSG[kind][l](v), subject: SUBJECT[kind][l] + (v.title ? "：" + v.title : "") };
}
const defaultKind = s => ({ paid: "paid", pending: "paid", waitlist: "spot", refund_pending: "cancelled" }[s.status] || "reminder");
function openNotify(id, opts) {
  const s = signupById(id); if (!s) return;
  const kind = (opts && opts.kind) || defaultKind(s), l = (opts && opts.lang) || s.uiLang || "es";
  const m = buildMsg(kind, s, l);
  openDlg(`通知：${s.name}`, `<div class="form" data-nid="${esc(id)}"><div class="grid2"><label><span class="lbl">訊息類型</span><select id="nk">${Object.keys(MSG_LABEL).map(k => `<option value="${k}" ${k === kind ? "selected" : ""}>${MSG_LABEL[k]}</option>`).join("")}</select></label>
    <label><span class="lbl">語言</span><select id="nl">${LANGS.map(x => `<option value="${x[0]}" ${x[0] === l ? "selected" : ""}>${x[1]}</option>`).join("")}</select></label></div>
    <textarea class="msgbox" id="nt">${esc(m.text)}</textarea>
    <div class="acts"><a class="btn primary" id="n-wa" target="_blank" rel="noopener" href="${esc(waHref(s, m.text))}">用 WhatsApp 開啟</a><a class="btn" id="n-mail" href="mailto:${esc(s.email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}">用 Email 開啟</a><button class="btn" id="n-copy" data-copy="">複製</button></div>
    <p class="hint">這只是訊息草稿，不會自動寄出；你看過再送。</p></div>`);
  $("#n-copy").dataset.copy = m.text;
}
function refreshNotify() {
  const box = $("[data-nid]"); if (!box) return;
  const s = signupById(box.dataset.nid), m = buildMsg($("#nk").value, s, $("#nl").value);
  $("#nt").value = m.text; $("#n-wa").href = waHref(s, m.text); $("#n-mail").href = `mailto:${s.email}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`; $("#n-copy").dataset.copy = m.text;
}
document.addEventListener("input", e => { if (e.target.id === "nt") { const s = signupById($("[data-nid]").dataset.nid); $("#n-wa").href = waHref(s, e.target.value); $("#n-copy").dataset.copy = e.target.value; $("#n-mail").href = `mailto:${s.email}?subject=${encodeURIComponent(buildMsg($("#nk").value, s, $("#nl").value).subject)}&body=${encodeURIComponent(e.target.value)}`; } });

/* 整班通知：每個人一列，各自開 WhatsApp／Email（WhatsApp 沒辦法一次群發） */
function openBatch(cid, kind, group) {
  const c = courseById(cid); if (!c) return;
  kind = kind || "confirmed"; group = group || "paid";
  const list = signupsOf(cid).filter(s => group === "all" ? COUNTED.concat(["waitlist"]).includes(s.status) : s.status === group);
  openDlg(`通知學生：${titleOf(c.title)}`, `<div class="form" data-bcid="${esc(cid)}"><div class="grid2"><label><span class="lbl">訊息類型</span><select id="bk">${Object.keys(MSG_LABEL).map(k => `<option value="${k}" ${k === kind ? "selected" : ""}>${MSG_LABEL[k]}</option>`).join("")}</select></label>
    <label><span class="lbl">對象</span><select id="bg">${[["paid", "已付款"], ["pending", "待確認"], ["waitlist", "候補"], ["refund_pending", "待退款"], ["all", "全部（含待確認、候補）"]].map(g => `<option value="${g[0]}" ${g[0] === group ? "selected" : ""}>${g[1]}</option>`).join("")}</select></label></div>
    <p class="hint">共 ${list.length} 位。每個人用他報名時選的語言，各自按一下開啟。</p>
    ${list.map(s => { const m = buildMsg(kind, s, s.uiLang || "es"); return `<div class="list-line"><span><b>${esc(s.name)}</b><span class="sub">${esc(s.whatsapp)}</span></span><span class="acts" style="margin:0"><a class="btn sm primary" target="_blank" rel="noopener" href="${esc(waHref(s, m.text))}">WhatsApp</a><a class="btn sm" href="mailto:${esc(s.email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}">Email</a></span></div>`; }).join("") || `<div class="empty">這個條件下沒有學生。</div>`}
    ${list.length ? `<div class="acts"><button class="btn sm" data-copy="${esc(list.map(s => s.email).join(", "))}">複製全部 Email</button></div>` : ""}</div>`);
}
document.addEventListener("change", e => {
  if (e.target.id === "nk" || e.target.id === "nl") refreshNotify();
  if (e.target.id === "bk" || e.target.id === "bg") { const b = $("[data-bcid]"); openBatch(b.dataset.bcid, $("#bk").value, $("#bg").value); }
  if (e.target.id === "cfilter") { state.courseFilter = e.target.value; renderMain(); }
});
document.addEventListener("click", e => {          // 對話框裡的複製按鈕
  const b = e.target.closest("[data-copy]"); if (!b || !b.dataset.copy) return;
  const done = () => { const o = b.textContent; b.textContent = "已複製"; setTimeout(() => { b.textContent = o; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(b.dataset.copy).then(done, () => toast("複製失敗"));
  else toast("這個瀏覽器不能自動複製，請手動選取文字");
});

function exportCsv() {
  const rows = filterSignups(), cols = [["ref", "編號"], ["status", "狀態"], ["course", "班級"], ["name", "姓名"], ["email", "Email"], ["whatsapp", "WhatsApp"], ["country", "國家"], ["studentLevel", "程度"], ["source", "從哪裡知道"], ["currency", "幣別"], ["amount", "金額"], ["method", "付款方式"], ["payRef", "付款憑證編號"], ["createdAt", "報名時間"], ["desiredStart", "想開始日"], ["paidConfirmedAt", "確認收款時間"], ["note", "備註"]];
  const q = v => `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
  const val = (s, k) => k === "status" ? SIGNUP_STATUS[s.status] : k === "course" ? courseTitle(s.courseId) : k === "amount" ? (s.paidAmount || s.expectedAmount || "") : k === "currency" ? (s.paidCurrency || s.currency || "") : s[k];
  const csv = "﻿" + [cols.map(c => q(c[1])).join(",")].concat(rows.map(s => cols.map(c => q(val(s, c[0]))).join(","))).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `團班報名_${twToday()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  toast(`已匯出 ${rows.length} 筆`);
}

/* ===================================================================== 收入 */
function viewIncome() {
  const paid = state.signups.filter(s => s.status === "paid"), pend = state.signups.filter(s => s.status === "pending");
  const amt = s => ({ a: Number(s.paidAmount) || Number(s.expectedAmount) || 0, c: s.paidCurrency || s.currency || "MXN" });
  const twd = s => Number(s.paidTwd) || toTwd(amt(s).a, amt(s).c);
  const ids = Array.from(new Set(state.signups.map(s => s.courseId)));
  const row = cid => { const p = paid.filter(s => s.courseId === cid), by = c => p.filter(s => amt(s).c === c).reduce((x, s) => x + amt(s).a, 0); return { cid, n: p.length, mxn: by("MXN"), usd: by("USD"), twd: p.reduce((x, s) => x + twd(s), 0) }; };
  const rows = ids.map(row), tot = rows.reduce((t, r) => ({ n: t.n + r.n, mxn: t.mxn + r.mxn, usd: t.usd + r.usd, twd: t.twd + r.twd }), { n: 0, mxn: 0, usd: 0, twd: 0 });
  const pendTwd = pend.reduce((x, s) => x + toTwd(Number(s.expectedAmount) || 0, s.currency || "MXN"), 0);
  return `<div class="head"><h1>收入</h1></div>
    <div class="tiles"><div class="tile"><b>${tot.n}</b><span>已付款人數</span></div><div class="tile"><b style="font-size:19px">${esc(money(tot.twd, "TWD"))}</b><span>已收（約合台幣）</span></div><div class="tile"><b>${pend.length}</b><span>待確認</span></div><div class="tile"><b style="font-size:19px">${esc(money(pendTwd, "TWD"))}</b><span>待確認（約合台幣）</span></div></div>
    <div class="tbwrap"><table class="tb"><thead><tr><th>班級</th><th>人數</th><th>披索</th><th>美金</th><th>約合台幣</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(courseTitle(r.cid))}</td><td>${r.n}</td><td>${esc(money(r.mxn, "MXN"))}</td><td>${esc(money(r.usd, "USD"))}</td><td>${esc(money(r.twd, "TWD"))}</td></tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--soft)">還沒有收入紀錄</td></tr>`}</tbody>
    <tfoot><tr><td>合計</td><td>${tot.n}</td><td>${esc(money(tot.mxn, "MXN"))}</td><td>${esc(money(tot.usd, "USD"))}</td><td>${esc(money(tot.twd, "TWD"))}</td></tr></tfoot></table></div>
    <p class="hint" style="margin-top:10px">只算「已付款」。標記已付款當下的匯率會記下來；匯率可以到「設定」修改。已退款與待退款的不算。</p>`;
}

/* ===================================================================== 設定 */
function viewSettings() {
  const s = state.settings, m = s.mxn || {};
  return `<div class="head"><h1>設定</h1></div>
    <form id="sf" class="form card" novalidate>
      <h3>聯絡方式（學員在付款頁會看到）</h3>
      <label><span class="lbl">Email</span><input type="email" name="contactEmail" value="${esc(s.contactEmail || "")}" placeholder="預設：a2224907@gmail.com"></label>
      <label><span class="lbl">Instagram 網址</span><input type="text" name="igUrl" value="${esc(s.igUrl || "")}" placeholder="預設：@cadadiaunosminutos_ben_chino"></label>
      <h3>PayPal（美金）</h3>
      <label><span class="lbl">PayPal.me 連結</span><input type="text" name="paypalMe" value="${esc(s.paypalMe || "")}" placeholder="https://paypal.me/你的帳號"><p class="hint">學員按付款時，網址會自動加上金額與幣別。</p></label>
      <h3>披索轉帳（墨西哥）</h3>
      <label><span class="lbl">轉帳資料怎麼給學員</span><select name="bankMode"><option value="show" ${s.bankMode === "show" ? "selected" : ""}>直接顯示在付款頁</option><option value="contact" ${s.bankMode !== "show" ? "selected" : ""}>請學員先聯絡我再給帳號</option></select></label>
      <div class="grid2"><label><span class="lbl">銀行</span><input type="text" name="bank" value="${esc(m.bank || "")}"></label><label><span class="lbl">戶名</span><input type="text" name="holder" value="${esc(m.holder || "")}"></label></div>
      <label><span class="lbl">CLABE（18 碼）</span><input type="text" name="clabe" value="${esc(m.clabe || "")}" inputmode="numeric" maxlength="18"></label>
      <label><span class="lbl">給學員的提醒（選填）</span><input type="text" name="mxnNote" value="${esc(m.note || "")}" placeholder="例如：轉帳時請在備註寫你的名字"></label>
      <p class="hint">只有選「直接顯示」而且填了 CLABE，付款頁才會顯示轉帳資料。</p>
      <h3>匯率（只用來估算收入，約合台幣）</h3>
      <div class="grid2"><label><span class="lbl">1 美金 ＝ 台幣</span><input type="number" step="any" name="rUSD" value="${esc(s.rates.USD)}"></label><label><span class="lbl">1 披索 ＝ 台幣</span><input type="number" step="any" name="rMXN" value="${esc(s.rates.MXN)}"></label></div>
      <div id="sf-err" class="err-box" hidden></div>
      <div class="foot"><button type="submit" class="btn primary">儲存設定</button></div></form>
    ${state.mode === "local" ? `<div class="card"><h3>示範資料</h3><p class="hint">本機示範模式專用：載入幾筆假資料來試用，或清空。</p><div class="acts"><button class="btn sm" data-act="seed">載入示範資料</button><button class="btn sm danger" data-act="wipe">清空示範資料</button></div></div>` : ""}`;
}
async function saveSettings(e) {
  e.preventDefault();
  const f = e.target, v = n => f.elements[n].value.trim(), box = $("#sf-err");
  const errs = [];
  if (v("paypalMe") && !isUrl(v("paypalMe"))) errs.push("PayPal.me 連結要以 http 或 https 開頭");
  if (v("igUrl") && !isUrl(v("igUrl"))) errs.push("Instagram 網址要以 http 或 https 開頭");
  if (v("clabe") && !/^\d{18}$/.test(v("clabe"))) errs.push("CLABE 要是 18 位數字");
  if (f.elements.bankMode.value === "show" && !v("clabe")) errs.push("選「直接顯示」就要填 CLABE");
  if (!num(v("rUSD")) || !num(v("rMXN"))) errs.push("匯率要填大於 0 的數字");
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(esc).join("<br>"); return; }
  box.hidden = true;
  try {
    await store.put("settings", { contactEmail: v("contactEmail"), igUrl: v("igUrl"), paypalMe: v("paypalMe"), bankMode: f.elements.bankMode.value,
      mxn: { bank: v("bank"), holder: v("holder"), clabe: v("clabe"), note: v("mxnNote") }, rates: { USD: num(v("rUSD")), MXN: num(v("rMXN")) } });
    toast("設定已儲存");
  } catch (err) { console.error(err); box.hidden = false; box.textContent = "儲存失敗，請確認登入帳號與 Firestore 規則"; }
}

/* ---------- 示範資料（本機模式） ---------- */
async function seed() {
  const today = twToday(), c1 = { ...blankCourse(), id: "demo-c1", status: "open", title: { hant: "零基礎中文團班", hans: "零基础中文团班", es: "Chino desde cero" }, intro: { hant: "從發音開始，每週兩次。", hans: "从发音开始，每周两次。", es: "Desde la pronunciación, dos veces por semana." },
    rules: { hant: "請準時上線。", hans: "请准时上线。", es: "Sé puntual." }, refund: { hant: "開課前 3 天可全額退費。", hans: "开课前 3 天可全额退费。", es: "Reembolso hasta 3 días antes." }, startDate: CLS.addDays(today, 7),
    slots: [{ d: 1, s: "21:00", e: "22:00" }, { d: 3, s: "21:00", e: "22:00" }], capacity: 6, minStudents: 3, priceMXN: 600, priceUSD: 35, promoMXN: 480, promoUSD: 28, promoUntil: CLS.addDays(today, 10) };
  const c2 = { ...blankCourse(), id: "demo-c2", status: "draft", sortOrder: 2, level: "mid", title: { hant: "中級會話團班" }, startDate: CLS.addDays(today, 30), slots: [{ d: 5, s: "20:00", e: "21:00" }], priceMXN: 800, priceUSD: 45 };
  const mk = (i, st, over) => ({ id: "demo-s" + i, courseId: "demo-c1", courseTitle: c1.title, ref: "AB" + i + "CD2" + i, status: st, name: ["Sofía Ramírez", "Carlos Pérez", "Lucía Gómez", "Diego Torres", "Ana Silva"][i - 1], email: `demo${i}@example.com`, whatsapp: "+5255123400" + i,
    country: "墨西哥", countryCode: "MX", studentLevel: "zero", uiLang: ["es", "hans", "hant", "es", "es"][i - 1], currency: "MXN", expectedAmount: 480, listAmount: 600, promoApplied: true, method: "spei", payRef: "SPEI-" + i + "00123", paidAt: today + "T10:00",
    note: "", acceptedRules: true, acceptedAt: new Date().toISOString(), createdAt: new Date(Date.now() - i * 3600e3).toISOString(), ...over });
  await store.put("courses", c1); await store.put("courses", c2); await store.put("priv", { id: "demo-c1", zoomUrl: "https://zoom.us/j/0000000000", zoomNote: "密碼 123456", materials: [{ title: "第 1 課講義", url: "https://example.com/1", note: "PDF" }], adminNote: "" });
  const list = [mk(1, "pending"), mk(2, "paid", { paidConfirmedAt: new Date().toISOString(), paidAmount: 480, paidCurrency: "MXN", paidTwd: 816 }), mk(3, "paid", { currency: "USD", expectedAmount: 28, method: "paypal", paidConfirmedAt: new Date().toISOString(), paidAmount: 28, paidCurrency: "USD", paidTwd: 896 }), mk(4, "waitlist", { currency: undefined, expectedAmount: undefined }), mk(5, "refund_pending")];
  for (const s of list) await store.put("signups", s);
  toast("已載入示範資料");
}

/* ===================================================================== 事件 */
async function doLogin() {
  state.loginMsg = ""; $("#login-msg").textContent = "";
  try { await store.signIn(); } catch (e) {
    console.error(e);
    const map = { "auth/unauthorized-domain": "這個網址還沒加入 Firebase 的授權網域。", "auth/operation-not-allowed": "Firebase 還沒啟用 Google 登入方式。", "auth/popup-closed-by-user": "", "auth/cancelled-popup-request": "" };
    state.loginMsg = e.code in map ? map[e.code] : `登入失敗（${e.code || e.message}）`; $("#login-msg").textContent = state.loginMsg;
  }
}
const act = {
  go: id => { state.view = id; render(); window.scrollTo(0, 0); },
  login: doLogin, logout: () => store.signOut(), close: closeDlg,
  "new-course": () => openCourseForm(), "edit-course": id => openCourseForm(id), "del-course": delCourse, "close-course": closeCourse, "dup-course": dupCourse,
  "course-signups": id => { state.view = "signups"; state.courseFilter = id; state.filter = "all"; state.q = ""; render(); window.scrollTo(0, 0); },
  "batch-notify": id => openBatch(id),
  "add-slot": () => $("#slots").insertAdjacentHTML("beforeend", slotRow()), "add-mat": () => $("#mats").insertAdjacentHTML("beforeend", matRow()),
  "rm-row": (id, el) => el.closest(".row3").remove(),
  ltab: (id, el) => { $$("#ltabs button").forEach(b => b.classList.toggle("on", b === el)); $$("[data-lg]").forEach(p => { p.hidden = p.dataset.lg !== id; }); },
  "to-hans": async () => {
    const f = $("#cf"), keys = TEXTS.map(t => t[0]);
    if (keys.some(k => f.elements[`t_${k}_hans`].value.trim()) && !(await confirmBox("簡體欄位已有內容", "用繁體重新轉換會蓋掉簡體現有的文字。", "蓋掉並轉換"))) return;
    const conv = OpenCC.Converter({ from: "t", to: "cn" });
    keys.forEach(k => { f.elements[`t_${k}_hans`].value = conv(f.elements[`t_${k}_hant`].value); });
    toast("已轉成簡體，請看一下有沒有怪的地方");
  },
  filter: id => { state.filter = id; renderMain(); },
  toggle: id => { state.open.has(id) ? state.open.delete(id) : state.open.add(id); renderMain(); },
  "mark-paid": openMarkPaid, notify: id => openNotify(id),
  "to-pending": async id => { const s = signupById(id); if (!s) return; await setStatus(s, "pending"); toast("已移回待確認"); },
  "to-refund": async id => { const s = signupById(id); if (s && await confirmBox(`把「${s.name}」標成待退款？`, "名額會釋出。之後用「通知」寄退款說明。", "標成待退款")) { await setStatus(s, "refund_pending"); toast("已標成待退款"); } },
  "to-refunded": async id => { const s = signupById(id); if (s) { await setStatus(s, "refunded", { refundedAt: new Date().toISOString() }); toast("已標成已退款"); } },
  "to-cancel": async id => { const s = signupById(id); if (s && await confirmBox(`取消「${s.name}」的報名？`, "名額會釋出。", "取消報名")) { await setStatus(s, "cancelled"); toast("已取消"); } },
  "save-note": async id => { const s = signupById(id), t = $(`[data-note="${id}"]`); if (!s) return; await store.put("signups", { ...s, adminNote: t.value.trim() }); toast("備註已儲存"); },
  "del-signup": async id => { const s = signupById(id); if (!s || !(await confirmBox(`刪除「${s.name}」這筆報名？`, "刪除後無法復原。", "刪除"))) return; await store.remove("signups", id); state.signups = state.signups.filter(x => x.id !== id); await syncTaken(s.courseId); toast("已刪除"); },
  "export-csv": exportCsv, seed: async () => { await seed(); }, wipe: async () => { if (await confirmBox("清空示範資料？", "只會清掉這個瀏覽器裡的示範資料。", "清空")) { await local.wipe(); toast("已清空"); } },
  "set-cstatus": (id, el) => setCourseStatus(id, el.value)
};
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el || el.tagName === "SELECT") return;
  const fn = act[el.dataset.act]; if (fn) Promise.resolve(fn(el.dataset.id, el)).catch(err => { console.error(err); toast("操作失敗"); });
});
document.addEventListener("change", e => { const el = e.target.closest("select[data-act]"); if (el) act[el.dataset.act](el.dataset.id, el); });
document.addEventListener("submit", e => {
  if (e.target.id === "cf") saveCourse(e); else if (e.target.id === "mpf") doMarkPaid(e); else if (e.target.id === "sf") saveSettings(e);
});
document.addEventListener("input", e => { if (e.target.id === "q") { state.q = e.target.value; $("#srows").innerHTML = filterSignups().map(signupRow).join("") || `<div class="empty">這裡沒有報名。</div>`; } });
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#app").hidden && !$("#dlg").open) render(); });
function showLogin(on) { $("#login").hidden = !on; $("#app").hidden = on; $("#login-msg").textContent = state.loginMsg; }

/* ===================================================================== 啟動 */
(async function boot() {
  let adapter = local;
  if (FIREBASE_READY) { try { adapter = await makeFirestore(); } catch (e) { console.error(e); toast("Firebase 連線失敗，改用本機示範模式"); } }
  store = adapter; state.mode = adapter.mode;
  const onData = d => {
    state.courses = (d.courses || []).slice(); state.priv = (d.priv || []).slice(); state.signups = (d.signups || []).slice(); state.settings = mergeSettings(d.settings);
    if (!($("#dlg").open) || !$("#cf")) render();        // 編輯班級時不要重畫背景，避免打到一半被洗掉
  };
  if (adapter.mode === "firebase") {
    showLogin(true);
    adapter.onAuth(async user => {
      if (!user) { adapter.stop(); state.user = null; showLogin(true); return; }
      if (!isAllowed(user.email)) { state.loginMsg = `這個帳號（${user.email}）沒有使用權限，請改用授權的帳號登入。`; await adapter.signOut(); showLogin(true); return; }
      state.user = user; state.loginMsg = ""; showLogin(false); adapter.start(onData);
    });
  } else { showLogin(false); await adapter.start(onData); }
})();
