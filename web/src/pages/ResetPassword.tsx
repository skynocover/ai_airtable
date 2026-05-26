import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { STRINGS } from "@ai-airtable/shared";
import { resetPassword } from "@/lib/auth-client";
import { AuthShell, ErrorText } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const S = STRINGS.auth;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError(S.invalidResetToken);
      return;
    }
    if (password.length < 8) {
      setError(S.weakPassword);
      return;
    }
    setBusy(true);
    const { error: err } = await resetPassword({ newPassword: password, token });
    setBusy(false);
    if (err) {
      setError(S.invalidResetToken);
      return;
    }
    setDone(true);
  }

  return (
    <AuthShell title={S.resetTitle}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{S.resetSuccess}</p>
          <Button asChild className="w-full">
            <Link to="/login">{S.backToLogin}</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="password">{S.passwordLabel}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder={S.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={busy}>
            {S.resetSubmit}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
