# 訂閱群組簿 Suscripción

付費訂閱群組的報名與管理：學員自己報名、付款、上傳付款證明；老師在後台審核、記錄到期日、處理續訂。

給 Claude：改這個工具前先讀這份。Ben 的規則：先討論、測好、問過才推（他說「推」才推）；用白話繁體中文說明。

- **Firebase 專案：** subscription-48d3c（與入口網站 `cadadiaunosminutos-share-zone` 共用）
- **狀態：** 使用中

## 三個頁面

| 頁面 | 網址 | 給誰 | 檔案 |
|---|---|---|---|
| 群組介紹頁（Gimnasio de Chino，西／中雙語） | https://wangchiapin.github.io/subscription/groups/ | 學員 | `groups/index.html` |
| 報名頁（Suscripción） | https://wangchiapin.github.io/subscription/ | 學員 | `index.html` |
| 後台（訂閱群組簿） | https://wangchiapin.github.io/subscription/form/ | 只有老師 | `form/index.html` |

三個頁面都是單一 HTML，GitHub Pages 直接讀，不用編譯。

## 報名流程（學員）

1. 填基本資料（姓名、Email 要輸入兩次確認）。
2. 選群組（目前有 VIP 與基礎兩種）和方案（月訂／雙月訂）、選幣別（美金或墨西哥披索）。
3. 付款：
   - **PayPal**（美金）：頁面顯示 PayPal.me 連結，付完填交易編號。
   - **墨西哥銀行轉帳（SPEI）**：付款資料由後端在付款步驟才回傳，不寫在網頁裡。
4. 上傳付款證明（截圖）後送出，等老師審核。

## 價格與優惠

- 原價寫在 `groups/index.html` 的 `PRICES`（VIP）和 `PRICES_BASIC`；實際顯示以報名系統回傳為準。
- **優惠價**：只有在優惠生效時，後端才會回傳 `promo`（截止日以台灣日期判斷）。優惠期間頁面顯示優惠價並劃掉原價，註明截止日。
- **2026-10-13 起優惠也適用於續訂。**
- 頁面介紹有 FAQ（付款方式、怎麼續訂、沒續訂會怎樣：直接移出群組，想回來重新付款即可）。

## 後台功能（只限授權 Google 帳號）

- **登入限制**：只有 `form/index.html` 裡 `ALLOWED_EMAILS` 列的信箱能進；真正的防線是 Firestore 安全規則。
- **總覽**：成員依到期狀態分類（今日到期、明日到期、7 天內、已過期、有效、封存）；到期日當天不算有效，「最後有效日」是前一天。
- **群組管理**：新增、修改、刪除群組與費用；刪除群組會連同成員與付費記錄一起刪。
- **成員管理**：手動新增或修改成員、啟用日與到期日、封存、刪除。
- **審核報名**：看付款證明截圖，確認後自動建立成員並算好到期日；若學員實際付款的方案和選的群組不同，會提示改放到對的群組（`levelHint`）。
- **續訂**：從現有到期日接續（日期不會越算越早）；已封存的成員續訂後恢復。後台有**續訂／到期提醒訊息草稿**（中文簡繁、西文），群組有優惠時寫優惠價和截止日。
- **活動紀錄**與**教學活動記錄**：誰在何時新增、續訂、刪除；教學活動可獨立記錄與刪除。
- 匯率預設：1 美金＝32 台幣、1 披索＝1.7 台幣（可在設定改）。

## 資料（Firestore）

`sub_groups`（群組）、`sub_members`（成員）、`sub_settings/main`（設定）、`sub_requests`（報名申請）、`sub_activity`（活動紀錄）、`sub_events`（教學活動）。另外有 `portalStatus`（`group-vip`、`group-basic`，欄位 `state`）：後台設定群組開放狀態時寫入，群組介紹頁讀它來決定報名按鈕，公開可讀、只有管理員能寫，改規則時別漏掉。

報名頁與介紹頁是透過一個 Google Apps Script 後端送出報名、取價格與優惠；付款截圖由報名頁壓縮成 JPEG 後送到這個後端，後台審核時顯示後端回傳的截圖連結（`screenshotUrl`）。截圖實際放在哪裡，從這個 repo 看不出來（程式裡沒有用到 Firebase Storage）。

沒有填 Firebase 設定時，後台會用「本機示範模式」（資料只存在瀏覽器，不用登入），報名頁也有示範資料。

