// 在 Node 裡跑真正的 class-signup.gs：假的 Firestore REST、Drive、Mail、Cache、Lock。
const vm = require("vm"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const SRC = fs.readFileSync(path.join(__dirname, "..", "..", "apps-script", "class-signup.gs"), "utf8");
function create(opts) {
  opts = opts || {};
  const db = {};                       // "coll/id" -> fields (Firestore typed)
  const mails = [], files = [], props = Object.assign({ NOTIFY_EMAIL: "ben@example.com", DRIVE_FOLDER_ID: "F1" }, opts.props || {}), cache = {};
  const log = { errors: [] };
  const R = (code, body) => ({ getResponseCode: () => code, getContentText: () => (body === undefined ? "" : JSON.stringify(body)) });
  const docOf = (k) => ({ name: "projects/p/databases/(default)/documents/" + k, fields: db[k] });
  const fetch = (url, o) => {
    o = o || {}; const m = String(o.method || "get").toLowerCase(), u = new URL(url), p = u.pathname.replace(/^\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents/, "");
    if (m === "post" && p === ":runQuery") {
      const q = JSON.parse(o.payload).structuredQuery, coll = q.from[0].collectionId, f = q.where.fieldFilter, fp = f.field.fieldPath, want = JSON.stringify(f.value);
      const hits = Object.keys(db).filter(k => k.startsWith(coll + "/") && db[k][fp] && JSON.stringify(db[k][fp]) === want).map(k => ({ document: docOf(k) }));
      return R(200, hits.length ? hits : [{ readTime: "x" }]);
    }
    const parts = p.replace(/^\//, "").split("/"), coll = parts[0], id = parts[1] && decodeURIComponent(parts[1]);
    if (m === "get" && !id) { const ks = Object.keys(db).filter(k => k.startsWith(coll + "/")); return R(200, ks.length ? { documents: ks.map(docOf) } : {}); }
    if (m === "get") return db[coll + "/" + id] ? R(200, docOf(coll + "/" + id)) : R(404, { error: {} });
    if (m === "post") { const nid = u.searchParams.get("documentId"), k = coll + "/" + nid; if (db[k]) return R(409, {}); db[k] = JSON.parse(o.payload).fields; return R(200, docOf(k)); }
    if (m === "patch") { const k = coll + "/" + id; if (!db[k]) return R(404, {}); const f = JSON.parse(o.payload).fields; u.searchParams.getAll("updateMask.fieldPaths").forEach(x => { db[k][x] = f[x]; }); return R(200, docOf(k)); }
    return R(400, {});
  };
  const out = [];
  const ctx = {
    console: { error: (...a) => { log.errors.push(a.join(" ")); if (opts.verbose) console.log("[gs error]", ...a); }, log() {} }, Logger: { log() {} },
    UrlFetchApp: { fetch }, ScriptApp: { getOAuthToken: () => "tok" },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ text: s, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID(), base64Decode: s => Array.from(Buffer.from(s, "base64")), newBlob: (b, t, n) => ({ b, t, n }) },
    DriveApp: { getFolderById: () => ({ createFile: blob => { const f = { name: blob.n, trashed: false, getUrl: () => "https://drive/" + blob.n, setTrashed() { f.trashed = true; } }; files.push(f); return f; } }), createFolder: () => ({ getId: () => "F2", getUrl: () => "u", createFile() {} }) },
    MailApp: { sendEmail: m => { if (opts.mailFail) throw new Error("quota"); mails.push(m); }, getRemainingDailyQuota: () => 100 },
    Session: { getEffectiveUser: () => ({ getEmail: () => "me@example.com" }) },
    Date, JSON, Math, Number, String, Object, Array, RegExp, Error, encodeURIComponent, decodeURIComponent
  };
  vm.createContext(ctx);
  // const 宣告不會掛到 ctx 上，所以結尾補一行把需要的東西匯出
  vm.runInContext(SRC + "\n;this.__api={doGet:doGet,doPost:doPost};", ctx);
  const parse = r => JSON.parse(r.text);
  const fsTo = (v) => ({ doGet: 0 });
  return {
    db, mails, files, props, log,
    get: params => parse(ctx.__api.doGet({ parameter: params })),
    post: body => parse(ctx.__api.doPost({ postData: { contents: typeof body === "string" ? body : JSON.stringify(body) } })),
    // 把一般物件寫進假 Firestore（跟後台寫的一樣）
    put(coll, id, obj) { db[coll + "/" + id] = toFs(obj); },
    read(coll, id) { return db[coll + "/" + id] ? fromFs(db[coll + "/" + id]) : null; },
    all(coll) { return Object.keys(db).filter(k => k.startsWith(coll + "/")).map(k => Object.assign({ id: k.split("/")[1] }, fromFs(db[k]))); }
  };
}
function toV(v) { if (v === null || v === undefined) return { nullValue: null }; if (typeof v === "boolean") return { booleanValue: v }; if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }; if (typeof v === "string") return { stringValue: v }; if (Array.isArray(v)) return { arrayValue: { values: v.map(toV) } }; return { mapValue: { fields: toFs(v) } }; }
function toFs(o) { const f = {}; Object.keys(o).forEach(k => { if (o[k] !== undefined) f[k] = toV(o[k]); }); return f; }
function fromV(v) { if ("stringValue" in v) return v.stringValue; if ("integerValue" in v) return Number(v.integerValue); if ("doubleValue" in v) return v.doubleValue; if ("booleanValue" in v) return v.booleanValue; if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromV); if ("mapValue" in v) return fromFs(v.mapValue.fields || {}); return null; }
function fromFs(f) { const o = {}; Object.keys(f).forEach(k => { o[k] = fromV(f[k]); }); return o; }
module.exports = { create };
