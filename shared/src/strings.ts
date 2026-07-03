/**
 * zh-TW UI 文案常數(無 i18n 框架,見 PLAN.md §8.4、附錄 A)。
 * 集中放這裡,供 web/ 與後續 change 共用。真要加語系時再導 i18next。
 */
export const STRINGS = {
  app: {
    name: "AI 資料工作台",
    tagline: "跟 AI 說一句話,把雜亂資訊變成整理好的資料表",
  },

  auth: {
    // 共用
    emailLabel: "電子郵件",
    passwordLabel: "密碼",
    nameLabel: "名稱",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "至少 8 個字元",
    orDivider: "或",
    googleButton: "使用 Google 繼續",

    // 登入
    loginTitle: "登入",
    loginSubmit: "登入",
    loginToSignUp: "還沒有帳號?",
    loginToSignUpLink: "註冊",
    forgotPasswordLink: "忘記密碼?",

    // 註冊
    signUpTitle: "建立帳號",
    signUpSubmit: "註冊",
    signUpToLogin: "已經有帳號了?",
    signUpToLoginLink: "登入",

    // 忘記 / 重設密碼
    forgotTitle: "重設密碼",
    forgotDescription: "輸入你的電子郵件,我們會寄送重設密碼的連結。",
    forgotSubmit: "寄送重設連結",
    forgotSent: "如果這個 email 有註冊,我們已寄出重設連結,請檢查信箱。",
    resetTitle: "設定新密碼",
    resetSubmit: "更新密碼",
    resetSuccess: "密碼已更新,請用新密碼登入。",
    backToLogin: "返回登入",

    // 錯誤(通用,不洩露帳號是否存在)
    invalidCredentials: "帳號或密碼錯誤",
    emailTaken: "這個 email 已經被註冊了",
    weakPassword: "密碼至少需要 8 個字元",
    invalidResetToken: "重設連結已失效或已被使用,請重新申請",
    genericError: "發生錯誤,請稍後再試",
    networkBusy: "網路忙線中,請稍後再試",
  },

  workspace: {
    nameEmpty: "工作區名稱不能空白",
    renamed: "工作區名稱已更新",
  },

  home: {
    welcome: "歡迎回來",
    currentWorkspace: "目前工作區",
    signOut: "登出",
    save: "儲存",
    loading: "載入中…",
    emptyHint: "你的資料工作台已就緒。Collection、Chat 與截圖功能即將上線。",
    loadFailed: "載入工作區失敗,請重新整理頁面",
  },

  collections: {
    title: "我的 Collections",
    newButton: "新增 Collection",
    emptyTitle: "開始建立你的第一個 Collection",
    emptyHint: "Collection 是一張資料表。先建立一個,就能開始整理你的資料。",
    namePlaceholder: "例如:客戶名單、報名資料",
    create: "建立",
    cancel: "取消",
    loadFailed: "載入 Collection 失敗,請重新整理頁面",
    nameEmpty: "名稱不能空白",
    back: "返回",
  },

  records: {
    addButton: "新增資料",
    exportButton: "匯出 CSV",
    empty: "尚無資料,點「新增資料」開始建立。",
    save: "儲存",
    cancel: "取消",
    deleteConfirm: "確定要刪除這筆資料嗎?",
    source: "來源",
    sourceManual: "手動",
    sourceScreenshot: "截圖",
    sourceForm: "表單",
    total: "共 {n} 筆",
    loadFailed: "載入資料失敗,請重新整理頁面",
    conflictReload: "表格結構已被更新,已為你重新載入最新內容。",
    noFields: "這個 Collection 還沒有欄位。",
    selectPlaceholder: "請選擇",
  },

  chat: {
    title: "AI 助理",
    open: "開啟 AI 助理",
    collapse: "收合",
    placeholder: "跟 AI 說一句話…",
    send: "送出",
    newChat: "新對話",
    contextNone: "未綁定資料表",
    contextPrefix: "對話對象:",
    empty: "跟 AI 說你想建立或整理什麼資料。",
    thinking: "思考中…",
    failed: "AI 處理失敗,請稍後再試",
    // tool 卡片
    createdTitle: "已建立資料表",
    createdOpen: "開啟",
    proposalTitle: "Schema 變更提案",
    proposalReason: "理由",
    accept: "接受並套用",
    reject: "拒絕",
    applied: "已套用",
    rejected: "已拒絕",
    removeWarn: "此提案包含刪除欄位。既有資料會保留但不再顯示,重建欄位可救回。確定要刪除嗎?",
    removeConfirm: "確認刪除",
    conflict: "表格已被更新,請重新整理後再試一次。",
    queryTitle: "查詢結果",
    queryTotal: "共 {n} 筆",
    errorTitle: "操作失敗",
    // operation 描述
    opAdd: "新增欄位",
    opRemove: "刪除欄位",
    opRename: "重新命名",
    opUpdate: "更新欄位設定",
    opReorder: "重新排序欄位",
  },

  schemaAdmin: {
    manageButton: "管理欄位",
    title: "管理欄位",
    close: "關閉",
    addField: "新增欄位",
    fieldName: "欄位名稱",
    fieldType: "型別",
    optionsLabel: "選項(逗號分隔)",
    requiredLabel: "必填",
    currencyLabel: "貨幣(如 TWD)",
    aiHintLabel: "AI 提示",
    save: "儲存",
    cancel: "取消",
    add: "新增",
    rename: "改名",
    edit: "編輯設定",
    moveUp: "上移",
    moveDown: "下移",
    remove: "刪除",
    removeConfirmTitle: "確定要刪除這個欄位嗎?",
    removeConfirmBody: "既有資料會保留但不再顯示,重建同名欄位可救回。",
    removeConfirm: "確認刪除",
    conflict: "表格結構已被更新,已為你重新載入最新內容,請再試一次。",
    applyFailed: "套用失敗,請稍後再試",
    noFields: "這個 Collection 還沒有欄位,先新增一個。",
    // 7 種型別標籤(與 Home 共用)
    types: {
      short_text: "短文字",
      long_text: "長文字",
      number: "數字 / 金額",
      select_single: "單選",
      date: "日期",
      email: "Email",
      phone: "電話",
    },
  },

  errors: {
    networkBusy: "網路忙線中,請稍後再試",
    aiFailed: "AI 處理失敗,請試試清楚一點的圖片",
    quotaReached: "已達本月使用上限",
  },
} as const;

export type Strings = typeof STRINGS;
