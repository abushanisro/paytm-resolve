import type { Decision, Evidence } from "../types";

/**
 * Deterministic policy. No model involved: given the facts the tools returned
 * and how many re-checks are left, decide what happens to the case.
 *
 * The only two ways to close are a matched merchant credit or a bank-confirmed
 * reversal. Everything else is monitored or handed to a named human team.
 */
export function decide(ev: Evidence, rechecksLeft: number): Decision {
  const { txn, bank, credit } = ev;

  if (ev.toolFailure || !txn || !bank || !credit) {
    return escalate("TOOL_UNAVAILABLE", "Payments Ops");
  }
  if (credit.state === "UNKNOWN") {
    return escalate("TOOL_UNAVAILABLE", "Settlement Ops");
  }

  const conflicting =
    bank.state === "AMBIGUOUS" ||
    (txn.status === "SUCCESS" && bank.state === "FAILED") ||
    (txn.status === "FAILED" && bank.state === "SUCCESS") ||
    (bank.state === "FAILED" && credit.state === "MATCHED");
  if (conflicting) return escalate("CONFLICTING_DATA", "Payments Ops");

  if (bank.state === "FAILED") {
    if (bank.reversal === "CONFIRMED") {
      return {
        action: "CLOSE_VERIFIED",
        reason: "REVERSAL_CONFIRMED",
        owner: "Resolve",
        customerTemplate: "C_REVERSAL_CONFIRMED",
        merchantTemplate: "M_PAYMENT_FAILED",
      };
    }
    if (rechecksLeft <= 0) return escalate("RECHECK_BUDGET_EXHAUSTED", "Bank Disputes");
    return {
      action: "MONITOR",
      reason: "REVERSAL_PENDING",
      owner: "Resolve",
      customerTemplate: "C_REVERSAL_PENDING",
      merchantTemplate: "M_HOLD_GOODS",
    };
  }

  if (bank.state === "PENDING") {
    if (rechecksLeft <= 0) return escalate("RECHECK_BUDGET_EXHAUSTED", "Bank Disputes");
    return {
      action: "MONITOR",
      reason: "BANK_PENDING",
      owner: "Resolve",
      customerTemplate: "C_BANK_PENDING",
      merchantTemplate: "M_HOLD_GOODS",
    };
  }

  // bank.state === "SUCCESS"
  if (credit.state === "MATCHED") {
    return {
      action: "CLOSE_VERIFIED",
      reason: "CREDIT_MATCHED",
      owner: "Resolve",
      customerTemplate: "C_CREDIT_VERIFIED",
      merchantTemplate: "M_CREDIT_VERIFIED",
    };
  }
  if (rechecksLeft <= 0) return escalate("RECHECK_BUDGET_EXHAUSTED", "Settlement Ops");
  return {
    action: "MONITOR",
    reason: "CREDIT_NOT_FOUND",
    owner: "Resolve",
    customerTemplate: "C_CREDIT_PENDING",
    merchantTemplate: "M_HOLD_GOODS",
  };
}

function escalate(reason: Decision["reason"], owner: Decision["owner"]): Decision {
  return {
    action: "ESCALATE",
    reason,
    owner,
    customerTemplate: "C_ESCALATED",
    merchantTemplate: "M_UNDER_REVIEW",
  };
}
