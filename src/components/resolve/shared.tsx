import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Case, CaseStatus } from "@/resolve/types";

export function PaytmLogo({ className }: { className?: string }) {
  return (
    <span className={cn("paytm-wordmark", className)} aria-label="Paytm">
      <span>pay</span>
      <span className="text-brand-cyan">tm</span>
    </span>
  );
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  INTAKE: "Reading complaint",
  NEEDS_INFO: "Waiting for customer",
  INVESTIGATING: "Investigating",
  MONITORING: "Open · re-checking",
  CLOSED_VERIFIED: "Closed · verified",
  ESCALATED: "Escalated to human",
};

const STATUS_TONE: Record<CaseStatus, string> = {
  INTAKE: "bg-status-blue-soft text-brand-navy",
  NEEDS_INFO: "bg-status-blue-soft text-brand-navy",
  INVESTIGATING: "bg-status-cyan-soft text-brand-navy",
  MONITORING: "bg-status-amber-soft text-status-amber",
  CLOSED_VERIFIED: "bg-status-green-soft text-status-green",
  ESCALATED: "bg-status-red-soft text-status-red",
};

export function StatusPill({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        STATUS_TONE[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export const shortClock = (at: number) =>
  new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function countdown(c: Case, now: number): string | null {
  if (c.status !== "MONITORING" || c.recheck.nextAt == null) return null;
  const secs = Math.max(0, Math.round((c.recheck.nextAt - now) / 1000));
  return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
}

export function PhoneFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex w-full max-w-[340px] flex-col items-center gap-2">
      <figcaption className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </figcaption>
      <div className="w-full rounded-[2.2rem] border border-border bg-foreground/90 p-2 shadow-[var(--shadow-panel)]">
        <div className="relative flex h-[620px] flex-col overflow-hidden rounded-[1.7rem] bg-background">
          <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-foreground/90" />
          {children}
        </div>
      </div>
    </figure>
  );
}
