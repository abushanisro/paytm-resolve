import { Link } from "@tanstack/react-router";
import { Banknote, FastForward, FlaskConical, Landmark, Radar, RotateCcw, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Faults, Snapshot } from "@/resolve/types";

import { PaytmLogo, countdown } from "./shared";
import { useActions } from "./useResolve";

const FAULTS: { key: keyof Faults; label: string; hint: string }[] = [
  { key: "bankTimeout", label: "Bank check times out", hint: "Agent should escalate, not guess" },
  { key: "creditFlaky", label: "Settlement fails once", hint: "Agent should retry and recover" },
  { key: "conflictingData", label: "Sources disagree", hint: "Agent should escalate" },
];

/**
 * Presenter controls. They change the synthetic world (bank, settlement,
 * clock), never a case. Resolve has to discover each change on its own.
 */
export function PresenterBar({ snap }: { snap: Snapshot }) {
  const actions = useActions();
  const monitoring = snap.cases.filter((c) => c.status === "MONITORING");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <PaytmLogo className="!text-[22px]" />
        <span className="font-display text-[16px] font-extrabold">Resolve</span>
        <span className="hidden text-[12px] text-muted-foreground sm:inline">
          Investigate · Act · Verify · Close
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            snap.llm.live
              ? "bg-status-green-soft text-status-green"
              : "bg-status-amber-soft text-status-amber",
          )}
          title="Which model answers the AI steps"
        >
          <Zap className="size-3" aria-hidden /> {snap.llm.provider}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Synthetic data · no real payments · not affiliated with Paytm
        </span>
        <nav className="ml-auto flex items-center gap-1 text-[12px] font-medium">
          <Link
            to="/customer"
            className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Customer
          </Link>
          <Link
            to="/merchant"
            className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Merchant
          </Link>
          <Link
            to="/console"
            className="rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Console
          </Link>
          <Link
            to="/evals"
            className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FlaskConical className="size-3.5" aria-hidden /> Evals
          </Link>
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Presenter
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => actions.sim("NEXT_RECHECK")}
          disabled={monitoring.length === 0}
        >
          <FastForward /> Jump to next re-check
        </Button>
        <Button size="sm" variant="outline" onClick={() => actions.sim("NEW_UNMATCHED_PAYMENT")}>
          <Radar /> New payment, credit delayed
        </Button>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {FAULTS.map((f) => (
            <label
              key={f.key}
              className="flex cursor-pointer items-center gap-1.5 text-[12px]"
              title={f.hint}
            >
              <Switch
                checked={snap.faults[f.key]}
                onCheckedChange={(on) => actions.fault(f.key, on)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => actions.reset()}>
          <RotateCcw /> Reset demo
        </Button>
      </div>

      {monitoring.length === 0 ? (
        <p className="flex min-h-[49px] items-center border-t border-border px-4 text-[12px] text-muted-foreground">
          No case is waiting on a re-check. When one is, you can change the bank or settlement
          record here and watch Resolve find out for itself.
        </p>
      ) : (
        <ul className="space-y-1.5 border-t border-border px-4 py-2.5">
          {monitoring.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
              <span className="font-bold">{c.id}</span>
              <span className="text-muted-foreground">
                UPI {c.ref} · re-check {c.recheck.count + 1} of {c.recheck.max} in{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {countdown(c, snap.now)}
                </span>
              </span>
              <span className="text-muted-foreground">Change the world:</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => c.ref && actions.sim("LAND_CREDIT", c.ref)}
              >
                <Banknote /> Merchant credit lands
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => c.ref && actions.sim("BANK_CONFIRMS_FAILURE", c.ref)}
              >
                <Landmark /> Bank confirms failure + reversal
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
