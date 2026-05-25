# AI 資料工作台 — 完整開發企劃書

> 版本:v1.2
> 文件用途:作為 Claude Code 開發此產品的主要參考文件
> 文件語言:中文敘述 + 英文技術識別字

---

## 0. 給開發者 (Claude Code) 的話

這份文件是這個產品的完整設計。閱讀順序建議:

1. **先讀 1-2 章** (產品定位、核心概念) — 理解你要建什麼、為什麼
2. **再讀 3 章** (技術架構) — 知道用什麼工具、怎麼組合
3. **重點讀 5 章** (Phase 1 詳細規格) — **這是要先實作的範圍**
4. 第 4 章 (階段規劃) 和第 11 章 (後續預覽) 讓你了解未來方向,**但 Phase 1 不要把後面的功能寫進來**
5. 7-10 章是非功能需求和最佳實踐

**重要原則:**

- Phase 1 範圍以外的功能 **不要實作**,即使技術上很容易加
- 所有 AI 與模型互動都用 **tool calling / structured output**,不要 parse 自由文字
- 所有 AI 寫入資料的操作都要 **先 preview、用戶確認後才 commit**
- 程式碼用 TypeScript,結構保持簡單清楚,優先可讀性而非過度抽象
- 有疑問時,優先「先做出能跑的最簡版本」,再迭代

**v1.1 範圍調整(務必先看):**

為避免過度設計,Phase 1 已移除以下基礎設施 —— 它們都是「有併發 / 有規模 / 有第二 provider 或語言」才划算的東西,需要時再加,**現在不要蓋**:

- Durable Objects、Cloudflare Queues、多 LLM provider/fallback、Workers AI
- Stripe 線上付費(Pro 人工開通)、自製 analytics dashboard、i18next 框架
- `change_field_type`、表單檔案上傳

並確立:**D1 是唯一真相**(schema snapshot 為準,operations log 只是 audit)、**截圖抽取同步化**、**單一 Worker**、**7 種核心 field types**(見 §2.4)、**多租戶隔離硬規則**(見 §3.3)。

---

## 1. 專案概述

### 1.1 產品定位

一個 AI-native 的資料工作台,專為自由工作者、接案者、小型工作室設計。用戶可以透過對話、表單、截圖等多種方式收集和整理資料,所有 input 共用同一個資料層,AI 在中間做結構化翻譯。

**一句話定位:**
> 「跟 AI 對話,生出可以用的資料庫。你說一句、別人填一份、丟一張截圖,資料自動進到對的地方。」

### 1.2 願景

成為亞洲 (尤其 LINE 為主要溝通工具的市場) 接案者和小團隊**每天都會打開**的資料管理工具。取代他們在 Excel、Notion、LINE 收藏、Google Forms 之間切換的混亂狀態。

### 1.3 目標用戶 (按優先序)

1. **接案者 / 自由工作者**:設計師、寫手、攝影、顧問、教練、自由開發者
2. **小型工作室 / 代理商** (1-5 人):每個成員都類似接案者,但有少量協作需求
3. **個人業務 / 銷售** (保險、房仲、業務 BD):需要管理大量客戶對話與紀錄
4. **內容創作者 / 社群經營者**:有少量但持續的觀眾互動與資料收集

**共同特徵:**
- 客戶 / 互動對象大量在 LINE / IG DM / Email
- 沒有完整 CRM,但需要結構化整理資料
- 經常需要做表單收集 (詢價、報名、回饋)
- 個人付費意願 $10-30 USD/月,團隊 $30-50 USD/seat/月

### 1.4 核心問題與解決方案

| 用戶痛點 | 現有方案的問題 | 我們的解法 |
|---|---|---|
| 客戶對話都在 LINE,要整理就是手動 | LINE 不能匯出、無 API | 截圖 → AI 自動抽取進對應的表 |
| 每接新案子都要重做類似的表單 | Google Form 太陽春、Typeform 太貴 | 對話式 AI 表單生成,可不斷對話修改 |
| Airtable 太重、學習曲線太陡 | 需要先學資料庫概念 | 對話即建表,不用學 schema |
| 收完資料還要手動整理到別處 | 工具間銜接斷裂 | 同一個工具收集 + 查詢 + 分享 |
| 想看自己的資料,還要打開試算表 | 介面複雜 | Chat 直接問 |

### 1.5 為什麼這個有勝算

- **截圖整理**這個功能在亞洲市場是**真實的空缺**,主流工具沒有做
- **對話式建表單**比 Airtable AI 更輕、比 Typeform AI 更聰明
- **Cloudflare 技術棧**讓我們在亞洲區延遲低、AI 成本可控
- **垂直定位** (接案者) 比通用 Airtable 競品有更清楚的訊息
- 創辦人在地化的繁中體驗,是國際工具難以複製的

---

## 2. 核心概念與資料模型

### 2.1 核心概念抽象

整個產品建立在這個概念模型上:

```
                       Workspace
                          │
                  ┌───────┴───────┐
            Collection 1     Collection 2  ...
                  │
            ┌─────┴─────────────────────────────┐
            │                                   │
        Schema (欄位定義)                   Records (實際資料)
            │                                   │
       ┌────┴────┐                         由多種 input 寫入
       │         │
   Field 1   Field 2 ...                   ┌──────────────┐
                                           │ Public Form  │
       ┌─────────────────┐                 │ Screenshot   │
       │   Input Methods │ ←───── 都使用 ─→ │ Chat Input   │
       │   (寫入管道)     │                 │ Bulk Import  │
       └─────────────────┘                 └──────────────┘

       ┌─────────────────┐
       │   Views         │ ←─── 都展示 ──→  Records
       │   (展示方式)     │
       └─────────────────┘

       ┌─────────────────┐
       │   Shares        │ ←─── 控制 ───→  Input 與 View 的公開狀態
       │   (公開設定)     │
       └─────────────────┘
```

**Collection = Schema + Records + Inputs + Views + Shares**

這是整個產品的中心抽象。所有功能都圍繞 Collection 展開。

### 2.2 Entity 定義

以下是核心 Entity 的 TypeScript 型別定義 (Phase 1 範圍):

