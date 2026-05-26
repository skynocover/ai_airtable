import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { STRINGS } from "@ai-airtable/shared";
import { signUp, useSession } from "@/lib/auth-client";
import { AuthShell, ErrorText, GoogleAuthButton } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const S = STRINGS.auth;

export default function SignUp() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isPending && session) return <Navigate to="/home" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(S.weakPassword);
      return;
    }
    setBusy(true);
    const { error: err } = await signUp.email({ email, password, name: name || email });
    setBusy(false);
    if (err) {
      // Better Auth 對重複 email 會回錯誤;統一以「已被註冊」呈現。
      setError(
        err.status === 422 || err.code === "USER_ALREADY_EXISTS" ? S.emailTaken : S.genericError,
      );
      return;
    }
    navigate("/home");
  }

  return (
    <AuthShell title={S.signUpTitle}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">{S.nameLabel}</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          {S.signUpSubmit}
        </Button>
      </form>

      <GoogleAuthButton />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {S.signUpToLogin}{" "}
        <Link to="/login" className="font-medium text-foreground hover:underline">
          {S.signUpToLoginLink}
        </Link>
      </p>
    </AuthShell>
  );
}
