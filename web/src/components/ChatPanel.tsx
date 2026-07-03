import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  STRINGS,
  type ChatAction,
  type Collection,
  type CreateCollectionAction,
  type QueryRecordsAction,
  type SchemaOperation,
  type SchemaProposalAction,
} from "@ai-airtable/shared";
import { api, ApiError } from "@/lib/api";
import { chatApi } from "@/lib/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const T = STRINGS.chat;

interface UiMessage {
  id: string | null; // 持久化的 message id(assistant 於 done 後才有);提案 accept/reject 需要
  role: "user" | "assistant";
  content: string;
  actions: ChatAction[];
}

/** localStorage key:每個 context(collection 或 home)記一個 session,重整後可讀回歷史。 */
function ctxKey(context: Collection | null): string {
  return `chat_session:${context?.id ?? "home"}`;
}

export default function ChatPanel({
  context,
  onSchemaApplied,
}: {
  context: Collection | null;
  onSchemaApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const key = ctxKey(context);

  // context 切換:讀回該 context 的 session 與歷史(6.6:提案卡片狀態正確還原)。
  useEffect(() => {
    const saved = localStorage.getItem(key);
    setSessionId(saved);
    setMessages([]);
    if (!saved) return;
    chatApi
      .getMessages(saved)
      .then((r) => {
        setMessages(
          r.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            actions: m.actions,
          })),
        );
      })
      .catch(() => {
        // session 不存在(可能已刪)→ 清掉。
        localStorage.removeItem(key);
        setSessionId(null);
      });
  }, [key]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  function patchLastAssistant(update: (m: UiMessage) => UiMessage) {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = update(next[i]);
          break;
        }
      }
      return next;
    });
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");

    try {
      let sid = sessionId;
      if (!sid) {
        const session = await chatApi.createSession(context?.id ?? null);
        sid = session.id;
        setSessionId(sid);
        localStorage.setItem(key, sid);
      }

      // 使用者訊息 + 一則空的 assistant streaming 訊息。
      setMessages((prev) => [
        ...prev,
        { id: null, role: "user", content: text, actions: [] },
        { id: null, role: "assistant", content: "", actions: [] },
      ]);

      await chatApi.send(sid, text, {
        onText: (delta) => patchLastAssistant((m) => ({ ...m, content: m.content + delta })),
        onAction: (card) => patchLastAssistant((m) => ({ ...m, actions: [...m.actions, card] })),
        onError: (message) =>
          patchLastAssistant((m) => ({
            ...m,
            content: m.content || `⚠️ ${message}`,
          })),
        onDone: (messageId) => patchLastAssistant((m) => ({ ...m, id: messageId })),
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        patchLastAssistant((m) => ({ ...m, content: m.content || `⚠️ ${T.failed}` }));
      }
    } finally {
      setSending(false);
    }
  }

  function onNewChat() {
    localStorage.removeItem(key);
    setSessionId(null);
    setMessages([]);
  }

  // 提案 accept/reject。
  async function updateProposal(
    msg: UiMessage,
    action: SchemaProposalAction,
    status: "applied" | "rejected",
  ) {
    if (!msg.id) return;
    if (status === "rejected") {
      await chatApi.patchAction(msg.id, action.id, "rejected").catch(() => {});
      setActionStatus(msg.id, action.id, "rejected");
      return;
    }
    // accept → 走 #2 POST /operations(帶提案 schema_version 樂觀鎖)。
    try {
      await api.applyOperations(
        action.collection_id,
        action.schema_version,
        action.operations as SchemaOperation[],
      );
      await chatApi.patchAction(msg.id, action.id, "applied").catch(() => {});
      setActionStatus(msg.id, action.id, "applied");
      onSchemaApplied?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 版本衝突:提示重整並 refetch schema,卡片維持 pending。
        alert(T.conflict);
        onSchemaApplied?.();
      } else if (!(err instanceof ApiError && err.status === 401)) {
        alert((err as Error).message);
      }
    }
  }

  function setActionStatus(
    messageId: string,
    actionId: string,
    status: SchemaProposalAction["status"],
  ) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              actions: m.actions.map((a) =>
                a.id === actionId && a.type === "schema_operation" ? { ...a, status } : a,
              ),
            }
          : m,
      ),
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:opacity-90"
      >
        💬 {T.open}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-sm flex-col border-l bg-background shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{T.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {context ? `${T.contextPrefix}${context.name}` : T.contextNone}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onNewChat}>
            {T.newChat}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            ✕
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">{T.empty}</p>
        ) : (
          messages.map((m, i) => (
            <MessageBubble
              key={m.id ?? `tmp-${i}`}
              message={m}
              context={context}
              onProposal={updateProposal}
            />
          ))
        )}
      </div>

      <form onSubmit={onSend} className="border-t p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={T.placeholder}
            disabled={sending}
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            {T.send}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  context,
  onProposal,
}: {
  message: UiMessage;
  context: Collection | null;
  onProposal: (m: UiMessage, a: SchemaProposalAction, status: "applied" | "rejected") => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            : "w-full space-y-2"
        }
      >
        {message.content ? (
          <div
            className={
              isUser
                ? "whitespace-pre-wrap"
                : "whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm"
            }
          >
            {message.content}
          </div>
        ) : !isUser && message.actions.length === 0 ? (
          <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {T.thinking}
          </div>
        ) : null}

        {message.actions.map((a) => (
          <ActionCard
            key={a.id}
            action={a}
            message={message}
            context={context}
            onProposal={onProposal}
          />
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  action,
  message,
  context,
  onProposal,
}: {
  action: ChatAction;
  message: UiMessage;
  context: Collection | null;
  onProposal: (m: UiMessage, a: SchemaProposalAction, status: "applied" | "rejected") => void;
}) {
  if (action.type === "create_collection") return <CreatedCard action={action} />;
  if (action.type === "query_records") return <QueryCard action={action} />;
  return (
    <ProposalCard action={action} message={message} context={context} onProposal={onProposal} />
  );
}

function CreatedCard({ action }: { action: CreateCollectionAction }) {
  if (action.status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <div className="font-medium text-destructive">{T.errorTitle}</div>
        <div className="text-muted-foreground">{action.message}</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="font-medium">✅ {T.createdTitle}</div>
      <div className="mt-1 flex items-center justify-between">
        <span>{action.name}</span>
        {action.slug ? (
          <Link to={`/c/${action.slug}`} className="text-primary hover:underline">
            {T.createdOpen} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function QueryCard({ action }: { action: QueryRecordsAction }) {
  if (action.status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <div className="font-medium text-destructive">{T.errorTitle}</div>
        <div className="text-muted-foreground">{action.message}</div>
      </div>
    );
  }
  const rows = action.rows ?? [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      <div className="font-medium">🔍 {T.queryTitle}</div>
      <div className="text-muted-foreground">
        {T.queryTotal.replace("{n}", String(action.total ?? 0))}
      </div>
      {rows.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((r, i) => (
                <tr key={i} className="border-t">
                  {cols.map((c) => (
                    <td key={c} className="whitespace-nowrap px-2 py-1">
                      {String(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const OP_LABELS: Record<SchemaOperation["op"], string> = {
  add_field: T.opAdd,
  remove_field: T.opRemove,
  rename_field: T.opRename,
  update_field_meta: T.opUpdate,
  reorder_fields: T.opReorder,
};

function describeOp(op: SchemaOperation, context: Collection | null): string {
  const fieldName = (id: string) => context?.schema.fields.find((f) => f.id === id)?.name ?? id;
  switch (op.op) {
    case "add_field":
      return `${T.opAdd}:「${op.field.name}」(${op.field.type})`;
    case "remove_field":
      return `${T.opRemove}:「${fieldName(op.field_id)}」`;
    case "rename_field":
      return `${T.opRename}:「${fieldName(op.field_id)}」→「${op.new_name}」`;
    case "update_field_meta":
      return `${T.opUpdate}:「${fieldName(op.field_id)}」`;
    case "reorder_fields":
      return T.opReorder;
  }
}

function ProposalCard({
  action,
  message,
  context,
  onProposal,
}: {
  action: SchemaProposalAction;
  message: UiMessage;
  context: Collection | null;
  onProposal: (m: UiMessage, a: SchemaProposalAction, status: "applied" | "rejected") => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const ops = action.operations as SchemaOperation[];
  const hasRemove = ops.some((o) => o.op === "remove_field");
  const pending = action.status === "pending";

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        hasRemove ? "border-destructive/50 bg-destructive/5" : "bg-card"
      }`}
    >
      <div className={`font-medium ${hasRemove ? "text-destructive" : ""}`}>
        📝 {T.proposalTitle}
      </div>
      <ul className="mt-2 space-y-1">
        {ops.map((op, i) => (
          <li key={i} className="text-muted-foreground">
            • {describeOp(op, context)}{" "}
            <span className="text-[10px] uppercase opacity-60">{OP_LABELS[op.op]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-xs text-muted-foreground">
        {T.proposalReason}:{action.reason}
      </div>

      {pending ? (
        hasRemove && confirmingRemove ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-destructive">{T.removeWarn}</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onProposal(message, action, "applied")}
              >
                {T.removeConfirm}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
                {STRINGS.records.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={!message.id}
              onClick={() =>
                hasRemove ? setConfirmingRemove(true) : onProposal(message, action, "applied")
              }
            >
              {T.accept}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!message.id}
              onClick={() => onProposal(message, action, "rejected")}
            >
              {T.reject}
            </Button>
          </div>
        )
      ) : (
        <div className="mt-2 text-xs font-medium">
          {action.status === "applied" ? `✅ ${T.applied}` : `✕ ${T.rejected}`}
        </div>
      )}
    </div>
  );
}