```typescript
// === User & Workspace ===

interface User {
  id: string;              // uuid
  email: string;
  name: string;
  avatar_url?: string;
  created_at: Date;
  updated_at: Date;
}

interface Workspace {
  id: string;              // uuid
  name: string;
  owner_id: string;        // User.id
  slug: string;            // URL-friendly identifier
  plan: 'free' | 'pro';    // 訂閱方案
  // Quotas
  records_used: number;
  screenshots_used_this_month: number;
  ai_tokens_used_this_month: number;
  // 註:Phase 1 無線上付費,plan 由人工開通 (見 §7)
  created_at: Date;
  updated_at: Date;
}

// === Collection ===

interface Collection {
  id: string;              // uuid
  workspace_id: string;
  name: string;            // 用戶看到的名稱
  slug: string;            // URL 用,workspace 內 unique
  icon?: string;           // emoji
  description?: string;
  schema_version: number;  // 每次 schema 變動 +1
  created_at: Date;
  updated_at: Date;
}

// === Schema ===

type FieldType =
  | 'short_text'
  | 'long_text'
  | 'number'         // currency 是 number + 欄位上的 currency 顯示設定,不是獨立型別
  | 'select_single'
  | 'date'
  | 'email'
  | 'phone';

// Phase 2+ 再加:select_multi、datetime、url、file、image

interface Field {
  id: string;              // 短 id,例如 "fld_abc123"
  name: string;            // 顯示名稱
  type: FieldType;
  required: boolean;
  ai_hint?: string;        // 給 AI 看的欄位語意說明
  // Type-specific config
  options?: string[];      // for select types
  currency?: string;       // for currency type, e.g. 'TWD'
  multiline?: boolean;     // for text types
  // Validation
  min?: number;
  max?: number;
  pattern?: string;        // regex
  // Display
  order: number;
  hidden_in_public?: boolean;  // 公開頁面是否隱藏
  created_at: Date;
}

// Collection 的 schema 由一連串 SchemaOperation 組成
// Current schema 是這些 operations 的 reduce 結果

type SchemaOperation =
  | { op: 'add_field'; field: Omit<Field, 'created_at'>; at_order?: number }
  | { op: 'remove_field'; field_id: string }
  | { op: 'rename_field'; field_id: string; new_name: string }
  | { op: 'update_field_meta'; field_id: string; updates: Partial<Field> }
  | { op: 'reorder_fields'; field_ids: string[] };

// Phase 1 不支援 change_field_type:改型別會牽涉既有 records 的資料遷移,
// 先讓用戶「刪欄位重建」。Phase 2+ 再評估。

interface SchemaOperationLog {
  id: string;
  collection_id: string;
  operation: SchemaOperation;
  applied_by: 'user' | 'ai';
  user_id: string;
  reason?: string;          // AI 的理由說明
  applied_at: Date;
}

// === Records ===

interface Record {
  id: string;
  collection_id: string;
  data: { [field_id: string]: any };  // 鍵是 field id,值是欄位資料
  // Provenance
  source: 'form' | 'screenshot' | 'manual' | 'bulk_import';
  source_metadata?: {
    // for screenshot
    screenshot_url?: string;
    extraction_confidence?: number;
    // for form
    submission_id?: string;
    ip_country?: string;
  };
  // Soft delete
  deleted_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// === Inputs (寫入管道) ===

interface InputConfig {
  id: string;
  collection_id: string;
  type: 'public_form' | 'screenshot';  // Phase 1 只有這兩種
  enabled: boolean;
  // Public form specific
  form_settings?: {
    slug: string;             // /f/[slug]
    title: string;
    description?: string;
    submit_button_text?: string;
    thank_you_message?: string;
    turnstile_enabled: boolean;
    require_email?: boolean;
  };
  created_at: Date;
  updated_at: Date;
}

interface FormSubmission {
  id: string;
  input_id: string;
  collection_id: string;
  record_id: string;        // 對應建立的 Record
  ip_country?: string;
  user_agent?: string;
  submitted_at: Date;
}

interface ScreenshotJob {
  id: string;
  collection_id: string;
  user_id: string;
  image_url: string;        // R2 URL
  status: 'preview_ready' | 'committed' | 'cancelled';  // 同步抽取:上傳即 await,回來就是 preview_ready
  extraction_result?: {
    fields: { [field_id: string]: { value: any; confidence: number; source_hint?: string } };
    suggested_new_fields?: Array<{ name: string; type: FieldType; reason: string }>;
    overall_notes?: string;
  };
  record_id?: string;       // 確認 commit 後建立的 Record
  created_at: Date;
  committed_at?: Date;
}

// === Chat ===

interface ChatSession {
  id: string;
  workspace_id: string;
  user_id: string;
  context_collection_id?: string;  // 當前對話綁定的 Collection
  title: string;            // 由 AI 摘要產生
  created_at: Date;
  last_message_at: Date;
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  // Structured actions taken (AI tool calls)
  actions?: Array<{
    type: 'schema_operation' | 'query' | 'create_collection';
    payload: any;
    result?: any;
  }>;
  created_at: Date;
}
```

### 2.3 Schema Operations 設計重點

**為什麼保留 operations log?**

唯一真相是 `current_schema_json`(snapshot);operation 直接 apply 到 snapshot 上,log 只是 append 的 audit / undo 紀錄。**不要在讀取時 reduce operations 重算 schema** —— 沒有 DO、沒有併發,event-sourcing 那套是純負擔。

1. **AI 只輸出 incremental operations**,大幅降低 token 用量
2. **支援 undo**:逆向 apply(Phase 1 先記 log,undo UI 可緩做)
3. **版本歷史 / audit**:operations log 就是歷史

**AI 與 Operations 的互動模式:**

當用戶在 chat 說「加一個預算欄位」,AI 應該:

```typescript
// AI 用 tool calling 輸出(只產生提案,不碰 DB):
{
  tool: 'propose_schema_operations',
  arguments: {
    collection_id: 'col_xxx',
    operations: [
      {
        op: 'add_field',
        field: {
          id: 'fld_budget',
          name: '預算',
          type: 'number',
          required: false,
          currency: 'TWD',   // 金額 = number + currency 顯示設定,不是獨立型別
          ai_hint: '客戶提到的預算金額,可能含「預算」「budget」「大概多少」等字眼',
          order: 99
        }
      }
    ],
    reason: '使用者要加一個預算欄位'
  }
}
```

**propose → confirm 二段式(schema 寫入的核心安全機制):**

1. `propose_schema_operations` tool **只回傳提案,絕不寫 DB**。後端把提案存進該則 AI 訊息的 `actions_json`(狀態 `pending`)
2. 前端把提案渲染成確認卡片(「我要加一個『預算』欄位,類型是金額。要套用嗎?」)
3. 用戶**只能接受 / 拒絕**(Phase 1 不支援逐欄編輯;要改回頭跟 AI 講)
4. 接受 → 前端呼叫**唯一寫入入口** `POST /collections/:id/operations`,帶 `schema_version` 樂觀鎖 → 後端 apply 到 `current_schema_json` + 寫 `SchemaOperationLog` + `schema_version +1`
5. 更新該訊息 `actions_json` 狀態為 `applied`(或拒絕時 `rejected`);重整頁面後卡片狀態正確顯示

**兩條硬規則:**

- **刪欄位(`remove_field`)= 紅色提案卡 + 二次確認**:文案明寫「既有資料會保留但不再顯示,重建欄位即可救回」(remove 不動 records 的 `data_json`)
- **版本衝突**:若確認時 `schema_version` 與當前不符(其他分頁/操作已改過 schema),**拒絕該次套用**,提示「表格已被更新,請重新整理」並讓前端 refetch 最新 schema。不自動 merge

