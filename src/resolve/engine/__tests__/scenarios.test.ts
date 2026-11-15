import { describe, expect, it } from "vitest";

import { SUCCESS_CLAIMS } from "../../templates";
import type { Case } from "../../types";
import { chooseTxn, submitComplaint } from "../agent";
import { createStore, type Store } from "../store";
import { simulate, tick } from "../verifier";

const MODE = "fallback" as const;

async function complain(s: Store, text: string): Promise<Case> {
  const { caseId, done } = submitComplaint(s, text, MODE);
  await done;
  const found = s.cases.find((c) => c.id === caseId) ?? s.cases[s.cases.length - 1];
  if (!found) throw new Error("no case");
  return found;
}
const templates = (c: Case, to: "customer" | "merchant") =>
  c.messages.filter((m) => m.to === to).map((m) => m.templateId);

/** Safety invariant: no message claims an outcome the synthetic world does not show. */
function assertNoUnverifiedClaims(s: Store) {
  for (const c of s.cases) {
    for (const m of c.messages) {
      const claim = SUCCESS_CLAIMS[m.templateId];
      if (!claim) continue;
      if (claim === "CREDIT") expect(s.world.credits.get(c.ref!)?.state).toBe("MATCHED");
      if (claim === "REVERSAL") expect(s.world.bank.get(c.ref!)?.reversal).toBe("CONFIRMED");
    }
  }
}

describe("scenarios", () => {
  it("S1: failed payment with confirmed reversal closes on its own", async () => {
    const s = createStore();
    const c = await complain(
      s,
      "My payment of 800 to Annapurna Sweets failed but money was debited",
    );
    expect(c.ref).toBe("1936");
    expect(c.status).toBe("CLOSED_VERIFIED");
    expect(c.owner).toBe("Resolve");
    expect(templates(c, "customer")).toEqual(["C_INVESTIGATING", "C_REVERSAL_CONFIRMED"]);
    expect(templates(c, "merchant")).toEqual(["M_PAYMENT_FAILED"]);
    assertNoUnverifiedClaims(s);
  });

  it("S2: asks which ₹500 payment, monitors, then closes only after the credit is found on re-check", async () => {
    const s = createStore();
    const c = await complain(s, "500 rupaye kat gaye par Sharma Kirana ko nahi mile");
    expect(c.language).toBe("hi");
    expect(c.status).toBe("NEEDS_INFO");
    expect(c.candidates.sort()).toEqual(["4821", "4822"]);

    await chooseTxn(s, c.id, "4821", MODE);
    expect(c.status).toBe("MONITORING");
    expect(templates(c, "merchant")).toEqual(["M_HOLD_GOODS"]);
    expect(templates(c, "customer")).toContain("C_CREDIT_PENDING");

    // Credit lands in the world, but nothing closes until Resolve re-checks.
    simulate(s, "LAND_CREDIT", "4821");
    await tick(s, MODE);
    expect(c.status).toBe("MONITORING");

    simulate(s, "NEXT_RECHECK");
    await tick(s, MODE);
    expect(c.status).toBe("CLOSED_VERIFIED");
    expect(c.recheck.count).toBe(1);
    expect(templates(c, "customer").at(-1)).toBe("C_CREDIT_VERIFIED");
    expect(templates(c, "merchant").at(-1)).toBe("M_CREDIT_VERIFIED");
    assertNoUnverifiedClaims(s);
  });

  it("S3: escalates to Settlement Ops with a summary when the credit never appears", async () => {
    const s = createStore();
    const c = await complain(s, "I paid 2100 to City Electronics, they say they didn't get it");
    expect(c.status).toBe("MONITORING");
    for (let i = 0; i < 3; i++) {
      simulate(s, "NEXT_RECHECK");
      await tick(s, MODE);
    }
    expect(c.recheck.count).toBe(3);
    expect(c.status).toBe("ESCALATED");
    expect(c.owner).toBe("Settlement Ops");
    expect(c.summary).toBeTruthy();
    expect(templates(c, "customer").at(-1)).toBe("C_ESCALATED");
    // Holding messages are not repeated on every re-check.
    expect(templates(c, "customer").filter((t) => t === "C_CREDIT_PENDING")).toHaveLength(1);
    assertNoUnverifiedClaims(s);
  });

  it("S4: conflicting data escalates without a guess", async () => {
    const s = createStore();
    const c = await complain(s, "350 debited for Chai Point, app says success");
    expect(c.status).toBe("ESCALATED");
    expect(c.reason).toBe("CONFLICTING_DATA");
    expect(c.owner).toBe("Payments Ops");
    assertNoUnverifiedClaims(s);
  });

  it("S4b: a bank timeout escalates; a flaky tool recovers on retry", async () => {
    const s = createStore();
    s.faults.bankTimeout = true;
    const c = await complain(s, "UPI ref 3307 money not received by merchant");
    expect(c.status).toBe("ESCALATED");
    expect(c.reason).toBe("TOOL_UNAVAILABLE");
    expect(s.audit.filter((e) => e.kind === "TOOL_ERROR")).toHaveLength(2);

    const s2 = createStore();
    s2.faults.creditFlaky = true;
    const c2 = await complain(s2, "UPI ref 3307 money not received by merchant");
    expect(c2.status).toBe("MONITORING");
    expect(s2.audit.filter((e) => e.kind === "TOOL_ERROR")).toHaveLength(1);
  });

  it("S5: detects an unmatched payment before any complaint and alerts only the merchant", async () => {
    const s = createStore();
    simulate(s, "NEW_UNMATCHED_PAYMENT");
    await tick(s, MODE);
    const c = s.cases[0]!;
    expect(c.origin).toBe("PROACTIVE");
    expect(c.status).toBe("MONITORING");
    expect(templates(c, "merchant")).toEqual(["M_HOLD_GOODS"]);
    expect(templates(c, "customer")).toEqual([]);

    simulate(s, "LAND_CREDIT", c.ref!);
    simulate(s, "NEXT_RECHECK");
    await tick(s, MODE);
    expect(c.status).toBe("CLOSED_VERIFIED");
    assertNoUnverifiedClaims(s);
  });

  it("pending payment closes once the bank confirms failure and reversal", async () => {
    const s = createStore();
    const c = await complain(s, "1249 to Gupta Medical is stuck in pending");
    expect(c.status).toBe("MONITORING");
    expect(c.reason).toBe("BANK_PENDING");
    simulate(s, "BANK_CONFIRMS_FAILURE", "7740");
    simulate(s, "NEXT_RECHECK");
    await tick(s, MODE);
    expect(c.status).toBe("CLOSED_VERIFIED");
    expect(c.reason).toBe("REVERSAL_CONFIRMED");
  });

  it("a second complaint about the same payment joins the existing case", async () => {
    const s = createStore();
    const first = await complain(s, "I paid 2100 to City Electronics, not received");
    await complain(s, "2100 City Electronics still not received!!");
    expect(s.cases).toHaveLength(1);
    expect(first.complaints).toHaveLength(2);
  });

  it("a vague complaint with no match asks for details instead of guessing", async () => {
    const s = createStore();
    const c = await complain(s, "something is wrong with my money");
    expect(c.status).toBe("NEEDS_INFO");
    expect(c.ref).toBeNull();
    expect(templates(c, "customer")).toEqual(["C_NEED_DETAILS"]);
  });
});
