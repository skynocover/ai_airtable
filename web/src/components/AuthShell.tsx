import type { ReactNode } from "react";
import { STRINGS } from "@ai-airtable/shared";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold">{STRINGS.app.name}</div>
          <p className="mt-1 text-sm text-muted-foreground">{STRINGS.app.tagline}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-destructive">{children}</p>;
}

/** 「或」分隔線 + Google 社群登入按鈕(登入/註冊頁共用)。 */
export function GoogleAuthButton() {
  return (
    <>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {STRINGS.auth.orDivider}
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signIn.social({ provider: "google", callbackURL: "/home" })}
      >
        {STRINGS.auth.googleButton}
      </Button>
    </>
  );
}