> `create_collection`(建新表)**例外:直接建立,不走 propose**。建立的是空表,沒有覆蓋既有資料的風險,onboarding 體驗優先。

### 2.4 欄位值的儲存格式

`records.data_json` 是 `{ [field_id]: value }`。**存法、排序行為、AI 抽取輸出三者必須一致**,中間不做任何 parsing 轉換層 —— AI preview 卡片顯示的值,就是要存進去的值。

| type | data_json 存法 | 範例 | AI 抽取要輸出 |
|---|---|---|---|
| `short_text` / `long_text` | string | `"王大明"` | 原文字串 |
| `number` | **JSON number** | `50000` | 純數字,不含逗號/符號 |
| `select_single` | string (option label) | `"設計"` | 必須是 options 之一,否則留空 |
| `date` | **ISO 字串 `YYYY-MM-DD`** | `"2026-05-25"` | `YYYY-MM-DD` |
| `email` | string | `"a@b.com"` | 驗證過格式 |
| `phone` | **string(永不存 number)** | `"0912345678"` | 原樣字串,保留前導 0 與 +886 |

> **金額沒有獨立型別**:用 `number` + 欄位上的 `currency` 設定(如 `'TWD'`)。DB 永遠存純數字 `50000`,只有**顯示層**用 `Intl.NumberFormat('zh-TW', { style: 'currency', currency })` 加符號。這樣 `json_extract` 數值比較才正確(「預算最高」查得到)。AI 抽取金額一律輸出純數字,不含 `$` / 逗號 / 「元」。

**三條跨型別規則:**

1. **空值 = 不存這個 key**(sparse)。`data_json` 只放有值的欄位,「缺席」即「空」,不存 `null`。
2. **AI 輸出格式 = 儲存格式**。抽取 tool schema / prompt 必須明寫:日期 `YYYY-MM-DD`、數字給原始數值、電話給字串。commit 時零轉換。
3. **`select_single` 存 label 字串**:改選項名稱會讓既有 record 對不上(低頻,Phase 1 可接受;Phase 2+ 再評估 stable option id)。

**查詢影響:** `created_at` 是真實欄位有 index,「上週收到幾筆」走 index;「預算最高」靠 `json_extract(data_json,'$.fld_x')`,因為數字存的是 number,SQLite 數值比較正確 —— 資料量小可全掃。

---

## 3. 技術棧與架構

### 3.1 技術選型

| 層 | 選型 | 用途 |
|---|---|---|
| **Hosting / Edge** | Cloudflare Workers | API + 公開表單 SSR(單一 worker) |
| **Frontend** | React + Vite (SPA) | 後台介面 |
| **Frontend Framework** | TypeScript + Tailwind CSS + shadcn/ui | UI |
| **API Framework** | Hono | Worker 上的 routing |
| **Auth** | Better Auth | Session 管理、Email + Google 登入 |
| **Database** | Cloudflare D1 (SQLite) | **唯一真相**,所有持久化 |
| **File Storage** | Cloudflare R2 | 截圖 |
| **KV Store** | Cloudflare KV | slug 反查、cache |
| **AI Gateway** | Cloudflare AI Gateway | 統一進出 LLM,加 cache、log、limits |
| **LLM** | Anthropic Claude (Sonnet) via API | Schema、對話、查詢、截圖抽取(vision)|
| **Email** | Cloudflare Email Workers / Resend | 通知 email |
| **Anti-bot** | Cloudflare Turnstile | 公開表單防 bot |
| **Monitoring** | Sentry + Cloudflare Analytics | 錯誤追蹤 |

> **Phase 1 不用**(避免過度設計,需要時再加):Durable Objects、Queues、Workflows、Vectorize、Workers AI(分類/embedding)、多 LLM provider / fallback、Stripe。全部都是「有規模 / 有併發 / 有第二語言或 provider」才划算的基礎設施。

### 3.2 系統架構圖

```
┌─────────────────────────────────────────────────────────┐
│   Browser (User)                                        │
│   - Admin UI (React SPA)                                │
│   - Public Form Page                                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────┐
│   單一 Cloudflare Worker (Hono routing)                  │
│   - /api/*    → API endpoints                           │
│   - /f/*      → Public form pages (SSR,同一個 worker)   │
│   - /auth/*   → Better Auth                             │
│   - 截圖抽取:request 內直接 await Claude vision (同步)   │
└──────────┬───────────────────────┬─────────────┬────────┘
           │                       │             │
           ▼                       ▼             ▼
   ┌──────────────┐        ┌──────────────┐ ┌──────────────┐
   │ D1 (SQLite)  │        │ R2 (Files)   │ │ AI Gateway   │
   │ 唯一真相      │        │ - screenshots│ │   │          │
   │ - users      │        └──────────────┘ │   ▼          │
   │ - workspaces │                         │ Claude       │
   │ - collections│                         │ Sonnet       │
   │ - records    │                         │ (含 vision)  │
   │ - submissions│                         └──────────────┘
   │ - ...        │
   └──────────────┘
```

### 3.3 資料儲存策略

**D1(唯一真相):**

Phase 1 用**單一 D1 database**,所有 workspace 共用,每個資料表都有 `workspace_id` 欄位做隔離。理由:簡單、容易管理、Phase 1 規模夠用。

`collections.current_schema_json` 是 schema 的唯一真相;`schema_operations` 只是 audit log(見 §2.3)。

> **多租戶隔離是硬規則**:單一 D1 共用 = 任何漏掉 `WHERE workspace_id = ?` 的查詢都是跨租戶外洩。所有 D1 存取一律過 `scopedDb(workspace_id)` wrapper,讓「不帶 workspace_id 查資料」在型別上就不可能。這種 bug 自己測抓不到(只有一個 workspace),會在第二個用戶時爆。

未來如果某個 workspace 資料量大,可以遷移到專屬 D1。但 v1 不要設計這個。

**R2(檔案):**

- 截圖原檔:`/screenshots/{workspace_id}/{job_id}.{ext}`
- 永遠用 signed URL 給前端

### 3.4 AI 層架構

**所有 LLM 呼叫都透過 AI Gateway**,得到:
- 統一的 logging、metrics
- Cache (相同 prompt 命中時免錢)
- Rate limiting per workspace
- 成本可視化(AI Gateway 幾乎免費,改個 URL 即可,值得從 Phase 1 就接)

**模型分工(Phase 1 只用一個 model):**

| 任務 | 模型 | 為什麼 |
|---|---|---|
| Schema 對話 + 操作 | Claude Sonnet | 推理強、tool calling 穩 |
| 截圖抽取 | Claude vision(**型號待 spike 定**) | 先比 Sonnet vs 便宜款的命中率,再依毛利取捨(見 §12.1 Week 0) |
| 資料查詢 (生 filter) | Claude Sonnet | 推理 |

