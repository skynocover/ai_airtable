import type { Env } from "../types";

/**
 * Phase 1 最小寄信通道。
 * 完整的共用 email 通道(Resend + 寄件網域驗證 + 樣板)在 `public-form-input` change 建立。
 *
 * 行為(刻意明確分流,避免「假成功」):
 *   - 未設定 RESEND_API_KEY 且為本地開發(baseURL 非 https):把 reset 連結印到 log,正常返回。
 *   - 未設定 RESEND_API_KEY 但為正式環境(baseURL 為 https):**拋出錯誤**。否則 reset token
 *     會被寫進 log(任何有 log 存取權者皆可接管帳號),且 forgot-password 會假成功卻沒寄信。
 *   - 已設定 RESEND_API_KEY:實際寄送;若 Resend 回非 2xx 或 fetch 失敗,**拋出錯誤**,
 *     讓上游(Better Auth forgot-password)知道寄送失敗,而不是默默回成功卻沒寄出。
 */
export async function sendResetPasswordEmail(
  env: Env,
  to: string,
  resetUrl: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // 正式環境(https origin)缺金鑰是設定錯誤:寧可 fail loud,也不要把 token 印進 log。
    if (env.BETTER_AUTH_URL?.startsWith("https://")) {
      console.error("[email] 正式環境未設定 RESEND_API_KEY,拒絕以印 log 方式洩漏 reset token");
      throw new Error("寄信服務未設定");
    }
    // 本地開發:只印 log(reset 連結可直接從 log 取得)。
    console.log(`[email:reset-password] to=${to} url=${resetUrl}`);
    return;
  }

  // 寄件人可由環境覆寫;預設值僅適用 Resend 測試(只能寄給帳號擁有者),
  // 正式環境務必設定 EMAIL_FROM 為已驗證網域的寄件地址。
  const from = env.EMAIL_FROM || "AI 資料工作台 <onboarding@resend.dev>";

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "重設你的密碼",
        html:
          `<p>我們收到了重設密碼的請求。點擊下方連結設定新密碼(連結會在一段時間後失效):</p>` +
          `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
          `<p>如果不是你本人操作,請忽略這封信。</p>`,
      }),
    });
  } catch (e) {
    console.error("[email] Resend 寄送失敗", e);
    throw new Error("寄送重設密碼信失敗");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[email] Resend 回應非 2xx", res.status, detail);
    throw new Error(`寄送重設密碼信失敗(HTTP ${res.status})`);
  }
}
