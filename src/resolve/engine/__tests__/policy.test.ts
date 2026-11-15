import { describe, expect, it } from "vitest";

import type { BankResp, Credit, Evidence, Txn } from "../../types";
import { decide } from "../policy";

const txn = (status: Txn["status"]): Txn => ({
  ref: "1",
  utr: "u",
  amount: 500,
  customerId: "c",
  merchantId: "m",
  merchantName: "M",
  createdAt: 0,
  status,
});
const ev = (
  status: Txn["status"],
  bank: BankResp["state"],
  reversal: BankResp["reversal"],
  credit: Credit["state"],
): Evidence => ({
  txn: txn(status),
  bank: { ref: "1", state: bank, reversal },
  credit: { ref: "1", state: credit },
});

describe("policy.decide", () => {
  it("closes when the bank confirms a reversal", () => {
    const d = decide(ev("FAILED", "FAILED", "CONFIRMED", "NO_MATCH"), 3);
    expect(d).toMatchObject({
      action: "CLOSE_VERIFIED",
      reason: "REVERSAL_CONFIRMED",
      owner: "Resolve",
    });
  });

  it("closes when the merchant credit is matched", () => {
    const d = decide(ev("SUCCESS", "SUCCESS", "NONE", "MATCHED"), 3);
    expect(d).toMatchObject({ action: "CLOSE_VERIFIED", reason: "CREDIT_MATCHED" });
  });

  it("monitors bank success with no merchant credit, and tells the merchant to hold goods", () => {
    const d = decide(ev("SUCCESS", "SUCCESS", "NONE", "NO_MATCH"), 3);
    expect(d).toMatchObject({
      action: "MONITOR",
      reason: "CREDIT_NOT_FOUND",
      merchantTemplate: "M_HOLD_GOODS",
    });
  });

  it("escalates to Settlement Ops once the re-check budget is spent", () => {
    const d = decide(ev("SUCCESS", "SUCCESS", "NONE", "NO_MATCH"), 0);
    expect(d).toMatchObject({
      action: "ESCALATE",
      reason: "RECHECK_BUDGET_EXHAUSTED",
      owner: "Settlement Ops",
    });
  });

  it("monitors a pending payment, then escalates to Bank Disputes", () => {
    expect(decide(ev("PENDING", "PENDING", "NONE", "NO_MATCH"), 2).action).toBe("MONITOR");
    expect(decide(ev("PENDING", "PENDING", "NONE", "NO_MATCH"), 0)).toMatchObject({
      action: "ESCALATE",
      owner: "Bank Disputes",
    });
  });

  it("does not close a failed payment until the reversal is confirmed", () => {
    expect(decide(ev("FAILED", "FAILED", "NONE", "NO_MATCH"), 3)).toMatchObject({
      action: "MONITOR",
      reason: "REVERSAL_PENDING",
    });
    expect(decide(ev("FAILED", "FAILED", "INITIATED", "NO_MATCH"), 3).action).toBe("MONITOR");
  });

  it.each([
    ["ambiguous bank answer", ev("SUCCESS", "AMBIGUOUS", "NONE", "NO_MATCH")],
    ["ledger success, bank failed", ev("SUCCESS", "FAILED", "NONE", "NO_MATCH")],
    ["ledger failed, bank success", ev("FAILED", "SUCCESS", "NONE", "NO_MATCH")],
    ["bank failed but credit matched", ev("FAILED", "FAILED", "CONFIRMED", "MATCHED")],
  ])("escalates conflicting data: %s", (_name, e) => {
    expect(decide(e, 3)).toMatchObject({
      action: "ESCALATE",
      reason: "CONFLICTING_DATA",
      owner: "Payments Ops",
    });
  });

  it("escalates instead of guessing when a tool failed or a fact is missing", () => {
    expect(decide({ txn: txn("SUCCESS"), toolFailure: "timeout" }, 3)).toMatchObject({
      action: "ESCALATE",
      reason: "TOOL_UNAVAILABLE",
    });
    expect(decide(ev("SUCCESS", "SUCCESS", "NONE", "UNKNOWN"), 3).action).toBe("ESCALATE");
    expect(decide({}, 3).action).toBe("ESCALATE");
  });
});