> Phase 1 文字任務全走 Claude Sonnet,**不做多 provider fallback、不引入 Workers AI**(分類/embedding 是 Phase 3+)。先別蓋多模型抽象。截圖 vision 型號待命中率 spike 後定案。

**Tool calling 是強制**:每個 AI 任務都用 structured output。不要讓 AI 吐自由文字然後 parse。

---

## 4. 開發階段總覽

### 4.1 Phase 1 (約 8 週) — 核心 loop

**目標**:能上線、能收費、能講出差異化故事。

**範圍**:
- Auth + Workspace
- Collection 對話建立與修改
- 兩個 input:公開表單 + 截圖抽取
- Admin 後台表格檢視 + 編輯
- Chat 資料查詢
- Email 通知
- 用量配額追蹤(免費版 + 成本/濫用上限,無付費方案)

**詳細規格見第 5 章。**

### 4.2 Phase 2 (4-6 週) — 公開展示 + 強化

加入:
- 公開展示頁 (`/t/[slug]`) — table / gallery / list 三種樣式
- 公開單筆詳情頁 (`/d/[slug]/[id]`)
- 表單條件邏輯
- 多步驟表單
- 截圖多張合併、文字貼上抽取
- CSV / Excel 批次匯入
- LINE Notify、Discord、Slack webhook 通知
- 公開頁 branding (logo、色)
- 自訂網域 (Pro)

### 4.3 Phase 3 (8-10 週) — AI 中樞深化

加入:
- 個人 chat 輸入 (chat 寫資料,不只查資料)
- 跨 Collection 智慧路由
- 對話洞察 / 摘要
- 對話式表單 (chat-style 公開表單)
- Email 轉寄輸入
- Reference Field (跨 Collection 關聯)
- REST API + Webhook (outgoing)

### 4.4 Phase 4 (8-12 週) — 團隊與整合

加入:
- 多人 Workspace
- 角色與權限
- LINE Bot 整合
- Notion / Google Sheets 雙向 sync
- Zapier / Make connector
- Embed widget
- Audit log

### 4.5 Backlog (現階段不規劃)

- 語音輸入
- 行動端原生 App
- 進階洞察儀表板
- SSO / SAML
- 多語系介面
- Kanban / Gantt views (**不做**)
- Formula 語言 (**不做**)
- 進階 automation builder (**不做**)

---

## 5. Phase 1 詳細規格

### 5.1 範圍

**✅ 包含**

| 模組 | 功能 |
|---|---|
| Auth | Email 密碼登入、Google OAuth、登出、忘記密碼 |
| Workspace | 自動建立、設定名稱、查看用量 |
| 配額 | 用量追蹤 + 限制(免費版成本/濫用煞車,**Phase 1 無付費方案**) |
| Collection | 建立、命名、icon、軟刪除 |
| Schema | 對話建立 + 修改、7 種 field types、operations log |
| Records | CRUD、軟刪除、來源 badge |
| Input: Form | 公開短網址、Turnstile、感謝訊息 |
| Input: Screenshot | 單張上傳、Vision AI 同步抽取、Preview 卡片、確認後 commit |
| Admin View | Collection 列表、表格檢視、inline edit、排序、CSV 匯出 |
| Chat | 綁定 Collection context、schema 對話、查詢對話 |
| Notification | 新提交時 email |

**❌ 不包含 (Phase 2+)**

- 公開展示頁、單筆詳情頁
- 表單條件邏輯、多步驟
- 多張截圖合併
- 對話寫入資料 (chat 只能查不能寫)
- 自訂網域、branding、logo 移除
- 團隊、權限
- API、Webhook
- 整合 (LINE、Notion、Sheets)
- Email 轉寄、語音、批次匯入
- 進階 view (gallery、list)
- **Stripe / 線上付費**(Pro 人工開通)
- **表單檔案上傳**(file / image 欄位型別)
- **change_field_type**(改欄位型別,牽涉資料遷移)
- Durable Objects、Queues(無併發 / 非同步需求)

### 5.2 用戶故事 (Phase 1 必須能完成)

**Story 1:接案者整理客戶**
1. 我註冊登入
2. 跟 AI 說「我要整理我的客戶資料」
3. AI 跟我來回問 2-3 句,建出「客戶資料」Collection,有 5-7 個欄位
4. 我從 LINE 截圖一張對話,拖進去
5. AI 抽取出客戶姓名、產業、預算、聯絡方式,顯示 preview
6. 我看一眼,小修一下預算,按確認
7. 第一筆客戶進到表格

**Story 2:接案者收詢價**
1. 我跟 AI 說「再建一個詢價單,要問需求、預算、時程、聯絡方式」
2. AI 建好,我說「設定成公開表單」
3. 我拿到 `/f/abc123` 短網址
4. 我把連結貼到 IG bio
5. 訪客填表,我收到 email 通知
6. 我打開後台,看到新提交

**Story 3:接案者查資料**
1. 我在 chat 問「上週收到幾筆詢問」
2. AI 回「3 筆」,並列出大致內容
3. 我問「預算最高的是哪個」
4. AI 回出對應紀錄

**Story 4:用量達上限**
1. 我用了 18 張截圖 (免費上限 20)
2. 我繼續用,截圖功能提示「快到上限」
3. 達上限後阻擋上傳,顯示「已達本月使用上限」
4. (Phase 1) 無升級路徑,純提示;付費方案 Phase 2 才規劃

### 5.3 資料庫 schema (D1)

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified INTEGER DEFAULT 0,
  name TEXT NOT NULL,
  avatar_url TEXT,
  hashed_password TEXT,         -- null if OAuth only
  created_at INTEGER NOT NULL,  -- unix ms
  updated_at INTEGER NOT NULL
);

CREATE TABLE accounts (         -- Better Auth account links
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,       -- 'email' | 'google'
  provider_account_id TEXT NOT NULL,
  -- ... per Better Auth schema
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE sessions (         -- Better Auth sessions
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  -- ...
);

-- Workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  -- Quotas (rolling counters)
  records_used INTEGER DEFAULT 0,
  screenshots_used_this_month INTEGER DEFAULT 0,
  ai_tokens_used_this_month INTEGER DEFAULT 0,
  quota_reset_at INTEGER,
  -- Phase 1 無 Stripe;plan 由人工開通。Stripe 相關欄位留待後續階段再加。
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Collections
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  -- Current schema snapshot (JSON,從 operations 算出的當前狀態)
  current_schema_json TEXT NOT NULL,  -- { fields: Field[] }
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, slug)
);

-- Schema Operations Log
CREATE TABLE schema_operations (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  operation_json TEXT NOT NULL,    -- SchemaOperation
  applied_by TEXT NOT NULL,        -- 'user' | 'ai'
  user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  applied_at INTEGER NOT NULL
);

CREATE INDEX idx_schema_ops_collection ON schema_operations(collection_id, applied_at);

