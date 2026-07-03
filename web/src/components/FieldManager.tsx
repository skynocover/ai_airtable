import { useState } from "react";
import {
  FIELD_TYPES,
  STRINGS,
  type Collection,
  type Field,
  type FieldType,
  type SchemaOperation,
} from "@ai-airtable/shared";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const S = STRINGS.schemaAdmin;

/**
 * 手動管理欄位(schema)—— 不經 AI,直接組 SchemaOperation 呼叫 #2 既有 POST /operations
 * (帶當前 schema_version 樂觀鎖)。每次套用後由 onChanged 觸發父層 refetch,
 * 讓 collection(含 schema_version)永遠是 server 真相,不在前端猜版本。
 */
export default function FieldManager({
  collection,
  onChanged,
  onClose,
}: {
  collection: Collection;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const fields = collection.schema.fields;
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /** 套用一批 operations;成功或 409 皆 refetch(server 為真相)。 */
  async function apply(operations: SchemaOperation[]): Promise<boolean> {
    if (busy || operations.length === 0) return false;
    setBusy(true);
    try {
      await api.applyOperations(collection.id, collection.schema_version, operations);
      await onChanged();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return false;
      if (err instanceof ApiError && err.status === 409) {
        alert(S.conflict);
        await onChanged(); // refetch 最新 schema(版本已前進)
      } else {
        alert((err as Error).message || S.applyFailed);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const ids = fields.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await apply([{ op: "reorder_fields", field_ids: ids }]);
  }

  async function removeField(fieldId: string) {
    const ok = await apply([{ op: "remove_field", field_id: fieldId }]);
    if (ok) setConfirmRemoveId(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">{S.title}</div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            ✕
          </Button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">{S.noFields}</p>
          ) : (
            fields.map((f, i) => (
              <FieldRow
                key={f.id}
                field={f}
                index={i}
                total={fields.length}
                busy={busy}
                editing={editingId === f.id}
                confirmingRemove={confirmRemoveId === f.id}
                onEdit={() => setEditingId(editingId === f.id ? null : f.id)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                onAskRemove={() => setConfirmRemoveId(f.id)}
                onCancelRemove={() => setConfirmRemoveId(null)}
                onConfirmRemove={() => removeField(f.id)}
                onSaveEdit={async (ops) => {
                  const ok = await apply(ops);
                  if (ok) setEditingId(null);
                }}
              />
            ))
          )}
        </div>

        <div className="border-t px-4 py-3">
          {adding ? (
            <AddFieldForm
              busy={busy}
              onCancel={() => setAdding(false)}
              onAdd={async (op) => {
                const ok = await apply([op]);
                if (ok) setAdding(false);
              }}
            />
          ) : (
            <Button size="sm" onClick={() => setAdding(true)} disabled={busy}>
              + {S.addField}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function typeLabel(t: FieldType): string {
  return S.types[t];
}

function FieldRow({
  field,
  index,
  total,
  busy,
  editing,
  confirmingRemove,
  onEdit,
  onMoveUp,
  onMoveDown,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
  onSaveEdit,
}: {
  field: Field;
  index: number;
  total: number;
  busy: boolean;
  editing: boolean;
  confirmingRemove: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  onSaveEdit: (ops: SchemaOperation[]) => void;
}) {
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{field.name}</div>
          <div className="text-xs text-muted-foreground">
            {typeLabel(field.type)}
            {field.required ? " · 必填" : ""}
            {field.currency ? ` · ${field.currency}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || index === 0}
            onClick={onMoveUp}
            title={S.moveUp}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || index === total - 1}
            onClick={onMoveDown}
            title={S.moveDown}
          >
            ↓
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onEdit}>
            {S.edit}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="text-destructive hover:text-destructive"
            onClick={onAskRemove}
          >
            {S.remove}
          </Button>
        </div>
      </div>

      {confirmingRemove ? (
        <div className="mt-2 rounded border border-destructive/50 bg-destructive/5 p-2">
          <div className="text-xs font-medium text-destructive">{S.removeConfirmTitle}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{S.removeConfirmBody}</div>
          <div className="mt-2 flex gap-2">
            <Button variant="destructive" size="sm" disabled={busy} onClick={onConfirmRemove}>
              {S.removeConfirm}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancelRemove}>
              {S.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? <EditFieldForm field={field} busy={busy} onSave={onSaveEdit} /> : null}
    </div>
  );
}

/** 編輯既有欄位:改名 → rename_field;改設定 → update_field_meta(不可改 type)。可一次送多個 op。 */
function EditFieldForm({
  field,
  busy,
  onSave,
}: {
  field: Field;
  busy: boolean;
  onSave: (ops: SchemaOperation[]) => void;
}) {
  const [name, setName] = useState(field.name);
  const [required, setRequired] = useState(field.required);
  const [options, setOptions] = useState((field.options ?? []).join(", "));
  const [currency, setCurrency] = useState(field.currency ?? "");
  const [aiHint, setAiHint] = useState(field.ai_hint ?? "");

  function buildOps(): SchemaOperation[] {
    const ops: SchemaOperation[] = [];
    const newName = name.trim();
    if (newName && newName !== field.name) {
      ops.push({ op: "rename_field", field_id: field.id, new_name: newName });
    }
    // update_field_meta:只帶有變動的設定(type/id 不可改)。
    const updates: Record<string, unknown> = {};
    if (required !== field.required) updates.required = required;
    if (field.type === "select_single") {
      const opts = options
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      if (JSON.stringify(opts) !== JSON.stringify(field.options ?? [])) updates.options = opts;
    }
    if (field.type === "number" && currency !== (field.currency ?? "")) {
      updates.currency = currency.trim();
    }
    if (aiHint !== (field.ai_hint ?? "")) updates.ai_hint = aiHint.trim();
    if (Object.keys(updates).length > 0) {
      ops.push({ op: "update_field_meta", field_id: field.id, updates });
    }
    return ops;
  }

  return (
    <div className="mt-2 space-y-2 rounded bg-muted/40 p-2">
      <label className="block text-xs text-muted-foreground">
        {S.fieldName}
        <Input className="mt-1 h-9" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {S.requiredLabel}
      </label>
      {field.type === "select_single" ? (
        <label className="block text-xs text-muted-foreground">
          {S.optionsLabel}
          <Input
            className="mt-1 h-9"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        </label>
      ) : null}
      {field.type === "number" ? (
        <label className="block text-xs text-muted-foreground">
          {S.currencyLabel}
          <Input
            className="mt-1 h-9"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </label>
      ) : null}
      <label className="block text-xs text-muted-foreground">
        {S.aiHintLabel}
        <Input className="mt-1 h-9" value={aiHint} onChange={(e) => setAiHint(e.target.value)} />
      </label>
      <Button size="sm" disabled={busy} onClick={() => onSave(buildOps())}>
        {S.save}
      </Button>
    </div>
  );
}

/** 新增欄位 → add_field(7 種型別;select_single 需 options)。 */
function AddFieldForm({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (op: SchemaOperation) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("short_text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [currency, setCurrency] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(STRINGS.collections.nameEmpty);
      return;
    }
    const field: Record<string, unknown> = { name: trimmed, type, required };
    if (type === "select_single") {
      field.options = options
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
    }
    if (type === "number" && currency.trim()) field.currency = currency.trim();
    onAdd({ op: "add_field", field } as SchemaOperation);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 min-w-[8rem] flex-1"
          placeholder={S.fieldName}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
      </div>
      {type === "select_single" ? (
        <Input
          className="h-9"
          placeholder={S.optionsLabel}
          value={options}
          onChange={(e) => setOptions(e.target.value)}
        />
      ) : null}
      {type === "number" ? (
        <Input
          className="h-9"
          placeholder={S.currencyLabel}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
      ) : null}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {S.requiredLabel}
      </label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={submit}>
          {S.add}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          {S.cancel}
        </Button>
      </div>
    </div>
  );
}
