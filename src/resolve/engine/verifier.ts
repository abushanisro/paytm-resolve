import type { SimAction } from "../types";
import { investigate, newCase } from "./agent";
import type { ProviderMode } from "./llm";
import { DEMO_MERCHANT, audit, now, type Store } from "./store";

/**
 * The verify loop. Called on every UI poll (and directly by tests).
 *  1. Re-checks monitored cases whose next check is due.
 *  2. Proactive detector: opens a case for a new payment the bank calls
 *     successful but settlement has not matched, before anyone complains.
 */
export async function tick(s: Store, mode: ProviderMode = "auto"): Promise<void> {
  if (s.ticking) return;
  s.ticking = true;
  try {
    for (const c of [...s.cases]) {
      if (
        c.status !== "MONITORING" ||
        c.busy ||
        c.recheck.nextAt == null ||
        c.recheck.nextAt > now(s)
      )
        continue;
      c.recheck.count += 1;
      audit(s, {
        caseId: c.id,
        kind: "RECHECK",
        actor: "code",
        title: `Scheduled re-check ${c.recheck.count} of ${c.recheck.max}`,
        detail: "Re-running the same read-only checks. Nothing is assumed from the last run.",
      });
      await investigate(s, c, mode, true);
    }

    for (const ref of s.world.live) {
      if (s.cases.some((c) => c.ref === ref)) continue;
      const txn = s.world.txns.get(ref);
      const bank = s.world.bank.get(ref);
      const credit = s.world.credits.get(ref);
      if (!txn || bank?.state !== "SUCCESS" || credit?.state !== "NO_MATCH") continue;
      const c = newCase(s, "PROACTIVE", txn.customerId);
      c.ref = ref;
      audit(s, {
        caseId: c.id,
        kind: "DETECTOR",
        actor: "code",
        title: "Unmatched credit detected, no complaint yet",
        detail: `Reconciliation feed: bank success for UPI ${ref} (₹${txn.amount}) with no merchant credit.`,
      });
      await investigate(s, c, mode, false);
    }
  } finally {
    s.ticking = false;
  }
}

/** Presenter controls. These change the synthetic world, never a case directly. */
export function simulate(s: Store, action: SimAction, ref?: string): string {
  const caseId = ref ? (s.cases.find((c) => c.ref === ref)?.id ?? null) : null;
  switch (action) {
    case "NEXT_RECHECK": {
      const due = s.cases
        .filter((c) => c.status === "MONITORING" && c.recheck.nextAt != null)
        .map((c) => c.recheck.nextAt as number);
      if (!due.length) return "No re-check is scheduled.";
      const jump = Math.max(0, Math.min(...due) - now(s)) + 500;
      s.clockOffsetMs += jump;
      audit(s, {
        caseId: null,
        kind: "SIMULATOR",
        actor: "presenter",
        title: `Demo clock advanced ${Math.round(jump / 1000)}s`,
        detail: "Jumps to the next scheduled re-check.",
      });
      return `Clock advanced ${Math.round(jump / 1000)}s.`;
    }
    case "LAND_CREDIT": {
      if (!ref || !s.world.credits.has(ref)) return "Unknown payment.";
      s.world.credits.set(ref, { ref, state: "MATCHED" });
      audit(s, {
        caseId,
        kind: "SIMULATOR",
        actor: "presenter",
        title: `World change: merchant credit lands for UPI ${ref}`,
        detail:
          "The settlement file now shows the credit. Resolve has not been told; it must find out on re-check.",
      });
      return `Credit for ${ref} now exists in the settlement file.`;
    }
    case "BANK_CONFIRMS_FAILURE": {
      const txn = ref ? s.world.txns.get(ref) : undefined;
      if (!ref || !txn) return "Unknown payment.";
      txn.status = "FAILED";
      s.world.bank.set(ref, { ref, state: "FAILED", reversal: "CONFIRMED" });
      audit(s, {
        caseId,
        kind: "SIMULATOR",
        actor: "presenter",
        title: `World change: bank confirms failure and reversal for UPI ${ref}`,
        detail: "Resolve has not been told; it must find out on re-check.",
      });
      return `Bank now reports ${ref} as failed and reversed.`;
    }
    case "NEW_UNMATCHED_PAYMENT": {
      const n = s.paymentSeq++;
      const newRef = String(9015 + n * 7);
      const amount = [640, 275, 1120][n % 3] ?? 640;
      s.world.txns.set(newRef, {
        ref: newRef,
        utr: `4${newRef}55120917`,
        amount,
        customerId: "CUST-WALKIN",
        merchantId: DEMO_MERCHANT,
        merchantName: "Sharma Kirana Store",
        createdAt: now(s),
        status: "SUCCESS",
      });
      s.world.bank.set(newRef, { ref: newRef, state: "SUCCESS", reversal: "NONE" });
      s.world.credits.set(newRef, { ref: newRef, state: "NO_MATCH" });
      s.world.live.add(newRef);
      audit(s, {
        caseId: null,
        kind: "SIMULATOR",
        actor: "presenter",
        title: `World change: new ₹${amount} payment at Sharma Kirana (UPI ${newRef})`,
        detail: "Bank success, merchant credit delayed. Nobody has complained.",
      });
      return `New payment ${newRef} created.`;
    }
  }
}