-- Records (每筆資料)
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),  -- 為了查詢效率
  data_json TEXT NOT NULL,         -- { [field_id]: value }
  source TEXT NOT NULL,            -- 'form' | 'screenshot' | 'manual'
  source_metadata_json TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_records_collection ON records(collection_id, deleted_at, created_at DESC);
CREATE INDEX idx_records_workspace ON records(workspace_id);

-- Input configs
CREATE TABLE inputs (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  type TEXT NOT NULL,              -- 'public_form' | 'screenshot'
  enabled INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT,              -- type-specific config
  public_slug TEXT UNIQUE,         -- only for public_form
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_inputs_public_slug ON inputs(public_slug);

-- Form submissions
CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  input_id TEXT NOT NULL REFERENCES inputs(id),
  collection_id TEXT NOT NULL REFERENCES collections(id),
  record_id TEXT NOT NULL REFERENCES records(id),
  ip_country TEXT,
  user_agent TEXT,
  submitted_at INTEGER NOT NULL
);

-- Screenshot jobs
CREATE TABLE screenshot_jobs (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  image_url TEXT NOT NULL,         -- R2 path
  status TEXT NOT NULL,            -- 'preview_ready' | 'committed' | 'cancelled'(同步抽取,無 pending/processing)
  extraction_result_json TEXT,
  record_id TEXT REFERENCES records(id),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  committed_at INTEGER
);

-- Chat
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  context_collection_id TEXT REFERENCES collections(id),
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id),
  role TEXT NOT NULL,              -- 'user' | 'assistant'
  content TEXT NOT NULL,
  actions_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
```

### 5.4 API 設計

統一 prefix:`/api/v1`。所有 endpoints (除標註外) 都需要 session cookie。

```
# Auth (透過 Better Auth)
POST   /api/auth/sign-up
POST   /api/auth/sign-in
POST   /api/auth/sign-out
GET    /api/auth/session
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/oauth/google

# Workspace
GET    /api/v1/workspace                     # 取得 current workspace
PATCH  /api/v1/workspace                     # 改名
GET    /api/v1/workspace/usage               # 用量

# Collections
GET    /api/v1/collections                   # 列表
POST   /api/v1/collections                   # 建立 (通常由 chat 觸發)
GET    /api/v1/collections/:id
PATCH  /api/v1/collections/:id               # 改名 / icon
DELETE /api/v1/collections/:id               # 軟刪除
GET    /api/v1/collections/:id/schema        # 當前 schema
GET    /api/v1/collections/:id/operations    # operations 歷史
POST   /api/v1/collections/:id/operations    # 套用 operations (通常由 chat 觸發)

# Records
GET    /api/v1/collections/:id/records       # 列表,支援 query params: filter, sort, limit, offset
POST   /api/v1/collections/:id/records       # 手動新增
GET    /api/v1/records/:id
PATCH  /api/v1/records/:id                   # inline edit
DELETE /api/v1/records/:id                   # 軟刪除
POST   /api/v1/collections/:id/records/export # 匯出 CSV

# Inputs
GET    /api/v1/collections/:id/inputs        # 該 collection 的所有 input
POST   /api/v1/collections/:id/inputs        # 建立 input (例如啟用公開表單)
PATCH  /api/v1/inputs/:id                    # 改設定
DELETE /api/v1/inputs/:id

# Public form (no auth)
GET    /f/:public_slug                       # SSR 公開表單頁
POST   /api/v1/public/forms/:public_slug/submit  # 訪客提交

# Screenshot(同步抽取:上傳後 await,直接回 preview 結果,無需 polling)
POST   /api/v1/collections/:id/screenshots   # 上傳截圖 → await vision → 回 preview_ready 結果
GET    /api/v1/screenshots/:job_id           # 取得抽取結果(重新整理用)
POST   /api/v1/screenshots/:job_id/commit    # 確認 preview 並寫入(可帶編輯後的值)
POST   /api/v1/screenshots/:job_id/cancel    # 取消

# Chat
GET    /api/v1/chat/sessions                 # 列表
POST   /api/v1/chat/sessions                 # 建立新 session
GET    /api/v1/chat/sessions/:id/messages    # 取得歷史
POST   /api/v1/chat/sessions/:id/messages    # 發送訊息 (SSE 串流回應)
DELETE /api/v1/chat/sessions/:id
```

### 5.5 前端頁面

**Admin 介面 (登入後)**

```
/                          → 重導向到 /home 或 /login
/login                     → 登入頁
/sign-up                   → 註冊頁
/home                      → Workspace 首頁 (chat + collection 列表)
/c/:slug                   → 單個 Collection 頁面
/c/:slug?view=records      → 預設,顯示資料表格
/c/:slug?view=settings     → schema、inputs、share 設定
/c/:slug?view=chat         → Collection-scoped chat
/screenshots/:job_id       → 截圖抽取 preview 頁
/settings                  → 帳號 / workspace / 用量
/usage                     → 用量檢視(配額還剩多少;Phase 1 無付費方案,/billing 留待 Phase 2)
```

**公開頁面 (無需登入)**

```
/f/:public_slug            → 公開表單填寫頁 (SSR)
/f/:public_slug/thanks     → 提交成功頁
```

**Layout 建議:**

主介面採用 **三欄式佈局**:
```
┌─────────────┬──────────────────────────┬──────────────┐
│ 左 sidebar   │ 中間主內容區              │ 右 chat 面板  │
│ - Workspace │ (表格 / 設定 / preview)   │ 永遠在的     │
│ - Collection│                          │ AI 對話框    │
│   list      │                          │             │
│ - settings  │                          │             │
└─────────────┴──────────────────────────┴──────────────┘
```

Chat 是常駐右側,任何時刻都可以對 AI 講話。當前 collection context 自動同步到 chat。

### 5.6 AI 整合細節

#### 5.6.1 Chat 系統 prompt

System prompt 應該包含:
- 產品上下文 (你是這個產品的 AI 助理,負責協助管理 Collection)
- 當前 workspace 的所有 collections 簡介
- 當前對話綁定的 collection 的完整 schema
- 可用的 tools

#### 5.6.2 Tool 定義 (Phase 1)

```typescript
// Tools that AI can call

tool: create_collection
  description: 建立一個新的 Collection
  parameters: {
    name: string,
    slug: string,        // url-friendly
    icon?: string,       // emoji
    description?: string,
    initial_fields: Field[]
  }
  returns: { collection_id, success }
  // 直接建立(不走 propose):建的是空表,無覆蓋既有資料風險,onboarding 優先

tool: propose_schema_operations
  description: 對指定 Collection 提出 schema 變動「提案」(不直接套用)
  parameters: {
    collection_id: string,
    schema_version: number,   // 提案所基於的版本,確認時做樂觀鎖比對
    operations: SchemaOperation[],
    reason: string            // 給用戶看的解釋
  }
  returns: { proposal }       // 只回傳提案,存進 chat message 的 actions_json(狀態 pending)
  // 重要:此 tool 絕不寫 DB。真正套用走 POST /collections/:id/operations(用戶確認後)
  // 用戶只能接受/拒絕(Phase 1 不支援逐欄編輯);刪欄位需紅色二次確認;版本不符則拒絕並提示重整

