import { useState } from "react";
import { Link } from "react-router-dom";
import { STRINGS } from "@ai-airtable/shared";
import { requestPasswordReset } from "@/lib/auth-client";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const S = STRINGS.auth;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // 無論 email 是否存在,都呼叫後一律顯示相同訊息(不洩露註冊狀態)。
    await requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthShell title={S.forgotTitle} description={sent ? undefined : S.forgotDescription}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{S.forgotSent}</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{S.backToLogin}</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">{S.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder={S.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {S.forgotSubmit}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/login">{S.backToLogin}</Link>
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
