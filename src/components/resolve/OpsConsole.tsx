import { Bot, Code2, Radar, ShieldCheck, User, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { AuditEvent, Case, Snapshot } from "@/resolve/types";

import { Chip, PaytmLogo, StatusPill, clock, countdown, rupees } from "./shared";

const REASON: Record<string, string> = {
  REVERSAL_CONFIRMED: "Bank confirmed failure and reversal",
  CREDIT_MATCHED: "Merchant credit matched",
  CREDIT_NOT_FOUND: "Bank success, merchant credit not found yet",
  BANK_PENDING: "Bank has not given a final answer",
  REVERSAL_PENDING: "Payment failed, reversal not confirmed yet",
  CONFLICTING_DATA: "Sources disagree",
  TOOL_UNAVAILABLE: "A check could not be completed",
  RECHECK_BUDGET_EXHAUSTED: "Still unresolved after all re-checks",
};

export function OpsConsole({ snap, className }: { snap: Snapshot; className?: string }) {
  const cases = useMemo(
    () => [...snap.cases].sort((a, b) => b.updatedAt - a.updatedAt),
    [snap.cases],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const selected = cases.find((c) => c.id === picked) ?? cases[0] ?? null;

  const open = cases.filter(
    (c) => c.status !== "CLOSED_VERIFIED" && c.status !== "ESCALATED",
  ).length;
  const auto = cases.filter((c) => c.status === "CLOSED_VERIFIED").length;
  const handed = cases.filter((c) => c.status === "ESCALATED").length;

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <PaytmLogo className="!text-[18px]" />
        <span className="font-display text-[14px] font-bold">Resolve · Support console</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Chip>{open} open</Chip>
          <Chip className="text-status-green">{auto} closed by Resolve</Chip>
          <Chip className="text-status-red">{handed} handed to humans</Chip>
        </div>
      </header>

      {cases.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div className="max-w-xs">
            <ShieldCheck className="mx-auto size-8 text-brand-cyan" aria-hidden />
            <p className="mt-3 font-display text-[15px] font-bold">No cases yet</p>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Send a complaint from the customer phone, or create an unmatched payment from the
              presenter bar to see Resolve open a case on its own.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)]">
          <ul className="resolve-scroll max-h-40 overflow-y-auto border-b border-border md:max-h-none md:border-b-0 md:border-r">
            {cases.map((c) => {
              const t = snap.txns.find((x) => x.ref === c.ref);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setPicked(c.id)}
                    aria-current={selected?.id === c.id}
                    className={cn(
                      "block w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent",
                      selected?.id === c.id && "bg-accent",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold">{c.id}</span>
                      <span className="text-[12px] font-bold tabular-nums">
                        {t ? rupees(t.amount) : "—"}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {t ? `${t.merchantName} · UPI ${t.ref}` : "Transaction not identified"}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      <StatusPill status={c.status} />
                      {c.origin === "PROACTIVE" && (
                        <Radar
                          className="size-3.5 text-brand-cyan"
                          aria-label="Detected proactively"
                        />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected && <CaseDetail c={selected} snap={snap} />}
        </div>
      )}
    </section>
  );
}

function CaseDetail({ c, snap }: { c: Case; snap: Snapshot }) {
  const t = snap.txns.find((x) => x.ref === c.ref);
  const events = useMemo(() => snap.audit.filter((e) => e.caseId === c.id), [snap.audit, c.id]);
  const next = countdown(c, snap.now);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events.length]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[18px] font-extrabold">{c.id}</h2>
          <StatusPill status={c.status} />
          <Chip>Owner: {c.owner}</Chip>
          <Chip>{c.origin === "PROACTIVE" ? "Detected proactively" : "Customer complaint"}</Chip>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t
            ? `${rupees(t.amount)} to ${t.merchantName} · UPI ${t.ref} · UTR ${t.utr}`
            : "Transaction not identified yet"}
          {c.reason && (
            <>
              {" "}
              · <span className="font-medium text-foreground">{REASON[c.reason]}</span>
            </>
          )}
        </p>
        {c.complaint && (
          <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-[12px] italic leading-snug text-foreground">
            “{c.complaint}”
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Fact label="Ledger" value={c.evidence.txn?.status} />
          <Fact
            label="Bank"
            value={
              c.evidence.bank
                ? `${c.evidence.bank.state}${c.evidence.bank.reversal !== "NONE" ? ` · reversal ${c.evidence.bank.reversal}` : ""}`
                : undefined
            }
          />
          <Fact label="Merchant credit" value={c.evidence.credit?.state.replace("_", " ")} />
          <Fact
            label="Re-checks"
            value={`${c.recheck.count} of ${c.recheck.max}${next ? ` · next in ${next}` : ""}`}
            neutral
          />
        </dl>
        {c.evidence.toolFailure && (
          <p className="mt-2 rounded-lg bg-status-red-soft px-3 py-2 text-[12px] font-medium text-status-red">
            Check failed: {c.evidence.toolFailure}
          </p>
        )}

        {c.summary && (
          <div className="mt-3 rounded-xl border border-border bg-status-blue-soft p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Bot className="size-3.5" aria-hidden /> Handoff summary · written by {c.summaryBy}
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">{c.summary}</p>
          </div>
        )}
      </div>
      <div className="resolve-scroll min-h-[160px] flex-1 overflow-y-auto p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Audit log · every step, in order
        </h3>
        <ol className="mt-2 space-y-0">
          {events.map((e) => (
            <AuditRow key={e.id} e={e} />
          ))}
        </ol>
        <div ref={end} />
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  neutral,
}: {
  label: string;
  value: string | undefined;
  neutral?: boolean;
}) {
  const good = value && /^(SUCCESS|MATCHED)/.test(value);
  const bad = value && /^(FAILED|NO MATCH|AMBIGUOUS|UNKNOWN)/.test(value);
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-[12px] font-bold",
          !value && "font-normal text-muted-foreground",
          !neutral && good && "text-status-green",
          !neutral && bad && "text-status-red",
          !neutral && value?.startsWith("PENDING") && "text-status-amber",
        )}
      >
        {value ?? "Not checked"}
      </dd>
    </div>
  );
}