tool: query_records
  description: 查詢 Collection 的資料
  parameters: {
    collection_id: string,
    filter?: {
      field_id: string,
      op: 'eq' | 'gt' | 'lt' | 'contains' | 'between',
      value: any
    }[],
    sort?: { field_id: string, direction: 'asc' | 'desc' }[],
    limit?: number,
    offset?: number
  }
  returns: { records: Record[], total: number }

tool: extract_from_screenshot
  description: 從截圖中抽取結構化資料 (vision)
  parameters: {
    image_url: string,
    target_collection_id: string,
    current_schema: { fields: Field[] }
  }
  returns: {
    fields: { [field_id]: { value, confidence, source_hint } },
    suggested_new_fields?: Field[],
    overall_notes?: string
  }

tool: enable_public_form
  description: 為 Collection 啟用公開表單
  parameters: {
    collection_id: string,
    title: string,
    description?: string,
    submit_button_text?: string,
    thank_you_message?: string
  }
  returns: { public_slug, public_url }
```

#### 5.6.3 截圖抽取 prompt 策略

呼叫 vision model 時,完整 context 包含:
1. **任務說明**:「從這張圖中抽取資料,填入下列欄位」
2. **目標 schema**:列出每個 field 的 name、type、ai_hint
3. **指令**:「對每個欄位,輸出值 + confidence (0-1) + 從圖中哪裡得到。不確定就留空。發現可能需要的新欄位,放在 suggested_new_fields。」
4. **格式指令**:輸出值必須符合 §2.4 的儲存格式(日期 `YYYY-MM-DD`、數字給原始數值不含符號、電話給字串),commit 時零轉換。
5. **隱私指令**:「不要記住或重述敏感資料,只做結構化抽取。」

輸出嚴格用 tool_use,不要 free-form 文字。

#### 5.6.4 資料查詢策略

當用戶問「上週收到幾筆」,AI 應該:
1. 用 `query_records` tool 設定 filter (created_at >= 7 days ago)
2. 收到 result 後,用自然語言回覆

不要把 raw records 全部塞進 LLM context (隱私 + 成本)。一律走 structured query。

進階查詢 (Phase 3 才做):需要 LLM 看少量 record 內容時,做 sampling,並在 UI 上明確標示「AI 看過你以下幾筆資料」。

### 5.7 Phase 1 接受標準 (Done = ?)

Phase 1 完成的判斷標準:

- [ ] 新用戶可以從註冊到第一個 collection 建立,全程不需要任何外部說明
- [ ] AI 可以從空白對話中,建立一個 5-7 欄位的合理 schema
- [ ] AI 可以接受「加 X 欄位」「改 Y 欄位類型」「刪 Z 欄位」並正確 apply
- [ ] 上傳一張清楚的 LINE / Email 截圖,AI 能抽出至少 60% 欄位的正確值
- [ ] 截圖 preview 卡片可以編輯每個欄位後再 commit
- [ ] 公開表單頁在手機上看起來專業、能順利提交
- [ ] 表單提交後,owner 在 1 分鐘內收到 email 通知
- [ ] 後台表格可以看到、編輯、匯出資料
- [ ] 達配額上限時正確阻擋並顯示友善提示(Phase 1 無升級路徑、無付費)
- [ ] 全站 P95 API 回應時間 < 500ms (排除 AI 端點)
- [ ] AI 端點 (chat / screenshot) 有明確的 loading 狀態,不會看起來卡住
- [ ] 主流瀏覽器 (Chrome / Safari / Edge) 桌面 + 手機都能用
- [ ] 介面繁中正確,沒有英文落單字

---

## 6. UX/UI 原則

### 6.1 核心原則 (貫穿所有功能)

1. **AI 動作必須先 preview**:所有 AI 觸發的寫入 (schema 改動、資料抽取、表單建立) 都要顯示 preview,用戶確認才執行
2. **顯示 AI 的「根據」與「信心」**:抽取結果旁邊小字顯示來源、confidence
3. **永遠可 undo**:刪除是軟刪除、schema 改動有 operations log
4. **空狀態要友善**:新 collection 沒資料時,顯示「拖一張截圖到這裡」、「分享公開表單連結」等引導
5. **錯誤訊息要人話**:不要顯示 500 / stack trace,顯示「AI 抽取失敗,試試清楚一點的圖片」
6. **行動端不是縮小版桌面**:截圖上傳、查詢這些常用功能,行動端要單獨設計

### 6.2 設計系統方向

- 用 **shadcn/ui** 作為元件基礎
- 用 **Tailwind CSS** 主要樣式
- **不要 overdesign**:乾淨、留白、字體清楚比花俏 UI 重要
- 主色:選一個品牌色 (建議冷色系,專業感),搭配 neutral grey
- **支援 dark mode** (但 Phase 1 可以先做好 light mode)
- 字體:中文用 Noto Sans TC、英文用 Inter

### 6.3 關鍵交互模式

**截圖 Preview 卡片** (這是產品最重要的 UX 之一):

```
┌────────────────────────────────────────────────┐
│  📸 從截圖抽取                                  │
│  ┌──────────────────┐                          │
│  │  [縮圖]           │                          │
│  └──────────────────┘                          │
│                                                │
│  我抽到以下資料,要寫入「客戶資料」嗎?           │
│                                                │
│  ✓ 姓名     王大明              [高信心]       │
│  ✓ 公司     ABC 設計工作室      [高信心]       │
│  ⚠ 預算     50,000 (?)         [中信心 - 編輯] │
│  ⚠ 產業     ___ (沒看到)        [低信心 - 補]  │
│  ✓ Email    wang@abc.com       [高信心]       │
│                                                │
│  💡 建議新增欄位:「下次聯絡時間」              │
│     (原文:「下週三再聊」)        [加入] [略過] │
│                                                │
│  [取消]                        [編輯後確認]    │
└────────────────────────────────────────────────┘
```

**Chat 介面**:

- 常駐右側面板,固定寬度 (可摺疊)
- 上方顯示當前 context (例如「目前對話對象:客戶資料 Collection」)
- 用戶可切換 context 或設為「跨 Collection」
- AI 回覆中如果有 tool call (schema 變動、查詢),用卡片呈現,不是純文字
- 串流回應 (SSE)

---

## 7. 配額策略(Phase 1:免費版 + 成本/濫用上限)

**Phase 1 只有免費版,不收費、不分方案。** 以下所有上限的目的**不是商業方案,而是純粹的成本 / 濫用煞車** —— 防止單一用戶(或寫壞的 script)燒爆 AI 帳單或塞爆儲存。零收入階段,寧可設緊一點,上線後看 AI Gateway 真實 log 再放寬。

| 項目 | Free 上限 | 性質 |
|---|---|---|
| Collections | 3 | 規模煞車 |
| 總 Records | 500(累計) | 儲存煞車 |
| 截圖抽取 (每月) | 20 | **AI 成本煞車** |
| 公開表單提交 (每月) | 100 | 濫用煞車 |
| AI Chat tokens (每月) | 硬上限 | **AI 成本煞車** |
| Email 通知 / CSV 匯出 | ✓ | 無上限 |
| 公開表單 footer logo | 有 | — |

> **AI 成本硬上限(最重要):** `ai_tokens_used_this_month` 與 `screenshots_used_this_month` 設**真實硬上限,達標即擋**。這是零收入階段唯一的防燒錢機制 —— 沒有它,一個用戶就能讓你收到幾百鎂的 Anthropic 帳單。注意 token 用量是呼叫**後**才知道,所以是 best-effort,可能超出一個呼叫的量;vision 另設「單次 input/output token 上限」當第二道閘。

> **上限數字怎麼定:** Week 0 spike 拿到「單張截圖真實成本 C」後回推 —— 問的不是「Pro 賺不賺錢」,而是「**一個免費用戶用滿額度,最壞花我多少?**」。例:`20 張 × C`,若 C=$0.025 → 每註冊最壞 $0.5(可接受當獲客成本);若 C 高到 $5/人,就把免費截圖從 20 下調。

**配額重設:** screenshots / form submissions / ai_tokens 每月 1 號重設。Records 是累計(不重設,刪除才會降)。

**達上限處理:** 
- 截圖 / AI:阻擋,顯示「已達本月使用上限」(Phase 1 無升級路徑,純提示)
- 表單提交:阻擋(顯示「此表單暫時不接受新提交」給訪客,通知 owner)
- Records:阻擋新增(chat、表單、截圖都會擋)

> **Pro / 線上付費 → Phase 2 才規劃。** 定價數字($15 等)、Pro 配額、Stripe、升級流程、定價回推公式全部延後。`workspaces.plan` 欄位先保留(預設 `'free'`),但 Phase 1 不用它做任何分支邏輯。

---

## 8. 非功能需求

### 8.1 性能

- **冷啟動 < 50ms** (Cloudflare Workers 自然達成)
- **P95 API < 500ms** (排除 AI endpoint)
- **公開表單頁 LCP < 1.5s** (SSR + minimal JS)
- **截圖抽取 < 15s** (從上傳到 preview ready)

### 8.2 安全與隱私

- 所有 API 走 HTTPS
- Session 用 httpOnly secure cookie
- 公開表單防 bot:Turnstile + per-IP rate limit
- 截圖儲存加密 (R2 自動)
- AI Gateway 設定**禁止用於訓練** (Claude API 預設不訓練,但要 double check)
- 用戶可以隨時刪除自己的資料 (軟刪除 → 30 天後實刪)
- GDPR / PDPA 友善:在公開表單下方顯示資料用途、聯絡方式
- API key (Phase 3+) 走 hashed 儲存

### 8.3 監控與可觀測性

- Sentry 接住前後端錯誤
- Cloudflare Analytics 看流量
- AI Gateway 看每個 LLM call 的成本、延遲、錯誤

> **不自製 analytics dashboard。** Phase 1 用戶量小,要看 DAU / 抽取成功率 / AI 成本就跑一條 SQL + 看上面三個現成來源。有量了再建 dashboard。

### 8.4 國際化

- v1 只做繁體中文
- **不架 i18next 框架**:UI 文案集中放一個 `zh-TW` 字串常數檔(見附錄 A),真要加日文 / 英文時再導 i18next。「先架框架」通常比之後重構還貴。
- 日期、時間、貨幣格式用 `Intl` API,預設 `zh-TW`

---

## 9. 程式碼結構建議

```
/
├── web/                          # React SPA (admin UI)
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── lib/
│   │   └── ...
│   └── package.json
│
├── worker/                       # 單一 Worker:API + 公開表單 SSR
│   ├── src/
│   │   ├── index.ts              # Hono entry(/api、/f、/auth)
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── workspaces.ts
│   │   │   ├── collections.ts
│   │   │   ├── records.ts
│   │   │   ├── inputs.ts
│   │   │   ├── screenshots.ts    # 同步抽取
│   │   │   ├── chat.ts
│   │   │   └── public-form.ts    # /f/* SSR
│   │   ├── ai/
│   │   │   ├── client.ts         # AI Gateway client (Claude)
│   │   │   ├── tools.ts          # Tool definitions
│   │   │   ├── prompts.ts        # System prompts
│   │   │   └── extraction.ts     # 截圖抽取邏輯
│   │   ├── lib/
│   │   │   ├── db.ts             # D1 helpers + scopedDb(workspace_id)
│   │   │   ├── auth.ts           # Better Auth setup
│   │   │   ├── schema-ops.ts     # Schema operations apply 到 snapshot
│   │   │   └── ...
│   │   └── types.ts
│   └── wrangler.toml
│
├── shared/                       # 共用 TypeScript 型別 + zod schema
│   └── ...                       # (先用單一資料夾,別急著拆 monorepo packages)
│
├── migrations/                   # D1 migrations
│   ├── 0001_initial.sql
│   └── ...
│
└── README.md
```

---

## 10. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| AI 抽取結果信任崩潰 | 用戶不再用截圖功能 | 強制 preview、顯示信心、明確編輯流程 |
| AI 成本超出預期 | 利潤吃緊 | AI Gateway cache、每用戶配額、選對模型 |
| Cloudflare D1 限制 | Scale 困難 | 先單 D1,監控大小,接近時做 sharding |
| 公開表單被濫用 | 垃圾資料、頻寬成本 | Turnstile、IP rate limit、表單可關閉 |
| LINE 截圖隱私疑慮 | 用戶不敢上傳 | 明確隱私政策、不用於訓練聲明、可刪除 |
| 競品快速跟進 | 失去差異化 | 持續深化截圖體驗、累積用戶資料的網路效應 |

---

## 11. 後續階段預覽 (僅供方向參考,不要實作)

**Phase 2 重點預告:**
- **Stripe 線上付費**(Phase 1 從範圍移出)
- **表單檔案上傳**(file / image 欄位型別)
- 公開展示頁 (`/t/[slug]`) — 把 collection 變成可瀏覽的網頁,gallery / list / table 三種樣式
- 表單條件邏輯、多步驟
- LINE Notify、Slack / Discord webhook 通知
- 自訂網域、品牌色

**Phase 3 重點預告:**
- 對話直接寫入資料 (不只查資料)
- 跨 Collection 智慧路由
- Email 轉寄輸入
- REST API、Webhook outgoing
- Reference field (collection 間關聯)

**Phase 4 重點預告:**
- 多人 Workspace、角色、權限
- LINE Bot 雙向整合
- Notion / Google Sheets sync
- Embed widget

**永遠不會做的:**
- Kanban / Gantt / Timeline view (Airtable 地盤)
- Formula 語言
- 進階 multi-step automation builder
- 完整即時多人協作編輯 schema

---

## 12. 開發實施建議

### 12.1 建議的開發順序 (Phase 1 內部)

```
Week 0: 動工前 spike(先驗證核心賭注,別用想的)
  - 拿 10-20 張真實 LINE/Email 截圖,手測 Claude vision 抽取命中率
  - 同時比 Sonnet vs 便宜 vision 款的品質落差 → 定案截圖型號
  - 驗 Better Auth 在 Workers + D1 能順跑 (session / OAuth / reset token)
  - 確認 AI Gateway / Claude 不訓練、Email 網域驗證可行
  - ⚠ 過關才進 Week 1;命中率不理想就回頭調整產品假設

