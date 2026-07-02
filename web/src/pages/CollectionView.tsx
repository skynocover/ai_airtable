import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { STRINGS, type Collection, type Field, type RecordItem } from "@ai-airtable/shared";
import { useSession } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { formatFieldValue, htmlInputType, inputKindForField } from "@/lib/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const R = STRINGS.records;
const C = STRINGS.collections;

const SOURCE_LABELS: Record<string, string> = {
  manual: R.sourceManual,
  screenshot: R.sourceScreenshot,
  form: R.sourceForm,
};

interface SortState {
  field: string;
  dir: "asc" | "desc";
}

export default function CollectionView() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session, isPending } = useSession();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [sort, setSort] = useState<SortState | null>(null);
  const [editing, setEditing] = useState<{ recordId: string; fieldId: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState("");

  const fields: Field[] = useMemo(() => collection?.schema.fields ?? [], [collection]);

  // slug → collection(Phase 1 用列表解析)。
  useEffect(() => {
    if (isPending || !session || !slug) return;
    setLoadError("");
    api
      .listCollections()
      .then((cols) => {
        const found = cols.find((c) => c.slug === slug);
        if (!found) {
          setLoadError(C.loadFailed);
          return;
        }
        setCollection(found);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return;
        setLoadError(C.loadFailed);
      });
  }, [isPending, session, slug]);

  function refetchRecords(col: Collection, sortState: SortState | null) {
    const sortParam = sortState ? `${sortState.field}:${sortState.dir}` : undefined;
    api
      .listRecords(col.id, { sort: sortParam })
      .then((res) => {
        setRecords(res.records);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return;
        setLoadError(R.loadFailed);
      });
  }

  useEffect(() => {
    if (collection) refetchRecords(collection, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, sort]);

  if (!isPending && !session) return <Navigate to="/login" replace />;

  function toggleSort(fieldId: string) {
    setSort((prev) => {
      if (prev?.field === fieldId)
        return { field: fieldId, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { field: fieldId, dir: "asc" };
    });
  }

  function startEdit(rec: RecordItem, field: Field) {
    setEditing({ recordId: rec.id, fieldId: field.id });
    const v = rec.data[field.id];
    setEditValue(v === undefined || v === null ? "" : String(v));
  }

  async function commitEdit(field: Field) {
    if (!editing || !collection) return;
    const recordId = editing.recordId;
    setEditing(null);
    try {
      const updated = await api.updateRecord(recordId, { [field.id]: editValue });
      setRecords((prev) => prev.map((r) => (r.id === recordId ? updated : r)));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      // 失敗則重新載入,確保畫面與 DB 一致。
      refetchRecords(collection, sort);
    }
  }

  async function onDelete(recordId: string) {
    if (!collection || !window.confirm(R.deleteConfirm)) return;
    try {
      await api.deleteRecord(recordId);
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      refetchRecords(collection, sort);
    }
  }

  async function onAddRow(e: React.FormEvent) {
    e.preventDefault();
    if (!collection) return;
    setRowError("");
    try {
      await api.createRecord(collection.id, newRow);
      setNewRow({});
      setAdding(false);
      refetchRecords(collection, sort);
    } catch (err) {
      setRowError((err as Error).message);
    }
  }

  async function onExport() {
    if (!collection) return;
    try {
      const blob = await api.exportCsv(collection.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection.slug}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // 已導回登入頁
      setLoadError(R.loadFailed);
    }
  }

  function renderEditor(field: Field) {
    const kind = inputKindForField(field);
    if (kind === "select") {
      return (
        <select
          autoFocus
          className="h-9 w-full rounded border border-input bg-background px-2 text-sm"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit(field)}
        >
          <option value="">{R.selectPlaceholder}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    return (
      <Input
        autoFocus
        type={htmlInputType(kind)}
        className="h-9"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={() => commitEdit(field)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(field);
          if (e.key === "Escape") setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/home" className="text-sm text-muted-foreground hover:underline">
            ← {C.back}
          </Link>
          <h1 className="text-xl font-semibold">
            {collection ? `${collection.icon || "📋"} ${collection.name}` : "…"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onExport} disabled={!collection}>
            {R.exportButton}
          </Button>
          <Button
            onClick={() => setAdding((v) => !v)}
            disabled={!collection || fields.length === 0}
          >
            {R.addButton}
          </Button>
        </div>
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {collection && fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">{R.noFields}</p>
      ) : null}

      {collection && fields.length > 0 ? (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {R.total.replace("{n}", String(total))}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {fields.map((f) => (
                    <th
                      key={f.id}
                      className="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium hover:bg-muted"
                      onClick={() => toggleSort(f.id)}
                    >
                      {f.name}
                      {sort?.field === f.id ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium">{R.source}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={fields.length + 2}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      {R.empty}
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec.id} className="border-t">
                      {fields.map((f) => {
                        const isEditing = editing?.recordId === rec.id && editing.fieldId === f.id;
                        return (
                          <td
                            key={f.id}
                            className="px-3 py-2 align-top"
                            onClick={() => {
                              if (!isEditing) startEdit(rec, f);
                            }}
                          >
                            {isEditing ? (
                              renderEditor(f)
                            ) : (
                              <span className="block min-h-[1.25rem] cursor-text">
                                {formatFieldValue(f, rec.data[f.id])}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2">
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {SOURCE_LABELS[rec.source] ?? rec.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onDelete(rec.id)}>
                          🗑
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {adding ? (
            <form onSubmit={onAddRow} className="mt-4 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const kind = inputKindForField(f);
                  return (
                    <label key={f.id} className="space-y-1 text-sm">
                      <span className="text-muted-foreground">
                        {f.name}
                        {f.required ? " *" : ""}
                      </span>
                      {kind === "select" ? (
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={newRow[f.id] ?? ""}
                          onChange={(e) =>
                            setNewRow((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                        >
                          <option value="">{R.selectPlaceholder}</option>
                          {(f.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          type={htmlInputType(kind)}
                          value={newRow[f.id] ?? ""}
                          onChange={(e) =>
                            setNewRow((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              {rowError ? <p className="mt-2 text-sm text-destructive">{rowError}</p> : null}
              <div className="mt-3 flex gap-2">
                <Button type="submit">{R.save}</Button>
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                  {R.cancel}
                </Button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
