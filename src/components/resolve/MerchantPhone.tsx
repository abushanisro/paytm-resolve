import { BadgeCheck, Hand, Hourglass, RotateCcw, Store, Volume2 } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { renderMessage } from "@/resolve/templates";
import type { Case, MerchantTemplateId, Message, Snapshot } from "@/resolve/types";

import { PaytmLogo, PhoneFrame, rupees, shortClock } from "./shared";

/** What the merchant should do, which is the decision the pitch says they need. */
const ACTION: Record<
  MerchantTemplateId,
  { verb: string; tone: string; soft: string; icon: typeof Hand }
> = {
  M_HOLD_GOODS: {
    verb: "Wait",
    tone: "text-status-amber",
    soft: "bg-status-amber-soft",
    icon: Hand,
  },
  M_CREDIT_VERIFIED: {
    verb: "Fulfil",
    tone: "text-status-green",
    soft: "bg-status-green-soft",
    icon: BadgeCheck,
  },
  M_PAYMENT_FAILED: {
    verb: "Re-ask",
    tone: "text-status-red",
    soft: "bg-status-red-soft",
    icon: RotateCcw,
  },
  M_UNDER_REVIEW: {
    verb: "Wait",
    tone: "text-status-amber",
    soft: "bg-status-amber-soft",
    icon: Hourglass,
  },
};

export function MerchantPhone({ snap }: { snap: Snapshot }) {
  const { alerts, payments, name } = useMemo(() => {
    // The phone follows whichever merchant was alerted most recently, so every
    // scenario is visible on stage. Defaults to the demo merchant.
    let lastMsg = -1;
    let merchantId = snap.merchantId;
    for (const c of snap.cases) {
      const t = snap.txns.find((x) => x.ref === c.ref);
      for (const m of c.messages) {
        if (m.to === "merchant" && t && m.id > lastMsg) {
          lastMsg = m.id;
          merchantId = t.merchantId;
        }
      }
    }
    const mine = snap.txns.filter((t) => t.merchantId === merchantId);
    const alerts: { msg: Message; c: Case }[] = [];
    const latest = new Map<string, Message>();
    for (const c of snap.cases) {
      if (!c.ref || !mine.some((t) => t.ref === c.ref)) continue;
      for (const m of c.messages) {
        if (m.to !== "merchant") continue;
        alerts.push({ msg: m, c });
        latest.set(c.ref, m);
      }
    }
    alerts.sort((a, b) => b.msg.id - a.msg.id);
    return {
      alerts,
      payments: mine.map((t) => ({ t, last: latest.get(t.ref) })),
      name: mine[0]?.merchantName ?? "Merchant",
    };
  }, [snap]);

  const top = alerts[0];
  const topAction = top ? ACTION[top.msg.templateId as MerchantTemplateId] : null;

  return (
    <PhoneFrame label={`Merchant · ${name}`}>
      <header className="flex items-center gap-2 border-b border-border bg-card px-4 pb-2.5 pt-9">
        <PaytmLogo className="!text-[17px]" />
        <span className="text-[11px] font-semibold text-muted-foreground">for Business</span>
        <Store className="ml-auto size-4 text-muted-foreground" aria-hidden />
      </header>

      <div className="resolve-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* Soundbox-style alert: one instruction, large enough to read across a counter. */}
        <section
          key={top?.msg.id ?? "idle"}
          className={cn(
            "resolve-pop rounded-2xl border border-border p-3.5",
            topAction ? topAction.soft : "bg-card",
          )}
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Volume2 className="size-3.5" aria-hidden /> Soundbox alert
          </div>
          {top && topAction ? (
            <>
              <p
                className={cn(
                  "mt-2 flex items-center gap-2 font-display text-[26px] font-extrabold leading-none",
                  topAction.tone,
                )}
              >
                <topAction.icon className="size-6" aria-hidden /> {topAction.verb}
              </p>
              <p className="mt-2 text-[13px] font-medium leading-snug text-foreground">
                {renderMessage(top.msg)}
              </p>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {top.c.id} · {shortClock(top.msg.at)}
                {top.c.origin === "PROACTIVE" && " · detected before any complaint"}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-display text-[22px] font-extrabold leading-none text-foreground">
                All clear
              </p>
              <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
                No payments need your attention. You'll be told here whether to fulfil, wait or
                re-ask.
              </p>
            </>
          )}
        </section>

        <section>
          <h3 className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent payments
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {payments.map(({ t, last }) => {
              const a = last ? ACTION[last.templateId as MerchantTemplateId] : null;
              return (
                <li key={t.ref} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold tabular-nums">
                      {rupees(t.amount)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      UPI {t.ref} · {shortClock(t.createdAt)}
                    </span>
                  </span>
                  {a ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-bold",
                        a.soft,
                        a.tone,
                      )}
                    >
                      {a.verb}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No flag</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {alerts.length > 1 && (
          <section>
            <h3 className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Earlier alerts
            </h3>
            <ul className="space-y-1.5">
              {alerts.slice(1, 6).map(({ msg }) => (
                <li
                  key={msg.id}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-[11px] leading-snug text-muted-foreground"
                >
                  <span className="font-semibold text-foreground">{shortClock(msg.at)}</span> ·{" "}
                  {renderMessage(msg)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PhoneFrame>
  );
}
