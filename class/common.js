/* 團班報名：報名頁與學員個人頁共用的程式（語言、時間換算、呼叫後端）
   API_URL：部署 apps-script/class-signup.gs 之後，把網頁應用程式網址貼在這裡。
   沒填（還是 YOUR_ 開頭）時是示範模式，頁面用假資料，不會送出任何東西。 */
(function (global) {
  "use strict";
  const API_URL = global.CLS_API_URL || "YOUR_APPS_SCRIPT_URL";
  const DEMO = String(API_URL).indexOf("YOUR_") === 0;
  const DEFAULT_PAYPAL_ME = "https://paypal.me/ben790831";   // 後台「設定」有填 PayPal.me 就用設定的
  const DEFAULT_EMAIL = "a2224907@gmail.com";
  const DEFAULT_IG = "https://www.instagram.com/cadadiaunosminutos_ben_chino/";
  const LANGS = ["hans", "hant", "es"];
  const IDX = { hans: 0, hant: 1, es: 2 };
  const LANG_LABEL = { hans: "简体", hant: "繁體", es: "Español" };

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.prototype.slice.call((el || document).querySelectorAll(s));
  const esc = s => String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsPut = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } };
  const pad = n => String(n).padStart(2, "0");

  /* ---------- 文字：每一項依序是 [简体, 繁體, Español]；简体一樣用台灣用字 ---------- */
  const K = {
    title: ["团班报名", "團班報名", "Clases grupales"],
    lead: ["选择班级、完成付款，我确认后就会让你加入课程。", "選擇班級、完成付款，我確認後就會讓你加入課程。", "Elige tu clase y realiza el pago. Cuando lo confirme, quedarás inscrito."],
    loading: ["载入中…", "載入中…", "Cargando…"],
    loadErr: ["无法载入页面，请检查网路后再试一次。", "無法載入頁面，請檢查網路後再試一次。", "No pudimos cargar la página. Revisa tu conexión e inténtalo de nuevo."],
    noCourses: ["目前没有招生中的班级。", "目前沒有招生中的班級。", "Por ahora no hay clases con inscripciones abiertas."],
    demo: ["示范模式：页面尚未连线，不会送出任何资料。", "示範模式：頁面尚未連線，不會送出任何資料。", "Modo demostración: la página aún no está conectada; no se envía nada."],
    details: ["查看详情并报名", "查看詳情並報名", "Ver detalles e inscribirme"],
    signupBtn: ["我要报名", "我要報名", "Inscribirme"],
    waitBtn: ["加入候补", "加入候補", "Unirme a la lista de espera"],
    backList: ["← 返回班级列表", "← 返回班級列表", "← Volver a las clases"],
    fStart: ["开课日期", "開課日期", "Inicio"],
    fTime: ["上课时间", "上課時間", "Horario"],
    fJoin: ["加入方式", "加入方式", "Cómo unirse"],
    fSeats: ["名额", "名額", "Cupo"],
    fPrice: ["费用", "費用", "Precio"],
    fLevel: ["程度", "程度", "Nivel"],
    fDeadline: ["报名截止", "報名截止", "Cierre de inscripción"],
    twTime: ["台湾时间", "台灣時間", "hora de Taiwán"],
    tzLabel: ["换算成：", "換算成：", "Ver en:"],
    seatsInfo: ["已报名 {taken} / {cap} 人", "已報名 {taken} / {cap} 人", "Inscritos {taken} / {cap}"],
    seatsLeft: ["剩 {n} 个名额", "剩 {n} 個名額", "quedan {n} lugares"],
    minOpen: ["满 {n} 人开班", "滿 {n} 人開班", "se abre con {n} alumnos"],
    noLimit: ["不限名额", "不限名額", "Sin límite de cupo"],
    lv_zero: ["零基础", "零基礎", "Desde cero"], lv_basic: ["初级", "初級", "Básico"], lv_mid: ["中级", "中級", "Intermedio"], lv_high: ["中高级以上", "中高級以上", "Intermedio-avanzado o más"], lv_all: ["不限程度", "不限程度", "Todos los niveles"],
    sl_zero: ["完全没学过", "完全沒學過", "Nunca he estudiado"], sl_some: ["学过一点", "學過一點", "He estudiado un poco"], sl_basic: ["初级", "初級", "Básico"], sl_mid: ["中级", "中級", "Intermedio"], sl_high: ["中高级以上", "中高級以上", "Intermedio-avanzado o más"],
    join_rolling: ["随时可加入", "隨時可加入", "Puedes unirte en cualquier momento"], join_monthly: ["每月开新梯次", "每月開新梯次", "Nuevo grupo cada mes"],
    unit_month: ["每月", "每月", "por mes"], unit_course: ["整期", "整期", "por curso completo"], unit_session: ["每堂", "每堂", "por clase"],
    st_open: ["招生中", "招生中", "Inscripciones abiertas"], st_confirmed: ["已成班", "已成班", "Clase confirmada"], st_full: ["已额满", "已額滿", "Completo"],
    st_waitlist: ["额满，可候补", "額滿，可候補", "Completo · lista de espera"], st_deadline: ["报名已截止", "報名已截止", "Inscripción cerrada"],
    promoLine: ["优惠价至 {d} 止（台湾时间），还剩 {n} 天", "優惠價至 {d} 止（台灣時間），還剩 {n} 天", "Precio promocional hasta el {d} (hora de Taiwán). Quedan {n} días"],
    promoLast: ["优惠价到今天为止（台湾时间）", "優惠價到今天為止（台灣時間）", "Hoy es el último día del precio promocional (hora de Taiwán)"],
    secIntro: ["班级介绍", "班級介紹", "Presentación"], secRules: ["班级规定", "班級規定", "Reglas de la clase"],
    secRefund: ["退费、请假与补课", "退費、請假與補課", "Reembolsos, ausencias y reposiciones"], secNote: ["其他说明", "其他說明", "Más información"],
    stepData: ["你的资料", "你的資料", "Tus datos"], stepPay: ["付款", "付款", "Pago"],
    name: ["姓名（全名）", "姓名（全名）", "Nombre completo"], country: ["国家", "國家", "País"], pickCountry: ["请选择国家", "請選擇國家", "Elige tu país"], otherCountryLbl: ["哪个国家？", "哪個國家？", "¿Cuál país?"], otherCountry: ["其他国家", "其他國家", "Otro país"],
    email: ["电子邮件", "電子郵件", "Correo electrónico"], email2: ["再次输入电子邮件", "再次輸入電子郵件", "Confirma tu correo"],
    wa: ["WhatsApp 号码", "WhatsApp 號碼", "Número de WhatsApp"], waHint: ["请含国码。上课通知会用这个号码联络你。", "請含國碼。上課通知會用這個號碼聯絡你。", "Con código de país. Te avisaremos por este número."],
    level: ["你的中文程度", "你的中文程度", "Tu nivel de chino"], pickLevel: ["请选择", "請選擇", "Elige una opción"],
    source: ["你是从哪里知道这个班的？", "你是從哪裡知道這個班的？", "¿Cómo te enteraste de esta clase?"],
    src_ig: ["Instagram", "Instagram", "Instagram"], src_fb: ["Facebook", "Facebook", "Facebook"], src_friend: ["朋友介绍", "朋友介紹", "Un amigo me lo recomendó"],
    src_wa: ["WhatsApp 群组", "WhatsApp 群組", "Grupo de WhatsApp"], src_other: ["其他", "其他", "Otro"],
    startWish: ["想从哪一天开始上课（选填）", "想從哪一天開始上課（選填）", "¿Desde qué fecha quieres empezar? (opcional)"], startHint: ["不填就从最近一次上课开始。", "不填就從最近一次上課開始。", "Si lo dejas vacío, empiezas en la próxima clase."],
    note: ["备注（选填）", "備註（選填）", "Comentarios (opcional)"],
    consent: ["我已阅读上面的班级规定与退费说明，并且同意。", "我已閱讀上面的班級規定與退費說明，並且同意。", "Leí las reglas y la política de reembolso de arriba y las acepto."],
    next: ["下一步", "下一步", "Siguiente"], back: ["上一步", "上一步", "Atrás"], sendWait: ["送出候补", "送出候補", "Enviar a la lista de espera"],
    eName: ["请输入你的全名。", "請輸入你的全名。", "Escribe tu nombre completo."], eCountry: ["请选择国家。", "請選擇國家。", "Elige tu país."], eOther: ["请输入你的国家。", "請輸入你的國家。", "Escribe tu país."],
    eEmail: ["请输入有效的电子邮件。", "請輸入有效的電子郵件。", "Escribe un correo válido."], eEmail2: ["两次输入的电子邮件不一致。", "兩次輸入的電子郵件不一致。", "Los correos no coinciden."],
    eWa: ["请输入含国码的号码，例如 +52 55 1234 5678。", "請輸入含國碼的號碼，例如 +52 55 1234 5678。", "Escribe tu número con código de país, por ejemplo +52 55 1234 5678."],
    eSource: ["请选择你是从哪里知道的。", "請選擇你是從哪裡知道的。", "Elige cómo te enteraste."],
    eLevel: ["请选择你的程度。", "請選擇你的程度。", "Elige tu nivel."], eConsent: ["请勾选同意班级规定与退费说明。", "請勾選同意班級規定與退費說明。", "Debes aceptar las reglas y la política de reembolso."],
    summary: ["摘要", "摘要", "Resumen"], sCourse: ["班级", "班級", "Clase"], sTotal: ["应付总额", "應付總額", "Total a pagar"],
    payCurrency: ["付款币别", "付款幣別", "Moneda de pago"], cMXN: ["墨西哥披索（银行转账）", "墨西哥披索（銀行轉帳）", "Peso mexicano (transferencia)"], cUSD: ["美金（PayPal）", "美金（PayPal）", "Dólar (PayPal)"],
    payPaypal: ["请付款 <b>{amt}</b>：", "請付款 <b>{amt}</b>：", "Paga <b>{amt}</b>:"], payPaypalBtn: ["前往 PayPal 付款", "前往 PayPal 付款", "Pagar con PayPal"],
    payPaypalHint: ["付款后，请保存付款截图和交易编号。", "付款後，請保存付款截圖和交易編號。", "Después de pagar, guarda la captura y el ID de la transacción."],
    paySpei: ["请转账 <b>{amt}</b> 到下面的账号，汇款后回到这一页填写资料：", "請轉帳 <b>{amt}</b> 到下面的帳號，匯款後回到這一頁填寫資料：", "Transfiere <b>{amt}</b> a esta cuenta y vuelve a esta página para completar los datos:"],
    bankName: ["银行", "銀行", "Banco"], holder: ["户名", "戶名", "Titular"], clabe: ["CLABE", "CLABE", "CLABE"], bankNote: ["备注", "備註", "Nota"],
    payContact: ["转账前，请先联络我取得账号资料；汇款后回到这一页填写资料。", "轉帳前，請先聯絡我取得帳號資料；匯款後回到這一頁填寫資料。", "Antes de transferir, escríbeme para pedirte los datos de la cuenta; luego vuelve a esta página y completa los datos."],
    contactIG: ["用 Instagram 私讯我", "用 Instagram 私訊我", "Escríbeme por Instagram"], contactMail: ["寄 Email 给我", "寄 Email 給我", "Escríbeme por correo"],
    copy: ["复制", "複製", "Copiar"], copied: ["已复制", "已複製", "Copiado"],
    refPaypal: ["PayPal 交易编号", "PayPal 交易編號", "ID de la transacción de PayPal"], refSpei: ["转账追踪码或参考编号", "轉帳追蹤碼或參考編號", "Clave de rastreo o referencia"],
    refHintPaypal: ["可在 PayPal 的收据或通知信中找到。", "可在 PayPal 的收據或通知信中找到。", "La encuentras en el comprobante o en el correo de PayPal."],
    refHintSpei: ["显示在你的转账凭证上。", "顯示在你的轉帳憑證上。", "Aparece en el comprobante de tu transferencia."],
    paidAt: ["付款日期与时间", "付款日期與時間", "Fecha y hora del pago"],
    shot: ["付款截图", "付款截圖", "Captura del pago"], upload: ["上传截图", "上傳截圖", "Subir captura"], change: ["更换截图", "更換截圖", "Cambiar captura"], remove: ["移除", "移除", "Quitar"],
    shotBad: ["无法读取这张图片，请换一张截图（JPG 或 PNG）。", "無法讀取這張圖片，請換一張截圖（JPG 或 PNG）。", "No pudimos leer esa imagen. Prueba con otra captura (JPG o PNG)."],
    confirmPaid: ["我确认已完成付款，且资料正确。", "我確認已完成付款，且資料正確。", "Confirmo que ya realicé el pago y que mis datos son correctos."],
    fillAll: ["请填完所有栏位才能送出。", "請填完所有欄位才能送出。", "Completa todos los campos para poder enviar."],
    submit: ["确认报名", "確認報名", "Confirmar inscripción"], sending: ["送出中…", "送出中…", "Enviando…"],
    doneTitle: ["报名已送出！", "報名已送出！", "¡Inscripción enviada!"], doneWaitTitle: ["候补已送出！", "候補已送出！", "¡Estás en la lista de espera!"],
    doneText: ["我会核对你的付款，确认后通知你。", "我會核對你的付款，確認後通知你。", "Revisaremos tu pago y te avisaremos al confirmarlo."],
    doneWaitText: ["有名额时会通知你。", "有名額時會通知你。", "Te avisaremos si se libera un lugar."],
    doneRef: ["你的报名编号：", "你的報名編號：", "Tu referencia:"],
    doneLink: ["你的专属连结（请保存。付款确认后，从这里看上课连结和教材）：", "你的專屬連結（請保存。付款確認後，從這裡看上課連結和教材）：", "Tu enlace personal (guárdalo; cuando confirmemos tu pago verás aquí el Zoom y los materiales):"],
    openMy: ["打开我的页面", "打開我的頁面", "Abrir mi página"], mailSent: ["我们也寄了一封信到 {mail}。", "我們也寄了一封信到 {mail}。", "También te enviamos un correo a {mail}."],
    errRate: ["你连续送出太多次，请稍后再试。", "你連續送出太多次，請稍後再試。", "Enviaste varias solicitudes seguidas. Inténtalo más tarde."],
    errDup: ["这个电子邮件已经报名过这个班级了，请查看信箱里的专属连结；找不到的话请联络我。", "這個電子郵件已經報名過這個班級了，請查看信箱裡的專屬連結；找不到的話請聯絡我。", "Este correo ya está inscrito en esta clase. Revisa tu correo para ver tu enlace personal; si no lo encuentras, escríbeme."],
    errFull: ["这个班级刚刚额满了。", "這個班級剛剛額滿了。", "Esta clase acaba de llenarse."], errClosed: ["这个班级已经不接受报名。", "這個班級已經不接受報名。", "Esta clase ya no acepta inscripciones."],
    errDeadline: ["这个班级的报名已截止。", "這個班級的報名已截止。", "La inscripción a esta clase ya cerró."], errCurrency: ["这个班级无法使用该币别，请回上一步再试一次。", "這個班級無法使用該幣別，請回上一步再試一次。", "Esa moneda no está disponible. Vuelve atrás e inténtalo de nuevo."],
    errShot: ["截图太大或不是有效的图片，请换一张。", "截圖太大或不是有效的圖片，請換一張。", "La captura es demasiado grande o no es una imagen válida."],
    errPayref: ["请填写完整的交易编号或参考编号。", "請填寫完整的交易編號或參考編號。", "Escribe el ID o la referencia completa."],
    errServer: ["暂时无法送出，请稍后再试。", "暫時無法送出，請稍後再試。", "No pudimos enviar tu solicitud. Inténtalo de nuevo en un momento."],
    errNet: ["无法送出，请检查网路后再试一次。", "無法送出，請檢查網路後再試一次。", "No pudimos enviar. Revisa tu conexión e inténtalo de nuevo."],
    foot: ["你的资料和付款凭证只用于管理这个班级。", "你的資料和付款憑證只用於管理這個班級。", "Tus datos y tu comprobante solo se usan para gestionar la clase."],
    /* 個人頁 */
    myTitle: ["我的报名", "我的報名", "Mi inscripción"], hello: ["{name}，你好", "{name}，你好", "Hola, {name}"],
    myLoadErr: ["无法载入，请检查网路后再试一次。", "無法載入，請檢查網路後再試一次。", "No pudimos cargar. Revisa tu conexión e inténtalo de nuevo."],
    myNotFound: ["找不到这笔报名，请确认连结是否完整。", "找不到這筆報名，請確認連結是否完整。", "No encontramos esta inscripción. Verifica que el enlace esté completo."],
    my_pending: ["等待确认付款", "等待確認付款", "Pago en revisión"], my_paid: ["已付款，欢迎加入！", "已付款，歡迎加入！", "¡Pago confirmado, bienvenido!"],
    my_waitlist: ["候补中", "候補中", "En lista de espera"], my_refund_pending: ["待退款", "待退款", "Reembolso pendiente"], my_refunded: ["已退款", "已退款", "Reembolsado"], my_cancelled: ["已取消", "已取消", "Cancelada"],
    msg_pending: ["我正在核对你的付款，确认后这一页会显示上课连结和教材。可以晚一点再回来看。", "我正在核對你的付款，確認後這一頁會顯示上課連結和教材。可以晚一點再回來看。", "Estoy revisando tu pago. Cuando lo confirme, aquí verás el enlace de Zoom y los materiales. Puedes volver más tarde."],
    msg_paid: ["下面是上课连结和教材。请保存这一页的网址。", "下面是上課連結和教材。請保存這一頁的網址。", "Aquí tienes el enlace de Zoom y los materiales. Guarda la dirección de esta página."],
    msg_waitlist: ["你在候补名单上，有名额时会通知你。", "你在候補名單上，有名額時會通知你。", "Estás en la lista de espera. Te avisaremos si se libera un lugar."],
    msg_refund_pending: ["这个班级没有开成（或已调整），退款处理中，会再联络你。", "這個班級沒有開成（或已調整），退款處理中，會再聯絡你。", "La clase no se abrió (o hubo un cambio). Estamos procesando tu reembolso y te contactaremos."],
    msg_refunded: ["已完成退款。", "已完成退款。", "El reembolso ya fue realizado."], msg_cancelled: ["这笔报名已取消。", "這筆報名已取消。", "Esta inscripción fue cancelada."],
    zoom: ["上课连结", "上課連結", "Enlace de Zoom"], openLink: ["打开", "打開", "Abrir"], materials: ["教材", "教材", "Materiales"],
    noMat: ["目前还没有教材，之后会放在这里。", "目前還沒有教材，之後會放在這裡。", "Aún no hay materiales; los pondremos aquí."],
    noZoom: ["上课连结还没有设定，会在开课前放在这里。", "上課連結還沒有設定，會在開課前放在這裡。", "El enlace de Zoom aún no está listo; lo pondremos aquí antes de empezar."],
    myRef: ["报名编号", "報名編號", "Referencia"], myCourse: ["班级", "班級", "Clase"], myPaid: ["费用", "費用", "Monto"], myStart: ["想开始上课的日期", "想開始上課的日期", "Fecha de inicio elegida"],
    contactMe: ["有问题请联络我：", "有問題請聯絡我：", "¿Dudas? Escríbeme:"], seeClass: ["查看班级介绍", "查看班級介紹", "Ver la presentación de la clase"]
  };
  const WD = { hans: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], hant: ["週一", "週二", "週三", "週四", "週五", "週六", "週日"], es: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] };
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const COUNTRIES = [ // [代碼, 西文, 繁體, 简体, 國碼]
    ["MX", "México", "墨西哥", "墨西哥", "52"], ["ES", "España", "西班牙", "西班牙", "34"], ["CO", "Colombia", "哥倫比亞", "哥伦比亚", "57"], ["AR", "Argentina", "阿根廷", "阿根廷", "54"],
    ["CL", "Chile", "智利", "智利", "56"], ["PE", "Perú", "秘魯", "秘鲁", "51"], ["VE", "Venezuela", "委內瑞拉", "委内瑞拉", "58"], ["EC", "Ecuador", "厄瓜多", "厄瓜多", "593"],
    ["GT", "Guatemala", "瓜地馬拉", "瓜地马拉", "502"], ["CR", "Costa Rica", "哥斯大黎加", "哥斯大黎加", "506"], ["PA", "Panamá", "巴拿馬", "巴拿马", "507"], ["UY", "Uruguay", "烏拉圭", "乌拉圭", "598"],
    ["PY", "Paraguay", "巴拉圭", "巴拉圭", "595"], ["BO", "Bolivia", "玻利維亞", "玻利维亚", "591"], ["HN", "Honduras", "宏都拉斯", "宏都拉斯", "504"], ["SV", "El Salvador", "薩爾瓦多", "萨尔瓦多", "503"],
    ["NI", "Nicaragua", "尼加拉瓜", "尼加拉瓜", "505"], ["DO", "República Dominicana", "多明尼加", "多明尼加", "1"], ["CU", "Cuba", "古巴", "古巴", "53"], ["PR", "Puerto Rico", "波多黎各", "波多黎各", "1"],
    ["US", "Estados Unidos", "美國", "美国", "1"], ["TW", "Taiwán", "台灣", "台湾", "886"], ["OTHER", "Otro país", "其他國家", "其他国家", ""]
  ];
  const TZS = [ // [IANA, 简体, 繁體, Español]
    ["America/Mexico_City", "墨西哥城", "墨西哥城", "Ciudad de México"], ["Europe/Madrid", "马德里", "馬德里", "Madrid"], ["America/Bogota", "波哥大", "波哥大", "Bogotá"],
    ["America/Lima", "利马", "利馬", "Lima"], ["America/Santiago", "圣地牙哥", "聖地牙哥", "Santiago"], ["America/Argentina/Buenos_Aires", "布宜诺斯艾利斯", "布宜諾斯艾利斯", "Buenos Aires"],
    ["America/Caracas", "卡拉卡斯", "卡拉卡斯", "Caracas"], ["America/Guatemala", "瓜地马拉", "瓜地馬拉", "Guatemala"], ["America/Costa_Rica", "哥斯大黎加", "哥斯大黎加", "Costa Rica"],
    ["America/Panama", "巴拿马", "巴拿馬", "Panamá"], ["America/Guayaquil", "厄瓜多（基多）", "厄瓜多（基多）", "Ecuador (Quito)"], ["America/Montevideo", "蒙特维多", "蒙特維多", "Montevideo"],
    ["America/Asuncion", "亚松森", "亞松森", "Asunción"], ["America/La_Paz", "拉巴斯", "拉巴斯", "La Paz"], ["America/Santo_Domingo", "圣多明哥", "聖多明哥", "Santo Domingo"],
    ["America/Havana", "哈瓦那", "哈瓦那", "La Habana"], ["America/New_York", "纽约", "紐約", "Nueva York"], ["America/Chicago", "芝加哥", "芝加哥", "Chicago"], ["America/Los_Angeles", "洛杉矶", "洛杉磯", "Los Ángeles"]
  ];

  /* ---------- 語言 ---------- */
  let lang = (function () {
    const q = new URLSearchParams(global.location ? global.location.search : "").get("lang");
    if (LANGS.indexOf(q) >= 0) return q;
    const s = lsGet("clsLang"); return LANGS.indexOf(s) >= 0 ? s : "hans";
  })();
  const getLang = () => lang;
  function setLang(l) { if (LANGS.indexOf(l) < 0) return; lang = l; lsPut("clsLang", l); if (global.document) document.documentElement.lang = l === "hans" ? "zh-Hans" : l === "hant" ? "zh-Hant" : "es"; }
  function t(key, vars) {
    const e = K[key]; if (!e) return key;
    let s = e[IDX[lang]];
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }
  /* 多語欄位：依目前語言挑，缺的話用另一個中文版本、最後用西文 */
  function pick(o, l) {
    if (!o || typeof o !== "object") return String(o || "");
    const L = l || lang, order = L === "es" ? ["es", "hant", "hans"] : L === "hans" ? ["hans", "hant", "es"] : ["hant", "hans", "es"];
    for (let i = 0; i < order.length; i++) if (o[order[i]]) return o[order[i]];
    return "";
  }
  const countryName = c => lang === "es" ? c[1] : lang === "hans" ? c[3] : c[2];
  const tzName = z => { const r = TZS.filter(x => x[0] === z)[0]; return r ? r[1 + IDX[lang]] : z.replace(/_/g, " ").split("/").pop(); };
  function applyStatic(root) {
    $$("[data-i]", root).forEach(el => { el.textContent = t(el.getAttribute("data-i")); });
    $$("[data-i-ph]", root).forEach(el => { el.setAttribute("placeholder", t(el.getAttribute("data-i-ph"))); });
    if (global.document) document.title = t("title");
  }
  function bindLangSwitch(el, onChange) {
    const draw = () => { el.innerHTML = LANGS.map(l => `<button type="button" data-lang="${l}" class="${l === lang ? "on" : ""}">${LANG_LABEL[l]}</button>`).join(""); };
    draw();
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-lang]"); if (!b || b.dataset.lang === lang) return;
      setLang(b.dataset.lang); draw(); onChange();
    });
  }

  /* ---------- 日期、金額 ---------- */
  const parseYmd = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  const isYmd = s => !!parseYmd(s);
  function fmtYmd(s) {
    const p = parseYmd(s); if (!p) return "";
    return lang === "es" ? `${p.d} de ${MESES[p.m - 1]} de ${p.y}` : `${p.y}年${p.m}月${p.d}日`;
  }
  const utcDay = s => { const p = parseYmd(s); return Date.UTC(p.y, p.m - 1, p.d); };
  const daysBetween = (a, b) => Math.round((utcDay(b) - utcDay(a)) / 86400000);
  function addDays(s, n) { const d = new Date(utcDay(s) + n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  const twToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  function money(n, c) {
    const s = Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
    return c === "MXN" ? `$${s} MXN` : c === "USD" ? `US$ ${s}` : s;
  }
  const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  /* ---------- 上課時間：台灣時間（固定 UTC+8）換算成別的時區 ---------- */
  const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  function nextOcc(ymd, dow) {
    const p = parseYmd(ymd), wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(), cur = wd === 0 ? 7 : wd;
    return addDays(ymd, (dow - cur + 7) % 7);
  }
  function partsIn(ms, tz) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
    const g = k => (f.filter(x => x.type === k)[0] || {}).value || "";
    return { dow: DOW[g("weekday")] || 1, time: `${pad(+g("hour") % 24)}:${g("minute")}` };
  }
  /* slot: { d: 1~7（週一=1）, s: "21:00", e: "22:00" }（台灣時間）；baseYmd 用來決定「下一次上課」的日期，夏令時間才會算對 */
  function slotView(slot, tz, baseYmd) {
    const date = nextOcc(baseYmd, slot.d), p = parseYmd(date), sm = String(slot.s).split(":").map(Number), em = String(slot.e).split(":").map(Number);
    const dur = (((em[0] * 60 + em[1]) - (sm[0] * 60 + sm[1])) + 1440) % 1440 || 60;
    const startMs = Date.UTC(p.y, p.m - 1, p.d, sm[0] - 8, sm[1]);
    const a = partsIn(startMs, tz), b = partsIn(startMs + dur * 60000, tz);
    return { twDay: slot.d, twS: slot.s, twE: slot.e, locDay: a.dow, locS: a.time, locE: b.time };
  }
  const wdName = n => WD[lang][n - 1] || "";
  function slotsHtml(slots, tz, baseYmd) {
    return (slots || []).map(s => {
      const v = slotView(s, tz, baseYmd);
      return `<span class="slot"><b>${esc(wdName(v.twDay))} ${esc(v.twS)}–${esc(v.twE)}</b> <small>${esc(t("twTime"))}</small>`
        + (tz === "Asia/Taipei" ? "" : `<br>→ ${esc(wdName(v.locDay))} ${esc(v.locS)}–${esc(v.locE)} <small>${esc(tzName(tz))}</small>`) + `</span>`;
    }).join("");
  }
  function defaultTz() {
    const saved = lsGet("clsTz"); if (saved && validTz(saved)) return saved;
    let z = ""; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { z = ""; }
    return z && z !== "Asia/Taipei" && validTz(z) ? z : "America/Mexico_City";
  }
  function validTz(z) { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch (e) { return false; } }
  function tzOptions(sel) {
    const list = TZS.map(x => x[0]);
    if (list.indexOf(sel) < 0) list.unshift(sel);
    return list.map(z => `<option value="${esc(z)}" ${z === sel ? "selected" : ""}>${esc(tzName(z))}</option>`).join("");
  }

  /* ---------- 呼叫後端（示範模式用假資料） ---------- */
  function demoCourse() {
    const today = twToday();
    return {
      id: "demo", status: "open", state: "open", level: "zero", joinMode: "rolling", sortOrder: 1,
      title: { hans: "零基础中文团班", hant: "零基礎中文團班", es: "Chino desde cero (clase grupal)" },
      intro: { hans: "从发音和拼音开始，每周两次，小班互动。", hant: "從發音和拼音開始，每週兩次，小班互動。", es: "Empezamos con pronunciación y pinyin. Dos clases por semana en grupo pequeño." },
      rules: { hans: "请准时上线，课前备好教材。", hant: "請準時上線，課前備好教材。", es: "Conéctate puntual y ten tus materiales listos." },
      refund: { hans: "开课前 3 天可全额退费；开课后不退费，请假可补课一次。", hant: "開課前 3 天可全額退費；開課後不退費，請假可補課一次。", es: "Reembolso completo hasta 3 días antes; después no hay reembolso. Una reposición por ausencia." },
      note: {}, startDate: addDays(today, 7), signupDeadline: "", capacity: 8, minStudents: 4, taken: 3, allowWaitlist: true,
      slots: [{ d: 1, s: "21:00", e: "22:00" }, { d: 3, s: "21:00", e: "22:00" }], priceUnit: "month", priceMXN: 600, priceUSD: 35, promoMXN: 480, promoUSD: 28, promoUntil: addDays(today, 10),
      options: [{ currency: "MXN", amount: 480, list: 600, promo: true }, { currency: "USD", amount: 28, list: 35, promo: true }]
    };
  }
  async function demoApi(action, p) {
    await new Promise(r => setTimeout(r, 200));
    const c = demoCourse();
    if (action === "courses") return { ok: true, today: twToday(), courses: [c], contact: { email: "demo@example.com", ig: "" } };
    if (action === "payinfo") return { ok: true, state: "open", options: c.options, promoUntil: c.promoUntil, paypal: { link: "" }, bankMode: "show", bank: { bank: "Banco de ejemplo", holder: "Titular de ejemplo", clabe: "000000000000000000", note: "" }, contact: { email: "demo@example.com", ig: "" } };
    if (action === "my") return { ok: true, today: twToday(), signup: { name: "Demo", ref: "DEMO01", status: p.t === "0".repeat(32) ? "pending" : "paid", courseId: "demo", currency: "MXN", amount: 480, desiredStart: "", createdAt: "", paidAt: "", uiLang: "es" }, course: c, access: { zoomUrl: "https://zoom.us/j/0000000000", zoomNote: "ID: 000 000 0000", materials: [{ title: "Lección 1", url: "https://example.com/1", note: "PDF" }] }, contact: { email: "demo@example.com", ig: "" } };
    return { ok: false, error: "action" };
  }
  async function apiGet(action, params) {
    if (DEMO) return demoApi(action, params || {});
    const u = new URL(API_URL); u.searchParams.set("action", action);
    Object.keys(params || {}).forEach(k => u.searchParams.set(k, params[k]));
    const r = await fetch(u.toString()); return r.json();
  }
  async function apiPost(body) {
    if (DEMO) { await new Promise(r => setTimeout(r, 400)); return { ok: true, ref: "DEMO01", token: "0".repeat(32), status: body.waitlist ? "waitlist" : "pending", myUrl: "../my/?t=" + "0".repeat(32) }; }
    const r = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    return r.json();
  }

  /* 複製按鈕：<button data-copy="文字"> */
  function bindCopy() {
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-copy]"); if (!b) return;
      const done = () => { const old = b.textContent; b.textContent = t("copied"); setTimeout(() => { b.textContent = old; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(b.dataset.copy).then(done, () => {});
      else { const ta = document.createElement("textarea"); ta.value = b.dataset.copy; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (x) { /* 忽略 */ } ta.remove(); }
    });
  }

  global.CLS = { API_URL, DEMO, LANGS, K, COUNTRIES, TZS, $, $$, esc, lsGet, lsPut, pad, getLang, setLang, t, pick, countryName, tzName, applyStatic, bindLangSwitch,
    parseYmd, isYmd, fmtYmd, daysBetween, addDays, twToday, money, nowLocal, nextOcc, slotView, slotsHtml, defaultTz, tzOptions, validTz, apiGet, apiPost, bindCopy, DEFAULT_PAYPAL_ME, DEFAULT_EMAIL, DEFAULT_IG };
})(window);
