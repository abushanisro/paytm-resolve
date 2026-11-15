import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { chooseTxn, submitComplaint } from "./engine/agent";
import { runEvals } from "./engine/evals";
import { llmStatus } from "./engine/llm";
import { sarvamTranscribe } from "./engine/llm/sarvam";
import { DEMO_CUSTOMER, DEMO_MERCHANT, audit, getStore, now, resetStore } from "./engine/store";
import { simulate, tick } from "./engine/verifier";
import type { FailureCategory, HumanAction, Snapshot } from "./types";

/**
 * Server functions. Handlers run only on the server; the browser gets an RPC
 * stub. The Sarvam key never leaves this side.
 */

export const getSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<Snapshot> => {
    const s = getStore();
    void tick(s).catch(() => {}); // verify loop runs on every poll; not awaited so the UI stays live
    return {
      now: now(s),
      llm: llmStatus(),
      customerId: DEMO_CUSTOMER,
      merchantId: DEMO_MERCHANT,
      txns: [...s.world.txns.values()].sort((a, b) => b.createdAt - a.createdAt),
      cases: s.cases,
      audit: s.audit.slice(-400),
      faults: s.faults,
    };
  },
);

export const sendComplaint = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ text: z.string().trim().min(1).max(600) }).parse(d))
  .handler(async ({ data }) => {
    const { caseId } = submitComplaint(getStore(), data.text);
    return { caseId };
  });

export const pickTxn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ caseId: z.string(), ref: z.string() }).parse(d))
  .handler(async ({ data }) => {
    void chooseTxn(getStore(), data.caseId, data.ref);
    return { ok: true };
  });

export const runSim = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        action: z.enum([
          "NEXT_RECHECK",
          "LAND_CREDIT",
          "BANK_CONFIRMS_FAILURE",
          "NEW_UNMATCHED_PAYMENT",
        ]),
        ref: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => ({ message: simulate(getStore(), data.action, data.ref) }));

export const setFault = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({ key: z.enum(["bankTimeout", "creditFlaky", "conflictingData"]), on: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = getStore();
    s.faults[data.key] = data.on;
    if (data.key === "creditFlaky") s.flakyUsed.clear();
    audit(s, {
      caseId: null,
      kind: "SIMULATOR",
      actor: "presenter",
      title: `Fault injection: ${data.key} ${data.on ? "ON" : "off"}`,
    });
    return { ok: true };
  });

export const resetDemo = createServerFn({ method: "POST" }).handler(async () => {
  resetStore();
  return { ok: true };
});

export const runEvalSuite = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ mode: z.enum(["auto", "fallback"]) }).parse(d))
  .handler(async ({ data }) => runEvals(data.mode));

export const transcribe = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ audioBase64: z.string().max(4_000_000), mime: z.string().max(80) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const bytes = Uint8Array.from(atob(data.audioBase64), (ch) => ch.charCodeAt(0));
      const out = await sarvamTranscribe(bytes, data.mime);
      return { ok: true as const, text: out.text, language: out.language };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });


export const qualifyFailure = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        caseId: z.string(),
        category: z.enum([
          "BANK_GATEWAY_TIMEOUT",
          "MERCHANT_SETTLEMENT_DELAY",
          "DATA_INCONSISTENCY",
          "SUSPECTED_FRAUD",
          "USER_INPUT_ERROR",
        ] satisfies FailureCategory[]),
        action: z.enum([
          "APPROVE_MANUAL_REFUND",
          "CREDIT_MERCHANT_MANUALLY",
          "TRIGGER_RECHECK",
          "REQUEST_BANK_STATEMENT",
          "REJECT_CLAIM",
        ] satisfies HumanAction[]),
        note: z.string().max(500).default(""),
        reviewer: z.string().max(100).default("Ops Specialist"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = getStore();
    const c = s.cases.find((x) => x.id === data.caseId);
    if (!c) return { ok: false as const, error: "Case not found" };

    c.qualification = {
      category: data.category,
      action: data.action,
      note: data.note,
      reviewer: data.reviewer,
      at: now(s),
    };

    if (data.action === "APPROVE_MANUAL_REFUND" || data.action === "CREDIT_MERCHANT_MANUALLY") {
      c.status = "CLOSED_VERIFIED";
      c.closedAt = now(s);
      c.owner = "Resolve";
    } else if (data.action === "REJECT_CLAIM") {
      c.status = "CLOSED_VERIFIED";
      c.closedAt = now(s);
    } else if (data.action === "REQUEST_BANK_STATEMENT") {
      c.status = "NEEDS_INFO";
    }
    // TRIGGER_RECHECK leaves it in current state for the verifier to pick up

    audit(s, {
      caseId: c.id,
      kind: "STATE",
      actor: "code",
      title: `Human qualified: ${data.category}`,
      detail: `Action: ${data.action}. Note: "${data.note}" — ${data.reviewer}`,
    });

    return { ok: true as const };
  });