Week 1-2: 基礎建設
  - 專案初始化 (單一 Worker + Vite SPA + Hono + Better Auth)
  - D1 migrations、基本 schema、scopedDb(workspace_id) wrapper
  - Email + Google 登入跑通
  - Workspace 自動建立

Week 3-4: Collection 核心 + Chat 骨架
  - Collection CRUD
  - Schema operations 機制 (apply 到 snapshot / 記 audit log)
  - Chat 介面 + 串流回應 (用 dummy AI 也行)
  - 接 Claude API,實作 create_collection、apply_schema_operations tools

Week 5-6: 截圖抽取
  - R2 上傳
  - Vision API 同步整合 (上傳 → await → preview)
  - Preview 卡片 UI
  - Commit / Edit / Cancel 流程

Week 7: 公開表單 + 後台檢視
  - Schema-driven form renderer
  - 公開表單頁 SSR (同一 worker)
  - Turnstile 整合
  - Email 通知
  - Admin 表格檢視、inline edit、CSV 匯出

Week 8: Chat 查詢 + 配額 + 收尾
  - query_records tool
  - 配額追蹤與限制 (Pro 人工開通)
  - 端對端測試所有 user stories
  - 性能優化、錯誤處理打磨
  - Landing page、隱私政策 / TOS
```

### 12.2 測試策略

- **不追求 100% test coverage**,Phase 1 先求 ship
- **必測**:Schema operations apply、Records CRUD、AI tool 回傳格式驗證、多租戶隔離(workspace_id scoping)
- **手動測試** UI flow,用真實截圖測抽取
- **E2E**:用 Playwright 跑 3-5 個核心 user journey

### 12.3 上線檢查清單

- [ ] 環境變數正確 (API keys)
- [ ] D1 production migrations 跑過
- [ ] R2 bucket + CORS
- [ ] AI Gateway 設定 (cache、rate limit)
- [ ] Turnstile site key + secret
- [ ] Custom domain + SSL
- [ ] Sentry 接好
- [ ] 隱私政策、服務條款頁
- [ ] 註冊→建表→截圖→表單 端對端走過 3 次

---

## 附錄 A:核心字串 (UI 文案參考)

這些是介面上會出現的關鍵中文文案,可作為 i18n 基礎:

```
# 引導
- 「開始建立你的第一個 Collection」
- 「跟 AI 說,你想要整理什麼?」
- 「拖一張截圖到這裡,我會幫你整理」

