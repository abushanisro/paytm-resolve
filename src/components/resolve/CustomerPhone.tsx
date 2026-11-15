import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  FileText,
  Loader2,
  Mic,
  SendHorizontal,
  Sparkles,
  Square,
  UserCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { transcribe } from "@/resolve/api";
import { renderMessage } from "@/resolve/templates";
import type { Case, Message, Snapshot } from "@/resolve/types";

import { PaytmLogo, PhoneFrame, StatusPill, rupees, shortClock } from "./shared";
import { useActions } from "./useResolve";

const SAMPLES = [
  "500 rupaye kat gaye par Sharma Kirana ko nahi mile",
  "My ₹800 payment to Annapurna Sweets failed but money was debited",
  "சிட்டி எலக்ட்ரானிக்ஸ்-க்கு 2100 ரூபாய் அனுப்பினேன், அவர்களுக்கு கிடைக்கவில்லை",
  "₹1,249 to Gupta Medical is stuck on pending",
  "350 debited for Chai Point, the shop says nothing came",
];

type Item =
  | { kind: "user"; id: number; text: string; at: number }
  | { kind: "agent"; id: number; msg: Message; c: Case };

export function CustomerPhone({ snap }: { snap: Snapshot }) {
  const actions = useActions();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const mine = useMemo(() => snap.cases.filter((c) => c.complaints.length > 0), [snap.cases]);
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const c of mine) {
      for (const q of c.complaints) out.push({ kind: "user", id: q.id, text: q.text, at: q.at });
      for (const m of c.messages)
        if (m.to === "customer") out.push({ kind: "agent", id: m.id, msg: m, c });
    }
    return out.sort((a, b) => a.id - b.id);
  }, [mine]);
  const thinking = mine.some((c) => c.busy && c.status === "INTAKE");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items.length, thinking, snap.audit.length]);

  const send = async (value: string) => {
    const v = value.trim();
    if (!v || sending) return;
    setSending(true);
    setText("");
    try {
      await actions.complain(v);
    } finally {
      setSending(false);
    }
  };

  return (
    <PhoneFrame label="Customer · Ananya">
      <header className="flex items-center gap-2 border-b border-border bg-card px-4 pb-2.5 pt-9">
        <ArrowLeft className="size-4 text-muted-foreground" aria-hidden />
        <PaytmLogo className="!text-[17px]" />
        <span className="flex items-center gap-1 font-display text-[14px] font-bold text-foreground">
          Resolve <Sparkles className="size-3.5 text-brand-cyan" aria-hidden />
        </span>
      </header>

      <div ref={scroller} className="resolve-scroll flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
        {items.length === 0 && (
          <div className="space-y-2">
            <p className="rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-[13px] leading-snug shadow-sm">
              Hi Ananya. Tell me what went wrong with a payment, in any language. I'll check it and
              stay on it until it's verified.
            </p>
            <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Try one
            </p>
            {SAMPLES.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-[12px] leading-snug text-foreground transition-colors hover:border-brand-cyan hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {items.map((it) =>
          it.kind === "user" ? (
            <div key={`u${it.id}`} className="resolve-pop flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-[13px] leading-snug text-primary-foreground">
                {it.text}
              </p>
            </div>
          ) : (
            <AgentBubble
              key={`a${it.id}`}
              msg={it.msg}
              c={it.c}
              snap={snap}
              onPick={actions.pick}
            />
          ),
        )}

        {thinking && (
          <div className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading your message…
          </div>
        )}
      </div>

      <Composer text={text} setText={setText} onSend={send} busy={sending} live={snap.llm.live} />
    </PhoneFrame>
  );
}

function AgentBubble({
  msg,
  c,
  snap,
  onPick,
}: {
  msg: Message;
  c: Case;
  snap: Snapshot;
  onPick: (caseId: string, ref: string) => void;
}) {
  const lastCustomerMsg = [...c.messages].reverse().find((m) => m.to === "customer");
  const isLast = lastCustomerMsg?.id === msg.id;
  const outcome =
    msg.templateId !== "C_INVESTIGATING" &&
    msg.templateId !== "C_PICK_TXN" &&
    msg.templateId !== "C_NEED_DETAILS";

  return (
    <div className="resolve-pop max-w-[92%] space-y-1.5">
      <p className="rounded-2xl rounded-tl-sm bg-card px-3 py-2 text-[13px] leading-snug shadow-sm">
        {renderMessage(msg, c.language)}
      </p>

      {msg.templateId === "C_INVESTIGATING" && <Steps c={c} />}

      {outcome && isLast && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <StatusPill status={c.status} />
          <span className="text-[10px] text-muted-foreground">
            {c.id} · {shortClock(msg.at)}
          </span>
        </div>
      )}

      {isLast && (c.status === "ESCALATED" || c.qualification) && (
        <HumanWorkflowCard c={c} />
      )}

      {isLast && c.status === "NEEDS_INFO" && (
        <div className="space-y-1.5">
          {c.candidates.map((ref) => {
            const t = snap.txns.find((x) => x.ref === ref);
            if (!t) return null;
            return (
              <button
                key={ref}
                onClick={() => onPick(c.id, ref)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:border-brand-cyan hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold">{t.merchantName}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    UPI {t.ref} · {shortClock(t.createdAt)}
                  </span>
                </span>
                <span className="text-[13px] font-bold tabular-nums">{rupees(t.amount)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HumanWorkflowCard({ c }: { c: Case }) {
  const [uploaded, setUploaded] = useState(false);

  if (c.qualification) {
    const actionText =
      c.qualification.action === "APPROVE_MANUAL_REFUND"
        ? "Manual Refund Approved"
        : c.qualification.action === "CREDIT_MERCHANT_MANUALLY"
          ? "Merchant Ledger Credited"
          : c.qualification.action === "TRIGGER_RECHECK"
            ? "Re-check Forced"
            : c.qualification.action === "REQUEST_BANK_STATEMENT"
              ? "Bank Statement Requested"
              : "Claim Rejected";

    return (
      <div className="rounded-xl border border-status-green/40 bg-status-green-soft/70 p-2.5 text-[12px] shadow-sm space-y-1.5">
        <div className="flex items-center gap-1.5 font-bold text-status-green text-[11px]">
          <UserCheck className="size-3.5" /> Specialist Decision: {actionText}
        </div>
        {c.qualification.note && (
          <p className="rounded bg-background/90 p-2 text-[11px] italic text-foreground leading-snug">
            "{c.qualification.note}"
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          Verified by {c.qualification.reviewer} · Case updated
        </p>
        {c.qualification.action === "REQUEST_BANK_STATEMENT" && (
          <div className="pt-1">
            {uploaded ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-status-green">
                <CheckCircle2 className="size-3" /> Bank Statement Submitted
              </span>
            ) : (
              <button
                onClick={() => setUploaded(true)}
                className="flex items-center justify-center gap-1.5 w-full rounded-lg bg-brand-cyan py-1 text-[11px] font-bold text-brand-navy shadow-sm hover:opacity-90"
              >
                <FileText className="size-3" /> Upload Statement / Screenshot
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-status-amber/40 bg-status-amber-soft/60 p-2.5 text-[11px] shadow-sm space-y-1">
      <div className="flex items-center gap-1.5 font-bold text-status-amber">
        <UserCheck className="size-3.5" /> Transferred to Human Specialist ({c.owner})
      </div>
      <p className="text-muted-foreground leading-snug">
        This case has reached automated check boundaries. An operations engineer has been assigned to investigate and resolve it.
      </p>
    </div>
  );
}

function Steps({ c }: { c: Case }) {
  const failed = Boolean(c.evidence.toolFailure);
  const settled = c.status !== "INVESTIGATING" && c.status !== "INTAKE";
  const rows: { label: string; done: boolean; value?: string | undefined }[] = [
    { label: "Transaction details", done: Boolean(c.evidence.txn), value: c.evidence.txn?.status },
    { label: "Bank response", done: Boolean(c.evidence.bank), value: c.evidence.bank?.state },
    {
      label: "Merchant credit",
      done: Boolean(c.evidence.credit),
      value: c.evidence.credit?.state.replace("_", " "),
    },
    { label: "Next action decided", done: settled },
  ];
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="mb-1.5 text-[11px] font-semibold text-foreground">Checking your payment</p>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const firstPending = rows.findIndex((x) => !x.done);
          const state = r.done
            ? "done"
            : failed && i >= firstPending
              ? "error"
              : i === firstPending && !settled
                ? "active"
                : "wait";
          return (
            <li key={r.label} className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  "grid size-4 flex-none place-items-center rounded-full",
                  state === "done" && "bg-status-green text-white",
                  state === "error" && "bg-status-red-soft text-status-red",
                  state === "active" && "text-brand-cyan",
                  state === "wait" && "border border-border",
                )}
              >
                {state === "done" && <Check className="size-2.5" strokeWidth={3.5} aria-hidden />}
                {state === "error" && <CircleAlert className="size-3" aria-hidden />}
                {state === "active" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              </span>
              <span className={cn("flex-1", state === "wait" && "text-muted-foreground")}>
                {r.label}
              </span>
              {r.value && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {r.value}
                </span>
              )}
              {state === "error" && (
                <span className="text-[10px] font-semibold text-status-red">
                  {i === firstPending ? "unavailable" : "not run"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Composer({
  text,
  setText,
  onSend,
  busy,
  live,
}: {
  text: string;
  setText: (v: string) => void;
  onSend: (v: string) => void;
  busy: boolean;
  live: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const toggleMic = async () => {
    setNote(null);
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!live) {
      setNote("Voice needs SARVAM_API_KEY. Type instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setWorking(true);
        try {
          const blob = new Blob(chunks, { type: rec.mimeType });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000)
            bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const res = await transcribe({
            data: { audioBase64: btoa(bin), mime: rec.mimeType || "audio/webm" },
          });
          if (res.ok && res.text.trim()) setText(res.text.trim());
          else
            setNote(
              res.ok ? "Didn't catch that. Try again or type." : "Voice failed. Type instead.",
            );
        } catch {
          setNote("Voice failed. Type instead.");
        } finally {
          setWorking(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      // Sarvam's real-time endpoint is meant for clips under 30 seconds.
      setTimeout(() => rec.state === "recording" && rec.stop(), 25_000);
    } catch {
      setNote("Microphone not available. Type instead.");
    }
  };

  return (
    <div className="border-t border-border bg-card px-3 pb-3 pt-2">
      {note && <p className="mb-1.5 text-[11px] text-status-red">{note}</p>}
      {recording && (
        <p className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-status-red">
          <span className="resolve-wave flex items-center gap-0.5">
            <span /> <span /> <span /> <span />
          </span>
          Listening… tap stop when done
        </p>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
        }}
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={working}
          aria-label={recording ? "Stop recording" : "Speak your complaint"}
          className={cn(
            "grid size-9 flex-none place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground",
            recording && "border-status-red bg-status-red-soft text-status-red",
          )}
        >
          {working ? (
            <Loader2 className="size-4 animate-spin" />
          ) : recording ? (
            <Square className="size-3.5" />
          ) : (
            <Mic className="size-4" />
          )}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or speak in any language"
          aria-label="Describe your payment problem"
          className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-[13px] outline-none focus:border-brand-cyan"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Send"
          className="grid size-9 flex-none place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </div>
  );
}
