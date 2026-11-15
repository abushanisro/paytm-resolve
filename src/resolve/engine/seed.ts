import type { BankResp, Credit, Txn } from "../types";

/**
 * Synthetic ledger. Every record here is invented for the demo.
 *
 * Scenario map:
 *  1936  failed, bank reversal confirmed            -> closes on its own (S1)
 *  4821  bank success, merchant credit not found    -> monitor, closes when credit lands (S2)
 *  3307  bank success, credit never appears         -> escalates after re-check budget (S3)
 *  5562  ledger says success, bank says failed      -> conflicting data, escalates (S4)
 *  7740  pending at bank                            -> monitor until bank gives a final answer
 *  4822  second ₹500 to the same merchant, healthy  -> forces "which payment?" disambiguation
 */
type Row = [
  ref: string,
  amount: number,
  merchantId: string,
  merchantName: string,
  minsAgo: number,
  status: Txn["status"],
  bank: BankResp["state"],
  reversal: BankResp["reversal"],
  credit: Credit["state"],
];

const ROWS: Row[] = [
  ["4821", 500, "MER-SHARMA", "Sharma Kirana Store", 6, "SUCCESS", "SUCCESS", "NONE", "NO_MATCH"],
  ["4822", 500, "MER-SHARMA", "Sharma Kirana Store", 190, "SUCCESS", "SUCCESS", "NONE", "MATCHED"],
  ["7740", 1249, "MER-GUPTA", "Gupta Medical", 14, "PENDING", "PENDING", "NONE", "NO_MATCH"],
  [
    "1936",
    800,
    "MER-ANNAPURNA",
    "Annapurna Sweets",
    95,
    "FAILED",
    "FAILED",
    "CONFIRMED",
    "NO_MATCH",
  ],
  ["3307", 2100, "MER-CITY", "City Electronics", 48, "SUCCESS", "SUCCESS", "NONE", "NO_MATCH"],
  ["5562", 350, "MER-CHAI", "Chai Point", 25, "SUCCESS", "FAILED", "NONE", "NO_MATCH"],
  ["6104", 120, "MER-METRO", "Metro Recharge", 300, "SUCCESS", "SUCCESS", "NONE", "MATCHED"],
  ["2278", 1800, "MER-BIGB", "Big Bazaar", 1500, "SUCCESS", "SUCCESS", "NONE", "MATCHED"],
];

export function seedWorld(at: number) {
  const txns = new Map<string, Txn>();
  const bank = new Map<string, BankResp>();
  const credits = new Map<string, Credit>();
  for (const [
    ref,
    amount,
    merchantId,
    merchantName,
    minsAgo,
    status,
    bState,
    reversal,
    cState,
  ] of ROWS) {
    txns.set(ref, {
      ref,
      utr: `4${ref}${ref.split("").reverse().join("")}917`,
      amount,
      customerId: "CUST-ANANYA",
      merchantId,
      merchantName,
      createdAt: at - minsAgo * 60_000,
      status,
    });
    bank.set(ref, { ref, state: bState, reversal });
    credits.set(ref, { ref, state: cState });
  }
  return { txns, bank, credits, live: new Set<string>() };
}
