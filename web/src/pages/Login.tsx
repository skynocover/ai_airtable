import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { STRINGS } from "@ai-airtable/shared";
import { signIn, useSession } from "@/lib/auth-client";
import { AuthShell, ErrorText, GoogleAuthButton } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const S = STRINGS.auth;

export default function Login() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 已登入者自動導向 /home
  if (!isPending && session) return <Navigate to="/home" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await signIn.email({ email, password });
    setBusy(false);
    if (err) {
      setError(S.invalidCredentials);
      return;
    }
    navigate("/home");
  }

  return (
    <AuthShell title={S.loginTitle}>
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{S.passwordLabel}</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:underline">
              {S.forgotPasswordLink}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {S.loginSubmit}
        </Button>
      </form>

      <GoogleAuthButton />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {S.loginToSignUp}{" "}
        <Link to="/sign-up" className="font-medium text-foreground hover:underline">
          {S.loginToSignUpLink}
        </Link>
      </p>
    </AuthShell>
  );
}