## 團班報名（`class/`）

- **學員報名頁** `class/index.html`：班級列表 → 詳情（上課時間自動換算成學員當地時間）→ 填資料 → 付款（披索轉帳或 PayPal 美金）→ 上傳匯款截圖。額滿且開放候補時，免付款直接排候補。語言：簡體（預設，台灣用字）、繁體、西文；網址可加 `?lang=hans|hant|es`，班級直連 `#c=班級ID`。
- **學員個人頁** `class/my/index.html?t=專屬代碼`：報名成功後給學員的連結；你在後台標「已付款」之後，這頁才會出現 Zoom 連結與教材。
- **後台** `class/admin/`（獨立頁面）：Google 登入（`class/admin/admin.js` 的 `ALLOWED_EMAILS`）。分頁：班級（新增、編輯、三語文字與「繁轉簡」、開關狀態、複製、未成班一鍵標待退款、點名）、報名（狀態篩選、搜尋、標記已付款、通知草稿、整班通知、匯出 CSV）、收入、設定（轉帳資料、PayPal.me、匯率、折扣碼）。網址加 `?demo=1` 是本機示範模式，不用登入、不碰真資料。
- **後端** `apps-script/class-signup.gs`：獨立的 Apps Script，部署步驟寫在檔案最上面。公開頁都只透過它讀寫，**不直接碰 Firestore**；轉帳資料在付款步驟才回傳，Zoom 與教材只給已付款的專屬連結。部署後把網頁應用程式網址貼到 `class/common.js` 的 `API_URL`（報名頁與個人頁共用這一處）。沒填時兩頁是示範模式。
- **折扣碼**：固定折掉一個金額（披索、美金各自設定），可限定班級、截止日、使用次數。不跟優惠價疊加，學員付較低的那個。學員在付款步驟輸入，Apps Script 試算並在送出報名時再算一次、計次（`cls_codes/{代碼}` 的 `used`）；後台編輯折扣碼不會蓋掉 `used`。為防猜碼，錯誤嘗試全站 10 分鐘 30 次後暫停試算。已取消或退款的報名不會把次數還回去。
- **調課**：後台班級卡的「調課」，只改某一堂（改到別的日期時間，或取消不補），每週固定時段不動。存在班級的 `changes`（公開欄位）：`{ date: 原本那天, newDate, s, e（台灣時間）, note, cancel }`。報名頁詳情與學員專屬頁面會顯示（舊時間劃掉、新時間換成學員當地時間、附說明）；訊息要用「通知學生」的「調課通知」自己送。點名仍以原本那天為代號：取消不補的那天不計堂數，調到未來的那堂在還沒上之前不列入。編輯班級存檔時 `changes` 會保留，複製班級時會清空。
- **點名**：後台班級卡的「點名」。只記「缺席」「請假」，沒記的都算出席（請假不算出席）；可標「這天停課」不計堂數。上課日依開課日與每週時段算出，學員從付款確認日（或他想開始的日期，取較晚的）才開始算。累計顯示在報名名單的詳情裡。學員看不到。
- **資料（Firestore）**：`cls_courses`（班級公開欄位）、`cls_private/{班級ID}`（Zoom、教材、備註）、`cls_signups/{專屬代碼}`（報名；文件 ID 就是學員的專屬代碼）、`cls_settings/main`（設定）、`cls_codes/{代碼}`（折扣碼）、`cls_attendance/{班級ID__日期}`（點名紀錄）。這些集合沒有公開讀取，前面列的「全部只限管理員」的 `match /{document=**}` 規則已涵蓋，不需要另外加規則。
- **狀態**：班級 `draft / open / confirmed / full / closed`（學員看得到 open、confirmed、full）；報名 `pending / paid / waitlist / refund_pending / refunded / cancelled`，其中 `pending`、`paid` 佔名額。優惠價在台灣日期 ≤ 截止日且低於原價時生效。
- **通知**：後台只產生訊息草稿（WhatsApp / Email / 複製），不會自動寄給學員；報名當下 Apps Script 會寄一封給你、一封確認信給學員。
- **測試**：`tests/class/`，`gs.test.js`（後端，假 Firestore，含折扣碼）、`public.test.js`（報名頁＋個人頁，需要 playwright 與 Chrome）、`admin-demo.test.js`（後台示範模式）。
- 繁轉簡使用 `class/admin/opencc-t2cn.js`（opencc-js，MIT，授權檔在同資料夾）。