# Chat
- 「我可以幫你建立資料表、整理截圖、查詢資料」
- 「我建議加上這幾個欄位:」
- 「要套用以下變動嗎?」

# 截圖 preview
- 「我看到這些資訊」
- 「信心高 / 中 / 低」
- 「從原圖這裡得到」
- 「建議新增欄位」

# 公開表單
- 「謝謝你的提交」
- 「此表單暫時不接受新提交」
- 「Powered by [產品名]」

# 錯誤
- 「網路忙線中,請稍後再試」
- 「AI 處理失敗,請試試清楚一點的圖片」
- 「已達本月使用上限,升級即可繼續使用」
```

---

## 附錄 B:待確認決策

> **已決(v1.1):** 檔案上傳延 Phase 2、AI token 設硬上限、截圖 vision 型號待 spike、動工前先做命中率 spike(Week 0)。

**仍待拍板(產品 / 商業):**
- 免費版上限數字(截圖 20 / records 500 / token 上限)—— Week 0 拿到單張成本 C 後回推「最壞每註冊花多少」(見 §7)
- Pro / 付費方案 / 定價數字 → **Phase 2 才規劃**,Phase 1 不碰
- v1 onboarding 是否只鎖「接案者」一種人
- 產品名、網域、品牌色(目前皆 placeholder)

**技術選擇(有預設,待確認):**
- 前端 = React SPA(已收斂)
- ~~schema preview 流程~~ **已定案(見 §2.3)**:tool 改名 `propose_schema_operations`(只提案不寫 DB)、提案存 `actions_json`、用戶只能接受/拒絕、確認走 `POST /operations` + 樂觀鎖、刪欄位紅色二次確認、版本衝突拒絕重整、`create_collection` 直接建立不走 propose
- chat 歷史:只帶最近 N 則進 context(避免無限長大燒錢)

**動工前 spike(見 §12.1 Week 0):**
- 截圖命中率(最高優先)、Better Auth on Workers+D1、不訓練確認、Email 送達率

**規格細節(可先給預設):**
- 同一用戶多分頁併發改 schema → `schema_version` 樂觀鎖(版本不符拒絕 + 前端 refetch)
- id 前綴 `col_` / `fld_` / `rec_`;slug 生成規則 + 保留字(`api`/`f`/`auth`…)+ 衝突處理
- records REST 列表的 filter / sort query param 格式
- `query_records` 運算子集合(`eq` / `gt` / `lt` / `contains` / `between`)是否夠用
- 第一個 collection 怎麼生(純空白對話 vs 給「客戶」「詢價」範本)
- 軟刪除 30 天實刪 → Cron Trigger;表單 rate limit → Rate Limiting binding / KV(都不是 Queue)

---

**文件版本記錄:**

- v1.0:Phase 1 完整規格,4 階段路線圖
- v1.1:Phase 1 去過度設計 — 移除 Durable Objects、Stripe 線上付費、Cloudflare Queues、多 LLM provider/fallback、自製 analytics dashboard、i18next 框架、change_field_type、表單檔案上傳;schema snapshot 為唯一真相(ops log 降為 audit);截圖抽取改同步(2 態);field types 收斂為 7 種並定義 JSON 儲存格式(§2.4);單一 Worker(合併 public-form);monorepo 攤平為 shared/;新增多租戶隔離硬規則(§3.3)
- v1.2:確立動工前 Week 0 spike(截圖命中率優先);AI token 設硬上限 + 單位經濟試算(§7);截圖 vision 型號待 spike 定案(§3.4);新增附錄 B 待確認決策清單