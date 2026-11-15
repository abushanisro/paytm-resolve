import type { AuditEvent, BankResp, Case, Credit, Faults, Txn } from "../types";
import { seedDemoCases, seedWorld } from "./seed";

/**
 * In-memory state for the laptop demo. `world` is the synthetic ground truth
 * (ledger, bank, settlement); the agent only ever sees it through tools.
 */
export type Store = {
  world: {
    txns: Map<string, Txn>;
    bank: Map<string, BankResp>;
    credits: Map<string, Credit>;
    live: Set<string>; // refs created after reset; the proactive detector watches these
  };
  cases: Case[];
  audit: AuditEvent[];
  faults: Faults;
  flakyUsed: Set<string>;
  clockOffsetMs: number;
  stepDelayMs: number;
  seq: number;
  ticking: boolean;
  paymentSeq: number;
  caseSeq: number;
  startedAt: number;
};

export const DEMO_CUSTOMER = "CUST-ANANYA";
export const DEMO_MERCHANT = "MER-SHARMA";

export function createStore(opts: { stepDelayMs?: number; seedDemo?: boolean } = {}): Store {
  const startedAt = Date.now();
  const s: Store = {
    world: seedWorld(startedAt),
    cases: [],
    audit: [],
    faults: { bankTimeout: false, creditFlaky: false, conflictingData: false },
    flakyUsed: new Set(),
    clockOffsetMs: 0,
    stepDelayMs: opts.stepDelayMs ?? 0,
    seq: 0,
    ticking: false,
    paymentSeq: 0,
    caseSeq: 0,
    startedAt,
  };
  if (opts.seedDemo) {
    seedDemoCases(s);
  }
  return s;
}

export const now = (s: Store) => Date.now() + s.clockOffsetMs;

export function audit(s: Store, ev: Omit<AuditEvent, "id" | "at">): AuditEvent {
  const full: AuditEvent = { ...ev, id: ++s.seq, at: now(s) };
  s.audit.push(full);
  return full;
}

export const pause = (s: Store) =>
  s.stepDelayMs > 0 ? new Promise<void>((r) => setTimeout(r, s.stepDelayMs)) : Promise.resolve();

/* Global singleton for the running app (survives Vite HMR). */
const g = globalThis as unknown as { __resolveStore?: Store };

export function getStore(): Store {
  g.__resolveStore ??= createStore({ stepDelayMs: 650, seedDemo: true });
  return g.__resolveStore;
}

export function resetStore(): Store {
  g.__resolveStore = createStore({ stepDelayMs: 650, seedDemo: true });
  return g.__resolveStore;
}
