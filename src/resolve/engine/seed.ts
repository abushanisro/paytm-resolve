import type { BankResp, Case, Credit, Qualification, Txn } from "../types";
import type { Store } from "./store";

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


/**
 * Pre-populated demo cases so the HITL dashboard has data on first load.
 * Each case has a matching transaction in the world, audit trail entries,
 * and some are already qualified by a human reviewer.
 */

type DemoCase = {
  ref: string;
  complaint: string;
  status: Case["status"];
  origin: Case["origin"];
  owner: Case["owner"];
  reason: Case["reason"];
  language: Case["language"];
  evidence: Case["evidence"];
  recheckCount: number;
  minsAgo: number;
  closedMinsAgo?: number;
  summary?: string;
  qualification?: Qualification;
  // extra txn to add to world
  txn: Omit<Txn, "ref" | "createdAt">;
  bank: Omit<BankResp, "ref">;
  credit: Omit<Credit, "ref">;
};

const DEMO_CASES: DemoCase[] = [
  // 1. Escalated — Bank timeout, pending human review
  {
    ref: "8001",
    complaint: "Sent ₹1,500 to Royal Sweets but they say nothing came",
    status: "ESCALATED",
    origin: "COMPLAINT",
    owner: "Payments Ops",
    reason: "TOOL_UNAVAILABLE",
    language: "en",
    evidence: { toolFailure: "Bank status check timed out after 3s" },
    recheckCount: 0,
    minsAgo: 45,
    summary: "Customer paid ₹1,500 to Royal Sweets. Bank check timed out on both attempts. Cannot verify transaction state. Escalating to Payments Ops for manual UDIR query.",
    txn: { utr: "480018001917", amount: 1500, customerId: "CUST-ANANYA", merchantId: "MER-ROYAL", merchantName: "Royal Sweets", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 2. Escalated — Conflicting data, pending review
  {
    ref: "8002",
    complaint: "₹750 debit hua par Mehta Cloths ko nahi mila",
    status: "ESCALATED",
    origin: "COMPLAINT",
    owner: "Payments Ops",
    reason: "CONFLICTING_DATA",
    language: "hi",
    evidence: {
      txn: { ref: "8002", utr: "480028002917", amount: 750, customerId: "CUST-ANANYA", merchantId: "MER-MEHTA", merchantName: "Mehta Cloths", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8002", state: "FAILED", reversal: "NONE" },
      credit: { ref: "8002", state: "NO_MATCH" },
    },
    recheckCount: 0,
    minsAgo: 120,
    summary: "Ledger says SUCCESS but bank says FAILED with no reversal. Conflicting data requires manual reconciliation by Payments Ops.",
    txn: { utr: "480028002917", amount: 750, customerId: "CUST-ANANYA", merchantId: "MER-MEHTA", merchantName: "Mehta Cloths", status: "SUCCESS" },
    bank: { state: "FAILED", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 3. Escalated — Recheck budget exhausted, pending review
  {
    ref: "8003",
    complaint: "நான் 3200 ரூபாய் அனுப்பினேன் ஆனால் கிடைக்கவில்லை",
    status: "ESCALATED",
    origin: "COMPLAINT",
    owner: "Settlement Ops",
    reason: "RECHECK_BUDGET_EXHAUSTED",
    language: "ta",
    evidence: {
      txn: { ref: "8003", utr: "480038003917", amount: 3200, customerId: "CUST-ANANYA", merchantId: "MER-TAMIL", merchantName: "Tamil Nadu Stores", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8003", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8003", state: "NO_MATCH" },
    },
    recheckCount: 3,
    minsAgo: 240,
    summary: "Bank confirmed debit ₹3,200 to Tamil Nadu Stores. 3 settlement polling cycles completed — credit not matched. Settlement Ops must query acquiring bank directly.",
    txn: { utr: "480038003917", amount: 3200, customerId: "CUST-ANANYA", merchantId: "MER-TAMIL", merchantName: "Tamil Nadu Stores", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 4. Escalated — Already qualified by human (manual refund)
  {
    ref: "8004",
    complaint: "Payment of ₹999 to Flash Mobiles is missing",
    status: "CLOSED_VERIFIED",
    origin: "COMPLAINT",
    owner: "Resolve",
    reason: "RECHECK_BUDGET_EXHAUSTED",
    language: "en",
    evidence: {
      txn: { ref: "8004", utr: "480048004917", amount: 999, customerId: "CUST-ANANYA", merchantId: "MER-FLASH", merchantName: "Flash Mobiles", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8004", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8004", state: "NO_MATCH" },
    },
    recheckCount: 3,
    minsAgo: 480,
    closedMinsAgo: 300,
    summary: "₹999 to Flash Mobiles. Bank success, credit unmatched after 3 checks.",
    qualification: {
      category: "MERCHANT_SETTLEMENT_DELAY",
      action: "APPROVE_MANUAL_REFUND",
      note: "Confirmed with acquiring bank — settlement batch delayed due to RBI maintenance window. Refund approved.",
      reviewer: "Priya Sharma",
      at: 0, // will be set dynamically
    },
    txn: { utr: "480048004917", amount: 999, customerId: "CUST-ANANYA", merchantId: "MER-FLASH", merchantName: "Flash Mobiles", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 5. Closed — auto-resolved reversal
  {
    ref: "8005",
    complaint: "₹450 to Green Grocers failed but money is gone",
    status: "CLOSED_VERIFIED",
    origin: "COMPLAINT",
    owner: "Resolve",
    reason: "REVERSAL_CONFIRMED",
    language: "en",
    evidence: {
      txn: { ref: "8005", utr: "480058005917", amount: 450, customerId: "CUST-ANANYA", merchantId: "MER-GREEN", merchantName: "Green Grocers", createdAt: 0, status: "FAILED" },
      bank: { ref: "8005", state: "FAILED", reversal: "CONFIRMED" },
      credit: { ref: "8005", state: "NO_MATCH" },
    },
    recheckCount: 0,
    minsAgo: 180,
    closedMinsAgo: 178,
    txn: { utr: "480058005917", amount: 450, customerId: "CUST-ANANYA", merchantId: "MER-GREEN", merchantName: "Green Grocers", status: "FAILED" },
    bank: { state: "FAILED", reversal: "CONFIRMED" },
    credit: { state: "NO_MATCH" },
  },
  // 6. Closed — auto-resolved credit matched
  {
    ref: "8006",
    complaint: "2000 rupay bheje Deep Electronics ko, nahi mile unko",
    status: "CLOSED_VERIFIED",
    origin: "COMPLAINT",
    owner: "Resolve",
    reason: "CREDIT_MATCHED",
    language: "hi",
    evidence: {
      txn: { ref: "8006", utr: "480068006917", amount: 2000, customerId: "CUST-ANANYA", merchantId: "MER-DEEP", merchantName: "Deep Electronics", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8006", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8006", state: "MATCHED" },
    },
    recheckCount: 1,
    minsAgo: 350,
    closedMinsAgo: 340,
    txn: { utr: "480068006917", amount: 2000, customerId: "CUST-ANANYA", merchantId: "MER-DEEP", merchantName: "Deep Electronics", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "MATCHED" },
  },
  // 7. Monitoring — waiting for recheck 1
  {
    ref: "8007",
    complaint: "₹680 sent to Lakshmi Textiles, payment stuck",
    status: "MONITORING",
    origin: "COMPLAINT",
    owner: "Resolve",
    reason: "CREDIT_NOT_FOUND",
    language: "en",
    evidence: {
      txn: { ref: "8007", utr: "480078007917", amount: 680, customerId: "CUST-ANANYA", merchantId: "MER-LAKSH", merchantName: "Lakshmi Textiles", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8007", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8007", state: "NO_MATCH" },
    },
    recheckCount: 0,
    minsAgo: 8,
    txn: { utr: "480078007917", amount: 680, customerId: "CUST-ANANYA", merchantId: "MER-LAKSH", merchantName: "Lakshmi Textiles", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 8. Monitoring — bank pending, recheck 2
  {
    ref: "8008",
    complaint: "₹1,100 to Star Pharmacy pending for too long",
    status: "MONITORING",
    origin: "COMPLAINT",
    owner: "Resolve",
    reason: "BANK_PENDING",
    language: "en",
    evidence: {
      txn: { ref: "8008", utr: "480088008917", amount: 1100, customerId: "CUST-ANANYA", merchantId: "MER-STAR", merchantName: "Star Pharmacy", createdAt: 0, status: "PENDING" },
      bank: { ref: "8008", state: "PENDING", reversal: "NONE" },
      credit: { ref: "8008", state: "NO_MATCH" },
    },
    recheckCount: 1,
    minsAgo: 30,
    txn: { utr: "480088008917", amount: 1100, customerId: "CUST-ANANYA", merchantId: "MER-STAR", merchantName: "Star Pharmacy", status: "PENDING" },
    bank: { state: "PENDING", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 9. Proactive detection — monitoring
  {
    ref: "8009",
    complaint: null,
    status: "MONITORING",
    origin: "PROACTIVE",
    owner: "Resolve",
    reason: "CREDIT_NOT_FOUND",
    language: "en",
    evidence: {
      txn: { ref: "8009", utr: "480098009917", amount: 3500, customerId: "CUST-ANANYA", merchantId: "MER-JEWEL", merchantName: "Jewel Palace", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8009", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8009", state: "NO_MATCH" },
    },
    recheckCount: 0,
    minsAgo: 12,
    txn: { utr: "480098009917", amount: 3500, customerId: "CUST-ANANYA", merchantId: "MER-JEWEL", merchantName: "Jewel Palace", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 10. Escalated — qualified as suspected fraud
  {
    ref: "8010",
    complaint: "I never paid ₹4,200 to XYZ Traders! This is fraud!",
    status: "CLOSED_VERIFIED",
    origin: "COMPLAINT",
    owner: "Bank Disputes",
    reason: "CONFLICTING_DATA",
    language: "en",
    evidence: {
      txn: { ref: "8010", utr: "480108010917", amount: 4200, customerId: "CUST-ANANYA", merchantId: "MER-XYZ", merchantName: "XYZ Traders", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8010", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8010", state: "MATCHED" },
    },
    recheckCount: 0,
    minsAgo: 600,
    closedMinsAgo: 420,
    summary: "Customer denies making this payment. Bank and ledger both show success. Credit matched to merchant. Possible unauthorized transaction.",
    qualification: {
      category: "SUSPECTED_FRAUD",
      action: "REJECT_CLAIM",
      note: "Customer confirmed after callback that family member made the payment. Claim withdrawn. Marking as resolved.",
      reviewer: "Ravi Kumar",
      at: 0,
    },
    txn: { utr: "480108010917", amount: 4200, customerId: "CUST-ANANYA", merchantId: "MER-XYZ", merchantName: "XYZ Traders", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "MATCHED" },
  },
  // 11. Escalated — qualified, merchant credited manually
  {
    ref: "8011",
    complaint: "₹1,800 to Bangalore Books, deducted but shop says no",
    status: "CLOSED_VERIFIED",
    origin: "COMPLAINT",
    owner: "Settlement Ops",
    reason: "RECHECK_BUDGET_EXHAUSTED",
    language: "en",
    evidence: {
      txn: { ref: "8011", utr: "480118011917", amount: 1800, customerId: "CUST-ANANYA", merchantId: "MER-BANG", merchantName: "Bangalore Books", createdAt: 0, status: "SUCCESS" },
      bank: { ref: "8011", state: "SUCCESS", reversal: "NONE" },
      credit: { ref: "8011", state: "NO_MATCH" },
    },
    recheckCount: 3,
    minsAgo: 720,
    closedMinsAgo: 500,
    summary: "₹1,800 to Bangalore Books. Bank success confirmed via UTR. Settlement batch missing — acquiring bank HDFC had processing delay.",
    qualification: {
      category: "MERCHANT_SETTLEMENT_DELAY",
      action: "CREDIT_MERCHANT_MANUALLY",
      note: "Contacted HDFC acquiring bank. Settlement cleared in next batch. Merchant ledger credited manually. Customer confirmed goods received.",
      reviewer: "Anita Desai",
      at: 0,
    },
    txn: { utr: "480118011917", amount: 1800, customerId: "CUST-ANANYA", merchantId: "MER-BANG", merchantName: "Bangalore Books", status: "SUCCESS" },
    bank: { state: "SUCCESS", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
  // 12. Escalated — pending review, bank gateway timeout
  {
    ref: "8012",
    complaint: "₹560 kat gaya Patel Hardware ke liye, kuch nahi hua",
    status: "ESCALATED",
    origin: "COMPLAINT",
    owner: "Bank Disputes",
    reason: "RECHECK_BUDGET_EXHAUSTED",
    language: "hi",
    evidence: {
      txn: { ref: "8012", utr: "480128012917", amount: 560, customerId: "CUST-ANANYA", merchantId: "MER-PATEL", merchantName: "Patel Hardware", createdAt: 0, status: "PENDING" },
      bank: { ref: "8012", state: "PENDING", reversal: "NONE" },
      credit: { ref: "8012", state: "NO_MATCH" },
    },
    recheckCount: 3,
    minsAgo: 180,
    summary: "₹560 to Patel Hardware. Transaction stuck in PENDING at both ledger and bank after 3 re-checks. Bank Disputes must raise a UDIR dispute with issuer bank.",
    txn: { utr: "480128012917", amount: 560, customerId: "CUST-ANANYA", merchantId: "MER-PATEL", merchantName: "Patel Hardware", status: "PENDING" },
    bank: { state: "PENDING", reversal: "NONE" },
    credit: { state: "NO_MATCH" },
  },
];

export function seedDemoCases(s: Store): void {
  const at = Date.now();

  for (const dc of DEMO_CASES) {
    const createdAt = at - dc.minsAgo * 60_000;

    // Add txn, bank, credit to the world
    s.world.txns.set(dc.ref, { ref: dc.ref, ...dc.txn, createdAt });
    s.world.bank.set(dc.ref, { ref: dc.ref, ...dc.bank });
    s.world.credits.set(dc.ref, { ref: dc.ref, ...dc.credit });

    // Fix timestamps inside evidence
    if (dc.evidence.txn) dc.evidence.txn.createdAt = createdAt;

    const caseId = `PR-${10284 + s.caseSeq++}`;
    const closedAt = dc.closedMinsAgo != null ? at - dc.closedMinsAgo * 60_000 : null;

    // Fix qualification timestamp
    const qual = dc.qualification
      ? { ...dc.qualification, at: closedAt ?? at - 60_000 }
      : null;

    const c: Case = {
      id: caseId,
      origin: dc.origin,
      status: dc.status,
      owner: dc.owner,
      customerId: "CUST-ANANYA",
      complaint: dc.complaint,
      complaints: dc.complaint
        ? [{ id: ++s.seq, text: dc.complaint, at: createdAt }]
        : [],
      language: dc.language,
      intake: dc.complaint
        ? {
            language: dc.language,
            intent: "DEBITED_NOT_RECEIVED",
            amount: dc.txn.amount,
            merchantHint: dc.txn.merchantName,
            selectedRef: dc.ref,
            gist: dc.complaint,
          }
        : null,
      candidates: [],
      ref: dc.ref,
      evidence: dc.evidence,
      reason: dc.reason,
      recheck: {
        count: dc.recheckCount,
        max: 3,
        nextAt: dc.status === "MONITORING" ? at + 90_000 : null,
      },
      summary: dc.summary ?? null,
      summaryBy: dc.summary ? "scripted-fallback" : null,
      qualification: qual,
      messages: [],
      createdAt,
      updatedAt: closedAt ?? at - 30_000,
      closedAt,
      busy: false,
    };

    s.cases.push(c);

    // Seed audit trail for this case
    s.audit.push({
      id: ++s.seq,
      caseId,
      at: createdAt,
      kind: dc.origin === "PROACTIVE" ? "DETECTOR" : "INTAKE",
      actor: dc.origin === "PROACTIVE" ? "code" : "customer",
      title: dc.origin === "PROACTIVE" ? "Unmatched credit detected" : "Complaint received",
      detail: dc.complaint ?? `Proactive: bank success for UPI ${dc.ref}, credit unmatched`,
    });

    if (dc.evidence.txn) {
      s.audit.push({
        id: ++s.seq, caseId, at: createdAt + 1000,
        kind: "TOOL", actor: "code",
        title: `get_transaction_status("${dc.ref}")`,
        detail: `ledger status ${dc.evidence.txn.status}, ₹${dc.txn.amount} to ${dc.txn.merchantName}`,
      });
    }

    if (dc.evidence.bank) {
      s.audit.push({
        id: ++s.seq, caseId, at: createdAt + 2000,
        kind: "TOOL", actor: "code",
        title: `get_bank_response("${dc.ref}")`,
        detail: `bank ${dc.evidence.bank.state}, reversal ${dc.evidence.bank.reversal}`,
      });
    }

    if (dc.evidence.credit) {
      s.audit.push({
        id: ++s.seq, caseId, at: createdAt + 3000,
        kind: "TOOL", actor: "code",
        title: `check_merchant_credit("${dc.ref}")`,
        detail: `merchant credit ${dc.evidence.credit.state}`,
      });
    }

    if (dc.evidence.toolFailure) {
      s.audit.push({
        id: ++s.seq, caseId, at: createdAt + 2000,
        kind: "TOOL_ERROR", actor: "code",
        title: `get_bank_response("${dc.ref}") failed`,
        detail: dc.evidence.toolFailure,
      });
    }

    s.audit.push({
      id: ++s.seq, caseId, at: createdAt + 4000,
      kind: "POLICY", actor: "code",
      title: `decide() → ${dc.status === "CLOSED_VERIFIED" ? "CLOSE_VERIFIED" : dc.status === "ESCALATED" ? "ESCALATE" : "MONITOR"}`,
      detail: `${dc.reason}`,
    });

    if (dc.summary) {
      s.audit.push({
        id: ++s.seq, caseId, at: createdAt + 5000,
        kind: "MODEL", actor: "model",
        title: "Wrote handoff summary (scripted-fallback)",
        detail: dc.summary,
      });
    }

    if (qual) {
      s.audit.push({
        id: ++s.seq, caseId, at: qual.at,
        kind: "STATE", actor: "code",
        title: `Human qualified: ${qual.category}`,
        detail: `Action: ${qual.action}. Note: "${qual.note}" — ${qual.reviewer}`,
      });
    }
  }
}
