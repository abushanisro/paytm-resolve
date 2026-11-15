import {
  BankRespSchema,
  CreditSchema,
  TxnSchema,
  type BankResp,
  type Credit,
  type Txn,
} from "../types";
import { audit, pause, type Store } from "./store";

/**
 * Typed, read-only tool adapters over the synthetic world. Each one names the
 * real interface it stands in for. None of them can move money.
 */

export class ToolError extends Error {}

/** Real source: Paytm Transaction Status API (merchant) or the internal ledger. */
export async function getTransactionStatus(s: Store, ref: string): Promise<Txn> {
  const txn = s.world.txns.get(ref);
  if (!txn) throw new ToolError(`No transaction with reference ${ref}`);
  return TxnSchema.parse(txn);
}

/** Real source: UDIR transaction-status check through Paytm's TPAP access. */
export async function getBankResponse(s: Store, ref: string): Promise<BankResp> {
  if (s.faults.bankTimeout) throw new ToolError("Bank status check timed out after 3s");
  const bank = s.world.bank.get(ref);
  if (!bank) throw new ToolError(`No bank record for ${ref}`);
  if (s.faults.conflictingData) {
    return BankRespSchema.parse({
      ...bank,
      state: "AMBIGUOUS",
      note: "Issuer and NPCI switch disagree",
    });
  }
  return BankRespSchema.parse(bank);
}

/** Real source: Paytm Settlement API plus NPCI settlement files. */
export async function checkMerchantCredit(s: Store, ref: string): Promise<Credit> {
  if (s.faults.creditFlaky && !s.flakyUsed.has(ref)) {
    s.flakyUsed.add(ref);
    throw new ToolError("Settlement service returned 503");
  }
  const credit = s.world.credits.get(ref);
  if (!credit) return CreditSchema.parse({ ref, state: "UNKNOWN" });
  return CreditSchema.parse(credit);
}

/**
 * Runs a tool with one retry, writing every call, result and failure to the
 * audit log before the next step runs.
 */
export async function callTool<T>(
  s: Store,
  caseId: string,
  name: string,
  ref: string,
  fn: (s: Store, ref: string) => Promise<T>,
  describe: (result: T) => string,
): Promise<T> {
  const attempts = 2;
  for (let i = 1; i <= attempts; i++) {
    await pause(s);
    try {
      const result = await fn(s, ref);
      audit(s, {
        caseId,
        kind: "TOOL",
        actor: "code",
        title: `${name}("${ref}")`,
        detail: describe(result),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      audit(s, {
        caseId,
        kind: "TOOL_ERROR",
        actor: "code",
        title: `${name}("${ref}") failed`,
        detail:
          i < attempts ? `${message}. Retrying (${i}/${attempts - 1}).` : `${message}. Giving up.`,
      });
      if (i === attempts) throw new ToolError(`${name}: ${message}`);
    }
  }
  throw new ToolError(`${name}: unreachable`);
}
