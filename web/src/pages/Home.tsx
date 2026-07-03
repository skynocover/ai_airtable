import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { STRINGS, FIELD_TYPES, type Collection, type FieldType } from "@ai-airtable/shared";
import { signOut, useSession } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import ChatPanel from "@/components/ChatPanel";

const C = STRINGS.collections;
const H = STRINGS.home;

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  short_text: "短文字",
  long_text: "長文字",
  number: "數字 / 金額",
  select_single: "單選",
  date: "日期",
  email: "Email",
  phone: "電話",
};

interface DraftField {
  name: string;
  type: FieldType;
  options: string; // 逗號分隔(select_single 用)
}

export default function Home() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<DraftField[]>([
    { name: "", type: "short_text", options: "" },
  ]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isPending || !session) return;
    setLoadError("");
    api
      .listCollections()
      .then(setCollections)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return;
        setLoadError(C.loadFailed);
      });
  }, [isPending, session]);

  if (!isPending && !session) return <Navigate to="/login" replace />;

  function resetForm() {
    setName("");
    setFields([{ name: "", type: "short_text", options: "" }]);
    setFormError("");
    setCreating(false);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError(C.nameEmpty);
      return;
    }
    const builtFields = fields
      .filter((f) => f.name.trim())
      .map((f) => {
        const base: Record<string, unknown> = { name: f.name.trim(), type: f.type };
        if (f.type === "select_single") {
          base.options = f.options
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);
        }
        return base;
      });

    setSaving(true);
    try {
      const col = await api.createCollection({ name: name.trim(), fields: builtFields });
      setCollections((prev) => [col, ...(prev ?? [])]);
      resetForm();
      navigate(`/c/${col.slug}`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{C.title}</h1>
          <Button variant="outline" onClick={() => signOut().then(() => navigate("/login"))}>
            {H.signOut}
          </Button>
        </div>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : collections === null ? (
          <p className="text-sm text-muted-foreground">{H.loading}</p>
        ) : (
          <>
            <div className="mb-6 flex justify-end">
              {!creating ? <Button onClick={() => setCreating(true)}>{C.newButton}</Button> : null}
            </div>

            {creating ? (
              <Card className="mb-8">
                <CardContent className="pt-6">
                  <form onSubmit={onCreate} className="space-y-4">
                    <Input
                      autoFocus
                      placeholder={C.namePlaceholder}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />

                    <div className="space-y-2">
                      {fields.map((f, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <Input
                            className="flex-1 min-w-[8rem]"
                            placeholder="欄位名稱"
                            value={f.name}
                            onChange={(e) =>
                              setFields((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                              )
                            }
                          />
                          <select
                            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                            value={f.type}
                            onChange={(e) =>
                              setFields((prev) =>
                                prev.map((x, j) =>
                                  j === i ? { ...x, type: e.target.value as FieldType } : x,
                                ),
                              )
                            }
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {FIELD_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                          {f.type === "select_single" ? (
                            <Input
                              className="flex-1 min-w-[8rem]"
                              placeholder="選項(逗號分隔)"
                              value={f.options}
                              onChange={(e) =>
                                setFields((prev) =>
                                  prev.map((x, j) =>
                                    j === i ? { ...x, options: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setFields((prev) => [
                            ...prev,
                            { name: "", type: "short_text", options: "" },
                          ])
                        }
                      >
                        + 新增欄位
                      </Button>
                    </div>

                    {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

                    <div className="flex gap-2">
                      <Button type="submit" disabled={saving}>
                        {C.create}
                      </Button>
                      <Button type="button" variant="ghost" onClick={resetForm}>
                        {C.cancel}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {collections.length === 0 && !creating ? (
              <div className="rounded-lg border border-dashed py-16 text-center">
                <p className="text-lg font-medium">{C.emptyTitle}</p>
                <p className="mt-2 text-sm text-muted-foreground">{C.emptyHint}</p>
                <Button className="mt-6" onClick={() => setCreating(true)}>
                  {C.newButton}
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {collections.map((col) => (
                  <Link key={col.id} to={`/c/${col.slug}`}>
                    <Card className="transition-colors hover:bg-secondary/50">
                      <CardContent className="flex items-center gap-3 py-5">
                        <span className="text-2xl">{col.icon || "📋"}</span>
                        <div>
                          <div className="font-medium">{col.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {col.schema.fields.length} 個欄位
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <ChatPanel context={null} />
    </>
  );
}
