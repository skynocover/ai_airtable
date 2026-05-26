# authentication Specification

## Purpose

提供使用者身分驗證能力:email/密碼註冊與登入、Google OAuth、登出、忘記密碼與重設、以 httpOnly secure cookie 維持的 session,以及對應的前端 auth 頁面。

## Requirements

### Requirement: Email 密碼註冊

系統 SHALL 允許訪客以 email + 密碼註冊。透過 Better Auth 的 `/api/auth/sign-up`。密碼 MUST 以雜湊儲存(`users.hashed_password`),絕不存明碼。email MUST 在 `users` 表唯一。註冊成功後 SHALL 觸發 workspace 自動建立(見 `workspace` 能力)。

#### Scenario: 成功註冊
- **WHEN** 訪客以未使用過的 email + 合法密碼提交 `/api/auth/sign-up`
- **THEN** 建立 `users` 列(`hashed_password` 為雜湊值)、建立 session、自動建立一個 workspace,並回傳已登入狀態

#### Scenario: email 已被註冊
- **WHEN** 訪客以已存在的 email 提交註冊
- **THEN** 回傳明確錯誤(繁中訊息),不建立重複 user

### Requirement: Email 密碼登入

系統 SHALL 允許已註冊 user 以 email + 密碼登入,透過 `/api/auth/sign-in`,成功後建立 session。

#### Scenario: 成功登入
- **WHEN** user 以正確 email + 密碼登入
- **THEN** 建立 session 並設定 httpOnly secure cookie

#### Scenario: 密碼錯誤
- **WHEN** user 以錯誤密碼登入
- **THEN** 回傳通用「帳號或密碼錯誤」訊息,不洩露 email 是否存在

### Requirement: Google OAuth 登入

系統 SHALL 支援以 Google OAuth 登入/註冊,透過 `/api/auth/oauth/google`。首次以 Google 登入且 email 尚未存在時 SHALL 建立 user(`hashed_password` 為 null)並自動建立 workspace;`accounts` 表記錄 provider 連結。

#### Scenario: 首次 Google 登入
- **WHEN** 一個 email 從未註冊過的人完成 Google OAuth
- **THEN** 建立 user(無密碼)、建立 `accounts`(provider='google')、自動建立 workspace、建立 session

#### Scenario: 既有 email 以 Google 登入
- **WHEN** 一個 email 已存在的 user 完成 Google OAuth
- **THEN** 連結到既有 user 並登入,不建立重複 user

### Requirement: 登出

系統 SHALL 提供 `/api/auth/sign-out` 使當前 session 失效並清除 cookie。

#### Scenario: 登出使 session 失效
- **WHEN** 已登入 user 呼叫 `/api/auth/sign-out`
- **THEN** session 失效、cookie 被清除,後續需登入的請求回 401

### Requirement: 忘記密碼與重設

系統 SHALL 提供 `/api/auth/forgot-password` 與 `/api/auth/reset-password`。forgot 寄出含時效性 reset token 的 email;reset 以合法 token 更新密碼。token MUST 有有效期限且用過即失效。

#### Scenario: 申請重設
- **WHEN** user 對存在的 email 申請 forgot-password
- **THEN** 寄出含 reset token 的 email;對不存在的 email 不洩露其是否註冊(回應一致)

#### Scenario: 以合法 token 重設密碼
- **WHEN** user 以有效且未過期的 reset token + 新密碼提交 reset-password
- **THEN** 更新 `hashed_password`、使該 token 失效,user 可用新密碼登入

#### Scenario: 過期或已用 token
- **WHEN** user 以過期或已使用的 token 提交 reset
- **THEN** 拒絕並回傳明確錯誤,密碼不變

### Requirement: Session 以 httpOnly secure cookie 維持

系統 SHALL 以 httpOnly、secure cookie 維持 session;session 記錄存於 `sessions` 表並有 `expires_at`。需登入的 API 在無有效 session 時 SHALL 回 401。

#### Scenario: 無 session 存取受保護 API
- **WHEN** 未帶有效 session cookie 的請求送到需登入的 `/api/v1/*`
- **THEN** 回傳 401,不洩露任何 workspace 資料

### Requirement: 前端 auth 頁面

系統 SHALL 提供 `/login` 與 `/sign-up` 前端頁面(繁體中文),支援 email/密碼與 Google 登入,並在成功後導向 `/home`。

#### Scenario: 已登入者造訪 login
- **WHEN** 已登入 user 造訪 `/login`
- **THEN** 自動導向 `/home`
