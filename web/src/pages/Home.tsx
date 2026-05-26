import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { STRINGS, type WorkspacePublic } from "@ai-airtable/shared";
import { signOut, useSession } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const H = STRINGS.home;
const W = STRINGS.workspace;

export default function Home() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [workspace, setWorkspace] = useState<WorkspacePublic | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (isPending || !session) return;
    setLoadError("");
    api
      .getWorkspace()
      .then((ws) => {
        setWorkspace(ws);
        setName(ws.name);
      })
      // 401 已由 api.ts 導回登入頁;其餘錯誤要顯示出來,否則畫面永遠卡在「載入中…」。
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return;
        setLoadError(H.loadFailed);
      });
  }, [isPending, session]);

  if (!isPending && !session) return <Navigate to="/login" replace />;

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    setSaving(true);
    try {
      const ws = await api.updateWorkspace(name);
      setWorkspace(ws);
      setName(ws.name);
      setNotice(W.renamed);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{H.welcome}</h1>
          {session?.user?.name ? (
            <p className="text-sm text-muted-foreground">{session.user.name}</p>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => signOut().then(() => navigate("/login"))}>
          {H.signOut}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{H.currentWorkspace}</CardTitle>
        </CardHeader>
        <CardContent>
          {workspace ? (
            <form className="flex items-end gap-3" onSubmit={onRename}>
              <div className="flex-1 space-y-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
                <p className="text-xs text-muted-foreground">/{workspace.slug}</p>
              </div>
              <Button type="submit" disabled={saving}>
                {H.save}
              </Button>
            </form>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{H.loading}</p>
          )}
          {notice ? <p className="mt-2 text-sm text-muted-foreground">{notice}</p> : null}
        </CardContent>
      </Card>

      <p className="mt-8 text-center text-sm text-muted-foreground">{H.emptyHint}</p>
    </div>
  );
}