const ACTOR: Record<AuditEvent["actor"], { label: string; icon: typeof Bot; cls: string }> = {
  model: { label: "Model", icon: Bot, cls: "bg-status-cyan-soft text-brand-navy" },
  code: { label: "Code", icon: Code2, cls: "bg-muted text-muted-foreground" },
  presenter: { label: "Simulator", icon: Wrench, cls: "bg-status-amber-soft text-status-amber" },
  customer: { label: "Customer", icon: User, cls: "bg-status-blue-soft text-brand-navy" },
};

function AuditRow({ e }: { e: AuditEvent }) {
  const a = ACTOR[e.actor];
  return (
    <li className="resolve-pop grid grid-cols-[58px_74px_minmax(0,1fr)] gap-2 border-l border-border py-1.5 pl-3 text-[12px]">
      <time className="font-mono text-[10px] leading-5 text-muted-foreground">{clock(e.at)}</time>
      <span
        className={cn(
          "inline-flex h-5 items-center gap-1 self-start rounded px-1.5 text-[10px] font-semibold",
          a.cls,
        )}
      >
        <a.icon className="size-3" aria-hidden /> {a.label}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "break-words font-semibold",
            (e.kind === "TOOL" || e.kind === "POLICY" || e.kind === "NOTIFY") &&
              "font-mono text-[11px]",
            e.kind === "TOOL_ERROR" && "font-mono text-[11px] text-status-red",
          )}
        >
          {e.title}
        </span>
        {e.detail && (
          <span className="block break-words leading-snug text-muted-foreground">{e.detail}</span>
        )}
      </span>
    </li>
  );
}
