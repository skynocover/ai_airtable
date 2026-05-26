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

  errors: {
    networkBusy: "網路忙線中,請稍後再試",
    aiFailed: "AI 處理失敗,請試試清楚一點的圖片",
    quotaReached: "已達本月使用上限",
  },
} as const;

export type Strings = typeof STRINGS;
