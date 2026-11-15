import { z } from "zod";

/* ---------- Ledger facts (what the tools return) ---------- */

export const TxnSchema = z.object({
  ref: z.string(), // short UPI reference shown to the customer
  utr: z.string(),
  amount: z.number(), // rupees
  customerId: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  createdAt: z.number(),
  status: z.enum(["SUCCESS", "PENDING", "FAILED"]),
});
export type Txn = z.infer<typeof TxnSchema>;

export const BankRespSchema = z.object({
  ref: z.string(),
  state: z.enum(["SUCCESS", "FAILED", "PENDING", "AMBIGUOUS"]),
  reversal: z.enum(["NONE", "INITIATED", "CONFIRMED"]),
  note: z.string().optional(),
});
export type BankResp = z.infer<typeof BankRespSchema>;

export const CreditSchema = z.object({
  ref: z.string(),
  state: z.enum(["MATCHED", "NO_MATCH", "UNKNOWN"]),
});
export type Credit = z.infer<typeof CreditSchema>;

export type Evidence = { txn?: Txn; bank?: BankResp; credit?: Credit; toolFailure?: string };

/* ---------- Policy ---------- */

export type Owner = "Resolve" | "Settlement Ops" | "Bank Disputes" | "Payments Ops";

export type ReasonCode =
  | "REVERSAL_CONFIRMED"
  | "CREDIT_MATCHED"
  | "CREDIT_NOT_FOUND"
  | "BANK_PENDING"
  | "REVERSAL_PENDING"
  | "CONFLICTING_DATA"
  | "TOOL_UNAVAILABLE"
  | "RECHECK_BUDGET_EXHAUSTED";

export type CustomerTemplateId =
  | "C_INVESTIGATING"
  | "C_NEED_DETAILS"
  | "C_PICK_TXN"
  | "C_REVERSAL_CONFIRMED"
  | "C_CREDIT_VERIFIED"
  | "C_CREDIT_PENDING"
  | "C_BANK_PENDING"
  | "C_REVERSAL_PENDING"
  | "C_ESCALATED";

export type MerchantTemplateId =
  "M_HOLD_GOODS" | "M_CREDIT_VERIFIED" | "M_PAYMENT_FAILED" | "M_UNDER_REVIEW";

export type TemplateId = CustomerTemplateId | MerchantTemplateId;

export type Decision = {
  action: "CLOSE_VERIFIED" | "MONITOR" | "ESCALATE";
  reason: ReasonCode;
  owner: Owner;
  customerTemplate: CustomerTemplateId;
  merchantTemplate: MerchantTemplateId;
};

/* ---------- Cases ---------- */

export type Lang = "en" | "hi" | "ta";

export type CaseStatus =
  "INTAKE" | "NEEDS_INFO" | "INVESTIGATING" | "MONITORING" | "CLOSED_VERIFIED" | "ESCALATED";

export type Message = {
  id: number;
  to: "customer" | "merchant";
  templateId: TemplateId;
  slots: Record<string, string>;
  at: number;
};

export type Intake = {
  language: Lang;
  intent:
    "DEBITED_NOT_RECEIVED" | "PAYMENT_FAILED" | "PAYMENT_PENDING" | "REFUND_NOT_RECEIVED" | "OTHER";
  amount: number | null;
  merchantHint: string | null;
  selectedRef: string | null;
  gist: string; // one-line English restatement
};

export type Case = {
  id: string;
  origin: "COMPLAINT" | "PROACTIVE";
  status: CaseStatus;
  owner: Owner;
  customerId: string;
  complaint: string | null; // first complaint text, shown in the console
  complaints: { id: number; text: string; at: number }[];
  language: Lang;
  intake: Intake | null;
  candidates: string[]; // txn refs the customer may pick from
  ref: string | null;
  evidence: Evidence;
  reason: ReasonCode | null;
  recheck: { count: number; max: number; nextAt: number | null };
  summary: string | null; // handoff summary, written by the model
  summaryBy: string | null;
  qualification: Qualification | null;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  busy: boolean;
};

/* ---------- Human-in-the-loop qualification ---------- */

export type FailureCategory =
  | "BANK_GATEWAY_TIMEOUT"
  | "MERCHANT_SETTLEMENT_DELAY"
  | "DATA_INCONSISTENCY"
  | "SUSPECTED_FRAUD"
  | "USER_INPUT_ERROR";

export type HumanAction =
  | "APPROVE_MANUAL_REFUND"
  | "CREDIT_MERCHANT_MANUALLY"
  | "TRIGGER_RECHECK"
  | "REQUEST_BANK_STATEMENT"
  | "REJECT_CLAIM";

export type Qualification = {
  category: FailureCategory;
  action: HumanAction;
  note: string;
  reviewer: string;
  at: number;
};

/* ---------- Audit ---------- */

export type AuditKind =
  | "INTAKE"
  | "MODEL"
  | "TOOL"
  | "TOOL_ERROR"
  | "POLICY"
  | "NOTIFY"
  | "RECHECK"
  | "STATE"
  | "DETECTOR"
  | "SIMULATOR";

export type AuditEvent = {
  id: number;
  caseId: string | null;
  at: number;
  kind: AuditKind;
  actor: "model" | "code" | "presenter" | "customer";
  title: string;
  detail?: string;
};

/* ---------- Demo controls ---------- */

export type Faults = {
  bankTimeout: boolean; // get_bank_response always times out
  creditFlaky: boolean; // check_merchant_credit fails once, then recovers
  conflictingData: boolean; // bank contradicts the ledger
};

export type SimAction =
  "NEXT_RECHECK" | "LAND_CREDIT" | "BANK_CONFIRMS_FAILURE" | "NEW_UNMATCHED_PAYMENT";

export type Snapshot = {
  now: number;
  llm: { provider: string; live: boolean };
  customerId: string;
  merchantId: string;
  txns: Txn[];
  cases: Case[];
  audit: AuditEvent[];
  faults: Faults;
};
